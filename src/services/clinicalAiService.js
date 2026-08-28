import { diagnosticAggravatingOptionLines, diagnosticComorbidityOptionLines, diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSpecifierOptionLines, diagnosticSyndromicOptionLines, formatDiagnosticOption, formatMedicationTreatmentOption, formatNonPharmacologicalOption, normalizeDiagnosticOptions, parseTreatmentResponse, selectedAggravatingValues, selectedComorbidityValues, selectedDiagnosisValues, selectedSpecifierValues, treatmentOptionLines } from "../clinical/diagnosis.js";
import { anamnesisText, conciseAntecedentsText, conciseComplaintText, conciseDiagnosticText, conciseHdaText, conciseIdentityText, conciseMentalExamText, joinWithOutro, mentalStateFindings, normalizeEvolutionNarrative, patientIdentificationText, professionalSelectedTreatmentItems, refinementAnswersText, requestedExamsText, returnStoryText, treatmentDiagnosisText } from "../clinical/narrative.js";
import { arrayValue, cleanClinicalLine, compactText, formatClinicalList, joinValues, normalizeText, stripFinalPeriod } from "../clinical/textFormat.js";
import { ANAMNESIS_AI_FIELDS, MENTAL_EXAM_AI_FIELDS } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js";

import { protocolBlocksText, protocolCatalogText, protocolItemById, protocolLoaded } from "../clinical/protocol.js";
import { parseMedicationResponse } from "./medicationService.js";

export function canonicalAiSelections(values, allowed = []) {
  const byNormalized = new Map(allowed.map(option => [normalizeText(option), option]));
  return arrayValue(values).map(value => byNormalized.get(normalizeText(value))).filter(Boolean);
}

export function localRefinementPlan(form = {}) {
  const hasRisk = arrayValue(form.riscoSuicidioIndicadores).some(value => !normalizeText(value).startsWith("nega"));
  return {
    questions: [
      { topic: "Duracao e controle", prompt: "A preocupacao ocorre na maioria dos dias e permanece dificil de controlar?", options: ["Sim", "Nao", "Parcialmente"], selection_mode: "single" },
      { topic: "Abrangencia", prompt: "Quais dominios concentram as preocupacoes?", options: ["Trabalho", "Familia", "Saude", "Financas", "Outros"], selection_mode: "multiple" },
      { topic: "Prejuizo funcional", prompt: "Qual o grau de prejuizo funcional atual?", options: ["Ausente", "Leve", "Moderado", "Grave"], selection_mode: "single" },
      { topic: "Substancias e causas clinicas", prompt: "Ha relacao temporal com cafeina, outras substancias, medicamentos ou condicao clinica?", options: ["Nao", "Cafeina", "Outra substancia", "Medicamento", "Condicao clinica", "Nao esclarecido"], selection_mode: "multiple" }
    ],
    red_flags: hasRisk ? [{ topic: "Risco suicida", reason: "Ha indicador de risco que exige confirmacao direta e plano de seguranca." }] : [],
    observations: [{ topic: "Sono", reason: "Esclarecer frequencia, latencia, despertares e impacto diurno." }],
    important_points: [{ topic: "Diagnosticos diferenciais", reason: "Confirmar ausencia de mania/hipomania, psicose, panico e causas relacionadas a substancias ou condicoes medicas." }]
  };
}

export async function requestClinicalAi(kind, prompt, mode = "current", ragQuery = "") {
  const response = await fetch("/api/clinical-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, prompt, mode: mode === "rag" ? "rag" : "current", ragQuery })
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const detail = data.detail ? ` ${compactText(data.detail, 320)}` : "";
    throw new Error(`${data.error || "Falha ao consultar o backend."}${detail}`);
  }
  const result = validateClinicalAiPayload(kind, data.result, data.text);
  return {
    result,
    text: data.text || clinicalAiTextFromResult(kind, result),
    sources: Array.isArray(data.sources) ? data.sources : [],
    // Codigo que a IA inventou e o servidor removeu. Vai a tela: a hipotese
    // chega sem codigo, e sem o aviso isso passaria por sindrome descritiva,
    // que legitimamente nao tem codigo.
    codeWarnings: Array.isArray(data.code_warnings) ? data.code_warnings : [],
    mode: data.mode || "current"
  };
}

export function buildRagQuery(kind, form = {}) {
  const diagnosis = treatmentDiagnosisText(form) || form.diagnosticoManual || "";
  // A busca vetorial recebe o dado ja estruturado, nao a transcricao bruta.
  // Depois de uma entrevista por voz, anamnesisText devolve a conversa inteira
  // — "Falante A: com dinheiro," e afins. Mil e quinhentos caracteres de fala
  // coloquial diluem o embedding e derrubam todas as fontes abaixo do limiar,
  // entao a consulta por voz voltava 422 num caso que a consulta digitada
  // recuperava sem dificuldade. Os campos estruturados dizem a mesma coisa em
  // vocabulario clinico: sao o que a extracao produziu a partir da conversa.
  // As negativas ficam de fora da busca. "Nega sintomas relacionados" e "Nega
  // ideacao, plano ou intencao suicida" nao se parecem com nada na literatura
  // indexada, e arrastavam o embedding inteiro para longe: a mesma consulta
  // recuperava zero fontes com elas e duas ou tres sem elas. Elas seguem no
  // prompt, onde documentam o que foi perguntado e negado — o que a busca
  // precisa e do que o paciente tem, nao do que ele nao tem.
  const positives = values => arrayValue(values).filter(value => !normalizeText(value).startsWith("nega"));
  const structured = [
    form.queixa,
    joinValues(positives(form.maniaHipomaniaSintomas)),
    joinValues(positives(form.ansiedadeSintomas)),
    joinValues(positives(form.depressaoSintomas)),
    joinValues(positives(form.psicoseSintomas)),
    joinValues(positives(form.sonoCaracteristicas)),
    joinValues(positives(form.usoSubstanciasComportamentos)),
    joinValues(positives(form.riscoSuicidioIndicadores)),
    mentalStateFindings(form).join("; "),
    // O que o medico esclareceu no refinamento tambem orienta a busca: sem
    // isso, a literatura recuperada ignora justamente a lacuna que ele acabou
    // de fechar.
    compactText(refinementAnswersText(form), 600)
  ].filter(Boolean).join("; ");
  // Sem estrutura ainda — consulta digitada, ou antes da extracao — cai na
  // narrativa, encurtada para nao repetir o mesmo problema.
  const symptoms = structured || compactText(anamnesisText(form), 600);
  // A anamnese e o refinamento rodam antes da extracao: ali a narrativa e o
  // unico dado que existe.
  const narrative = compactText(anamnesisText(form), 1200) || structured;
  if (kind === "anamnesis") return `Semiologia psiquiatrica para entrevista diagnostica: cronologia, curso, polaridade do humor, sintomas depressivos e maniacos, ansiedade, sono, psicose, risco suicida, substancias, causas medicas, funcionamento e fatores de protecao. Dados da narrativa: ${narrative}`.slice(0, 4000);
  if (kind === "refinement") return `Semiologia psiquiatrica para refinamento clinico: lacunas da anamnese, discriminacao entre sindromes, red flags, risco, psicose, bipolaridade, substancias, causas medicas, funcionamento e fatores de protecao. Dados ja registrados: ${narrative}`.slice(0, 4000);
  // O sintoma-alvo entra na busca, e nao so no prompt: e o RAG que orienta o
  // manejo dele agora, entao a literatura recuperada precisa cobri-lo. Sem esta
  // linha, a busca so falava do diagnostico e o alvo chegava a IA sem fonte.
  const alvos = joinValues(arrayValue(form.sintomasResiduais));
  if (kind === "treatment") return `Diretrizes e tratamento de ${diagnosis}. Dados clinicos relevantes: ${symptoms}`.slice(0, 4000);
  // A busca do sintoma-alvo pergunta por manejo, nao por diretriz de doenca, e
  // vai contra a biblioteca marcada "sintomatico". O diagnostico entra so como
  // contexto, no fim: quem manda aqui e o sintoma.
  if (kind === "symptomatic") return `Manejo sintomatico e alivio imediato de: ${alvos || symptoms}. Conduta farmacologica e nao farmacologica dirigida ao sintoma. Contexto clinico: ${diagnosis}; ${symptoms}`.slice(0, 4000);
  if (kind === "diagnosis") return `Criterios diagnosticos e diagnostico diferencial para: ${symptoms}`.slice(0, 4000);
  // A busca da revisao nao repete a da geracao: o que se pergunta ao livro
  // especializado e se AQUELAS hipoteses se sustentam. Sem as hipoteses na
  // consulta, o refino recuperaria os mesmos trechos genericos do quadro e
  // reescreveria a primeira passada em vez de audita-la.
  if (kind === "diagnosis_review") {
    const propostas = firstPassDiagnosisLines(form).join("; ");
    return `Revisao critica das hipoteses diagnosticas: ${propostas || symptoms}. Criterios formais, diagnostico diferencial, especificadores de gravidade e curso, comorbidade. Quadro clinico: ${symptoms}`.slice(0, 4000);
  }
  if (kind === "treatment_review") {
    const propostas = firstPassTreatmentLines(form).join("; ");
    return `Revisao critica da conduta proposta: ${propostas || diagnosis}. Adequacao da escolha, dose, titulacao, contraindicacao, interacao e alternativa de primeira linha para ${diagnosis}. Dados clinicos: ${symptoms}`.slice(0, 4000);
  }
  if (kind === "medication") return `Psicofarmacologia de ${form.medicationGeneric || ""}: dose inicial, titulacao, dose alvo, efeitos colaterais, contraindicacoes e interacoes. Contexto clinico: ${diagnosis}; ${symptoms}`.slice(0, 4000);
  // A revisao da ficha pergunta pelo que a primeira passada AFIRMOU sobre o
  // farmaco — a dose que ela escreveu, a titulacao, o efeito que ela citou —,
  // e nao pelo farmaco em geral. E o que faz o segundo livro conferir a ficha
  // em vez de redigi-la outra vez.
  // Duas palavras, e de proposito. "BIPPTIPS" e um token raro, que so aparece no
  // titulo da secao — e e ele que localiza o trecho. Descrever o que a secao
  // contem ("cuidados de uso, limite de dose, evidencia de eficacia") dilui o
  // token em prosa farmacologica generica, e a busca passa a devolver o
  // capitulo comum do farmaco. Medido nos dois formatos, em seis farmacos: a
  // consulta curta achou a secao nos seis; a descritiva falhou em quatro,
  // sertralina e litio inclusive.
  //
  // Vai sem espaco porque e assim que sai da extracao do PDF: "BIPPTIPS".
  if (kind === "medication_tips") {
    return `BIPPTIPS ${form.medicationGeneric || form.medicationNameText || ""}`.trim().slice(0, 4000);
  }
  if (kind === "medication_review") {
    const ficha = compactText([form.medicationPresentation, form.medicationSafety, form.medicationBestUse].filter(Boolean).join(" "), 1500);
    return `Revisao critica da ficha de ${form.medicationGeneric || form.medicationNameText || ""}: dose inicial, titulacao, dose alvo, efeitos colaterais, contraindicacoes, interacoes e monitorizacao. Afirmacoes a conferir: ${ficha}. Contexto clinico: ${diagnosis}`.slice(0, 4000);
  }
  return `${diagnosis}; ${symptoms}`.slice(0, 4000);
}

