import { anamnesisText } from "./narrative.js";
import { joinValues, normalizeText } from "./textFormat.js";
import { doctorDiagnosisOptions } from "./vocabulary.js";

export function treatmentOptionLines(value = "") {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split("\n").map(item => item.trim()).filter(Boolean);
}

export function diagnosticSyndromicOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiSindromico || form.diagnosticoAiOpcoes || "", 3); }

export function diagnosticNosologicalOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiNosologico || form.diagnosticoAiOutrasOpcoes || "", 3); }

export function diagnosticEtiologicalOptionLines(form = {}) { return normalizeDiagnosticOptions(form.diagnosticoAiEtiologico || "", 2); }

export function selectedDiagnosisValues(form = {}) {
  const values = Array.isArray(form.diagnosticoSelecionado)
    ? form.diagnosticoSelecionado
    : form.diagnosticoSelecionado
      ? [form.diagnosticoSelecionado]
      : [];
  return values.filter(Boolean);
}

export function selectedDiagnosisText(form = {}) {
  return selectedDiagnosisValues(form).join("\n");
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

// A hipotese aparece so com o nome, mas guarda por dentro o codigo da CID-11
// em que foi ancorada. Sem isso, na hora de codificar o diagnostico aprovado
// so restaria o texto livre para casar com a tabela — e "Depressao Maior" nao
// casa com "Transtorno depressivo recorrente" por nenhuma comparacao textual.
function parseStoredJson(value) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function diagnosticCodeAnchors(form = {}) {
  return parseStoredJson(form.diagnosticoAncoras);
}

export function diagnosticCodes(form = {}) {
  const stored = parseStoredJson(form.diagnosticoCodigos);
  return Array.isArray(stored.itens) ? stored : { itens: [], geradoEm: "" };
}

export function formatDiagnosticCodeLine(item = {}) {
  return [
    item.name,
    item.cid11 ? `CID-11: ${item.cid11}` : "",
    item.dsm5tr ? `DSM-5-TR: ${item.dsm5tr}` : ""
  ].filter(Boolean).join(" - ");
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
  const text = normalizeText(sourceText);
  // Cada categoria concorre so com as regras dela. Antes a lista era uma so e
  // era fatiada por posicao — as tres primeiras viravam "sindromicas", as tres
  // seguintes "nosologicas" —, o que rotulava entidade nosologica como
  // sindrome. E sem correspondencia nao propoe nada, mesmo criterio do
  // servidor, que devolve 422 em vez de responder sem fonte.
  const byCategory = (categoria, limit) => diagnosticRules()
    .filter(rule => rule.categoria === categoria)
    .map(rule => ({ ...rule, score: rule.terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) }))
    .filter(rule => rule.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  // Mesmo criterio da IA: a hipotese aparece so com o nome, e a ancora fica
  // guardada. Se o catalogo continuasse colando codigo na linha, a via de
  // contingencia entregaria codigo sem passar pela aprovacao do medico —
  // justamente o que o fluxo novo tira do caminho.
  const anchors = { ...diagnosticCodeAnchors(form) };
  const namesOf = rules => rules.map(rule => {
    const code = (rule.cid11 || "").trim().split(" ")[0];
    if (code) anchors[rule.name] = code;
    return rule.name;
  }).join("\n");
  const syndromic = namesOf(byCategory("sindromico", 3));
  const nosological = namesOf(byCategory("nosologico", 3));
  const selectedDoctorOptions = selectedDiagnosisValues(form).filter(option => doctorDiagnosisOptions.includes(option));
  return {
    diagnosticoAiSindromico: syndromic,
    diagnosticoAiNosologico: nosological,
    diagnosticoAiEtiologico: namesOf(byCategory("etiologico", 2)),
    diagnosticoAncoras: JSON.stringify(anchors),
    diagnosticoCodigos: "",
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
  return {
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
// PENDENTE DE REVISAO MEDICA: os termos de busca e os codigos abaixo foram
// escritos por mim e nao passaram pelo crivo do Dr. Regis.
function diagnosticRules() {
  return [
    {
      name: "Depressao Maior",
      categoria: "nosologico",
      // 6A70 e episodio UNICO; recorrente e 6A71. A regra nao distingue os dois
      // porque nao pergunta episodios previos, entao carrega os dois codigos.
      cid11: "6A70/6A71 - Episodio depressivo unico ou transtorno depressivo recorrente",
      dsm5tr: "Transtorno depressivo maior, episodio depressivo maior",
      terms: ["hipotimia", "anedonia", "deprim", "lentificacao", "hipobulia", "despertar precoce", "ideacao suicida"],
      differential: "luto, transtorno bipolar, uso de substancias, hipotireoidismo e transtorno de ajustamento."
    },
    {
      name: "Transtorno de Ansiedade Generalizada",
      categoria: "nosologico",
      cid11: "6B00 - Transtorno de ansiedade generalizada",
      dsm5tr: "Transtorno de ansiedade generalizada",
      terms: ["humor ansioso", "ansios", "preocupacoes excessivas", "inquietude", "tensao", "panico"],
      differential: "transtorno do panico, ansiedade social, TOC, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Depressao Bipolar",
      categoria: "nosologico",
      cid11: "6A60/6A61 - Transtorno bipolar tipo I/tipo II",
      dsm5tr: "Transtorno bipolar I ou II",
      terms: ["hipertimia", "euforia", "reducao da necessidade de sono", "fuga de ideias", "logorreia", "aceleracao", "hiperbulia"],
      differential: "TDAH, uso de substancias, transtorno de personalidade borderline e episodio depressivo unipolar."
    },
    {
      name: "Transtorno Obsessivo-Compulsivo",
      categoria: "nosologico",
      cid11: "6B20 - Transtorno obsessivo-compulsivo",
      dsm5tr: "Transtorno obsessivo-compulsivo",
      terms: ["obsessoes", "compulsividade", "toc", "rituais", "intrusivos"],
      differential: "ansiedade generalizada, transtornos relacionados a trauma, tiques e transtorno de personalidade obsessivo-compulsiva."
    },
    {
      name: "Transtorno Psicotico Primario ou Secundario",
      categoria: "nosologico",
      cid11: "6A20-6A2Z - Espectro da esquizofrenia e outros transtornos psicoticos primarios",
      dsm5tr: "Espectro da esquizofrenia e outros transtornos psicoticos",
      terms: ["alucinacao", "delirio", "juizo prejudicado", "critica prejudicada", "desconfianca", "afrouxamento", "descarrilamento"],
      differential: "transtorno bipolar com sintomas psicoticos, depressao psicotica, delirium, epilepsia e substancias."
    },
    {
      name: "Transtorno Relacionado a Trauma ou Estresse",
      categoria: "nosologico",
      cid11: "6B40/6B43 - TEPT ou transtorno de ajustamento",
      dsm5tr: "TEPT ou transtorno de ajustamento",
      terms: ["tept", "trauma", "luto", "separacao", "estresse", "conflito", "ajustamento"],
      differential: "depressao maior, ansiedade generalizada, luto prolongado e transtorno de personalidade."
    },
    {
      name: "Transtorno por Uso de Substancias",
      categoria: "nosologico",
      cid11: "6C40-6C4Z - Transtornos por uso de substancias",
      dsm5tr: "Transtornos relacionados a substancias e transtornos aditivos",
      terms: ["alcool", "cannabis", "cocaina", "crack", "opioides", "benzodiazepinicos", "substancias"],
      differential: "transtornos primarios do humor, ansiedade, psicose induzida por substancias e abstinencia/intoxicacao."
    },
    {
      name: "Transtorno do Panico",
      categoria: "nosologico",
      cid11: "6B01 - Transtorno do panico",
      dsm5tr: "Transtorno do panico",
      terms: ["panico", "palpitacoes", "falta de ar", "sudorese", "morte iminente", "crises"],
      differential: "ansiedade generalizada, ansiedade social, arritmias, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Transtorno de Deficit de Atencao e Hiperatividade",
      categoria: "nosologico",
      cid11: "6A05 - Transtorno de deficit de atencao e hiperatividade",
      dsm5tr: "Transtorno de deficit de atencao/hiperatividade",
      terms: ["desatencao", "dificuldade de concentracao", "impulsividade", "hiperatividade", "procrastinacao"],
      differential: "transtornos do humor, ansiedade, privacao de sono, uso de substancias e dificuldades de aprendizagem."
    },
    {
      name: "Transtorno Alimentar ou da Alimentacao",
      categoria: "nosologico",
      cid11: "6B80-6B8Z - Transtornos alimentares ou da alimentacao",
      dsm5tr: "Transtornos alimentares e da ingestao de alimentos",
      terms: ["compulsao alimentar", "restricao alimentar", "perda de peso", "ganho de peso", "imagem corporal"],
      differential: "depressao, ansiedade, condicoes endocrinas, efeitos medicamentosos e transtorno dismorfico corporal."
    },
    {
      name: "Sindrome Depressiva",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["hipotimia", "anedonia", "deprim", "hipobulia", "lentificacao", "desanimo", "choro facil", "desesperanca", "ideacao suicida", "culpa", "desvalia"],
      differential: "episodio depressivo maior, depressao bipolar, luto, transtorno de ajustamento, hipotireoidismo e depressao secundaria a substancias."
    },
    {
      name: "Sindrome Maniaca ou Hipomaniaca",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["hipertimia", "euforia", "expansiv", "logorreia", "fuga de ideias", "hiperbulia", "reducao da necessidade de sono", "grandiosidade", "taquipsiquismo", "gastos excessivos"],
      differential: "transtorno bipolar tipo I ou II, mania induzida por substancias ou medicamentos, TDAH e transtorno de personalidade."
    },
    {
      name: "Sindrome Ansiosa",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["ansios", "apreensao", "preocupacao excessiva", "inquietude", "tensao corporal", "tensao muscular", "hipervigilancia"],
      differential: "ansiedade generalizada, transtorno do panico, ansiedade social, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Sindrome Psicotica",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["alucinacao", "delirio", "descarrilamento", "afrouxamento", "critica prejudicada", "juizo prejudicado", "desconfianca", "autorreferencia", "desorganizacao"],
      differential: "esquizofrenia e transtornos psicoticos primarios, psicose afetiva, delirium, psicose induzida por substancias e causa organica."
    },
    {
      name: "Sindrome Obsessivo-Compulsiva",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["obsessoes", "compulsoes", "compulsividade", "rituais", "intrusivos", "verificacao", "lavagem", "simetria"],
      differential: "TOC, transtornos do espectro obsessivo-compulsivo, tiques, ansiedade generalizada e personalidade obsessivo-compulsiva."
    },
    {
      name: "Sindrome Catatonica",
      categoria: "sindromico",
      // 6A40 sozinho e "catatonia associada a outro transtorno mental". Como a
      // regra e sindromica e nao afirma a causa, vai o bloco inteiro: 6A41 e
      // induzida por substancia e 6E69 e secundaria a condicao medica.
      cid11: "6A40-6A4Z - Catatonia",
      dsm5tr: "Catatonia",
      terms: ["catatonia", "estupor", "negativismo", "flexibilidade cerea", "mutismo", "ecolalia", "ecopraxia", "estereotipias", "posturas bizarras"],
      differential: "catatonia associada a transtorno do humor ou psicotico, catatonia secundaria a condicao medica e sindrome neuroleptica maligna."
    },
    {
      name: "Sindrome Confusional Aguda (Delirium)",
      categoria: "sindromico",
      cid11: "6D70 - Delirium",
      dsm5tr: "Delirium",
      terms: ["rebaixamento do nivel de consciencia", "obnubilacao", "confusao mental", "inicio agudo", "flutuacao", "torpor", "letargia", "inversao do ciclo sono-vigilia"],
      differential: "demencia, estado pos-ictal, intoxicacao ou abstinencia, infeccao, disturbio metabolico e causa medicamentosa."
    },
    {
      name: "Sindrome Demencial",
      categoria: "sindromico",
      cid11: "6D80-6D8Z - Demencia",
      dsm5tr: "Transtorno neurocognitivo maior",
      terms: ["declinio cognitivo", "perda de memoria", "amnesia", "esquecimento progressivo", "apraxia", "afasia", "agnosia", "prejuizo funcional progressivo"],
      differential: "delirium, transtorno neurocognitivo leve, depressao com prejuizo cognitivo e causas reversiveis (B12, tireoide, hidrocefalia)."
    },
    {
      name: "Sindrome de Agitacao Psicomotora",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["agitacao psicomotora", "hiperatividade motora", "inquietude psicomotora", "heteroagressividade", "hostilidade", "contencao"],
      differential: "mania, psicose em atividade, delirium, intoxicacao ou abstinencia, acatisia e dor nao reconhecida."
    },
    {
      name: "Sindrome Dissociativa ou Conversiva",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["dissociacao", "despersonalizacao", "desrealizacao", "conversao", "amnesia dissociativa", "crise nao epileptica"],
      differential: "epilepsia, transtornos relacionados a trauma, simulacao e condicao neurologica."
    },
    {
      name: "Sindrome de Abstinencia",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["abstinencia", "fissura", "craving", "tremores", "sudorese", "interrupcao abrupta", "retirada"],
      differential: "abstinencia de alcool, benzodiazepinicos ou opioides, delirium tremens, ansiedade primaria e causa clinica."
    },
    {
      name: "Sindrome de Intoxicacao Aguda",
      categoria: "sindromico",
      cid11: "",
      dsm5tr: "",
      terms: ["intoxicacao", "embriaguez", "uso recente", "hiperemia conjuntival", "midriase", "miose", "disartria"],
      differential: "intoxicacao por substancia especifica, delirium, causa metabolica e efeito medicamentoso."
    },
    {
      name: "Induzido por Substancia",
      categoria: "etiologico",
      cid11: "6C40-6C4Z - Transtornos por uso de substancias",
      dsm5tr: "Transtornos induzidos por substancias",
      terms: ["alcool", "cannabis", "cocaina", "crack", "opioides", "anfetamina", "estimulantes", "benzodiazepinicos", "substancias", "uso de drogas"],
      differential: "transtorno primario coexistente, intoxicacao, abstinencia e transtorno persistente induzido por substancia."
    },
    {
      name: "Secundario a Condicao Medica Geral",
      categoria: "etiologico",
      cid11: "6E60-6E6Z - Sindromes mentais ou comportamentais secundarias",
      dsm5tr: "Transtorno mental devido a outra condicao medica",
      terms: ["hipotireoidismo", "hipertireoidismo", "anemia", "neoplasia", "epilepsia", "avc", "tce", "traumatismo cranioencefalico", "lupus", "hiv", "sifilis", "diabetes", "insuficiencia renal", "apneia do sono"],
      differential: "transtorno mental primario, causa medicamentosa e transtorno induzido por substancia."
    },
    {
      name: "Iatrogenico ou Medicamentoso",
      categoria: "etiologico",
      cid11: "",
      dsm5tr: "",
      terms: ["corticoide", "corticoides", "interferon", "isotretinoina", "efeito adverso", "efeito colateral", "polifarmacia", "inicio de medicacao", "troca de medicacao"],
      differential: "condicao medica de base, transtorno primario e interacao medicamentosa."
    },
    {
      name: "Relacionado a Estressor Psicossocial",
      categoria: "etiologico",
      cid11: "",
      dsm5tr: "",
      terms: ["luto por morte", "falecimento", "separacao", "divorcio", "desemprego", "demissao", "violencia", "abuso", "estressor", "perda recente"],
      differential: "transtorno de ajustamento, TEPT, luto prolongado, episodio depressivo desencadeado e reacao normal ao estressor."
    },
    {
      name: "Neurodegenerativo ou Lesional do SNC",
      categoria: "etiologico",
      cid11: "",
      dsm5tr: "",
      terms: ["parkinson", "alzheimer", "lesao cerebral", "tumor cerebral", "hidrocefalia", "esclerose multipla", "huntington", "neurocirurgia"],
      differential: "demencia de outra etiologia, delirium, sequela vascular e causa metabolica."
    },
    {
      name: "Carga Familiar ou Genetica",
      categoria: "etiologico",
      cid11: "",
      dsm5tr: "",
      terms: ["historia familiar", "antecedentes familiares", "parente de primeiro grau", "familiar com transtorno", "carga familiar"],
      differential: "avaliar peso do fator familiar diante de estressores atuais e de causas clinicas."
    }
  ];
}
