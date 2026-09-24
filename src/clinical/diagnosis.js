import { anamnesisText } from "./narrative.js";
import { arrayValue, joinValues, normalizeText } from "./textFormat.js";
import { doctorDiagnosisAliases, doctorDiagnosisOptions } from "./vocabulary.js";

export function treatmentOptionLines(value = "") {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split("\n").map(item => item.trim()).filter(Boolean);
}

// Sem teto de quantidade desde 24/09/2026 (decisao do Dr. Regis): o
// diagnostico diferencial nao compete por um numero fixo de vagas. Mesma
// mudanca do schema em server.py e da validacao em clinicalAiService.js --
// aqui e o caminho de texto plano, quando a resposta nao vem em JSON.
export function diagnosticSyndromicOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiSindromico || form.diagnosticoAiOpcoes || "", Infinity); }

export function diagnosticNosologicalOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiNosologico || form.diagnosticoAiOutrasOpcoes || "", Infinity); }

export function diagnosticEtiologicalOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiEtiologico || "", Infinity); }

// O catalogo local nao propoe especificador: ele casa termo, e gravidade,
// remissao e curso nao se leem de uma palavra solta no prontuario. Quando a IA
// nao responde, este grupo fica vazio — e a tela diz isso.
export function diagnosticSpecifierOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiEspecificadores || "", 4); }

// Mesmo caso do especificador: o catalogo local nao propoe comorbidade nem
// fator agravante. Comorbidade exige afirmar que duas entidades coexistem, e
// agravante e circunstancia do caso — nenhum dos dois se le por correspondencia
// de termo. Vem so da IA; sem ela, os blocos ficam vazios e a tela diz isso.
export function diagnosticComorbidityOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiComorbidades || "", 3); }

export function diagnosticAggravatingOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiAgravantes || "", 4); }

export function selectedComorbidityValues(form = {}) {
  return listValues(form.comorbidadeSelecionada);
}

export function selectedAggravatingValues(form = {}) {
  return listValues(form.agravanteSelecionado);
}

function listValues(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.filter(Boolean);
}

export function selectedSpecifierValues(form = {}) {
  const values = Array.isArray(form.especificadorSelecionado)
    ? form.especificadorSelecionado
    : form.especificadorSelecionado
      ? [form.especificadorSelecionado]
      : [];
  return values.filter(Boolean);
}

export function selectedDiagnosisValues(form = {}) {
  const values = Array.isArray(form.diagnosticoSelecionado)
    ? form.diagnosticoSelecionado
    : form.diagnosticoSelecionado
      ? [form.diagnosticoSelecionado]
      : [];
  return values.filter(Boolean).map(canonicalDoctorOption);
}

// As quatro hipoteses do medico ganharam CID-10 e DSM-5-TR no rotulo em
// 31/08/2026. O prontuario guarda o texto inteiro, entao um registro salvo
// antes disso traz o rotulo curto e deixaria de casar — a marcacao sumiria da
// tela sem sumir do registro, exatamente o que ja acontecera com os acentos.
// A chave e a descricao antes dos codigos; o resto do rotulo pode mudar.
function doctorOptionKey(texto = "") {
  return normalizeText(String(texto).split(/ - (?:CID-10|DSM-5-TR):/)[0]);
}

const DOCTOR_OPTION_BY_KEY = new Map([
  ...doctorDiagnosisOptions.map(option => [doctorOptionKey(option), option]),
  ...[...doctorDiagnosisAliases].map(([antigo, indice]) => [doctorOptionKey(antigo), doctorDiagnosisOptions[indice]])
]);

export function canonicalDoctorOption(value = "") {
  return DOCTOR_OPTION_BY_KEY.get(doctorOptionKey(value)) || value;
}

// "Outro" e a marca de que o medico escreveu a propria hipotese. Aqui ela e
// trocada pelo texto que ele escreveu — este e o funil por onde a hipotese
// chega ao prontuario, ao tratamento e a evolucao. selectedDiagnosisValues
// continua devolvendo o valor cru, porque e ele que decide qual caixa aparece
// marcada na tela.
export function selectedDiagnosisText(form = {}) {
  const escrita = String(form.diagnosticoMedicoOutro || "").trim();
  return selectedDiagnosisValues(form)
    .map(value => (normalizeText(value) === "outro" ? escrita : value))
    .filter(Boolean)
    .join("\n");
}