// O que a primeira passada colocou na tela. Nao ha campo novo no rascunho: as
// linhas vivem nos mesmos textareas ocultos que a tela ja preenche, e a
// revisao le dali. Marcado com [assinalado] o que o medico aceitou — e essa
// marca que transforma a segunda chamada em revisao de uma decisao clinica, e
// nao numa segunda opiniao sobre o caso cru.
function firstPassDiagnosisLines(form = {}) {
  const marcados = new Set([
    ...selectedDiagnosisValues(form), ...selectedSpecifierValues(form),
    ...selectedComorbidityValues(form), ...selectedAggravatingValues(form)
  ].map(normalizeText));
  const marca = linha => `${linha}${marcados.has(normalizeText(linha)) ? " [assinalado pelo medico]" : ""}`;
  return [
    ...diagnosticNosologicalOptionLines(form).map(linha => `NOSOLOGICO: ${marca(linha)}`),
    ...diagnosticSyndromicOptionLines(form).map(linha => `SINDROMICO: ${marca(linha)}`),
    ...diagnosticEtiologicalOptionLines(form).map(linha => `ETIOLOGICO: ${marca(linha)}`),
    ...diagnosticSpecifierOptionLines(form).map(linha => `ESPECIFICADOR: ${marca(linha)}`),
    ...diagnosticComorbidityOptionLines(form).map(linha => `COMORBIDADE: ${marca(linha)}`),
    ...diagnosticAggravatingOptionLines(form).map(linha => `AGRAVANTE: ${marca(linha)}`)
  ];
}

function firstPassTreatmentLines(form = {}) {
  const marcados = new Set(arrayValue(form.tratamentoMedicamentosSelecionados)
    .concat(arrayValue(form.abordagensSelecionadas)).map(normalizeText));
  const marca = linha => `${linha}${marcados.has(normalizeText(linha)) ? " [assinalado pelo medico]" : ""}`;
  return [
    ...treatmentOptionLines(form.tratamentoAiMedicamentos).map(linha => `MEDICAMENTOSO: ${marca(linha)}`),
    ...treatmentOptionLines(form.tratamentoAiAbordagens).map(linha => `NAO FARMACOLOGICO: ${marca(linha)}`)
  ];
}

// A ficha nao tem caixa de selecao: o medico nao assinala nada aqui, entao nao
// ha o que marcar como aceito. O que a revisao recebe e a ficha inteira, do
// jeito que esta na tela.
function firstPassMedicationLines(form = {}) {
  return [
    ["MEDICAMENTO", form.medicationNameText || form.medicationGeneric],
    ["DOSE INICIAL E PROGRESSAO", form.medicationPresentation],
    ["PRINCIPAIS EFEITOS COLATERAIS", form.medicationSafety],
    ["OBSERVACOES", form.medicationBestUse]
  ].filter(([, valor]) => String(valor || "").trim()).map(([rotulo, valor]) => `${rotulo}: ${String(valor).trim()}`);
}

function firstPassText(kind, form = {}) {
  const linhas = kind === "diagnosis_review" ? firstPassDiagnosisLines(form)
    : kind === "treatment_review" ? firstPassTreatmentLines(form)
    : kind === "medication_review" ? firstPassMedicationLines(form) : [];
  if (!linhas.length) return "";
  return `RESPOSTA DA PRIMEIRA PASSADA, A SER REVISADA:\n${linhas.join("\n")}\n`;
}

// A revisao devolve a mesma estrutura da geracao — mesma validacao, mesmo
// texto plano, mesmo formato de resposta. So a TAREFA muda: a primeira propoe,
// a segunda audita o que a primeira propos.
const REVIEW_OF_KIND = { diagnosis_review: "diagnosis", treatment_review: "treatment", medication_review: "medication" };

