import { formatDiagnosticOption, formatMedicationTreatmentOption, formatNonPharmacologicalOption, normalizeDiagnosticOptions, parseTreatmentResponse } from "../clinical/diagnosis.js";
import { anamnesisText, conciseAntecedentsText, conciseComplaintText, conciseDiagnosticText, conciseHdaText, conciseIdentityText, conciseMentalExamText, joinWithOutro, mentalStateFindings, normalizeEvolutionNarrative, patientIdentificationText, professionalSelectedTreatmentItems, requestedExamsText, returnStoryText, treatmentDiagnosisText } from "../clinical/narrative.js";
import { arrayValue, cleanClinicalLine, compactText, formatClinicalList, joinValues, normalizeText, stripFinalPeriod } from "../clinical/textFormat.js";
import { ANAMNESIS_AI_FIELDS, MENTAL_EXAM_AI_FIELDS } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js?v=tratamento-1";
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
    mentalStateFindings(form).join("; ")
  ].filter(Boolean).join("; ");
  // Sem estrutura ainda — consulta digitada, ou antes da extracao — cai na
  // narrativa, encurtada para nao repetir o mesmo problema.
  const symptoms = structured || compactText(anamnesisText(form), 600);
  // A anamnese e o refinamento rodam antes da extracao: ali a narrativa e o
  // unico dado que existe.
  const narrative = compactText(anamnesisText(form), 1200) || structured;
  if (kind === "anamnesis") return `Semiologia psiquiatrica para entrevista diagnostica: cronologia, curso, polaridade do humor, sintomas depressivos e maniacos, ansiedade, sono, psicose, risco suicida, substancias, causas medicas, funcionamento e fatores de protecao. Dados da narrativa: ${narrative}`.slice(0, 4000);
  if (kind === "refinement") return `Semiologia psiquiatrica para refinamento clinico: lacunas da anamnese, discriminacao entre sindromes, red flags, risco, psicose, bipolaridade, substancias, causas medicas, funcionamento e fatores de protecao. Dados ja registrados: ${narrative}`.slice(0, 4000);
  if (kind === "treatment") return `Diretrizes e tratamento de ${diagnosis}. Dados clinicos relevantes: ${symptoms}`.slice(0, 4000);
  if (kind === "diagnosis") return `Criterios diagnosticos e diagnostico diferencial para: ${symptoms}`.slice(0, 4000);
  if (kind === "medication") return `Psicofarmacologia de ${form.medicationGeneric || ""}: dose inicial, titulacao, dose alvo, efeitos colaterais, contraindicacoes e interacoes. Contexto clinico: ${diagnosis}; ${symptoms}`.slice(0, 4000);
  return `${diagnosis}; ${symptoms}`.slice(0, 4000);
}

function validateClinicalAiPayload(kind, result, text = "") {
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
  if (kind === "refinement") {
    if (!Array.isArray(result.questions) || result.questions.length < 3) throw new Error("Perguntas de refinamento ausentes.");
    ["red_flags", "observations", "important_points"].forEach(key => {
      if (!Array.isArray(result[key])) throw new Error("Bloco de refinamento fora do formato esperado.");
    });
  }
  if (kind === "diagnosis") {
    // Teto, nao piso. Ver o comentario no schema do server.py: exigir um numero
    // fixo obrigava o modelo a inventar hipotese quando faltava dado.
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
    result.medication_options.forEach(option => {
      ["medication", "initial_dose", "progression", "target_dose"].forEach(key => {
        if (typeof option?.[key] !== "string" || !option[key].trim()) throw new Error("Opção medicamentosa incompleta.");
      });
    });
    result.non_pharmacological_options.forEach(option => {
      ["approach", "details"].forEach(key => {
        if (typeof option?.[key] !== "string" || !option[key].trim()) throw new Error("Abordagem não farmacológica incompleta.");
      });
    });
  }
  if (kind === "evolution" && typeof result.markdown !== "string") throw new Error("Evolucao fora do formato esperado.");
  if (kind === "medication") {
    ["medication", "dose_progression", "side_effects", "notes"].forEach(key => {
      if (typeof result[key] !== "string") throw new Error("Medicamento fora do formato esperado.");
    });
  }
  return result;
}

