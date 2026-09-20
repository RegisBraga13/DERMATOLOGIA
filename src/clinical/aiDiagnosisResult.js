import { buildDiagnosticSuggestion, diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSyndromicOptionLines, doctorSelectedOptions, formatDiagnosticOption, selectedDiagnosisValues } from "./diagnosis.js";
import { normalizeText, stripFinalPeriod } from "./textFormat.js";

// Transformacao do que a IA devolve no que o formulario guarda. Estava dentro
// do gerador, no App.js, misturada com a chamada de rede, o estado do
// rascunho e o render — e e a parte com regra clinica dentro: quem concorre
// com quem, quem pode repetir, o que vira aviso na tela.
//
// Aqui e funcao pura: entra o resultado, sai o objeto. Da para testar sem
// navegador, sem servidor e sem chave de API.

export function countLabel(total, singular, plural = `${singular}s`) {
  return `${total} ${total === 1 ? singular : plural}`;
}

// Separador improvavel de aparecer em criterio, evidencia ou nome de hipotese.
// Barra vertical sozinha nao servia: ela ja e usada dentro das linhas de
// tratamento, e o dia em que os dois formatos se encontrassem a linha quebraria
// no lugar errado.
export const CRITERION_SEPARATOR = " ::: ";

export function diagnosisSuggestionFromAi({ result = {}, target = {}, sources = [], mode = "", codeWarnings = [], revisao = false }) {
  // Sem completar as vagas que sobram: se a IA propos duas sindromicas,
  // mostra duas. Antes o catalogo local enchia o resto das tres categorias
  // com o mesmo punhado de entidades nosologicas, o que fazia uma nosologia
  // aparecer rotulada como sindrome — e as vezes duas vezes, em categorias
  // diferentes, porque a deduplicacao era so dentro de cada grupo.
  const formatGroup = (items, count) => (items || []).map(formatDiagnosticOption)
    .filter(Boolean)
    .filter((option, index, list) => list.indexOf(option) === index).slice(0, count);
  // A deduplicacao era so dentro de cada grupo, entao a mesma entidade saia
  // duas vezes em categorias diferentes: numa chamada real de um caso de TAG,
  // "Transtorno de ansiedade generalizada" apareceu como sindromica E como
  // nosologica. Qual das duas esta certa e juizo clinico, entao o programa
  // nao escolhe em silencio: mantem uma e diz que aconteceu.
  const jaVistos = new Map();
  const duplicadas = [];
  const uniqueGroup = (items, count, categoria) => formatGroup(items, count).filter(nome => {
    // A chave e so a entidade, sem os codigos. Comparando a linha inteira, a
    // mesma entidade escapava sempre que os codigos diferiam entre as camadas
    // — e agora a sindromica sai sem codigo por construcao, entao ela NUNCA
    // colidiria com a nosologica, que sai com os dois. Ficou visivel num teste:
    // "Transtorno depressivo maior" apareceu como nosologica e como sindrome.
    const chave = normalizeText(entityName(nome));
    if (jaVistos.has(chave)) { duplicadas.push(`${entityName(nome)} (mantida em ${jaVistos.get(chave)})`); return false; }
    jaVistos.set(chave, categoria);
    return true;
  });
  // Nosologico primeiro: quando a mesma entidade sai nas duas categorias, a
  // IA nao esta distinguindo sindrome de transtorno, e a leitura nosologica
  // e a afirmacao mais especifica. Ficar com a sindromica esvaziava a
  // categoria util.
  const nosologicalOptions = uniqueGroup(result.nosological_options, 3, "Nosológico");
  // Os criterios viajam como linhas de texto, chaveadas pela MESMA linha que
  // rotula a caixa de selecao — nome mais os dois codigos. Assim a tela casa
  // criterio com hipotese por igualdade literal, sem indice paralelo que se
  // desalinha quando uma hipotese cai na deduplicacao. Hipotese deduplicada
  // leva os criterios dela junto, porque a chave sai da lista final.
  const criterionLines = (result.nosological_options || []).flatMap(item => {
    const hipotese = formatDiagnosticOption(item);
    if (!nosologicalOptions.includes(hipotese)) return [];
    return (item?.criteria || []).map(criterio => [
      hipotese,
      String(criterio?.criterion || "").trim(),
      String(criterio?.status || "").trim(),
      String(criterio?.evidence || "").trim()
    ].join(CRITERION_SEPARATOR)).filter(linha => linha.split(CRITERION_SEPARATOR).every(parte => parte));
  });
  // A faixa de sustentacao viaja como criterio: uma linha por hipotese,
  // chaveada pela mesma linha que rotula a caixa. Campo proprio, fora do texto
  // da hipotese, para nao chegar a laudo, atestado nem prontuario exportado:
  // decisao dele, 20/09/2026, e ela so aparece na tela do Diagnostico.
  const faixaLines = (result.nosological_options || []).flatMap(item => {
    const hipotese = formatDiagnosticOption(item);
    const { support_min: baixo, support_max: alto } = item || {};
    if (!nosologicalOptions.includes(hipotese)) return [];
    if (![baixo, alto].every(Number.isInteger) || baixo < 0 || baixo > alto || alto > 100) return [];
    return [[hipotese, baixo, alto].join(CRITERION_SEPARATOR)];
  });
  const syndromicOptions = uniqueGroup(result.syndromic_options, 3, "Sindrômico");
  const etiologicalOptions = uniqueGroup(result.etiological_options, 2, "Etiológico");
  // Comorbidade passa pelo uniqueGroup, ao contrario do especificador: ela e
  // entidade, e a mesma entidade nao pode ser ao mesmo tempo a hipotese
  // principal e a doenca que coexiste com ela. Vem depois das tres camadas,
  // entao em choque quem fica e a hipotese.
  const comorbidityOptions = uniqueGroup(result.comorbidity_options, 3, "Comorbidade");
  // Especificador nao passa por uniqueGroup: ele nao concorre com hipotese
  // nenhuma — qualifica uma. "Com sintomas psicoticos" ao lado de "Depressao
  // maior" e a mesma informacao dita uma vez, nao duplicata.
  const specifierOptions = pairedOptions(result.specifier_options, "applies_to");
  // Agravante nao e entidade nem qualificacao de entidade: e circunstancia do
  // caso. Fora do uniqueGroup pelo mesmo motivo do especificador.
  const aggravatingOptions = pairedOptions(result.aggravating_options, "effect");
  const selectedDoctorOptions = doctorSelectedOptions(target || {});
  // "Humor: deprimido, com anedonia severa (parou de sair e de cozinhar)".
  // A evidencia entre parenteses e o que separa esta analise de um rotulo
  // colado no caso -- e o que permite ao medico conferir cada achado contra o
  // proprio registro, sem reler a consulta inteira.
  const analysisItems = (result.psychopathological_analysis || [])
    .filter(item => ["domain", "finding", "evidence"].every(key => String(item?.[key] || "").trim()))
    .map(item => {
      const evidencia = stripFinalPeriod(String(item.evidence).trim());
      // A IA muitas vezes ja fecha o achado com a evidencia entre parenteses,
      // e o formato desta linha poe a evidencia entre parenteses de novo: saia
      // "Humor: tristeza persistente (parou de sair) (parou de sair)". Visto na
      // tela em 28/08/2026, nos oito dominios do mesmo caso.
      //
      // So corta quando o parentese do achado E a evidencia -- um contido no
      // outro. Parentese que diga outra coisa e informacao, e fica.
      const achado = stripFinalPeriod(String(item.finding).trim())
        .replace(/\s*\(([^()]*)\)\s*$/, (tudo, dentro) => {
          const a = normalizeText(dentro), b = normalizeText(evidencia);
          return a && b && (a.includes(b) || b.includes(a)) ? "" : tudo;
        }).trim();
      return { linha: `${String(item.domain).trim()}: ${stripFinalPeriod(achado)} (${evidencia})`, achado: stripFinalPeriod(achado) };
    })
    .filter((item, index, lista) => lista.findIndex(outro => outro.linha === item.linha) === index)
    .slice(0, 8);
  const analysis = analysisItems.map(item => item.linha);
  // So o achado, sem o dominio nem a evidencia: e o que a Historia clinica
  // escreve, em prosa. O dominio ("Pensamento (conteudo):") e rotulo de
  // formulario, e a evidencia ja esta contada na propria historia.
  const findings = analysisItems.map(item => item.achado).filter(Boolean);
  // Marcacao do medico que sobreviveu a revisao: so continua marcado o que a
  // segunda passada ainda propoe. Fora do refino nao ha o que preservar — uma
  // geracao nova troca a lista inteira.
  const propostas = new Set([...nosologicalOptions, ...syndromicOptions, ...etiologicalOptions].map(normalizeText));
  const doctorSet = new Set(selectedDoctorOptions);
  const marcadasAntes = revisao
    ? selectedDiagnosisValues(target || {}).filter(valor => !doctorSet.has(valor))
    : [];
  const marcadasMantidas = marcadasAntes.filter(valor => propostas.has(normalizeText(valor)));
  const marcadasPerdidas = marcadasAntes.length - marcadasMantidas.length;
  // Quais, e nao so quantas, desde 11/09/2026: a revisao substitui a tela
  // inteira, e sem o nome nao havia como conferir o que ela tirou.
  const marcadasRetiradas = marcadasAntes.filter(valor => !propostas.has(normalizeText(valor)));
  const marcadasFinais = [...selectedDoctorOptions, ...marcadasMantidas];

  return {
    analisePsicopatologica: analysis.join("\n"),
    analisePsicopatologicaAchados: findings.join("\n"),
    diagnosticoAiSindromico: syndromicOptions.join("\n"),
    diagnosticoAiNosologico: nosologicalOptions.join("\n"),
    diagnosticoAiCriterios: criterionLines.join("\n"),
    diagnosticoAiFaixas: faixaLines.join("\n"),
    diagnosticoAiEtiologico: etiologicalOptions.join("\n"),
    diagnosticoAiEspecificadores: specifierOptions.join("\n"),
    diagnosticoAiComorbidades: comorbidityOptions.join("\n"),
    diagnosticoAiAgravantes: aggravatingOptions.join("\n"),
    // Mesma razao das hipoteses: a IA propoe, quem assinala e o medico.
    especificadorSelecionado: [],
    comorbidadeSelecionada: [],
    agravanteSelecionado: [],
    // A IA propoe, nao assinala: so as hipoteses do proprio medico seguem
    // marcadas. Assinalar por ele inverteria o onus — passaria a ser preciso
    // descartar o que nao se quer, em vez de escolher o que se quer.
    //
    // No REFINO e diferente. Desde 31/08/2026 o Refinar so libera depois que o
    // medico assinala — e o refino devolvia a tela com nada marcado, apagando
    // exatamente a escolha que acabara de habilitar o botao. Aqui a marcacao
    // dele sobrevive quando a hipotese sobrevive: a segunda passada revisa a
    // escolha, nao a anula. O que a revisao tirou da lista sai da marcacao
    // tambem, e isso e dito na tela.
    diagnosticoSelecionado: marcadasFinais,
    diagnosticoManual: marcadasFinais.join("\n"),
    diferenciais: "",
    ragSourcesDiagnostico: sources,
    // Gravado no registro, desde 11/09/2026: o aiStatus diz isso na tela, mas
    // some na proxima geracao. O seletor do modo (aiMode) fica de fora: guarda a
    // ESCOLHA dele, e gravar aqui o modo que respondeu -- o servidor cai do RAG
    // para a web quando o acervo nao sustenta -- trocaria o radio sem ele pedir.
    diagnosticoOrigem: mode === "rag" ? "rag" : "nuvem",
    // A primeira proposta, guardada no registro quando o refino a substitui.
    // Geracao nova limpa: a comparacao so vale entre a proposta e a revisao.
    diagnosticoRefinoAnterior: revisao ? {
      em: new Date().toISOString(),
      sindromico: diagnosticSyndromicOptionLines(target || {}),
      nosologico: diagnosticNosologicalOptionLines(target || {}),
      etiologico: diagnosticEtiologicalOptionLines(target || {}),
      retiradas: marcadasRetiradas
    } : null,
    aiStatus: [
      analysis.length
        ? `Análise psicopatológica: ${countLabel(analysis.length, "domínio", "domínios")}, cada um com a evidência do registro.`
        : "",
      `Propostas para você assinalar: ${countLabel(nosologicalOptions.length, "nosológica")}, ${countLabel(syndromicOptions.length, "sindrômica")} e ${countLabel(etiologicalOptions.length, "etiológica")}. As hipóteses do médico foram mantidas.`,
      marcadasMantidas.length ? `${countLabel(marcadasMantidas.length, "hipótese que você assinalou continua", "hipóteses que você assinalou continuam")} marcada(s).` : "",
      marcadasPerdidas ? `${countLabel(marcadasPerdidas, "hipótese que você assinalou não foi", "hipóteses que você assinalou não foram")} mantida(s) pela revisão, e saiu(ram) da marcação.` : "",
      specifierOptions.length ? `${countLabel(specifierOptions.length, "especificador", "especificadores")} proposto(s).` : "",
      comorbidityOptions.length ? `${countLabel(comorbidityOptions.length, "comorbidade")} proposta(s).` : "",
      aggravatingOptions.length ? `${countLabel(aggravatingOptions.length, "fator agravante", "fatores agravantes")} proposto(s).` : "",
      // Renomear muda o que ele le na tela, entao e dito. Os avisos de codigo
      // ficam no log: o codigo nao aparece nesta etapa, so na codificacao.
      //
      // "mismatch" e a excecao, e subiu para a tela em 28/08/2026: e o servidor
      // dizendo que TROCOU o codigo porque o que a IA devolveu contradizia o
      // nome da hipotese -- 6A70.3, "grave sem sintomas psicoticos", numa
      // hipotese nomeada "com sintomas psicoticos". A correcao e automatica e
      // ancorada em tabela, mas silenciar uma troca de codigo diagnostico seria
      // pedir que ele confie sem poder conferir.
      ...(codeWarnings || []).filter(item => ["rename", "mismatch"].includes(item.kind)).map(item => item.text),
      duplicadas.length
        ? `${countLabel(duplicadas.length, "hipótese saiu", "hipóteses saíram")} em mais de uma categoria: ${duplicadas.join("; ")}.`
        : ""
    ].filter(Boolean).join(" "),
  };
}