function validateClinicalAiPayload(kind, result, text = "") {
  kind = REVIEW_OF_KIND[kind] || kind;
  if (!result && text) result = parseFallbackClinicalText(kind, text);
  if (!result || typeof result !== "object") throw new Error("Resposta estruturada ausente.");
  if (kind === "anamnesis") {
    ["chief_complaint", "hda", "medical_history"].forEach(key => {
      if (typeof result[key] !== "string") throw new Error("Anamnese narrativa fora do formato esperado.");
    });
  }
  if (kind === "mental_exam") {
    if (!Object.values(result).every(value => Array.isArray(value))) throw new Error("Exame psiquico fora do formato esperado.");
  }
  if (kind === "refinement_scope") {
    if (!Array.isArray(result.blocks) || !result.blocks.length) throw new Error("Escopo do refinamento ausente.");
  }
  if (kind === "refinement") {
    if (!Array.isArray(result.questions) || result.questions.length < 3) throw new Error("Perguntas de refinamento ausentes.");
    ["red_flags", "observations", "important_points"].forEach(key => {
      if (!Array.isArray(result[key])) throw new Error("Bloco de refinamento fora do formato esperado.");
    });
    if (protocolLoaded()) result = resolveRefinementAgainstProtocol(result);
  }
  if (kind === "diagnosis") {
    // Teto, nao piso. Ver o comentario no schema do server.py: exigir um numero
    // fixo obrigava o modelo a inventar hipotese quando faltava dado.
    // Item sem dominio, achado ou evidencia e descartado, e nao derruba a
    // resposta: um achado que a IA nao ancorou no registro nao pode chegar a
    // tela com cara de ancorado. Mesmo criterio do server.py.
    if (!Array.isArray(result.psychopathological_analysis)) result.psychopathological_analysis = [];
    result.psychopathological_analysis = result.psychopathological_analysis
      .filter(item => ["domain", "finding", "evidence"].every(key => typeof item?.[key] === "string" && item[key].trim()))
      .slice(0, 8);
    [["syndromic_options", 3], ["nosological_options", 3], ["etiological_options", 2]].forEach(([group, limit]) => {
      if (!Array.isArray(result[group]) || result[group].length > limit) throw new Error(`O grupo ${group} aceita no maximo ${limit} opcoes.`);
      result[group].forEach(option => {
        if (!option?.name) throw new Error("Opcao diagnostica sem nome.");
      });
    });
  }
  if (kind === "treatment") {
    if (!Array.isArray(result.medication_options) || result.medication_options.length > 3) throw new Error("O tratamento aceita no máximo 3 opções medicamentosas.");
    if (!Array.isArray(result.non_pharmacological_options) || result.non_pharmacological_options.length > 3) throw new Error("O tratamento aceita no máximo 3 abordagens não farmacológicas.");
    // Descarta a opcao incompleta em vez de derrubar a resposta: sem indicacao
    // farmacologica, zero medicamento e a resposta certa, e as orientacoes
    // precisam sobreviver a linha oca que a IA as vezes poe no lugar.
    const completa = (option, chaves) => chaves.every(key => typeof option?.[key] === "string" && option[key].trim());
    result.medication_options = result.medication_options.filter(option => completa(option, ["medication", "initial_dose", "progression", "target_dose"]));
    result.non_pharmacological_options = result.non_pharmacological_options.filter(option => completa(option, ["approach", "details"]));
  }
  if (kind === "symptomatic") {
    if (!Array.isArray(result.target_symptom_options)) throw new Error("Manejo sintomatico fora do formato esperado.");
    const completa = (option, chaves) => chaves.every(key => typeof option?.[key] === "string" && option[key].trim());
    result.target_symptom_options = result.target_symptom_options
      .filter(option => completa(option, ["symptom", "conduct"]))
      .map(option => ({
        ...option,
        // Sem dose e sem progressao a linha nao serve para prescrever, entao e
        // descartada — o sintoma continua valendo pela conduta.
        medication_options: (Array.isArray(option.medication_options) ? option.medication_options : [])
          .filter(item => completa(item, ["medication", "initial_dose", "progression"]))
          .slice(0, 2)
      }))
      .slice(0, 6);
  }
  if (kind === "medication_tips") {
    if (!Array.isArray(result.tips)) throw new Error("BIPP TIPS fora do formato esperado.");
    result.tips = result.tips.map(item => String(item || "").trim()).filter(Boolean).slice(0, 8);
  }
  if (kind === "evolution" && typeof result.markdown !== "string") throw new Error("Evolucao fora do formato esperado.");
  if (kind === "medication") {
    ["medication", "dose_progression", "side_effects", "notes"].forEach(key => {
      if (typeof result[key] !== "string") throw new Error("Medicamento fora do formato esperado.");
    });
  }
  return result;
}

/**
 * Onde a lista fica fechada de verdade.
 *
 * O prompt manda escolher do catalogo, mas prompt e pedido, nao garantia: o
 * modelo pode devolver id inexistente, ou o id certo com o texto da pergunta
 * reescrito. Aqui o texto vem SEMPRE do protocolo, nunca da resposta — a IA
 * contribui com as opcoes de resposta e com a escolha, e com mais nada.
 *
 * Pergunta com id desconhecido e descartada. Se sobrar menos de uma, o
 * chamador cai no plano local, que e o comportamento que ja existia quando a
 * IA falhava.
 */
function resolveRefinementAgainstProtocol(result) {
  const descartadas = [];
  const questions = (result.questions || []).map(question => {
    const item = protocolItemById(question.id);
    if (!item) {
      descartadas.push(question.id || "(sem id)");
      return null;
    }
    return {
      ...question,
      topic: item.campo || question.topic,
      prompt: item.pergunta,
      quando: item.quando || "",
      trechoId: item.trecho_id || ""
    };
  }).filter(Boolean);

  const resolveIds = (ids, campo) => arrayValue(ids)
    .map(id => protocolItemById(id))
    .filter(Boolean)
    .map(item => ({ topic: item[campo] || item.campo, reason: item.por_que || item.conduta || "", trechoId: item.trecho_id || "" }));

  return {
    ...result,
    questions,
    // Os sinais do protocolo entram como red flags: e a mesma secao da tela,
    // agora com origem no livro em vez de inventada.
    //
    // O `red_flags` livre do modelo NAO e mesclado aqui. Ele continua no
    // schema e o modelo continua preenchendo — no primeiro teste devolveu
    // "afetividade", "risco" e "sexualidade", que sao nomes de bloco, nao
    // sinais. Misturados aos sinais citados, entrariam na tela com a mesma
    // aparencia dos que vem do livro. Com protocolo carregado, vale o livro.
    red_flags: resolveIds(result.alerts, "sinal").slice(0, 8),
    // Por decisao do Dr. Regis, so as imprescindiveis que faltam, como aviso.
    important_points: resolveIds(result.mandatory_gaps, "item").slice(0, 12),
    discardedIds: descartadas
  };
}

function parseFallbackClinicalText(kind, text = "") {
  kind = REVIEW_OF_KIND[kind] || kind;
  // Sem contingencia para os BIPP TIPS: a caixa afirma reproduzir uma secao do
  // livro. Texto remontado de resposta solta nao e mais essa secao, e a tela
  // nao teria como dizer isso ao medico.
  if (["anamnesis", "mental_exam", "refinement", "medication_tips"].includes(kind)) return null;
  if (kind === "diagnosis") {
    const options = normalizeDiagnosticOptions(text, 8).map(line => {
      const [namePart, cidPart = "", dsmPart = ""] = line.split(/\s+-\s+/);
      return {
        name: stripFinalPeriod(namePart || ""),
        cid11: stripFinalPeriod(cidPart.replace(/^CID-?11:\s*/i, "")),
        dsm5tr: stripFinalPeriod(dsmPart.replace(/^DSM-?5-?TR:\s*/i, ""))
      };
    });
    return { syndromic_options: options.slice(0, 3), nosological_options: options.slice(3, 6), etiological_options: options.slice(6, 8) };
  }
  if (kind === "treatment") {
    const parsed = parseTreatmentResponse(text);
    return {
      medication_options: parsed.medicationOptions,
      non_pharmacological_options: parsed.approachOptions
    };
  }
  if (kind === "evolution") return { markdown: text };
  if (kind === "medication") {
    const parsed = parseMedicationResponse(text);
    return {
      medication: parsed.medicationNameText,
      dose_progression: parsed.medicationPresentation,
      side_effects: parsed.medicationSafety,
      notes: parsed.medicationBestUse
    };
  }
  return null;
}