function parseFallbackClinicalText(kind, text = "") {
  if (["anamnesis", "mental_exam", "refinement"].includes(kind)) return null;
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

export function buildClinicalAiPrompt(kind, form = {}, patient = {}, previous = null, isReturn = false) {
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
    refinement: [
      "Analise a anamnese revisada, o exame psiquico revisado e o exame fisico registrado.",
      "Crie de 3 a 8 perguntas objetivas de refinamento com opcoes de resposta, priorizando lacunas e discriminacao diagnostica.",
      "Liste red flags apenas quando sustentadas ou ainda nao esclarecidas; nao invente risco.",
      "Inclua observacoes e pontos importantes que merecem confirmacao antes do resumo.",
      "Nao gere diagnostico nem tratamento."
    ],
    diagnosis: [
      "Analise de forma integrada e nao superficial toda a anamnese, os antecedentes, o impacto funcional, os riscos e cada dominio preenchido do exame psiquico.",
      "Gere exatamente 3 hipoteses sindromicas, 3 hipoteses nosologicas e 2 hipoteses etiologicas.",
      "As hipoteses sindromicas devem descrever a sindrome clinica; as nosologicas devem propor transtornos/diagnosticos; as etiologicas devem propor causas medicas, substancias ou contextos causais quando sustentados pelos dados.",
      "As hipoteses sao mero auxilio ao psiquiatra e nao substituem avaliacao, confirmacao de criterios, exame clinico ou decisao medica.",
      "Cada opcao deve conter nome, CID-11 e DSM-5-TR no formato estruturado solicitado. Para hipoteses sindromicas ou etiologicas sem codigo especifico, informe 'N/A' de forma explicita."
    ],
    treatment: [
      "Gere exatamente 3 opcoes de abordagem medicamentosa: primeira opcao, segunda opcao e uma opcao off-label, exclusivamente com dados do Assistant da IA atual ou do RAG com literatura.",
      "Para cada opcao informe medicamento, dose inicial, progressao/titulacao e dose final ou dose-alvo.",
      "Gere exatamente 3 abordagens nao farmacologicas ou alternativas, com uma orientacao objetiva para cada uma.",
      "Considere as hipoteses escolhidas e os dados clinicos informados, incluindo riscos, comorbidades, substancias e exame psiquico. Nao invente dados.",
      "Sinalize necessidade de verificacao medica de contraindicações, interacoes, gestacao, funcao renal/hepatica e monitorizacao quando pertinente."
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
    medication: [
      `Preencha somente os campos solicitados sobre o medicamento informado: ${form.medicationGeneric || "nao informado"}.`,
      "Seja objetivo e nao inclua preco, links, indicacoes extensas ou cabecalhos adicionais.",
      "Use linguagem clinica resumida para prontuario."
    ]
  };
  const task = taskByKind[kind] || taskByKind.evolution;
  return [
    "Voce e um assistente especializado em psiquiatria, documentacao medica e prontuario eletronico.",
    "Responda em portugues do Brasil, com linguagem tecnica, clara, objetiva e utilizavel em prontuario.",
    "Nao invente dados. Quando algo nao estiver informado, sinalize como dado ausente ou necessidade de confirmacao.",
    "",
    "TAREFA:",
    ...task.map(item => `- ${item}`),
    "",
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
    `Hipoteses diagnosticas selecionadas/acrescentadas: ${stripFinalPeriod(treatmentDiagnosisText(form)) || stripFinalPeriod(form.diagnosticoManual || "") || "nao informado"}.`,
    `Diagnostico registrado: ${stripFinalPeriod(form.diagnosticoManual || "") || "nao informado"}.`,
    `Diferenciais registrados: ${stripFinalPeriod(form.diferenciais || "") || "nao informado"}.`,
    `Tratamento medicamentoso: ${stripFinalPeriod(form.tratamentoMedicamentoso || form.conduta || "") || "nao informado"}.`,
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
  if (kind === "anamnesis") return "Objeto estruturado de anamnese conforme o schema, sem texto adicional.";
  if (kind === "mental_exam") return "Objeto estruturado do exame psiquico conforme o schema, sem texto adicional.";
  if (kind === "refinement") return "Objeto estruturado com perguntas, red flags, observacoes e pontos importantes, sem texto adicional.";
  if (kind === "diagnosis") {
    return [
      "DIAGNOSTICO SINDROMICO: ate 3 hipoteses, uma por linha.",
      "DIAGNOSTICO NOSOLOGICO: ate 3 hipoteses, uma por linha.",
      "DIAGNOSTICO ETIOLOGICO: ate 2 hipoteses, uma por linha.",
      "Formato de cada linha: Nome - CID-11: ... - DSM-5-TR: ...",
      "",
      "No campo DSM-5-TR use o codigo alfanumerico da CID-10-MC, que e o que o",
      "DSM-5-TR adota — F41.1, F32.1, F43.21. Nao use os numericos antigos da",
      "CID-9-MC (296.22, 300.02, 309.0), que sao do DSM-IV.",
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