// "Transtorno depressivo maior - CID-11: 6A70 - DSM-5-TR: F32.-" -> o nome.
export function entityName(linha = "") {
  return String(linha).split(/\s+-\s+(?:CID-11|DSM-5-TR):/)[0].trim();
}

// Especificador e agravante tem o mesmo formato na tela: o nome, um travessao,
// e o segundo campo — a hipotese que ele qualifica, ou o que ele piora.
function pairedOptions(items, segundoCampo) {
  return (items || [])
    .map(item => [String(item?.name || "").trim(), String(item?.[segundoCampo] || "").trim()]
      .filter(Boolean).join(" — "))
    .filter(Boolean)
    .filter((option, index, list) => list.indexOf(option) === index)
    .slice(0, 4);
}

// Refinar que falha nao mexe em nada. A segunda passada revisa a primeira, e a
// revisao que nao veio nao e motivo para trocar a tela por outra coisa: o
// catalogo local apagaria a analise, os criterios e as faixas, e poria no lugar
// hipoteses de casamento de termo -- para quem acabou de assinalar a hipotese
// que queria refinar. So o aviso entra. O Refinar sempre pede RAG, por isso a
// fonte que nomeia e essa, e nao o seletor da primeira passada.
export function diagnosisReviewFailure(error = {}) {
  return {
    aiStatus: `Refinamento indisponível (RAG: ${error.message}). A primeira passada foi mantida como estava.`
  };
}