function clinicalAiTextFromResult(kind, result) {
  kind = REVIEW_OF_KIND[kind] || kind;
  if (kind === "anamnesis") return `QP: ${result.chief_complaint}\nHDA: ${result.hda}`;
  if (kind === "mental_exam") return Object.entries(result).map(([key, value]) => `${key}: ${joinValues(value)}`).join("\n");
  if (kind === "refinement") return result.questions.map(item => `${item.topic}: ${item.prompt}`).join("\n");
  if (kind === "diagnosis") {
    const formatGroup = (label, options) => `${label}:\n${options.map(formatDiagnosticOption).join("\n")}`;
    return [formatGroup("DIAGNOSTICO SINDROMICO", result.syndromic_options), formatGroup("DIAGNOSTICO NOSOLOGICO", result.nosological_options), formatGroup("DIAGNOSTICO ETIOLOGICO", result.etiological_options)].join("\n\n");
  }
  if (kind === "treatment") {
    return `TRATAMENTO MEDICAMENTOSO:\n${result.medication_options.map(formatMedicationTreatmentOption).join("\n")}\n\nOUTRAS ABORDAGENS NÃO FARMACOLÓGICAS:\n${result.non_pharmacological_options.map(formatNonPharmacologicalOption).join("\n")}`;
  }
  if (kind === "medication_tips") return result.tips.join("\n\n");
  if (kind === "evolution") return result.markdown;
  if (kind === "medication") {
    return [
      `MEDICAMENTO:\n${result.medication}`,
      `DOSE INICIAL E PROGRESSAO:\n${result.dose_progression}`,
      `PRINCIPAIS EFEITOS COLATERAIS:\n${result.side_effects}`,
      `OBSERVACOES:\n${result.notes}`
    ].join("\n\n");
  }
  return "";
}