export function normalizeDiagnosticOptions(value = "", limit = 5) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .filter(line => !/^hipotese principal|^justificativa|^diagnosticos diferenciais|^dados ausentes|^alertas/i.test(normalizeText(line)));
  return lines.slice(0, limit);
}

// Sindrome nem sempre tem codigo: sindrome ansiosa nao e uma entidade da
// CID-11. Quando o codigo nao existe o campo some da linha, em vez de sair
// "CID-11: undefined" ao lado do nome. A IA nao devolve vazio nesses casos:
// devolve a string "N/A", que precisa ser tratada como ausencia.
function diagnosticCode(value) {
  const clean = String(value || "").trim();
  return /^(n\.?\/?a\.?|nao se aplica|não se aplica|nao informado|não informado|sem codigo|sem código|-{1,2}|—)$/i.test(clean) ? "" : clean;
}

export function formatDiagnosticOption(item = {}) {
  const cid11 = diagnosticCode(item.cid11);
  const dsm5tr = diagnosticCode(item.dsm5tr);
  return [
    item.name,
    cid11 ? `CID-11: ${cid11}` : "",
    dsm5tr ? `DSM-5-TR: ${dsm5tr}` : ""
  ].filter(Boolean).join(" - ");
}

// Canoniza a hipotese do medico sem acento: os quatro rotulos foram
// acentuados, e um prontuario salvo antes disso guarda "Ausencia de
// psicopatologia...". Com comparacao literal, a hipotese dele desaparecia ao
// gerar o diagnostico de novo — o registro perdia a escolha do medico.
export function doctorSelectedOptions(form = {}) {
  const catalogo = new Set(doctorDiagnosisOptions);
  return selectedDiagnosisValues(form).filter(value => catalogo.has(value));
}

// A marca do transtorno, lida dos campos estruturados em vez de adivinhada no
// texto: prejuizo funcional registrado ("Sem impacto" nao conta, e a negacao
// dele) ou curso definido — episodico, persistente, recorrente. Sao os dois
// dados que separam "tem estes achados hoje" de "tem uma perturbacao que
// afeta a vida diaria".
function hasDisorderMarker(form = {}) {
  const impacto = arrayValue(form.impacto).filter(value => normalizeText(value) !== "sem impacto");
  const curso = arrayValue(form.curso).filter(Boolean);
  const inicio = arrayValue(form.inicio).filter(value => ["recorrente", "insidioso", "desde a infancia/adolescencia"].includes(normalizeText(value)));
  return Boolean(impacto.length || curso.length || inicio.length);
}

// O motor casa substring e nao le negacao — e a negacao e a redacao padrao da
// anamnese psiquiatrica. "Nega uso de substancias" fazia a hipotese Induzido
// por Substancia disparar justamente no paciente que nao usa nada. Aqui o
// trecho negado sai do texto antes de qualquer comparacao: a expressao de
// negacao e o que vem depois dela, ate a pontuacao ou no maximo seis palavras
// — o bastante para a formula usual, curto o bastante para nao engolir a
// oracao seguinte de um periodo corrido.
const NEGACAO = /\b(?:nega(?:ou|m|va|vam)?|nao (?:refere|relata|apresenta|faz uso|ha|houve)|nunca (?:usou|fez uso)|sem (?:uso|historia|historico|antecedente|antecedentes|relato|sinais|indicios)(?: de)?|ausencia de)\b(?:\s+[^\s.,;:|!?()]+){0,6}/g;

function stripNegated(text = "") {
  return text.replace(NEGACAO, " ");
}

