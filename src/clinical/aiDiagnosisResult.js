import { buildDiagnosticSuggestion, doctorSelectedOptions, formatDiagnosticOption } from "./diagnosis.js";
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

export function diagnosisSuggestionFromAi({ result = {}, target = {}, sources = [], mode = "", codeWarnings = [] }) {
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
  const analysis = (result.psychopathological_analysis || [])
    .filter(item => ["domain", "finding", "evidence"].every(key => String(item?.[key] || "").trim()))
    .map(item => `${String(item.domain).trim()}: ${stripFinalPeriod(String(item.finding).trim())} (${stripFinalPeriod(String(item.evidence).trim())})`)
    .filter((linha, index, lista) => lista.indexOf(linha) === index)
    .slice(0, 8);
  return {
    analisePsicopatologica: analysis.join("\n"),
    diagnosticoAiSindromico: syndromicOptions.join("\n"),
    diagnosticoAiNosologico: nosologicalOptions.join("\n"),
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
    diagnosticoSelecionado: selectedDoctorOptions,
    diagnosticoManual: selectedDoctorOptions.join("\n"),
    diferenciais: "",
    ragSourcesDiagnostico: sources,
    aiMode: mode,
    aiStatus: [
      analysis.length
        ? `Análise psicopatológica: ${countLabel(analysis.length, "domínio", "domínios")}, cada um com a evidência do registro.`
        : "",
      `Propostas para você assinalar: ${countLabel(nosologicalOptions.length, "nosológica")}, ${countLabel(syndromicOptions.length, "sindrômica")} e ${countLabel(etiologicalOptions.length, "etiológica")}. As hipóteses do médico foram mantidas.`,
      specifierOptions.length ? `${countLabel(specifierOptions.length, "especificador", "especificadores")} proposto(s).` : "",
      comorbidityOptions.length ? `${countLabel(comorbidityOptions.length, "comorbidade")} proposta(s).` : "",
      aggravatingOptions.length ? `${countLabel(aggravatingOptions.length, "fator agravante", "fatores agravantes")} proposto(s).` : "",
      // Renomear muda o que ele le na tela, entao e dito. Os avisos de codigo
      // ficam no log: o codigo nao aparece nesta etapa, so na codificacao.
      ...(codeWarnings || []).filter(item => item.kind === "rename").map(item => item.text),
      duplicadas.length
        ? `${countLabel(duplicadas.length, "hipótese saiu", "hipóteses saíram")} em mais de uma categoria: ${duplicadas.join("; ")}.`
        : ""
    ].filter(Boolean).join(" "),
  };
}

// "Transtorno depressivo maior - CID-11: 6A70 - DSM-5-TR: F32.-" -> o nome.
function entityName(linha = "") {
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
    ragSourcesDiagnostico: [],
    treatmentStatus: `${fonte} indisponivel: ${error.message}`,
    aiStatus: encontrou
      ? `${fonte} indisponível (${error.message}). As hipóteses abaixo vêm do catálogo local, por correspondência de termos do registro — contingência, não substituto da literatura indexada.`
      : `${fonte} indisponível (${error.message}). O catálogo local não achou correspondência no que está registrado; nenhuma hipótese foi proposta.`
  };
}