export function buildClinicalAiPrompt(kind, form = {}, patient = {}, previous = null, isReturn = false, scope = null) {
  const taskByKind = {
    anamnesis: [
      "Use a literatura de semiologia psiquiatrica recuperada pelo RAG como guia de cobertura, mas extraia somente informacoes explicitamente presentes na transcricao da conversa.",
      "A entrada e um dialogo bruto em ordem cronologica. Cada linha preserva o identificador do falante, mas os rotulos Falante A/B nao informam previamente quem e medico ou paciente; determine o papel pelo conteudo e pela sequencia conversacional.",
      "Perguntas do medico nao sao achados clinicos: nunca marque um sintoma apenas porque ele foi perguntado. Exija resposta afirmativa da paciente, relato espontaneo ou observacao explicita do medico.",
      "Interprete respostas curtas como sim, nao, as vezes e nao sei em conjunto com a pergunta imediatamente anterior.",
      "Quando houver correcao ou contradicao, a declaracao cronologicamente mais recente substitui a anterior. Preserve rigorosamente a diferenca entre quadro atual, episodio passado, antecedente familiar e hipotese apenas investigada.",
      "Organize a anamnese por queixa principal, cronologia e curso, sintomas nucleares e associados, polaridade depressiva/maníaca, ansiedade/pânico, sono, apetite, psicose, risco suicida, substâncias, causas médicas, antecedentes, funcionamento e fatores de proteção.",
      "Diferencie sintoma negado, sintoma presente e domínio não investigado; campo vazio significa dado não informado e nunca normalidade.",
      "Preencha queixa principal, HDA e campos estruturados da anamnese sem perder a narrativa temporal, intensidade, frequência, duração, gatilhos, fatores de melhora/piora e prejuízo funcional.",
      "Nao diagnostique, nao sugira tratamento e nao acrescente observacoes ao usuario.",
      `Nos campos de selecao, use exclusivamente estes rotulos canonicos: ${JSON.stringify(Object.fromEntries(Object.entries(ANAMNESIS_AI_FIELDS).map(([key, [, options]]) => [key, options])))}`
    ],
    mental_exam: [
      "Prepare uma sugestao estruturada de exame psiquico somente a partir da anamnese ja revisada pelo medico.",
      "Nao infira normalidade quando nao houver suporte; use arrays vazios quando o dominio nao puder ser avaliado.",
      "O medico revisara e alterara todas as selecoes antes de prosseguir.",
      `Use exclusivamente estes rotulos canonicos: ${JSON.stringify(Object.fromEntries(Object.entries(MENTAL_EXAM_AI_FIELDS).map(([key, formKey]) => [key, (optionGroups[formKey] || [])])))}`
    ],
    refinement_scope: [
      "Escolha quais blocos do protocolo de entrevista sao pertinentes a este caso.",
      "Devolva apenas os nomes dos blocos, exatamente como aparecem na lista. Ate 12.",
      "Inclua o bloco quando o caso levanta o assunto que ele cobre, mesmo que so para descartar. Deixe de fora o que o caso nao toca."
    ],
    refinement: [
      "Analise a anamnese revisada, o exame psiquico revisado e o exame fisico registrado.",
      // O motor antigo mandava a IA CRIAR as perguntas. Elas saiam boas, mas
      // sem procedencia: nao dava para conferir de onde vinham nem saber o que
      // tinham deixado de perguntar. Agora a lista e fechada.
      "Escolha de 3 a 8 perguntas EXCLUSIVAMENTE do catalogo do protocolo, devolvendo o id de cada uma. Nao escreva pergunta que nao esteja no catalogo, e nao altere o texto da pergunta escolhida.",
      "Escolha pelo campo 'quando' de cada pergunta: ela so cabe se a situacao descrita ali estiver presente neste caso.",
      "Nao repita pergunta que o registro ja responde. O medico nao deve reconfirmar o que ja documentou.",
      "Para cada pergunta escolhida, proponha de 3 a 5 opcoes de resposta objetivas. As opcoes sao suas; o texto da pergunta e do protocolo.",
      "Em 'mandatory_gaps', liste os ids dos itens imprescindiveis que o registro AINDA NAO cobre. Item ja documentado fica de fora.",
      "Em 'alerts', liste os ids dos sinais de alerta do protocolo sustentados por este caso. Nao invente risco e nao inclua sinal sem apoio no registro.",
      "Nao gere diagnostico nem tratamento."
    ],
    diagnosis: [
      "Analise de forma integrada e nao superficial toda a anamnese, os antecedentes, o impacto funcional, os riscos e cada dominio preenchido do exame psiquico.",
      "Gere ate 3 hipoteses nosologicas, ate 3 sindromicas e ate 2 etiologicas: e teto, nao piso. Grupo vazio e resposta legitima quando o registro nao sustenta.",
      // As tres camadas nao sao rotulos alternativos do mesmo achado: sao
      // perguntas clinicas diferentes. Escrever isso no prompt e o que impede
      // a IA de devolver a mesma entidade tres vezes com nomes trocados.
      "A camada NOSOLOGICA identifica a entidade nos manuais oficiais. E a base do tratamento principal, do seguimento continuo, do atestado e do laudo, e e ela que recebe os especificadores.",
      "Comece pela ANALISE PSICOPATOLOGICA, e so depois nomeie as hipoteses: e ela o raciocinio que as sustenta. Para cada dominio, escreva o achado e, entre parenteses, a EVIDENCIA — o trecho do registro que o sustenta, o mais literal possivel. 'Anedonia severa (parou de sair, de cozinhar e de atender o telefone)'. Achado que voce nao conseguir ancorar num trecho do registro NAO ENTRA: sem evidencia e afirmacao, e este prontuario nao afirma o que nao foi registrado.",
      "Na analise, ligue o que se explica: um achado somatico que decorre do conteudo do pensamento e o mesmo sintoma, e nao dois — perda de peso por recusa alimentar num delirio de negacao de orgaos muda a conduta, e a lista de sintomas separados nao diz isso. Diga a ligacao quando o registro a sustentar.",
      "A camada SINDROMICA descreve os sinais e sintomas que ocorrem juntos. Sao inespecificos e aparecem em varios transtornos — sindrome depressiva ocorre tambem no esquizofrenico e no borderline. Ela orienta a conduta imediata: alivio do sofrimento e controle de risco, antes mesmo de saber o nome definitivo do quadro. NAO repita aqui a entidade que voce nomeou na camada nosologica.",
      "A camada ETIOLOGICA aponta a causa primaria: vulnerabilidade genetica ou temperamental, estressores psicossociais, substancias, condicao medica geral. E o que permite tratamento causal — tratar a tireoide em vez de medicar o sintoma — e prevenir recidiva.",
      "As hipoteses sao mero auxilio ao psiquiatra e nao substituem avaliacao, confirmacao de criterios, exame clinico ou decisao medica.",
      "NAO proponha delirium (sindrome confusional aguda) em contexto nenhum: nem como hipotese, nem como especificador, nem como diagnostico diferencial. E quadro de paciente internado, sobretudo em UTI, e este prontuario e de consultorio. Se o registro sugerir rebaixamento de consciencia agudo, diga que o caso pede avaliacao clinica presencial em vez de nomear a sindrome.",
      "O delirium tremens e a excecao: e entidade psiquiatrica propria, complicacao grave da abstinencia alcoolica, e pode ser proposto quando o registro o sustentar.",
      "SO a camada nosologica leva codigo. Ela identifica a entidade nos manuais oficiais, entao cada hipotese nosologica sai com CID-11 e DSM-5-TR — sao classificacoes independentes e as duas aparecem sempre.",
      "As hipoteses sindromicas e etiologicas vao com os dois campos de codigo EM BRANCO. Sindrome e o conjunto de sinais e sintomas que ocorrem juntos, nao entidade catalogada; etiologia e a causa — vulnerabilidade genetica, estressor psicossocial, condicao medica —, tambem nao e entidade. Nunca escreva 'N/A' nesses campos.",
      "O nome da hipotese leva SO a entidade diagnostica. Toda qualificacao — gravidade, curso, remissao, sintomas associados, especificadores da CID ou do DSM — sai do nome e vai para 'specifier_options'. Escreva 'Transtorno depressivo persistente', nunca 'Transtorno depressivo persistente, episodio atual grave, com sintomas ansiosos': gravidade e sintomas ansiosos sao especificadores, e repeti-los no nome duplica a mesma informacao na tela do medico.",
      "Proponha ate 4 especificadores em 'specifier_options'. Especificador NAO e hipotese nova: e atributo de uma hipotese NOSOLOGICA que voce mesmo levantou — com sintomas psicoticos, com angustia ansiosa, com ciclagem rapida, com padrao sazonal, em remissao parcial ou total, leve/moderado/grave, inicio no periparto, com catatonia.",
      "Em cada especificador, 'applies_to' deve repetir o nome exato da hipotese NOSOLOGICA que ele qualifica. Especificador que nao se aplique a nenhuma hipotese nosologica levantada nao entra.",
      "Especificador sem apoio no registro nao entra. Gravidade so quando houver dado de intensidade, funcionalidade ou risco; remissao so quando o registro disser que o quadro cedeu. Lista vazia e resposta legitima.",
      // Comorbidade e agravante sao blocos proprios, a pedido dele. Um e
      // diagnostico que soma; o outro nao e diagnostico nenhum. Confundir os
      // dois — ou empurrar qualquer um deles para as hipoteses nosologicas,
      // que concorrem entre si — desfaz a separacao que ele pediu.
      "Proponha ate 3 comorbidades em 'comorbidity_options'. Comorbidade NAO concorre com as hipoteses nosologicas: elas sao alternativas do diagnostico diferencial, a comorbidade COEXISTE com a que voce considera mais provavel. Por ser entidade dos manuais, cada comorbidade sai com CID-11 e DSM-5-TR, como a camada nosologica. Nao repita aqui uma entidade que ja esteja em 'nosological_options'.",
      "Proponha ate 4 fatores agravantes em 'aggravating_options'. Agravante NAO e diagnostico: e o que piora curso, resposta ao tratamento ou prognostico — insonia cronica, uso nocivo de alcool, baixa adesao, isolamento social, conflito conjugal, doenca clinica descompensada, acesso dificil ao servico. Em 'effect', diga em uma frase curta o que aquele fator piora no caso.",
      "Comorbidade e agravante sem apoio no registro nao entram. Lista vazia e resposta legitima nos dois grupos.",
    ],
    treatment: [
      "Gere ate 3 opcoes de abordagem medicamentosa: primeira opcao, segunda opcao e uma opcao off-label, exclusivamente com dados do Assistant da IA atual ou do RAG com literatura. E teto, nao piso.",
      "Quando o quadro nao sustentar farmacoterapia — ausencia de psicopatologia de relevancia clinica, sintoma reativo ou adaptativo — devolva a lista de medicamentos VAZIA. Nao preencha a vaga com 'nao indicado', 'nenhum' ou linha sem dose: lista vazia e a resposta correta, e as orientacoes carregam a conduta.",
      // Remissao do quadro agudo nao e alta terapeutica: suspender manutencao
      // ali provoca recaida.
      "Remissao dos sintomas agudos NAO significa ausencia de indicacao. Proponha a conduta de manutencao e de reabilitacao, farmacologica ou nao, em vez de encerrar o tratamento, e diga explicitamente quando a conduta e de manutencao, e nao de tratamento do quadro agudo.",
      // Sintoma-Alvo, definicao dele: a queixa mais urgente, incomoda ou
      // incapacitante, que orienta a conduta imediata mesmo antes de haver
      // diagnostico nosologico. O medico assinala na tela; sem marcacao dele, a
      // IA nao inventa alvo nenhum.
      // Num teste com tres alvos assinalados, as tres opcoes medicamentosas
      // viraram tres hipnoticos: o sintoma-alvo tomou o lugar do tratamento da
      // doenca. Agora o alvo tem etapa propria, mas o aviso continua valendo.
      "'medication_options' trata a hipotese NOSOLOGICA — e o tratamento de fundo, o que sustenta o seguimento. O manejo pontual do sintoma-alvo tem etapa propria no programa e nao entra aqui.",
      "Para cada opcao medicamentosa informe medicamento, dose inicial, progressao/titulacao e dose final ou dose-alvo. Opcao sem esses quatro dados e descartada.",
      "Gere ate 3 abordagens nao farmacologicas ou orientacoes gerais, com uma orientacao objetiva para cada uma. Estas valem mesmo sem medicamento, e sao a conduta principal quando nao ha indicacao farmacologica.",
      "Considere as hipoteses escolhidas e os dados clinicos informados, incluindo riscos, comorbidades, substancias e exame psiquico. Nao invente dados.",
      "Sinalize necessidade de verificacao medica de contraindicações, interacoes, gestacao, funcao renal/hepatica e monitorizacao quando pertinente."
    ],
    // Etapa propria, com biblioteca propria. O manejo do sintoma nao e o
    // tratamento da doenca em versao curta: e a conduta que nao espera o
    // diagnostico fechar.
    symptomatic: [
      "SINTOMA-ALVO e a queixa mais urgente, incomoda ou incapacitante do caso, e orienta a conduta terapeutica imediata mesmo sem diagnostico nosologico estabelecido.",
      "Os sintomas-alvo deste atendimento sao APENAS os que o medico assinalou, listados no registro sob 'Sintomas-alvo assinalados'. Nunca proponha conduta para sintoma que ele nao assinalou, e nunca crie um sintoma-alvo por conta propria. Sem sintoma assinalado, devolva a lista VAZIA.",
      "Para cada sintoma assinalado devolva uma entrada em 'target_symptom_options': 'symptom' repete o nome exato do sintoma e 'conduct' diz a conduta imediata para ele — manejo, orientacao, monitorizacao.",
      // Num teste, a opcao medicamentosa voltou como "Ajuste de sertralina;
      // intervencoes comportamentais para sono" — prosa repetindo a conduta,
      // ocupando a caixa que devia trazer o remedio. Conduta e prescricao tem
      // funcoes diferentes e nao podem dizer a mesma coisa.
      "Em 'medication_options' vao ate 2 opcoes medicamentosas dirigidas AQUELE sintoma, como se usa na pratica: 'medication' com o farmaco, 'initial_dose' com a dose e a via de inicio, 'progression' com a titulacao — de quanto em quanto tempo se aumenta, ate que dose —, e 'interaction' com o cuidado diante do que o paciente ja toma.",
      "'interaction' e obrigatoriamente sobre ESTE paciente: cruze o farmaco proposto com o tratamento ja definido para a hipotese nosologica e com os medicamentos de uso do paciente, psiquiatricos ou nao. Diga o risco concreto — sedacao somada, sindrome serotoninergica, prolongamento de QT, competicao hepatica, potencializacao com alcool — e o que fazer. Sem interacao relevante, escreva que nao ha e por que.",
      "Nada de medida comportamental, encaminhamento, psicoterapia ou monitorizacao dentro de 'medication_options': isso e conduta e vai em 'conduct'. Nada de 'ajustar conforme resposta' no lugar da dose.",
      "Lista de medicamentos VAZIA significa que nao existe farmaco para aquele sintoma — nao que voce nao tenha a dose exata a mao. Se a literatura recuperada sustentar um farmaco, ele nao pode ficar de fora: escreva a dose usual de inicio. Nunca preencha a vaga com 'nao ha', 'nenhum', 'avaliar necessidade' ou farmaco sem dose.",
      "A opcao medicamentosa e proposta, nao prescricao: quem decide usar e o medico. Por isso ela nao substitui a conduta — as duas convivem na mesma entrada.",
      "A conduta deve sair da literatura recuperada e ser ajustada a este paciente: medicamento ja em uso, interacao, comorbidade, fator agravante, gestacao, funcao renal ou hepatica, risco de abuso e risco de suicidio.",
      "Quando propuser farmaco, informe dose e via de administracao. Quando a medida for nao farmacologica, diga o que fazer, com que frequencia e por quanto tempo — nao basta nomear a tecnica.",
      "A conduta do sintoma-alvo pode coincidir com o tratamento ja definido para a hipotese nosologica. Quando coincidir, diga isso na propria conduta em vez de repetir a prescricao: quem decide se marca ou nao e o medico.",
      "Nao repita o tratamento de fundo do transtorno. O que se pede aqui e o alivio do sintoma — o que fazer hoje, antes de a medicacao de manutencao fazer efeito.",
      "Sinalize necessidade de verificacao medica de contraindicações, interacoes e monitorizacao quando pertinente."
    ],
    evolution: [
      "Redija uma evolucao medica narrativa-descritiva, formal, tecnica, cientifica, objetiva e concisa.",
      "Use linguagem denotativa, literal e precisa, em terceira pessoa do singular ou na voz passiva.",
      "Organize os fatos em ordem cronologica e valorize tanto os achados registrados quanto as ausencias explicitamente documentadas.",
      "Diferencie negacao expressa de dado nao preenchido: nunca presuma normalidade ou ausencia de sintoma a partir de um campo vazio.",
      "Produza texto corrido em paragrafos, sem listas, titulos, nomes de campos, Markdown ou asteriscos.",
      "Inicie diretamente pelo nome, sem usar a palavra Paciente: [nome], [idade] anos, [estado civil], [religiao], [grau de instrucao], [ocupacao].",
      "Registre a situacao laboral exclusivamente como Em atividade ou No momento, afastado do trabalho, conforme os dados.",
      "Nao utilize em nenhuma parte as expressoes Durante o rastreio, No rastreio ou Quanto ao. Descreva os achados diretamente.",
      "Apresente o exame em um novo paragrafo iniciado por: No exame psiquico, apresenta-se [...].",
      "Elimine repeticoes e palavras desnecessarias, sem omitir dados clinicamente relevantes.",
      "No exame psiquico, descreva os achados de forma direta e integrada ao texto.",
      "Use apenas as hipoteses assinaladas pelo psiquiatra.",
      "Finalize com o tratamento efetivamente selecionado ou registrado: medicamentos, medidas nao farmacologicas, ajustes do medico e exames solicitados. Omita categorias sem registro."
    ],
    // Nao e redacao, e recuperacao: os BIPP TIPS ja existem escritos no livro,
    // no fim do capitulo de cada farmaco. O trabalho do modelo aqui e achar a
    // secao nos trechos recuperados e devolve-la, e nao escrever dicas suas.
    medication_tips: [
      `Nos trechos recuperados, localize a secao BIPP TIPS (aparece como "BIPPTIPS" ou "BIPP TIPS") do capitulo de ${form.medicationGeneric || form.medicationNameText || "nao informado"}.`,
      "Devolva cada paragrafo daquela secao como um item de 'tips', na ordem em que aparecem, preservando o conteudo: farmaco citado, numero de dose, unidade, enzima, populacao e conduta.",
      "Nao resuma a ponto de perder o dado, nao junte dois paragrafos num item e nao reordene por importancia.",
      "Retire do texto as marcas de nota de rodape que sobraram da extracao do PDF — os numeros soltos de referencia no meio ou no fim da frase.",
      "So entra o que estiver dentro da secao BIPP TIPS. Precaucao, posologia ou efeito colateral que estejam em outra parte do capitulo NAO sao BIPP TIPS.",
      "Se a secao nao aparecer nos trechos recuperados, ou se ela for de outro farmaco, devolva a lista VAZIA. Nunca escreva dicas de sua autoria, e nunca aproveite a secao de um farmaco parecido: lista vazia significa que este farmaco nao tem BIPP TIPS no livro."
    ],
    medication: [
      `Preencha somente os campos solicitados sobre o medicamento informado: ${form.medicationGeneric || "nao informado"}.`,
      "Seja objetivo e nao inclua preco, links, indicacoes extensas ou cabecalhos adicionais.",
      "Use linguagem clinica resumida para prontuario."
    ]
  };
  // A segunda passada nao recebe uma tarefa nova: recebe a MESMA tarefa, com o
  // papel trocado na frente. As regras de saida da geracao continuam valendo
  // linha por linha — teto de hipoteses, quem leva codigo, o que e
  // especificador —, porque a revisao devolve a tela inteira, e nao um
  // comentario sobre ela. Por decisao dele, nada sobrevive da primeira passada:
  // o que a revisao nao repetir, sai do prontuario.
  const reviewTask = [
    "Voce e o REVISOR. Uma primeira passada, feita com outra fonte, ja propos a resposta que vai reproduzida abaixo, e o medico assinalou o que aceitou. Seu papel e auditar aquilo com a literatura especializada aqui recuperada — nao comeca do zero e nao a reescreve por estilo.",
    "Avalie tambem o caso inteiro, e nao so a lista: o que a primeira passada deixou passar e o registro sustenta, entra.",
    "Devolva a resposta COMPLETA, com todos os campos preenchidos como na primeira passada. Ela sera substituida inteira pela sua — item que voce omitir desaparece da tela do medico.",
    "O que estiver correto, repita sem alterar. Nao troque nome, codigo ou dose so para variar a redacao: mudanca sem motivo clinico apaga a decisao ja tomada pelo medico.",
    "Corrija o que a fonte especializada nao sustentar: nome impreciso, codigo errado, camada trocada, gravidade sem apoio, dose ou titulacao fora da literatura. Retire o que nao se sustentar e acrescente o que faltar.",
    // A ficha do medicamento nao tem caixa de selecao — nada para assinalar —,
    // entao a linha da marca so entra onde ela existe. Instrucao sobre um
    // rotulo que nao aparece no texto ensina o modelo a inventar o rotulo.
    kind === "medication_review" ? "" : "Item marcado [assinalado pelo medico] foi aceito por ele: so o altere ou retire com apoio explicito na literatura recuperada. Preferencia de redacao nao e motivo.",
    kind === "medication_review"
      ? "Esta ficha vai sustentar prescricao: confira dose inicial, titulacao, dose maxima, efeito colateral, contraindicacao, interacao e monitorizacao contra a fonte especializada. Numero que a fonte nao sustentar sai da ficha."
      : "",
    "Nao invente dado clinico novo. Voce revisa o raciocinio, nao o registro."
  ].filter(Boolean);
  const task = REVIEW_OF_KIND[kind]
    ? [...reviewTask, ...taskByKind[REVIEW_OF_KIND[kind]]]
    : (taskByKind[kind] || taskByKind.evolution);
  return [
    "Voce e um assistente especializado em psiquiatria, documentacao medica e prontuario eletronico.",
    "Responda em portugues do Brasil, com linguagem tecnica, clara, objetiva e utilizavel em prontuario.",
    "Nao invente dados. Quando algo nao estiver informado, sinalize como dado ausente ou necessidade de confirmacao.",
    "",
    // O catalogo e o mesmo em toda consulta e vem antes dos dados do paciente
    // de proposito: prefixo estavel e o que o cache do modelo consegue
    // reaproveitar. Invertido, cada refinamento pagaria os 27 mil tokens
    // inteiros de novo.
    kind === "refinement_scope" && protocolLoaded() ? `BLOCOS DO PROTOCOLO DE ENTREVISTA:\n${protocolBlocksText()}\n` : "",
    kind === "refinement" && protocolLoaded() ? `CATALOGO DO PROTOCOLO DE ENTREVISTA:\n${protocolCatalogText(scope)}\n` : "",
    "TAREFA:",
    ...task.map(item => `- ${item}`),
    "",
    firstPassText(kind, form),
    "DADOS DO PACIENTE E DA CONSULTA:",
    kind === "evolution"
        ? clinicalEvolutionPromptData(form, patient, previous, isReturn)
        : kind === "medication"
          ? `Medicamento pesquisado: ${form.medicationGeneric || "nao informado"}.\n${clinicalPromptData(form, patient, previous, isReturn)}`
          : clinicalPromptData(form, patient, previous, isReturn),
    "",
    "FORMATO DA RESPOSTA:",
    promptResponseFormat(kind)
  ].join("\n");
}