// O medico nomeou a entidade no proprio registro — "TDAH", "esquizofrenia",
// "bipolar". Nomeada, ela dispensa a marca: quem esta afirmando o transtorno
// e ele, nao a regra.
//
// Nome inteiro, e nao pedaco de palavra, desde 11/09/2026: "tag" casava dentro
// de "estagio", "contagio" e "tagarela", e o nome liberava a hipotese de TAG
// sem a marca do transtorno. O plural continua valendo -- "psicoses",
// "bipolares". Os termos de sintoma (`terms`) seguem casando por pedaco, de
// proposito: "ansios" e "expansiv" sao radicais.
function namesEntity(rule = {}, text = "") {
  const semExcecoes = (rule.naoNomeia || [])
    .reduce((texto, termo) => texto.replace(wholeTermPattern(termo, "g"), " "), text);
  return (rule.nomeia || []).some(term => wholeTermPattern(term).test(semExcecoes));
}

function wholeTermPattern(term = "", flags = "") {
  const escapado = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escapado}(?:e?s)?(?![a-z0-9])`, flags);
}

export function buildDiagnosticSuggestion(form) {
  const qphdaText = anamnesisText(form);
  const sourceText = [
    qphdaText, form.fatoresOutro,
    joinValues(form.fatores), joinValues(form.fatoresMelhora), joinValues(form.impacto),
    joinValues(form.psiPrevios), joinValues(form.tratamentos), joinValues(form.medicos), joinValues(form.familiares), joinValues(form.substancias),
    joinValues(form.aparencia), joinValues(form.consciencia), joinValues(form.atencao), joinValues(form.orientacao), joinValues(form.memoria), joinValues(form.sensopercepcao),
    joinValues(form.pensamentoCursoForma), joinValues(form.pensamentoConteudo), joinValues(form.linguagem),
    joinValues(form.humor), joinValues(form.afeto), joinValues(form.psicomotricidade), joinValues(form.vontade), joinValues(form.juizoCritico),
    form.observacoesRetorno
  ].filter(Boolean).join(" | ");
  const text = stripNegated(normalizeText(sourceText));
  // Cada categoria concorre so com as regras dela. Antes a lista era uma so e
  // era fatiada por posicao — as tres primeiras viravam "sindromicas", as tres
  // seguintes "nosologicas" —, o que rotulava entidade nosologica como
  // sindrome. E sem correspondencia nao propoe nada, mesmo criterio do
  // servidor, que devolve 422 em vez de responder sem fonte.
  const marcaDeTranstorno = hasDisorderMarker(form);
  const byCategory = (categoria, limit) => diagnosticRules()
    .filter(rule => rule.categoria === categoria)
    .map(rule => ({ ...rule, score: rule.terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) }))
    .filter(rule => rule.score > 0)
    // Sindrome e conjunto de achados; transtorno e a perturbacao que afeta a
    // vida diaria, social ou de trabalho. Sao camadas diferentes, e o catalogo
    // tratava as duas como lista de sintomas: a Sindrome Depressiva e a
    // Depressao Maior chegaram a compartilhar dez termos, entao "paciente
    // deprimida" propunha o transtorno. Sindrome depressiva ocorre tambem no
    // esquizofrenico e no borderline — o sintoma sozinho nao nomeia entidade.
    // Aqui a camada nosologica passa a exigir, alem do sintoma, ou a marca do
    // transtorno (prejuizo funcional, curso definido) ou o proprio nome da
    // entidade no registro. A sindromica segue disparando com um achado, que
    // e exatamente o trabalho dela.
    .filter(rule => categoria !== "nosologico" || marcaDeTranstorno || namesEntity(rule, text))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const namesOf = rules => rules.map(formatDiagnosticOption).join("\n");
  const syndromic = namesOf(byCategory("sindromico", 3));
  // Dele, 14/09/2026: "qualquer episodio de mania documentado caracteriza
  // bipolaridade. Invariavelmente". Com mania no registro, a hipotese do humor e
  // o bipolar, e a depressao unipolar sai da lista em vez de concorrer com ele.
  const nosologicas = byCategory("nosologico", 4);
  const comMania = nosologicas.some(rule => rule.name === "Transtorno Bipolar");
  const nosological = namesOf(nosologicas.filter(rule => !(comMania && rule.name === "Depressão Maior")).slice(0, 3));
  const selectedDoctorOptions = doctorSelectedOptions(form);
  return {
    diagnosticoAiSindromico: syndromic,
    diagnosticoAiNosologico: nosological,
    diagnosticoAiEtiologico: namesOf(byCategory("etiologico", 2)),
    // Vazio de proposito: ver diagnosticSpecifierOptionLines. E limpa o que a
    // IA tenha proposto antes, para nao sobrar especificador de uma geracao
    // ao lado de hipoteses de outra.
    diagnosticoAiEspecificadores: "",
    diagnosticoAiComorbidades: "",
    diagnosticoAiAgravantes: "",
    // Campos antigos, mantidos para os prontuarios ja salvos.
    diagnosticoAiOpcoes: syndromic,
    diagnosticoAiOutrasOpcoes: nosological,
    diagnosticoSelecionado: selectedDoctorOptions,
    diagnosticoManual: selectedDoctorOptions.join("\n"),
    diferenciais: ""
  };
}

export function parseTreatmentResponse(text = "") {
  const clean = String(text || "").trim();
  const medMatch = clean.match(/TRATAMENTO MEDICAMENTOSO:\s*([\s\S]*?)(?:\n\s*OUTRAS ABORDAGENS(?: NÃO FARMACOLÓGICAS)?:|$)/i);
  const therapyMatch = clean.match(/OUTRAS ABORDAGENS(?: NÃO FARMACOLÓGICAS)?:\s*([\s\S]*)$/i);
  const medicationOptions = treatmentOptionLines(medMatch?.[1]).slice(0, 3).map(line => {
    const parts = line.split(/\s*\|\s*/);
    return {
      medication: parts[0] || "",
      initial_dose: (parts[1] || "").replace(/^Dose inicial:\s*/i, ""),
      progression: (parts[2] || "").replace(/^Progress[aã]o:\s*/i, ""),
      target_dose: (parts[3] || "").replace(/^Dose final:\s*/i, "")
    };
  });
  const approachOptions = treatmentOptionLines(therapyMatch?.[1]).slice(0, 3).map(line => {
    const parts = line.split(/\s*\|\s*/);
    return { approach: parts[0] || "", details: parts.slice(1).join(" | ") };
  });
  // "Ambulatorial | consultas semanais ate reduzir o risco". Vem
  // antes das duas listas no texto plano pela mesma razao que vem antes na
  // tela: onde tratar decide-se antes de com o que tratar.
  const nivelMatch = clean.match(/N[IÍ]VEL DE CUIDADO:\s*([^\n]+)/i);
  const [nivel = "", justificativa = ""] = (nivelMatch?.[1] || "").split(/\s*\|\s*/);
  const careLevel = nivel.trim() && justificativa.trim()
    ? { level: nivel.trim(), justification: justificativa.trim() }
    : null;
  return {
    careLevel,
    medicationOptions,
    approachOptions
  };
}

export function formatMedicationTreatmentOption(option = {}) {
  return `${option.medication} | Dose inicial: ${option.initial_dose} | Progressão: ${option.progression} | Dose final: ${option.target_dose}`;
}

export function formatNonPharmacologicalOption(option = {}) {
  return `${option.approach} | ${option.details}`;
}

// Catalogo local. Contingencia para quando a IA/RAG nao responde — nao
// substitui a literatura indexada. As sindromes descritivas nao levam codigo:
// "sindrome ansiosa" e descricao psicopatologica, nao entidade da CID-11.
// Termos e codigos revisados pelo Dr. Regis em 20/08/2026, nos tres blocos —
// nosologico, sindromico e etiologico. Alteracao de termo aqui muda hipotese
// na tela: e decisao clinica, nao ajuste de texto.
function diagnosticRules() {
  return [
    {
      name: "Depressão Maior",
      categoria: "nosologico",
      // 6A70 e episodio UNICO; recorrente e 6A71. A regra nao distingue os dois
      // porque nao pergunta episodios previos, entao carrega os dois codigos.
      cid11: "6A70/6A71 - Episodio depressivo unico ou transtorno depressivo recorrente",
      dsm5tr: "F32.9/F33.9 - Episodio unico ou recorrente, nao especificado",
      nomeia: ["depressao maior", "episodio depressivo", "transtorno depressivo", "distimia", "depressao recorrente"],
      terms: ["hipotimia", "anedonia", "depressivo", "deprimido", "deprimida", "lentificacao", "hipobulia", "despertar precoce", "ideacao suicida", "insonia", "fadiga", "cansaco", "desanimo", "culpa", "desesperanca"],
      differential: "luto, transtorno bipolar, uso de substancias, hipotireoidismo e transtorno de ajustamento."
    },
    {
      name: "Transtorno de Ansiedade Generalizada",
      categoria: "nosologico",
      cid11: "6B00 - Transtorno de ansiedade generalizada",
      dsm5tr: "F41.1 - Generalized anxiety disorder",
      nomeia: ["ansiedade generalizada", "tag"],
      terms: ["humor ansioso", "ansios", "ansiedade", "preocupacao", "preocupacoes excessivas", "inquietude", "panico"],
      differential: "transtorno do panico, ansiedade social, TOC, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Transtorno Bipolar",
      categoria: "nosologico",
      cid11: "6A60/6A61 - Transtorno bipolar tipo I/tipo II",
      dsm5tr: "F31.9 - Bipolar disorder, unspecified",
      nomeia: ["transtorno bipolar", "bipolaridade", "bipolar"],
      terms: ["hipertimia", "euforia", "reducao da necessidade de sono", "fuga de ideias", "logorreia", "aceleracao", "hiperbulia"],
      differential: "TDAH, uso de substancias, transtorno de personalidade borderline e episodio depressivo unipolar."
    },
    {
      name: "Transtorno Obsessivo-Compulsivo",
      categoria: "nosologico",
      cid11: "6B20 - Transtorno obsessivo-compulsivo",
      dsm5tr: "F42.2 - Mixed obsessional thoughts and acts",
      // "toc" sozinho e substring de "protocolo" e "tocar". Com os pontos, so
      // casa quando o medico escreve a sigla: normalizeText tira acento e
      // minusculiza, entao "T.O.C." vira "t.o.c.".
      nomeia: ["transtorno obsessivo", "t.o.c"],
      terms: ["obsessoes", "compulsividade", "compulsoes", "t.o.c", "rituais", "intrusivos"],
      differential: "ansiedade generalizada, transtornos relacionados a trauma, tiques e transtorno de personalidade obsessivo-compulsiva."
    },
    {
      name: "Transtorno Psicótico Primário ou Secundário",
      categoria: "nosologico",
      cid11: "6A20-6A2Z - Espectro da esquizofrenia e outros transtornos psicoticos primarios",
      dsm5tr: "F20.9/F29 - Esquizofrenia ou psicose nao especificada",
      // "delirio" nao casa com "delirium": delirium saiu do app inteiro por
      // decisao medica — e quadro de internacao, nao de consultorio.
      nomeia: ["esquizofrenia", "transtorno psicotico", "esquizoafetivo", "psicose"],
      terms: ["alucinacao", "delirio", "juizo prejudicado", "critica prejudicada", "desconfianca", "afrouxamento", "descarrilamento", "alogia", "embotamento", "isolamento", "autorreferencia"],
      differential: "transtorno bipolar com sintomas psicoticos, depressao psicotica, epilepsia e substancias."
    },
    {
      name: "Transtorno Relacionado a Trauma ou Estresse",
      categoria: "nosologico",
      cid11: "6B40/6B43 - TEPT ou transtorno de ajustamento",
      dsm5tr: "F43.10/F43.20 - TEPT ou transtorno de adaptacao",
      // "flashback" sem o s casa com singular e plural.
      nomeia: ["tept", "transtorno de estresse", "transtorno de ajustamento"],
      terms: ["tept", "trauma", "luto", "separacao", "ajustamento", "flashback", "evitacao", "alerta alto"],
      differential: "depressao maior, ansiedade generalizada, luto prolongado e transtorno de personalidade."
    },
    {
      name: "Transtorno por Uso de Substâncias",
      categoria: "nosologico",
      cid11: "6C40-6C4Z - Transtornos por uso de substancias",
      dsm5tr: "F10.20/F19.20 - Dependencia de alcool ou de outra substancia",
      // "dependencia de" saiu em 11/09/2026, por decisao dele: nomeava o
      // transtorno em "dependencia de cuidados". No lugar, vicio, adicao e uso
      // abusivo -- este sem o "de", para valer tambem "uso abusivo do crack".
      nomeia: ["transtorno por uso", "dependencia quimica", "alcoolismo", "vicio", "adicao", "uso abusivo"],
      // "Adicao" tambem e acrescimo -- "adicao de litio", "em adicao ao
      // tratamento" --, e acrescimo de farmaco e redacao de rotina na
      // potencializacao. Esses usos saem do texto antes de conferir o nome.
      naoNomeia: ["em adicao", "adicao de"],
      terms: ["alcool", "cannabis", "cocaina", "crack", "opioides", "benzodiazepinicos", "substancias"],
      differential: "transtornos primarios do humor, ansiedade, psicose induzida por substancias e abstinencia/intoxicacao."
    },
    {
      name: "Transtorno de Pânico",
      categoria: "nosologico",
      cid11: "6B01 - Transtorno do panico",
      dsm5tr: "F41.0 - Panic disorder",
      nomeia: ["transtorno de panico", "sindrome do panico"],
      terms: ["panico", "palpitacoes", "falta de ar", "sudorese", "morte iminente"],
      differential: "ansiedade generalizada, ansiedade social, arritmias, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Transtorno de Déficit de Atenção e Hiperatividade",
      categoria: "nosologico",
      cid11: "6A05 - Transtorno de deficit de atencao e hiperatividade",
      dsm5tr: "F90.9 - ADHD, unspecified type",
      nomeia: ["tdah", "deficit de atencao"],
      terms: ["desatencao", "dificuldade de concentracao", "impulsividade", "hiperatividade", "procrastinacao", "desorganizacao", "esquecimento", "hiperfoco", "inquietude"],
      differential: "transtornos do humor, ansiedade, privacao de sono, uso de substancias e dificuldades de aprendizagem."
    },
    {
      name: "Transtorno Alimentar ou da Alimentação",
      categoria: "nosologico",
      cid11: "6B80-6B8Z - Transtornos alimentares ou da alimentacao",
      dsm5tr: "F50.9 - Eating disorder, unspecified",
      nomeia: ["anorexia", "bulimia", "transtorno alimentar", "compulsao alimentar periodica"],
      terms: ["compulsao", "restricao"],
      differential: "depressao, ansiedade, condicoes endocrinas, efeitos medicamentosos e transtorno dismorfico corporal."
    },
    {
      name: "Síndrome Depressiva",
      categoria: "sindromico",
      cid11: "",
      terms: ["hipotimia", "anedonia", "deprimido", "deprimida", "hipobulia", "lentificacao", "desanimo", "choro facil", "desesperanca", "ideacao suicida", "culpa", "desvalia"],
      differential: "episodio depressivo maior, depressao bipolar, luto, transtorno de ajustamento, hipotireoidismo e depressao secundaria a substancias."
    },
    {
      name: "Síndrome Maníaca ou Hipomaníaca",
      categoria: "sindromico",
      cid11: "",
      terms: ["hipertimia", "euforia", "expansiv", "logorreia", "fuga de ideias", "hiperbulia", "reducao da necessidade de sono", "grandiosidade", "taquipsiquismo", "gastos excessivos"],
      differential: "transtorno bipolar tipo I ou II, mania induzida por substancias ou medicamentos, TDAH e transtorno de personalidade."
    },
    {
      name: "Síndrome Ansiosa",
      categoria: "sindromico",
      cid11: "",
      terms: ["ansios", "apreensao", "preocupacao excessiva", "inquietude", "tensao corporal", "tensao muscular", "hipervigilancia"],
      differential: "ansiedade generalizada, transtorno do panico, ansiedade social, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Síndrome Psicótica",
      categoria: "sindromico",
      cid11: "",
      terms: ["alucinacao", "delirio", "descarrilamento", "afrouxamento", "critica prejudicada", "juizo prejudicado", "desconfianca", "autorreferencia", "desorganizacao"],
      differential: "esquizofrenia e transtornos psicoticos primarios, psicose afetiva, psicose induzida por substancias e causa organica."
    },
    {
      name: "Síndrome Obsessivo-Compulsiva",
      categoria: "sindromico",
      cid11: "",
      terms: ["obsessoes", "compulsoes", "compulsividade", "rituais", "intrusivos", "verificacao", "lavagem", "simetria"],
      differential: "TOC, transtornos do espectro obsessivo-compulsivo, tiques, ansiedade generalizada e personalidade obsessivo-compulsiva."
    },
    {
      name: "Síndrome Catatônica",
      categoria: "sindromico",
      // 6A40 sozinho e "catatonia associada a outro transtorno mental". Como a
      // regra e sindromica e nao afirma a causa, vai o bloco inteiro: 6A41 e
      // induzida por substancia e 6E69 e secundaria a condicao medica.
      cid11: "6A40-6A4Z - Catatonia",
      dsm5tr: "F06.1 - Catatonic disorder due to known physiological condition",
      terms: ["catatonia", "estupor", "negativismo", "flexibilidade cerea", "mutismo", "ecolalia", "ecopraxia", "estereotipias", "posturas bizarras"],
      differential: "catatonia associada a transtorno do humor ou psicotico, catatonia secundaria a condicao medica e sindrome neuroleptica maligna."
    },
    // A Sindrome Confusional Aguda (Delirium) saiu do catalogo por decisao
    // medica: e diagnostico de paciente internado, sobretudo em UTI, e este
    // app e de consultorio. Fora do escopo, nao entra em contexto nenhum —
    // nem como hipotese, nem como diagnostico diferencial.
    {
      name: "Síndrome Demencial",
      categoria: "sindromico",
      // Sindrome nao leva codigo: quem carrega CID-11 e DSM-5-TR e a camada
      // nosologica, que nomeia a entidade. "Sindrome demencial" e o conjunto
      // de achados; o transtorno neurocognitivo e que tem codigo.
      cid11: "",
      // "amnesia" solto esta dentro de "amnesia dissociativa": um quadro
      // dissociativo disparava sindrome demencial junto. A demencia continua
      // coberta por declinio cognitivo, perda de memoria e esquecimento
      // progressivo, que sao o que o registro traz de fato.
      terms: ["declinio cognitivo", "perda de memoria", "amnesia anterograda", "esquecimento progressivo", "apraxia", "afasia", "agnosia", "prejuizo funcional progressivo"],
      differential: "transtorno neurocognitivo leve, depressao com prejuizo cognitivo e causas reversiveis (B12, tireoide, hidrocefalia)."
    },
    {
      name: "Síndrome de Agitação Psicomotora",
      categoria: "sindromico",
      cid11: "",
      terms: ["agitacao psicomotora", "hiperatividade motora", "inquietude psicomotora", "heteroagressividade", "hostilidade", "contencao"],
      differential: "mania, psicose em atividade, intoxicacao ou abstinencia, acatisia e dor nao reconhecida."
    },
    {
      name: "Síndrome Dissociativa ou Conversiva",
      categoria: "sindromico",
      cid11: "",
      terms: ["dissociacao", "despersonalizacao", "desrealizacao", "conversao", "amnesia dissociativa", "amnesia autobiografica", "crise nao epileptica"],
      differential: "epilepsia, transtornos relacionados a trauma, simulacao e condicao neurologica."
    },
    {
      name: "Síndrome de Abstinência",
      categoria: "sindromico",
      cid11: "",
      // "retirada" solto casava com "retirada gradual da medicacao" — desmame
      // planejado, o oposto de abstinencia. Com o complemento, so casa quando
      // a sindrome e nomeada.
      terms: ["abstinencia", "fissura", "craving", "tremores", "sudorese", "interrupcao abrupta", "sindrome de retirada"],
      // Delirium tremens volta por decisao medica: e entidade psiquiatrica, a
      // complicacao grave da abstinencia alcoolica, e nao o delirium de
      // internacao que saiu do app. No consultorio vale como sinal de
      // encaminhamento imediato.
      differential: "abstinencia de alcool, benzodiazepinicos ou opioides, delirium tremens, ansiedade primaria e causa clinica."
    },
    {
      name: "Síndrome de Intoxicação Aguda",
      categoria: "sindromico",
      cid11: "",
      terms: ["intoxicacao", "embriaguez", "uso recente", "hiperemia conjuntival", "midriase", "miose", "disartria"],
      differential: "intoxicacao por substancia especifica, causa metabolica e efeito medicamentoso."
    },
    // Excecao declarada por ele a regra de que so a camada nosologica leva
    // codigo: estas duas sao para o paciente ainda sem diagnostico confirmado,
    // e o codigo aqui e o proprio destino provisorio do caso. Nao retirar.
    {
      name: "Induzido por Substância",
      categoria: "etiologico",
      cid11: "6C40-6C4Z - Transtornos por uso de substancias",
      dsm5tr: "F19.90 - Other psychoactive substance use, unspecified",
      terms: ["alcool", "cannabis", "cocaina", "crack", "opioides", "anfetamina", "estimulantes", "benzodiazepinicos", "substancias", "uso de drogas"],
      differential: "transtorno primario coexistente, intoxicacao, abstinencia e transtorno persistente induzido por substancia."
    },
    {
      name: "Secundário a Condição Médica Geral",
      categoria: "etiologico",
      cid11: "6E60-6E6Z - Sindromes mentais ou comportamentais secundarias",
      dsm5tr: "F06.8 - Other specified mental disorders due to known physiological condition",
      terms: ["hipotireoidismo", "hipertireoidismo", "anemia", "neoplasia", "epilepsia", "avc", "tce", "traumatismo cranioencefalico", "lupus", "hiv", "sifilis", "diabetes", "insuficiencia renal", "apneia do sono"],
      differential: "transtorno mental primario, causa medicamentosa e transtorno induzido por substancia."
    },
    {
      name: "Iatrogênico ou Medicamentoso",
      categoria: "etiologico",
      cid11: "",
      terms: ["corticoide", "corticoides", "interferon", "isotretinoina", "efeito adverso", "efeito colateral", "polifarmacia", "inicio de medicacao", "troca de medicacao"],
      differential: "condicao medica de base, transtorno primario e interacao medicamentosa."
    },
    {
      name: "Relacionado a Estressor Psicossocial",
      categoria: "etiologico",
      cid11: "",
      // "abuso" solto casava com "abuso de alcool" e "abuso de substancias", que
      // sao a regra vizinha. Aqui o que importa e o abuso sofrido.
      terms: ["luto por morte", "falecimento", "separacao", "divorcio", "desemprego", "demissao", "violencia", "violencia domestica", "abuso sexual", "abuso fisico", "estressor", "perda recente"],
      differential: "transtorno de ajustamento, TEPT, luto prolongado, episodio depressivo desencadeado e reacao normal ao estressor."
    },
    {
      name: "Neurodegenerativo ou Lesional do SNC",
      categoria: "etiologico",
      cid11: "",
      terms: ["parkinson", "alzheimer", "lesao cerebral", "tumor cerebral", "hidrocefalia", "esclerose multipla", "huntington", "neurocirurgia"],
      differential: "demencia de outra etiologia, sequela vascular e causa metabolica."
    },
    {
      name: "Carga Familiar ou Genética",
      categoria: "etiologico",
      cid11: "",
      terms: ["historia familiar", "antecedentes familiares", "parente de primeiro grau", "familiar com transtorno", "carga familiar"],
      differential: "avaliar peso do fator familiar diante de estressores atuais e de causas clinicas."
    }
  ];
}