// O catalogo local so entra quando nao ha resposta nenhuma, e e dito com todas
// as letras que veio dele. Antes ele se misturava as hipoteses da IA sem que a
// tela distinguisse uma coisa da outra.
export function diagnosisSuggestionFromLocalCatalogue(target = {}, error = {}) {
  const local = buildDiagnosticSuggestion(target || {});
  // Este fluxo le aiMode; pharmaAiMode e o seletor do medicamento.
  const fonte = (target?.aiMode || "current") === "rag" ? "RAG" : "IA";
  const encontrou = local.diagnosticoAiSindromico || local.diagnosticoAiNosologico || local.diagnosticoAiEtiologico;
  return {
    ...local,
    // O catalogo local casa termo; nao le o registro e nao tem como apontar a
    // evidencia de nada. Analise sem evidencia e o que esta etapa recusa a
    // produzir, entao aqui ela fica vazia -- e limpa o que a IA tenha escrito
    // antes, para nao sobrar analise de uma geracao ao lado de hipoteses de
    // outra.
    analisePsicopatologica: "",
    analisePsicopatologicaAchados: "",
    // Pela mesma razao: o catalogo casa termo com regra, nao confere criterio
    // contra manual nenhum. Deixar os criterios da geracao anterior aqui seria
    // pior do que nao ter -- fundamentacao de uma hipotese ao lado de outra.
    diagnosticoAiCriterios: "",
    diagnosticoAiFaixas: "",
    ragSourcesDiagnostico: [],
    diagnosticoOrigem: "local",
    treatmentStatus: `${fonte} indisponivel: ${error.message}`,
    aiStatus: encontrou
      ? `${fonte} indisponível (${error.message}). As hipóteses abaixo vêm do catálogo local, por correspondência de termos do registro — contingência, não substituto da literatura indexada.`
      : `${fonte} indisponível (${error.message}). O catálogo local não achou correspondência no que está registrado; nenhuma hipótese foi proposta.`
  };
}