function clinicalEvolutionPromptData(form = {}, patient = {}, previous = null, isReturn = false) {
  return [
    `Identidade: ${conciseIdentityText(patient)}.`,
    `Queixa principal: ${conciseComplaintText(form, isReturn)}.`,
    `HDA: ${conciseHdaText(form, previous, isReturn)}.`,
    `Antecedentes: ${conciseAntecedentsText(form)}.`,
    `Exame psiquico: ${conciseMentalExamText(form)}.`,
    `HD/Hipoteses assinaladas: ${conciseDiagnosticText(form)}.`,
    `Tratamento medicamentoso selecionado: ${professionalSelectedTreatmentItems(form.tratamentoMedicamentosSelecionados, form.tratamentoMedicamentoso) || "nao informado"}.`,
    `Medidas nao farmacologicas selecionadas: ${professionalSelectedTreatmentItems(form.abordagensSelecionadas, form.abordagensTerapeuticas) || "nao informado"}.`,
    `Preenchimento pelo medico: ${cleanClinicalLine(form.condutaMedica || "") || "nao informado"}.`,
    `Exames solicitados: ${cleanClinicalLine(requestedExamsText(form) || form.examesLaboratoriais || "") || "nao informado"}.`
  ].join("\n");
}

function clinicalPromptData(form = {}, patient = {}, previous = null, isReturn = false) {
  return [
    `Identificacao: ${patientIdentificationText(patient, true)}`,
    `Tipo de atendimento: ${isReturn ? "retorno" : "consulta inicial/nova consulta"}.`,
    previous ? `Registro anterior: ${new Date(previous.createdAt || Date.now()).toLocaleDateString("pt-BR")} - ${stripFinalPeriod(normalizeEvolutionNarrative(previous.evolution) || anamnesisText(previous) || previous.observacoesRetorno || "")}.` : "",
    `QP/HDA: ${stripFinalPeriod(anamnesisText(form)) || "nao informado"}.`,
    `Fatores associados/desencadeantes: ${joinWithOutro(form.fatores, form.fatoresOutro) || "nao informado"}.`,
    `Fatores de melhora: ${joinWithOutro(form.fatoresMelhora, form.fatoresMelhoraOutro) || "nao informado"}.`,
    `Impacto funcional: ${joinValues(form.impacto) || "nao informado"}.`,
    `Rastreio de mania/hipomania: ${joinWithOutro(form.maniaHipomaniaSintomas, form.maniaHipomaniaSintomasOutro) || "nao informado"}.`,
    `Rastreio de ansiedade: ${joinValues(form.ansiedadeSintomas) || choiceSummary(form, ["ansiedadeFaltaControle", "ansiedadePreocupacaoExcessiva", "ansiedadeTensaoCorporal", "ansiedadeDificuldadeFocar", "ansiedadeAgitacao", "ansiedadeIrritabilidade", "ansiedadeSintomasFisicos"]) || "nao informado"}.`,
    `Sono: ${joinValues(form.sonoCaracteristicas) || choiceSummary(form, ["sonoReparador", "depressaoSono"]) || "nao informado"}.`,
    `Apetite e peso: ${joinValues(form.apetiteCaracteristicas) || choiceSummary(form, ["apetiteAlterado", "depressaoApetite"]) || "nao informado"}.`,
    `Rastreio depressivo: ${joinValues(form.depressaoSintomas) || choiceSummary(form, ["depressaoPoucoInteressePrazer", "depressaoDesanimoDesesperanca", "depressaoEnergia", "depressaoApetite", "depressaoConcentracao", "depressaoFalaLenta", "depressaoAgitacao", "depressaoAutoestimaRuinaEstorvo"]) || "nao informado"}.`,
    `Rastreio psicotico e paranoia: ${joinWithOutro(form.psicoseSintomas, form.psicoseSintomasOutro) || choiceSummary(form, ["sintomasPsicoticosParanoiaObservado", "sintomasPsicoticosVozesRuidos"]) || form.sintomasPsicoticosOutro || "nao informado"}.`,
    `Risco suicida: ${joinValues(form.riscoSuicidioIndicadores) || choiceSummary(form, ["riscoSuicidioIdeacao", "riscoSuicidioPlanejamento", "riscoSuicidioMeios", "riscoSuicidioTentativasPrevias"]) || "nao informado"}.`,
    `O que impede a acao hoje: ${stripFinalPeriod(form.riscoSuicidioRazoesViver || "") || "nao informado"}.`,
    `Razoes para viver: ${stripFinalPeriod(form.riscoSuicidioRazoesParaViver || "") || "nao informado"}.`,
    `Antecedentes psiquiatricos: ${joinWithOutro(form.psiPrevios, form.psiPreviosOutro) || "nao informado"}.`,
    `Tratamentos previos: ${joinWithOutro(form.tratamentos, form.tratamentosOutro) || "nao informado"}.`,
    `Antecedentes medicos: ${joinWithOutro(form.medicos, form.medicosOutro) || "nao informado"}.`,
    `Antecedentes familiares: ${joinWithOutro(form.familiares, form.familiaresOutro) || "nao informado"}.`,
    `Substancias/habitos: ${joinWithOutro(form.substancias, form.substanciasOutro) || joinWithOutro(form.usoSubstanciasComportamentos, form.usoSubstanciasComportamentosOutro) || "nao informado"}.`,
    `Exame psiquico: ${mentalStateFindings(form).length ? formatClinicalList(mentalStateFindings(form)) : "nao informado"}.`,
    // O exame fisico nunca chegou aqui. No caso de teste, as cicatrizes de
    // autolesao em antebraco estavam registradas e o diagnostico nao as via.
    `Exame fisico: ${stripFinalPeriod(form.fisico || "") || "nao informado"}.`,
    // Registrado pelo medico na tela de Tratamento. Sem esta linha o campo
    // ficava so no prontuario e a IA seguia propondo conduta para o quadro
    // agudo — o mesmo circuito fechado do refinamento.
    // So os nomes que ele assinalou. O manejo de cada alvo nao vem daqui: vem
    // do RAG, que e a fonte de tratamento do programa inteiro.
    `Sintomas-alvo assinalados: ${joinWithOutro(form.sintomasResiduais, form.sintomasResiduaisOutro) || "nenhum assinalado"}.`,
    // Fecha o laco do refinamento: o que o medico respondeu volta ao raciocinio.
    refinementAnswersText(form) ? `Refinamento clinico respondido pelo medico:\n${refinementAnswersText(form)}` : "",
    `Hipoteses diagnosticas selecionadas/acrescentadas: ${stripFinalPeriod(treatmentDiagnosisText(form)) || stripFinalPeriod(form.diagnosticoManual || "") || "nao informado"}.`,
    `Diagnostico registrado: ${stripFinalPeriod(form.diagnosticoManual || "") || "nao informado"}.`,
    `Diferenciais registrados: ${stripFinalPeriod(form.diferenciais || "") || "nao informado"}.`,
    // As duas linhas abaixo sao o que a interacao medicamentosa do sintoma-alvo
    // le: o que ja foi ASSINALADO para a hipotese nosologica, e nao so o texto
    // livre. Sem isso, a IA cruzava o farmaco novo com "nao informado".
    `Tratamento medicamentoso: ${professionalSelectedTreatmentItems(form.tratamentoMedicamentosSelecionados, form.tratamentoMedicamentoso) || stripFinalPeriod(form.tratamentoMedicamentoso || form.conduta || "") || "nao informado"}.`,
    `Medicamentos em uso pelo paciente: ${joinWithOutro(form.medicos, form.medicosOutro) || stripFinalPeriod(joinValues(form.medicos) || "") || "nao informado"}.`,
    `Outras abordagens terapeuticas: ${stripFinalPeriod(form.abordagensTerapeuticas || "") || "nao informado"}.`,
    `Exames solicitados: ${stripFinalPeriod(requestedExamsText(form) || form.examesLaboratoriais || "") || "nao informado"}.`,
    `Conduta medica: ${stripFinalPeriod(form.condutaMedica || "") || "nao informado"}.`,
    isReturn ? `Dados de retorno: ${stripFinalPeriod(returnStoryText(form, previous)) || "nao informado"}.` : ""
  ].filter(Boolean).join("\n");
}

function choiceSummary(form, keys = []) {
  return keys
    .map(key => form[key] ? `${key}: ${form[key]}` : "")
    .filter(Boolean)
    .join("; ");
}

function promptResponseFormat(kind) {
  kind = REVIEW_OF_KIND[kind] || kind;
  if (kind === "anamnesis") return "Objeto estruturado de anamnese conforme o schema, sem texto adicional.";
  if (kind === "mental_exam") return "Objeto estruturado do exame psiquico conforme o schema, sem texto adicional.";
  if (kind === "refinement_scope") return "Objeto com a chave blocks: lista de nomes de bloco, sem texto adicional.";
  if (kind === "refinement") return "Objeto estruturado com questions (cada uma com id do protocolo e opcoes de resposta), mandatory_gaps e alerts (apenas ids do protocolo), sem texto adicional.";
  if (kind === "diagnosis") {
    return [
      "ANALISE PSICOPATOLOGICA: ate 8 itens, um por linha, no formato",
      "Dominio: achado (evidencia literal do registro).",
      "Dominios uteis: humor, variacao circadiana, sono, apetite e alteracoes",
      "somaticas, pensamento (curso, forma e conteudo), sensopercepcao,",
      "cognicao, psicomotricidade, juizo critico, funcionalidade, risco.",
      "So os dominios que este caso sustenta: dominio sem achado nao entra.",
      "",
      "DIAGNOSTICO NOSOLOGICO: ate 3 hipoteses, uma por linha.",
      "ESPECIFICADORES: ate 4, uma por linha, no formato Nome - hipotese nosologica que ele qualifica.",
      "COMORBIDADES: ate 3, uma por linha, com os dois codigos.",
      "FATORES AGRAVANTES: ate 4, uma por linha, no formato Nome - o que ele piora.",
      "DIAGNOSTICO SINDROMICO: ate 3 hipoteses, uma por linha.",
      "DIAGNOSTICO ETIOLOGICO: ate 2 hipoteses, uma por linha.",
      "Formato de cada linha das hipoteses: Nome - CID-11: ... - DSM-5-TR: ...",
      "",
      "Toda hipotese leva os dois codigos: CID-11 e DSM-5-TR. Sao classificacoes",
      "independentes — um nao se deduz do outro, e os nomes as vezes diferem.",
      "",
      "No DSM-5-TR use o codigo alfanumerico da CID-10-MC, que e o que o DSM",
      "adota: F41.1, F33.1, F90.9. Nao use os numericos do DSM-IV (300.02).",
      "Distinga episodio unico (6A70/F32) de recorrente (6A71/F33).",
      "",
      "Proponha menos hipoteses, ou nenhuma no grupo, quando o registro nao",
      "sustentar. Nao complete as vagas com rotulo inespecifico do tipo",
      "'sindrome inespecifica', 'transtorno nao especificado' ou 'dados",
      "insuficientes': deixe o grupo vazio. Deixe o codigo em branco quando",
      "nao existir codigo proprio — sindrome descritiva costuma nao ter — em",
      "vez de escrever 'N/A'."
    ].join("\n");
  }
  if (kind === "treatment") {
    return [
      "TRATAMENTO MEDICAMENTOSO:",
      "Medicamento | Dose inicial: ... | Progressao: ... | Dose final: ...",
      "(ate 3 opcoes; menos, se o quadro nao sustentar mais)",
      "",
      "OUTRAS ABORDAGENS NAO FARMACOLOGICAS:",
      "Abordagem | Orientacao objetiva",
      "(ate 3 opcoes; menos, se o quadro nao sustentar mais)"
    ].join("\n");
  }
  if (kind === "symptomatic") {
    return [
      "CONDUTA PARA OS SINTOMAS-ALVO:",
      "Sintoma-alvo assinalado pelo medico | Conduta imediata para ele",
      "  1a opcao: Farmaco | Dose inicial: ... | Progressao: ... | Interacao: ...",
      "  2a opcao: idem, quando a literatura sustentar alternativa",
      "(uma entrada por sintoma assinalado; sem opcao medicamentosa quando o sintoma nao tiver tratamento farmacologico)"
    ].join("\n");
  }
  if (kind === "medication_tips") {
    return "Objeto com a chave tips: lista de paragrafos da secao BIPP TIPS, um por item, sem texto adicional. Lista vazia quando o farmaco nao tiver a secao.";
  }
  if (kind === "medication") {
    return [
      "MEDICAMENTO: (repita exatamente o nome informado em 'Medicamento pesquisado')",
      "",
      "DOSE INICIAL E PROGRESSAO:",
      "",
      "PRINCIPAIS EFEITOS COLATERAIS:",
      "",
      "OBSERVACOES:"
    ].join("\n");
  }
  return [
    "Texto corrido, narrativo-descritivo e cronologico, em paragrafos clinicos.",
    "Nao use titulos, listas, nomes de campos, Markdown ou asteriscos.",
    "Registre de forma impessoal os achados presentes, as negacoes expressas e os dados ausentes, sem inferir normalidade."
  ].join("\n");
}
