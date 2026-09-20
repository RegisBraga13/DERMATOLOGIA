import { diagnosticAggravatingOptionLines, diagnosticComorbidityOptionLines, diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSpecifierOptionLines, diagnosticSyndromicOptionLines, formatDiagnosticOption, formatMedicationTreatmentOption, formatNonPharmacologicalOption, normalizeDiagnosticOptions, parseTreatmentResponse, selectedAggravatingValues, selectedComorbidityValues, selectedDiagnosisValues, selectedSpecifierValues, treatmentOptionLines } from "../clinical/diagnosis.js";
import { careLevelOptions as CARE_LEVELS } from "../data/careLevels.js";
import { gestationalAgeText, lifeStagePromptText } from "../clinical/lifeStage.js";
import { anamnesisText, buildEvolutionNarrative, conciseAntecedentsText, conciseComplaintText, conciseDiagnosticText, conciseHdaText, conciseIdentityText, conciseMentalExamText, joinWithOutro, mentalStateFindings, normalizeEvolutionNarrative, patientIdentificationText, professionalSelectedTreatmentItems, refinementAnswersText, requestedExamsText, returnStoryText, treatmentDiagnosisText } from "../clinical/narrative.js";
import { arrayValue, cleanClinicalLine, compactText, formatClinicalList, joinValues, mentalExamKeys, normalizeText, stripFinalPeriod } from "../clinical/textFormat.js";
import { ANAMNESIS_AI_FIELDS, MENTAL_EXAM_AI_FIELDS, MENTAL_EXAM_NORMAL } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js";
import { scalesNarrativeText } from "../clinical/scoring.js";

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

export async function requestClinicalAi(kind, prompt, mode = "current", ragQuery = "", webQuery = "", ragMustMention = "", ragPatientScopes = [], diagnosisSelection = []) {
  const response = await fetch("/api/clinical-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // ragMustMention: o nome que o trecho recuperado TEM de citar para valer
    // como fonte. So a ficha do medicamento usa, porque so ali a resposta e
    // sobre um nome proprio -- e so ali a busca vetorial conseguia devolver oito
    // trechos de psiquiatria com relevancia alta para uma pergunta sobre
    // losartana, sem que nenhum falasse dela.
    // diagnosisSelection: as hipoteses que o medico assinalou, so no Refinar do
    // Diagnostico. O servidor anexa a secao "Criterios Diagnosticos" do DSM-5-TR
    // de cada uma, recortada do livro -- a busca vetorial nao a trazia.
    body: JSON.stringify({ kind, prompt, mode: mode === "rag" ? "rag" : "current", ragQuery, webQuery, ragMustMention, ragPatientScopes, diagnosisSelection })
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
    // As paginas que a busca da web citou. Chegam so no modo Nuvem, e vao a
    // tela pelo mesmo motivo das fontes do RAG: resposta sem procedencia nao
    // entra em prontuario.
    webSources: Array.isArray(data.web_sources) ? data.web_sources : [],
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
  // O retorno pergunta o que o Tratamento nao pergunta: nao "com o que tratar",
  // mas "o tratamento em curso esta funcionando, e o que se faz agora". Por isso
  // a busca leva os farmacos em uso e a evolucao observada, e nao so a hipotese.
  if (kind === "return_plan") {
    const emUso = joinValues(arrayValue(form.tratamentoMedicamentosSelecionados)) || stripFinalPeriod(form.tratamentoMedicamentoso || "");
    return `Conduta no seguimento de ${diagnosis} em uso de ${emUso || "tratamento nao informado"}: tempo esperado de resposta, quando aumentar dose, quando trocar, quando retirar, manejo de efeito adverso e de adesao irregular. Evolucao observada: ${symptoms}`.slice(0, 4000);
  }
  if (kind === "treatment") return `Diretrizes e tratamento de ${diagnosis}. Dados clinicos relevantes: ${symptoms}`.slice(0, 4000);
  // A busca do sintoma-alvo pergunta por manejo, nao por diretriz de doenca, e
  // vai contra a biblioteca marcada "sintomatico". O diagnostico entra so como
  // contexto, no fim: quem manda aqui e o sintoma.
  if (kind === "symptomatic") return `Manejo sintomatico e alivio imediato de: ${alvos || symptoms}. Conduta farmacologica e nao farmacologica dirigida ao sintoma. Contexto clinico: ${diagnosis}; ${symptoms}`.slice(0, 4000);
  // A CONSULTA FALA A LINGUA DO LIVRO, e nao a do formulario.
  //
  // Ate 28/08/2026 esta linha mandava `symptoms`, que comeca pelas listas de
  // sintomas em linguagem de paciente -- "Desinteresse ou falta de prazer",
  // "Cansaco ou falta de energia", "Sentimento de ruina". Nenhum livro escreve
  // assim: eles escrevem anedonia, fadiga, delirio de ruina. As listas leigas
  // afogavam os termos clinicos, e a busca nao achava nada.
  //
  // Medido nos 10 casos, contando trechos acima do limiar (maximo 80):
  //
  //     consulta antiga (listas leigas primeiro) ......  4
  //     exame psiquico apenas ......................... 38 a 53
  //     exame psiquico + queixa ....................... 56 a 58   <- esta
  //
  // Em OITO dos dez casos a consulta antiga recuperava ZERO trechos. Zero fonte
  // e 422 no servidor, e 422 derruba a etapa no catalogo local de 27 regras --
  // entao o medico que apertava "Gerar" em modo RAG recebia casamento de termo
  // com um aviso de indisponibilidade, e nao a literatura. Isso explica por que
  // o RAG parecia perder feio para um modelo de nuvem sem livro nenhum: na
  // maioria dos casos nao havia RAG na resposta.
  //
  // O exame psiquico ja esta escrito em vocabulario clinico -- bradipsiquismo,
  // hipotimia, hipobulia, delirio de ruina, bradilalia -- porque e o campo que
  // o medico preenche com os termos dele. E o pedaco do prontuario que mais se
  // parece com o texto dos livros. A queixa entra depois porque ancora o motivo
  // da consulta; sozinha ela rende menos (2 de 8 no caso 1).
  //
  // Tamanho nao era o problema: cortar a consulta antiga para 250 caracteres
  // manteve 0 de 8. Vocabulario era.
  // A Evolucao pergunta pelo SEGUIMENTO, e nao pelo diagnostico outra vez. O
  // que ela precisa do livro e a regua: tempo esperado de resposta, criterio de
  // remissao e de recaida, quando ajustar dose e quando trocar. Por isso a
  // consulta e montada em torno do par diagnostico + farmaco em uso, que e o
  // que define essa regua -- litio em mania tem prazo diferente de sertralina
  // em depressao, e a pergunta "esta funcionando?" so tem resposta com os dois.
  if (kind === "evolution") {
    const farmacos = joinValues(arrayValue(form.tratamentoMedicamentosSelecionados));
    return `Seguimento e resposta ao tratamento de ${diagnosis}. Tempo esperado de resposta, criterios de remissao e de recaida, ajuste de dose, troca de farmaco e refratariedade. Em uso: ${farmacos}. Quadro atual: ${symptoms}`.slice(0, 4000);
  }
  if (kind === "diagnosis") {
    const exame = mentalStateFindings(form).join("; ");
    // Sem exame preenchido — diagnostico pedido antes dele — cai na formulacao
    // antiga, que e o unico dado que existe nessa hora.
    return exame
      ? `Criterios diagnosticos e diagnostico diferencial. Exame psiquico: ${exame}. Queixa: ${form.queixa || ""}`.slice(0, 4000)
      : `Criterios diagnosticos e diagnostico diferencial para: ${symptoms}`.slice(0, 4000);
  }
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
  // O NOME, E SO O NOME. A licao ja estava escrita quinze linhas abaixo, sobre o
  // BIPPTIPS, e nao tinha sido aplicada aqui: descrever o que se quer do capitulo
  // dilui o token que localiza o capitulo. "Dose inicial, titulacao, dose alvo,
  // efeitos colaterais, contraindicacoes e interacoes" e a forma de QUALQUER
  // pagina de bula, e afogava o nome do farmaco; o contexto clinico do caso, que
  // vinha concatenado no fim, afogava o resto.
  //
  // Medido em 31/08/2026, contando trechos que CITAM o farmaco perguntado:
  //
  //                    consulta de producao      so o nome
  //     Clozapina .......... 0 de 8 ............ 8 de 8
  //     Olanzapina ......... 1 de 8 ............ 8 de 8
  //     Risperidona ........ 2 de 8 ............ 8 de 8
  //     Litio .............. 1 de 8 ............ 2 de 2
  //     Clonazepam ......... 1 de 8 ............ 7 de 8
  //     Losartana .......... 0 de 8 ............ 0 de 1
  //
  // Clozapina em ZERO e o caso que diz tudo: o Guia de Prescricao tem o capitulo
  // dela, e a busca devolvia oito trechos de outros farmacos com relevancia alta.
  // A ficha saia do livro certo falando do farmaco errado.
  //
  // A losartana continua em zero, que e a resposta certa de um acervo de
  // psiquiatria sobre um anti-hipertensivo -- e o que faz a busca cair para a web.
  if (kind === "medication") return String(form.medicationGeneric || "").trim().slice(0, 4000);
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
    // Criterio incompleto e descartado, e nao derruba a hipotese: mesma regra da
    // analise psicopatologica e do servidor. Criterio sem a evidencia deste
    // paciente e copia do manual — diz o que o DSM exige e nao diz se ESTE caso
    // preenche, que e a unica pergunta que a tela faz. Validado nos dois lados
    // porque a tela tambem recebe resposta pelo caminho de texto plano, que nao
    // passa pelo schema; por la a hipotese chega sem criterio, e a tela diz isso.
    result.nosological_options.forEach(option => {
      option.criteria = (Array.isArray(option.criteria) ? option.criteria : [])
        .filter(item => ["criterion", "status", "evidence"].every(key => typeof item?.[key] === "string" && item[key].trim())
          && CRITERION_STATUS.includes(item.status.trim()))
        .slice(0, 10);
      // Faixa invalida some, e nao derruba a hipotese. Mesma regra do servidor.
      const { support_min: baixo, support_max: alto } = option;
      const faixaValida = [baixo, alto].every(Number.isInteger) && baixo >= 0 && baixo <= alto && alto <= 100;
      if (!faixaValida) { option.support_min = null; option.support_max = null; }
    });
  }
  if (kind === "treatment") {
    // Nivel sem justificativa e descartado, e nao fatal: indicar leito sem
    // escrever por que e o que nao pode chegar ao prontuario. Mesma regra do
    // servidor -- validar nos dois lados porque a tela tambem recebe resposta
    // pelo caminho de texto plano, que nao passa pelo schema.
    const nivel = result.care_level;
    const nivelValido = nivel && CARE_LEVELS.includes(String(nivel.level || "").trim())
      && String(nivel.justification || "").trim();
    result.care_level = nivelValido
      ? { level: String(nivel.level).trim(), justification: String(nivel.justification).trim() }
      : null;
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
  if (kind === "return_plan") {
    if (!Array.isArray(result.medication_actions)) throw new Error("Ajuste de conduta fora do formato esperado.");
    if (!Array.isArray(result.conduct_options)) throw new Error("Ajuste de conduta fora do formato esperado.");
    const texto = (valor) => typeof valor === "string" ? valor.trim() : "";
    // Farmaco sem nome ou sem acao nao vira caixa de assinalar: seria uma linha
    // que o medico marca sem saber o que marcou. `detail` pode faltar -- manter
    // dose nao muda receita.
    result.medication_actions = result.medication_actions
      .filter(item => texto(item?.medication) && texto(item?.action))
      .map(item => ({ ...item, detail: texto(item.detail), rationale: texto(item.rationale) }))
      .slice(0, 8);
    result.conduct_options = result.conduct_options.map(texto).filter(Boolean).slice(0, 6);
  }
  if (kind === "medication_tips") {
    if (!Array.isArray(result.tips)) throw new Error("BIPP TIPS fora do formato esperado.");
    result.tips = result.tips.map(item => String(item || "").trim()).filter(Boolean).slice(0, 8);
  }
  if (kind === "evolution" && typeof result.markdown !== "string") throw new Error("Evolucao fora do formato esperado.");
  if (kind === "medication") {
    ["medication", "class_and_mechanism", "initial_dose", "titration", "target_dose", "ceiling", "avoid_with", "side_effects", "monitoring"].forEach(key => {
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
      care_level: parsed.careLevel,
      medication_options: parsed.medicationOptions,
      non_pharmacological_options: parsed.approachOptions
    };
  }
  if (kind === "evolution") return { markdown: text };
  if (kind === "medication") {
    // Caminho de texto plano: fallback de quando a resposta nao vem pelo schema.
    // Os campos curtos nao existem la, e inventar um parser de nove rotulos para
    // um caminho que quase nunca dispara custaria mais do que vale. Chega o nome
    // e o resto vazio, e a tela mostra so o que tem.
    const parsed = parseMedicationResponse(text);
    return {
      medication: parsed.medicationNameText,
      class_and_mechanism: "", initial_dose: "", titration: "", target_dose: "",
      ceiling: "", avoid_with: "", side_effects: parsed.medicationSafety || "", monitoring: ""
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
      `CLASSE E MECANISMO:\n${result.class_and_mechanism}`,
      `DOSE INICIAL:\n${result.initial_dose}`,
      `TITULACAO:\n${result.titration}`,
      `DOSE ALVO:\n${result.target_dose}`,
      `LIMITE:\n${result.ceiling}`,
      `EVITAR COM:\n${result.avoid_with}`,
      `EFEITOS COLATERAIS:\n${result.side_effects}`,
      `MONITORIZACAO:\n${result.monitoring}`
    ].join("\n\n");
  }
  return "";
}

// Lista fechada, igual no cliente, no servidor e no prompt. "nao avaliavel" nao
// e fracasso da IA: e a informacao que diz o que perguntar no retorno, e vale
// mais do que um "preenchido" assumido em cima do que ninguem registrou.
export const CRITERION_STATUS = ["preenchido", "nao preenchido", "nao avaliavel"];

// A consulta que vai para o buscador da web, e ela NAO e a consulta do RAG.
//
// A do RAG pode carregar a narrativa inteira: vai para o acervo dele, na conta
// dele, e quanto mais contexto melhor a recuperacao. A da web vai para um
// terceiro. Entao aqui entra so VOCABULARIO CLINICO FECHADO -- os termos que o
// medico marcou em lista, que sao palavras de livro -- e as hipoteses ja
// nomeadas. Nao entra queixa, nao entra HDA, nao entra resposta de refinamento,
// nao entra nome, idade, sexo, cidade nem ocupacao. "Delirio de grandeza, fuga
// de ideias, logorreia" nao diz quem e ninguem; "Estou otimo, quem quis vir foi
// minha familia" diz, e foi exatamente o que a primeira versao mandou para o
// buscador.
//
// Consulta vazia significa nao pesquisar. E a resposta certa: e melhor a Nuvem
// responder do que sabe, e a tela dizer que nao houve busca, do que pesquisar
// com o prontuario dentro.
export function buildWebQuery(kind, form = {}) {
  // Achado normal fica de fora: "consciente; orientado; preservada; sem
  // alteracao" nao tem o que procurar, e na primeira medicao esses termos
  // dominaram a consulta e trouxeram pagina de transtorno de personalidade
  // narcisista para um caso de mania -- "arrogancia" e "seducao" pontuando alto
  // num mar de normalidade.
  // Tambem as metades dos rotulos compostos: "Consciente/orientado" chega aqui
  // partido em dois achados, e nenhum dos dois casaria com o rotulo inteiro.
  // SO O QUE ESTA NA LISTA. mentalStateFindings devolve tambem o texto que o
  // medico escreveu no campo "Outro", e ali ele descreve o paciente com as
  // proprias palavras -- "interrompe o examinador, retoma tres assuntos ao mesmo
  // tempo e faz trocadilhos com as perguntas". Isso e narrativa de um caso, nao
  // termo de livro, e nao vai para buscador nenhum. O vocabulario fechado vai,
  // porque e palavra que ja esta impressa em todo manual.
  const catalogo = new Set(mentalExamKeys()
    .flatMap(chave => optionGroups[chave] || [])
    .map(normalizeText));
  const normais = new Set(Object.values(MENTAL_EXAM_NORMAL)
    .flatMap(valor => [valor, ...String(valor).split(/[\/(]/)])
    .map(item => normalizeText(item.replace(/\)/g, "")))
    .filter(Boolean));
  const termos = [
    ...arrayValue(form.diagnosticoSelecionado),
    ...String(form.diagnosticoAiNosologico || "").split("\n"),
    ...mentalStateFindings(form)
      .filter(item => catalogo.has(normalizeText(item)) && !normais.has(normalizeText(item)))
  ].map(item => String(item || "").split(" - ")[0].trim()).filter(Boolean);
  const unicos = [...new Set(termos)].slice(0, 12).join("; ");
  const farmaco = String(form.medicationGeneric || "").trim();
  const sintoma = String(form.appendixSymptom || "").trim();
  if (kind === "medication" || kind === "medication_review") {
    // "bula profissional ANVISA" nomeado na consulta, e nao so no contrato do
    // servidor: o Bulario Eletronico da ANVISA e a fonte oficial do que esta
    // aprovado NO BRASIL, e e ele que traz a apresentacao e a indicacao que
    // valem para uma receita daqui. Sem isso a busca voltava por DailyMed e EMA
    // -- corretas, mas americana e europeia, com apresentacao que nao existe na
    // farmacia. O bulario em si e uma pagina que carrega por JavaScript e
    // nenhum buscador le; os PDFs de bula por tras dela sao indexados, e sao o
    // que a busca alcanca.
    return farmaco ? `${farmaco}: bula profissional ANVISA, dose, titulacao, dose maxima, contraindicacao, interacao, alerta regulatorio` : "";
  }
  if (kind === "medication_tips") return "";
  if (kind === "symptomatic") {
    const alvo = sintoma || arrayValue(form.sintomasResiduais).join("; ");
    return alvo ? `Manejo farmacologico e nao farmacologico de ${alvo}: conduta, dose e cuidado` : "";
  }
  if (kind === "treatment" || kind === "treatment_review") {
    return unicos ? `Tratamento e diretriz atual para: ${unicos}. Primeira linha, dose, monitorizacao` : "";
  }
  // Mesmo cerco das outras etapas: so vocabulario fechado -- nome de doenca e
  // nome de farmaco, que estao impressos em qualquer manual. O que o medico
  // observou hoje nao vai para a web.
  if (kind === "return_plan") {
    const farmacos = arrayValue(form.tratamentoMedicamentosSelecionados)
      .map(item => String(item || "").split(" - ")[0].trim()).filter(Boolean).slice(0, 6);
    if (!unicos && !farmacos.length) return "";
    return `Ajuste de tratamento em ${unicos || farmacos.join("; ")}${farmacos.length ? ` em uso de ${farmacos.join("; ")}` : ""}: resposta parcial, troca, aumento de dose, efeito adverso, tempo de espera`;
  }
  // Vale o mesmo cerco das outras etapas: so vocabulario fechado. Diagnostico
  // assinalado e nome de farmaco sao palavras que estao impressas em qualquer
  // manual -- o que NAO vai e o estado deste paciente hoje, que so existe neste
  // prontuario. A pergunta a web e sobre a doenca e o remedio, nunca sobre ele.
  if (kind === "evolution") {
    const farmacos = arrayValue(form.tratamentoMedicamentosSelecionados)
      .map(item => String(item || "").split(" - ")[0].trim()).filter(Boolean).slice(0, 6);
    if (!unicos && !farmacos.length) return "";
    return `Seguimento de ${unicos || farmacos.join("; ")}${farmacos.length && unicos ? ` em uso de ${farmacos.join("; ")}` : ""}: tempo esperado de resposta, criterio de remissao, quando ajustar dose ou trocar`;
  }
  if (kind === "diagnosis" || kind === "diagnosis_review") {
    return unicos ? `Criterios diagnosticos DSM-5-TR e CID-11 e diagnostico diferencial para: ${unicos}` : "";
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
      "Leia o sintoma na forma que ele tem NAQUELA idade: irritabilidade, recusa escolar e queixa somatica sao apresentacao depressiva na crianca; queixa cognitiva e apatia sao apresentacao depressiva no idoso. Nao exija a forma adulta do sintoma para reconhece-lo.",
      "Diferencie sintoma negado, sintoma presente e domínio não investigado; campo vazio significa dado não informado e nunca normalidade.",
      "A cobertura muda com a faixa etaria informada em DADOS DO PACIENTE: cubra os dominios que aquela idade exige e nao force os que ela nao comporta. Numa crianca, escola, desenvolvimento e quem relata; num idoso, cognicao, quedas, polifarmacia e deficit sensorial; em mulher em idade fertil, ciclo, gestacao e amamentacao.",
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
      "Puxe as perguntas que a FAIXA ETARIA deste paciente exige e que ainda nao foram feitas — o que falta perguntar a uma crianca, a um adolescente ou a um idoso nao e o mesmo. Em mulher em idade fertil, ciclo menstrual, gestacao, puerperio, amamentacao e contracepcao sao lacuna quando ausentes.",
      "Havendo no catalogo um bloco de faixa (crianca_adolescente, idoso, saude_reprodutiva), ele entrou porque a identificacao do paciente o exige: escolha PELO MENOS uma pergunta dele, e mais de uma se o caso pedir. Bloco de faixa presente e ignorado e falha de cobertura, e nao economia.",
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
      // Dele, 20/09/2026: depois da anamnese, do exame psiquico e do refinamento
      // o programa monta a primeira historia clinica, e ela volta ao raciocinio
      // para robustecer as hipoteses. "Isso aqui e ouro."
      "A SINTESE DO CASO e a primeira historia clinica, montada so com anamnese, exame psiquico e exame fisico: ela mostra o caso inteiro e a cronologia, e serve para robustecer as hipoteses. Ela nao substitui o registro: a EVIDENCIA continua sendo o fato bruto do registro, nunca o termo tecnico nem a frase da sintese.",
      "A IDADE DE INICIO E CRITERIO, e nao contexto. Pese cada hipotese contra a faixa etaria: transtornos do neurodesenvolvimento comecam na infancia e nao surgem na vida adulta; esquizofrenia e transtorno bipolar tem inicio tipico da adolescencia ao adulto jovem; PRIMEIRO episodio de psicose, mania ou depressao grave no idoso e, ate prova em contrario, secundario a condicao medica, a medicamento ou a substancia — e a hipotese etiologica passa a ser obrigatoria.",
      "Hipotese incompativel com a idade so entra se o registro trouxer o que a sustente, e o motivo tem de aparecer na justificativa. Nao proponha transtorno de personalidade a partir de crise recente em adolescente ou adulto jovem: exige padrao ja estavel.",
      "Em mulher em idade fertil, considere no diferencial e nos especificadores o que depende do eixo reprodutivo: transtorno disforico pre-menstrual, inicio no periparto, e quadro do climaterio.",
      // Pedido dele, 28/08/2026: "Os diagnosticos devem ter o DSM-5-TR e CID-11
      // como pressupostos basicos -- eles sao o padrao ouro." Os dois entraram
      // no acervo nesse dia, no genero "criterios", e esta etapa os le. Ate
      // entao o app nao tinha FONTE DE CRITERIO nenhuma: psicopatologia
      // descreve fenomeno, sindromes descreve entidade, e nenhum dos dois traz
      // "cinco dos nove sintomas por duas semanas" nem a lista de
      // especificadores -- que foi justamente o que ele teve de corrigir a mao.
      "Em 'finding' escreva SO o achado, sem repetir a evidencia entre parenteses: a evidencia tem campo proprio e a tela ja a mostra entre parenteses depois do achado. Repetindo, a linha sai com o mesmo trecho duas vezes.",
      "DSM-5-TR e CID-11 sao o padrao de referencia desta etapa, e nao duas fontes entre outras. Toda hipotese NOSOLOGICA deve ser entidade existente em um dos dois; rotulo descritivo que nao seja entidade dessas classificacoes nao entra nessa camada — se for conjunto de achados, e sindromico.",
      "Confira os criterios na literatura recuperada antes de propor: numero de sintomas, duracao minima, prejuizo funcional e exclusoes. Proponha o que o registro sustenta, e nao o que o quadro sugere de longe. Quando um criterio decisivo nao puder ser verificado com o que esta registrado, marque-o 'nao avaliavel' em vez de assumir que esta preenchido.",
      "Os especificadores devem sair das listas oficiais do DSM-5-TR ou da CID-11 para AQUELA entidade: gravidade; com sintomas psicoticos, dizendo se sao congruentes ou incongruentes com o humor; caracteristicas melancolicas, atipicas, catatonicas, ansiosas; padrao sazonal; curso e remissao. Nao invente especificador descritivo fora dessas listas.",
      "Analise de forma integrada e nao superficial toda a anamnese, os antecedentes, o impacto funcional, os riscos e cada dominio preenchido do exame psiquico.",
      "Gere ate 3 hipoteses nosologicas, ate 3 sindromicas e ate 2 etiologicas: e teto, nao piso. Grupo vazio e resposta legitima quando o registro nao sustenta.",
      // As tres camadas nao sao rotulos alternativos do mesmo achado: sao
      // perguntas clinicas diferentes. Escrever isso no prompt e o que impede
      // a IA de devolver a mesma entidade tres vezes com nomes trocados.
      "A camada NOSOLOGICA identifica a entidade nos manuais oficiais. E a base do tratamento principal, do seguimento continuo, do atestado e do laudo, e e ela que recebe os especificadores.",
      // O campo que faltava, medido no caso Wagner: rodando os dois modos, seis
      // dos sete campos vieram identicos, porque nome e codigo e tudo que o
      // esquema aceitava. Com criterio, o livro passa a ter onde falar -- e a
      // fundamentacao, que e o que sustenta laudo e pericia, chega a tela.
      "Para CADA hipotese nosologica preencha 'criteria': os criterios diagnosticos daquela entidade, conferidos um a um contra ESTE paciente. E o que separa nomear de fundamentar, e e o que sustenta laudo, atestado e pericia.",
      // Decidido por ele em 20/09/2026, com quatro condicoes: faixa e nunca
      // valor exato; rotulada como estimativa nao calibrada; so na tela; sem
      // obrigar a soma a dar 100.
      "Para CADA hipotese nosologica preencha 'support_min' e 'support_max', inteiros de 0 a 100: a FAIXA, em pontos percentuais, do quanto o REGISTRO ATUAL sustenta aquela hipotese como explicacao do quadro. Nao e probabilidade calibrada nem prevalencia — voce nao conhece a populacao do consultorio —, e sim a leitura de quanto do que esta registrado a sustenta.",
      "A faixa tem de 10 a 25 pontos de largura, com extremos multiplos de 5 ('55 a 70', nunca '63'). Faixa mais larga quanto mais criterio decisivo estiver 'nao avaliavel': o que falta perguntar alarga a faixa. Hipotese com criterio decisivo 'nao preenchido' fica abaixo de 30. As faixas NAO precisam somar 100 e podem se sobrepor: as hipoteses nao sao exclusivas, e comorbidade e regra. Nao ordene nem arredonde as faixas para parecerem coerentes entre si.",
      "Em 'criterion' escreva o criterio como o manual o enuncia, com a letra ou o numero quando houver e o limiar quando houver — 'Criterio A: humor anormalmente elevado, expansivo ou irritavel, por pelo menos 1 semana'. Nao parafraseie ate virar sintoma solto: o que se confere e a regra.",
      "Em 'status' use exatamente 'preenchido', 'nao preenchido' ou 'nao avaliavel'. 'nao avaliavel' quando o registro nao permite decidir — e resposta legitima e util, porque diz o que perguntar; assumir preenchido o que nao foi registrado e o erro grave desta etapa.",
      "Em 'evidence' va ao FATO deste paciente que preenche o criterio, com as palavras do registro — 'dorme cerca de duas horas por noite ha tres semanas e acorda com energia de sobra'. Quando o status for 'nao avaliavel', escreva o que falta perguntar. Nunca repita o enunciado do criterio como se fosse evidencia.",
      "Confira os criterios contra a literatura recuperada, e nao de memoria: numero de sintomas exigido, duracao minima, prejuizo funcional e criterios de exclusao. Quando os manuais divergirem entre si — a CID-11 e o DSM-5-TR nem sempre exigem o mesmo —, diga qual voce esta conferindo.",
      "Nao proponha hipotese nosologica cujos criterios o registro contradiz. Hipotese com criterio decisivo NAO PREENCHIDO so entra se for diferencial que voce quer deixar registrado, e entao isso tem de estar visivel nos proprios criterios.",
      // Pedido dele, 14/09/2026, para valer SEMPRE: os criterios do DSM-5-TR
      // tem limites praticos e criticas estruturais na vida real; a mente
      // funciona em espectro continuo, e nao em gavetas fechadas; muitos
      // criterios se repetem em transtornos diferentes. Sem estas regras o
      // criterio conferido item por item vira contagem, e o quadro um sintoma
      // abaixo do limiar sai da tela levando o sofrimento junto.
      "Os criterios sao referencia, e nao veredito. A mente funciona em espectro continuo, e nao em gavetas fechadas: quadro com sofrimento ou prejuizo funcional claro que fica abaixo do limiar de uma entidade NAO some. Ele fica na camada sindromica ou, havendo a categoria, como 'outro transtorno especificado' daquele grupo, com o criterio que faltou marcado 'nao preenchido'.",
      "Muitos criterios se repetem em transtornos diferentes — insonia, fadiga, dificuldade de concentracao, irritabilidade, inquietacao, alteracao de apetite. Eles contam dentro de cada entidade, mas NAO separam uma hipotese da outra: no diagnostico diferencial, apoie a escolha no que e proprio de cada uma (a preocupacao na TAG, a elevacao do humor na mania, a revivescencia no TEPT), e nao na soma dos sintomas compartilhados.",
      // Modelo dimensional, no mesmo pedido: gravidade e espectro medem a
      // intensidade do sofrimento e a funcionalidade -- se o paciente consegue
      // trabalhar, estudar e se relacionar --, e nao a contagem de criterios.
      "Leitura dimensional: quando o registro trouxer dado sobre trabalho, estudo, relacoes ou autocuidado, a ANALISE PSICOPATOLOGICA inclui o dominio 'Funcionalidade', com o fato que mostra o prejuizo — o que a pessoa deixou de fazer, e desde quando. 'Prejuizo social, prejuizo familiar' e o rotulo marcado no formulario, e nao evidencia. A gravidade — leve, moderada, grave — sai da intensidade do sofrimento e desse prejuizo funcional, e nao do numero de criterios preenchidos.",
      // Diagnostico longitudinal, no mesmo pedido: a depressao isolada de hoje
      // pode se revelar bipolar, ou condicao medica, em alguns meses. O canal ja
      // existe -- criterio 'nao avaliavel' volta no retorno como o que
      // investigar --, entao a regra usa ele em vez de pedir campo novo.
      "O diagnostico e longitudinal: o quadro de hoje pode se revelar outro em meses — a depressao que se revela bipolar, a ansiedade ou a psicose que se revela condicao medica ou uso de substancia. Quando o registro nao permitir descartar a causa por substancia ou condicao medica, marque 'nao avaliavel' esse criterio de exclusao e escreva em 'evidence' o que investigar.",
      // Pedido dele, 14/09/2026: sinais de alerta para bipolaridade mesmo sem
      // episodio de mania ou hipomania documentado. Medido no mesmo dia: com
      // mania negada, a depressao psicotica saia com "nunca houve episodio
      // maniaco: preenchido" e nenhum aviso. Sem campo novo na tela, por decisao
      // dele: o sinal pesa no proprio criterio, e o 'nao avaliavel' ja volta no
      // retorno como o que investigar.
      "Em toda hipotese DEPRESSIVA — episodio depressivo, transtorno depressivo maior, recorrente ou persistente — o criterio de exclusao de mania ou hipomania ('nunca houve episodio maniaco ou hipomaniaco') e conferido tambem contra os sete sinais de alerta para bipolaridade, mesmo com mania negada: (1) primeiro episodio depressivo antes dos 20 anos; (2) tres ou mais episodios depressivos em cerca de cinco anos; (3) falta de resposta ao antidepressivo, perda rapida do efeito ou piora com ele; (4) estado misto ou ativacao com antidepressivo — agitacao, irritabilidade, ansiedade, 'acelerado por dentro e esgotado por fora'; (5) pai, mae ou irmao com transtorno bipolar; (6) caracteristicas atipicas — irritabilidade, raiva, impulsividade, hipersonia, aumento de apetite ou de peso; (7) episodios de inicio ou termino abrupto, em poucas semanas, sem estressor claro.",
      // Dele, 14/09/2026: "qualquer episodio de mania documentado caracteriza
      // bipolaridade. Invariavelmente". Diferente dos sinais de alerta, que se
      // pesam, esta regra nao se pesa.
      "Qualquer episodio MANIACO documentado no registro — atual ou passado, relatado pelo paciente, pelo familiar ou registrado em tratamento anterior — caracteriza bipolaridade, INVARIAVELMENTE. Nesse paciente a hipotese nosologica do humor e transtorno bipolar tipo I; se a mania surgiu com antidepressivo, outra substancia ou condicao medica, continua no espectro bipolar (induzido por substancia ou medicamento, ou devido a outra condicao medica), e nunca vira depressao unipolar. Nao proponha transtorno depressivo maior, episodio depressivo ou distimia como hipotese nosologica: o episodio depressivo atual e especificador do bipolar ('episodio atual depressivo'), e o criterio 'nunca houve episodio maniaco ou hipomaniaco' de qualquer hipotese depressiva e 'nao preenchido'.",
      // Dele, 14/09/2026: "Desses criterios nao sao rigidos, como tudo em
      // psiquiatria". Os sinais sao indicio para pesar, e nao lista a cumprir.
      "Os sinais nao sao rigidos, como nada em psiquiatria: pese-os em conjunto, com a idade, o curso e o restante do caso, e nao como lista a cumprir. Um sinal isolado e fraco num quadro que o resto do caso explica — primeiro episodio aos 58 anos apos luto, mania negada — nao obriga a mudar o criterio; varios sinais juntos, ou um sinal forte num paciente jovem, pesam. Quando o conjunto deixar a bipolaridade em aberto, marque 'nao avaliavel' e escreva em 'evidence' o sinal presente com o fato, e as perguntas que faltam, escritas para o paciente ou o familiar — 'primeiro episodio aos 17 anos; perguntar: algum pai, mae ou irmao ja teve transtorno bipolar? ja ficou agitado ou acelerado com antidepressivo?'.",
      "O sinal so pesa quando o registro o traz ou nao diz. Quando o registro mostrar o CONTRARIO do sinal — primeiro episodio depois dos 20 anos, nenhum parente com bipolar, boa resposta ao antidepressivo —, ele nao conta: 'primeiro episodio apos os 40 anos' e a ausencia do sinal, e nao alerta. Mas nao registrado nao e ausente: depressao ou suicidio na familia sem dizer se alguem teve transtorno bipolar nao afasta o sinal (5), e uso previo de antidepressivo sem dizer a resposta nao afasta os sinais (3) e (4) — diga isso na evidencia, e deixe o peso do conjunto decidir o status.",
      "Comece pela ANALISE PSICOPATOLOGICA, e so depois nomeie as hipoteses: e ela o raciocinio que as sustenta. Para cada dominio, escreva o achado e, entre parenteses, a EVIDENCIA — o trecho do registro que o sustenta, o mais literal possivel. 'Anedonia severa (parou de sair, de cozinhar e de atender o telefone)'. Achado que voce nao conseguir ancorar num trecho do registro NAO ENTRA: sem evidencia e afirmacao, e este prontuario nao afirma o que nao foi registrado.",
      // O exame psiquico e preenchido por termo tecnico marcado em lista. Sem a
      // regra abaixo, o trecho "mais literal" do registro para o dominio humor e
      // a propria lista de termos, e a linha sai tautologica: "euforia,
      // labilidade afetiva (euforia, labilidade afetiva)". Nomear duas vezes nao
      // e fundamentar. A evidencia tem de vir do relato -- comportamento, fala,
      // numero, data -- que e onde esta o fato que o termo interpreta.
      "A EVIDENCIA e o FATO BRUTO do relato: um comportamento, uma fala do paciente, um numero, uma data, um evento da anamnese, dos antecedentes ou do impacto funcional. NUNCA use como evidencia o termo tecnico marcado no exame psiquico, nem uma reformulacao do proprio achado. 'Grandiosidade (diz que foi escolhido para reorganizar o mercado imobiliario da cidade)' esta certo; 'Grandiosidade (ideias de grandeza)' esta errado, porque repete o achado com outras palavras e nao prova nada. Se o unico apoio para um achado for o termo do exame psiquico que ja o nomeia, o item NAO ENTRA: o exame psiquico diz o que o medico concluiu, e a evidencia tem de dizer o que o paciente fez ou falou.",
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
      "A SINTESE DO CASO e a primeira historia clinica, montada so com anamnese, exame psiquico e exame fisico, e a ANALISE PSICOPATOLOGICA traz os achados que sustentam as hipoteses. Use as duas para ver o caso inteiro e propor o tratamento dos sintomas que o paciente de fato tem, e nao so o do rotulo diagnostico.",
      "A faixa etaria muda a prescricao antes da dose. No idoso, comece com metade da dose do adulto, suba mais devagar, e evite benzodiazepinico e anticolinergico pelo risco de queda e de piora cognitiva. Em crianca e adolescente, so farmaco com indicacao para a idade, e antidepressivo com vigilancia de ativacao e de ideacao suicida nas primeiras semanas.",
      "Gestacao e amamentacao mudam a ESCOLHA do farmaco, e nao apenas a dose. Havendo gestacao, puerperio ou amamentacao no registro, a opcao proposta tem de ser compativel com isso, e a justificativa tem de dizer por que. Sendo mulher em idade fertil sem esse dado registrado, sinalize a necessidade de confirmar antes de prescrever teratogeno conhecido.",
      // Primeira instrucao da etapa, e nao a ultima: onde tratar decide-se antes
      // de com o que tratar. Num caso de depressao psicotica com recusa
      // alimentar, perda de 11 kg e ideacao suicida, a resposta trazia
      // antidepressivo e psicoeducacao sem em nenhum momento dizer que aquilo
      // era indicacao de leito.
      `Comece por 'care_level': onde este paciente deve ser tratado. Escolha UMA modalidade, exatamente como escrita, da lista fechada: ${CARE_LEVELS.join("; ")}. Nao invente modalidade fora da lista.`,
      "Em 'justification', diga em uma frase por que esse nivel, ancorada no que esta registrado — risco atual, capacidade de autocuidado, suporte disponivel, adesao, gravidade. Nivel sem justificativa e descartado.",
      "Recuse o ambulatorio quando o registro nao o sustentar: risco de suicidio com intencao, recusa alimentar com perda ponderal, sintomas psicoticos que impedem o autocuidado, e incapacidade de garantir seguranca em casa sao indicacao de leito ou de emergencia, e nao de retorno agendado.",
      "As modalidades de internacao seguem a Lei 10.216/2001, e a diferenca entre elas e juridica: voluntaria e com consentimento escrito do paciente; involuntaria e sem o consentimento dele, a pedido de terceiro; compulsoria e determinada por juiz. Escolha pela situacao do caso, e nao pela gravidade isolada.",
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
      "'medication_options' trata a hipotese NOSOLOGICA — e o tratamento de fundo, o que sustenta o seguimento. O manejo pontual do sintoma-alvo e consultado a parte, no apendice do programa, e nao entra aqui.",
      // A regra acima, sozinha, empurrou a etapa para a manutencao pura: numa
      // mania grave com sintomas psicoticos a resposta veio litio e valproato,
      // sem antipsicotico nenhum. O antipsicotico tinha sido lido como manejo de
      // sintoma, quando e o tratamento de primeira linha do episodio. Fase aguda
      // nao e sintoma-alvo: o alvo e a queixa isolada -- insonia, ansiedade --,
      // e o episodio e a doenca acontecendo agora. Corrigido em 31/08/2026,
      // sobre o caso Wagner.
      "O EPISODIO AGUDO faz parte do tratamento da hipotese nosologica, e nao do sintoma-alvo. Quando a hipotese escolhida traz episodio atual — sobretudo com o especificador grave ou com sintomas psicoticos —, a classe indicada para a FASE AGUDA daquele episodio TEM de aparecer entre as opcoes, e vem na 1a opcao, antes do que so age na manutencao. Mania aguda com sintomas psicoticos pede antipsicotico de segunda geracao; depressao com sintomas psicoticos pede antipsicotico associado ao antidepressivo. Propor apenas estabilizador de humor de inicio lento num episodio maniaco agudo esta errado, mesmo que o estabilizador seja o certo para o seguimento.",
      "Quando a fase aguda e a manutencao pedirem farmacos diferentes, diga isso na propria opcao — qual entra agora e qual sustenta o seguimento — em vez de sacrificar um dos dois para caber nas tres vagas.",
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
      "Os sintomas-alvo desta consulta sao APENAS os listados no registro sob 'Sintomas-alvo assinalados'. Nunca proponha conduta para sintoma que nao esteja ali, e nunca crie um sintoma-alvo por conta propria. Sem sintoma listado, devolva a lista VAZIA.",
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
    // O Ajuste de conduta do retorno. A regra que organiza tudo aqui: o medico
    // ja disse o que viu na pagina anterior, e a pagina anterior nao deixa
    // avancar incompleta. Entao esta etapa nao tem o que adivinhar -- e nao
    // pode: reescrever a evolucao que ele marcou seria trocar observacao por
    // suposicao, com a mesma cara na tela.
    return_plan: [
      "Esta e a etapa de AJUSTE DE CONDUTA de um retorno. O medico ja avaliou o paciente e registrou o que viu: evolucao clinica, adesao, efeitos colaterais, funcionalidade, e o estado de cada hipotese, de cada farmaco e de cada sintoma-alvo do atendimento anterior. Tudo isso esta no registro abaixo.",
      "Voce NAO reavalia e NAO reinterpreta esses achados: eles sao observacao do medico, e valem como fato. Sua tarefa e uma so — dizer o que decorre deles.",
      "Em 'medication_actions' entre com UMA acao para CADA medicamento que o paciente esta em uso, sem excecao. Um farmaco prescrito que nao aparece na lista e um farmaco esquecido no retorno.",
      "'medication' repete o nome do farmaco como esta no registro. 'action' e exatamente um destes: Manter dose, Aumentar dose, Diminuir dose, Trocar medicamento, Retirar, Acrescentar medicamento.",
      "Manter dose e uma decisao, e a decisao certa quando o quadro melhora com a dose atual e sem efeito limitante. Nao evite 'Manter dose' por parecer pouco.",
      "'detail' diz o que muda na receita, em numero: 'para 100 mg/dia', 'reduzir 25 mg por semana ate suspender', 'trocar por escitalopram 10 mg/dia'. Em Manter dose, 'detail' fica vazio.",
      "'rationale' e UMA frase curta ligando a acao ao que o medico registrou: qual achado dele sustenta esta decisao. Sem repetir a acao e sem prosa.",
      "Adesao irregular muda a leitura: dose que nao foi tomada nao falhou, e subir dose de remedio que o paciente nao toma e erro. Diga isso no 'rationale' quando for o caso.",
      "Efeito colateral registrado tem de aparecer em alguma acao — reduzir, trocar, dividir a tomada, manter e monitorar. Efeito que o medico anotou e a conduta ignora e a falha mais grave desta etapa.",
      "Respeite o tempo de resposta da classe: nao troque antidepressivo por falta de resposta antes do prazo que a literatura recuperada estabelece. Quando o prazo ainda nao passou, mantenha e diga no 'rationale' quanto tempo ainda se espera.",
      "Em 'conduct_options' vao ate 6 ajustes que NAO sao receita: exame a pedir, encaminhamento, psicoterapia, orientacao ao paciente, intervalo ate o proximo retorno, monitorizacao. Uma linha cada, direta, sem verbo de enfeite e sem justificativa dentro da linha.",
      "Nada de 'reavaliar em consulta', 'considerar ajuste' ou 'acompanhar evolucao' — isso e adiar a conduta, nao a conduta. Se nao ha o que propor, devolva a lista vazia.",
      "Cada linha e uma caixa que o medico marca ou nao: escreva uma por decisao, nunca duas coisas na mesma linha.",
      "Sucinto e objetivo. Sem introducao, sem fechamento, sem repetir o que ja esta no registro."
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
    // Refeita em 31/08/2026. A ficha vinha em tres campos de prosa longa que
    // reescreviam a bula -- sedacao, ganho de peso, extrapiramidais,
    // hiperprolactinemia. Ele foi direto ao ponto: "isso ai tem na bula", e
    // ditou o formato que queria, telegrafico. O texto longo e do livro, e o
    // livro agora abre sozinho no capitulo; aqui e a linha de consulta rapida.
    medication: [
      `Preencha somente os campos solicitados sobre o medicamento informado: ${form.medicationGeneric || "nao informado"}.`,
      "TELEGRAFICO. Cada campo e um fragmento, nao uma frase: sem sujeito, sem verbo de ligacao, sem 'recomenda-se', sem 'deve-se'. 'Antipsicotico atipico, antagonista D2 e 5-HT2A' e o formato certo; 'A risperidona e um antipsicotico atipico que atua como antagonista' e o errado.",
      "NAO REESCREVA A BULA. Efeito colateral comum de classe, cuidado obvio e frase de cautela generica ja estao na bula e no capitulo do livro, e nao ganham nada repetidos aqui. O que se consulta neste bloco e o que se precisa com a receita na mao.",
      "Em 'class_and_mechanism': a classe e o mecanismo em uma linha, com os receptores quando definirem o perfil clinico.",
      "Em 'initial_dose': so o numero, a via e a fracao — '2 mg/dia VO, 1 a 2 tomadas'. Em idoso ou paciente sensivel, a dose menor entre parenteses.",
      "Em 'titration': quanto se aumenta, de quanto em quanto tempo — 'aumentar 1 a 2 mg a cada 24 h'. Sem 'conforme resposta clinica' no lugar do numero.",
      "Em 'target_dose' e 'ceiling': as duas faixas, separadas. Dose alvo nao e dose maxima, e confundir as duas na mesma linha e o que faz errar receita.",
      "Em 'avoid_with': o que NAO combinar, e por que, em fragmento — 'levodopa (antagonismo)'. Quando o registro disser o que o paciente ja toma, cruze com isso primeiro e diga o risco concreto.",
      "Em 'side_effects': ate cinco, os que mudam conduta ou fazem o paciente abandonar o tratamento, separados por virgula. Nao e a lista da bula.",
      "Em 'monitoring': o exame e a periodicidade — 'litemia 5 dias apos dose estavel, depois trimestral; TSH e creatinina semestrais'. Sem exame nao ha o que escrever: campo curto e melhor do que campo cheio de generalidade.",
      "Nao inclua preco, link, cabecalho, nem a frase de que a decisao e medica: ela ja esta na tela."
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
    // Desde 14/09/2026 o servidor anexa, para cada hipotese assinalada, a secao
    // de criterios do DSM-5-TR inteira. Sem esta linha o modelo a trataria como
    // mais um trecho entre outros, e nao como a regra contra a qual conferir.
    kind === "diagnosis_review"
      ? "Quando as FONTES trouxerem a secao 'Criterios Diagnosticos' do DSM-5-TR de uma hipotese, esse e o texto oficial dos criterios daquela entidade: confira 'criteria' item por item contra ele, com o numero de sintomas, a duracao e as exclusoes que ele exige. Conferir nao e contar: quadro abaixo do limiar com sofrimento ou prejuizo funcional nao e retirado, desce para a camada sindromica ou para 'outro transtorno especificado'; e criterio que se repete em outros transtornos nao decide o diferencial."
      : "",
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
    ...caseSynthesisLines(kind, form, patient, isReturn),
    "FORMATO DA RESPOSTA:",
    promptResponseFormat(kind)
  ].join("\n");
}

// A sintese do caso volta ao Diagnostico e ao Tratamento: a primeira historia
// clinica, sem hipotese nem conduta, e no Tratamento tambem a analise
// psicopatologica, que ja passou pelo medico ao assinalar as hipoteses. No
// retorno nao ha esta etapa: o caso ja tem sintese, que e a consulta anterior.
function caseSynthesisLines(kind, form = {}, patient = {}, isReturn = false) {
  const base = REVIEW_OF_KIND[kind] || kind;
  if (isReturn || !["diagnosis", "treatment"].includes(base)) return [];
  const linhas = [];
  const sintese = buildEvolutionNarrative(form, patient, null, false, { preliminar: true });
  if (sintese) linhas.push("SINTESE DO CASO (primeira historia clinica, sem hipoteses nem tratamento):", sintese, "");
  const analise = String(form.analisePsicopatologica || "").trim();
  if (base === "treatment" && analise) linhas.push("ANALISE PSICOPATOLOGICA (achado e, entre parenteses, a evidencia do registro):", analise, "");
  return linhas;
}

function clinicalEvolutionPromptData(form = {}, patient = {}, previous = null, isReturn = false) {
  return [
    `Identidade: ${conciseIdentityText(patient)}.`,
    `Queixa principal: ${conciseComplaintText(form, isReturn)}.`,
    `HDA: ${conciseHdaText(form, previous, isReturn)}.`,
    `Antecedentes: ${conciseAntecedentsText(form)}.`,
    `Exame psiquico: ${conciseMentalExamText(form)}.`,
    `Escalas: ${stripFinalPeriod(scalesNarrativeText(form, previous).replace(/^Escalas aplicadas: /, "")) || "nenhuma aplicada"}.`,
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
    // A idade em linha PROPRIA, e com o que ela implica. Na identificacao ela
    // ficava ao lado do estado civil e da ocupacao, lida como cadastro.
    lifeStagePromptText(patient),
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
    // Os dois blocos condicionais da anamnese. So aparecem na tela para quem os
    // comporta, e por isso podem faltar aqui sem que isso signifique lacuna.
    // A gestacao vem em linha propria, antes do resto: e a unica resposta desta
    // tela que pode suspender uma prescricao. "Nao sabe" e afirmacao, e nao
    // lacuna -- por isso e dita, e nao omitida.
    pregnancyPromptLine(form),
    joinWithOutro(form.cicloReprodutivo, form.cicloReprodutivoOutro) || joinWithOutro(form.sintomasCiclo, form.sintomasCicloOutro) || form.historiaReprodutiva
      ? `Saude reprodutiva: ${[joinWithOutro(form.cicloReprodutivo, form.cicloReprodutivoOutro), joinWithOutro(form.sintomasCiclo, form.sintomasCicloOutro), stripFinalPeriod(form.historiaReprodutiva || "")].filter(Boolean).join("; ")}.`
      : "",
    joinWithOutro(form.informante, form.informanteOutro) || joinWithOutro(form.escolaridadeContexto, form.escolaridadeContextoOutro) || form.desenvolvimento
      ? `Contexto de crianca/adolescente: quem relata ${joinWithOutro(form.informante, form.informanteOutro) || "nao informado"}; escola ${joinWithOutro(form.escolaridadeContexto, form.escolaridadeContextoOutro) || "nao informado"}; desenvolvimento ${stripFinalPeriod(form.desenvolvimento || "") || "nao informado"}.`
      : "",
    `Antecedentes psiquiatricos: ${joinWithOutro(form.psiPrevios, form.psiPreviosOutro) || "nao informado"}.`,
    `Tratamentos previos: ${joinWithOutro(form.tratamentos, form.tratamentosOutro) || "nao informado"}.`,
    `Antecedentes medicos: ${joinWithOutro(form.medicos, form.medicosOutro) || "nao informado"}.`,
    `Antecedentes familiares: ${joinWithOutro(form.familiares, form.familiaresOutro) || "nao informado"}.`,
    `Substancias/habitos: ${joinWithOutro(form.substancias, form.substanciasOutro) || joinWithOutro(form.usoSubstanciasComportamentos, form.usoSubstanciasComportamentosOutro) || "nao informado"}.`,
    `Exame psiquico: ${mentalStateFindings(form).length ? formatClinicalList(mentalStateFindings(form)) : "nao informado"}.`,
    // O exame fisico nunca chegou aqui. No caso de teste, as cicatrizes de
    // autolesao em antebraco estavam registradas e o diagnostico nao as via.
    `Exame fisico: ${stripFinalPeriod(form.fisico || "") || "nao informado"}.`,
    // Escalas padronizadas, com os alertas por item. Um item de suicidio
    // positivo tem de chegar ao diagnostico e a conduta mesmo que a anamnese
    // diga "nega ideacao" -- e justamente a divergencia que importa.
    scalesNarrativeText(form, previous),
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

function pregnancyPromptLine(form = {}) {
  const resposta = arrayValue(form.gravidez)[0] || "";
  if (!resposta) return "";
  if (resposta === "Sim, com certeza") {
    const ig = gestationalAgeText(form.gravidezDum);
    return `Gestacao: CONFIRMADA${ig ? `, idade gestacional de ${ig}` : ", idade gestacional nao calculada"}. A escolha do farmaco tem de ser compativel com a gestacao e com o trimestre, e a justificativa deve dizer por que.`;
  }
  if (resposta === "Não sabe") {
    return "Gestacao: NAO SABE. Trate como possivel gestacao ate o beta-hCG: nao proponha teratogeno conhecido sem antes pedir o exame, e diga isso na conduta.";
  }
  return "Gestacao: descartada pela paciente.";
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
      "Dominio: achado (fato do relato que o sustenta, e nao o termo do exame psiquico que ja o nomeia).",
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
      "NIVEL DE CUIDADO:",
      "Modalidade exatamente como na lista | Justificativa em uma frase, ancorada no registro",
      "",
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
  if (kind === "return_plan") {
    return [
      "MEDICACAO:",
      "Farmaco | Acao | O que muda na receita | Por que, em uma frase",
      "(uma linha por farmaco em uso, sem excecao; Acao e uma de: Manter dose, Aumentar dose, Diminuir dose, Trocar medicamento, Retirar, Acrescentar medicamento)",
      "",
      "AJUSTES DE CONDUTA:",
      "Uma decisao por linha, sem justificativa dentro da linha",
      "(ate 6; lista vazia quando nao houver o que propor)"
    ].join("\n");
  }
  if (kind === "medication_tips") {
    return "Objeto com a chave tips: lista de paragrafos da secao BIPP TIPS, um por item, sem texto adicional. Lista vazia quando o farmaco nao tiver a secao.";
  }
  if (kind === "medication") {
    return [
      "MEDICAMENTO: (repita exatamente o nome informado em 'Medicamento pesquisado')",
      "CLASSE E MECANISMO: (fragmento, sem verbo)",
      "DOSE INICIAL: (numero, via e fracao)",
      "TITULACAO: (quanto se aumenta, de quanto em quanto tempo)",
      "DOSE ALVO: (faixa)",
      "LIMITE: (dose maxima)",
      "EVITAR COM: (o que nao combinar, e por que)",
      "EFEITOS COLATERAIS: (ate cinco, separados por virgula)",
      "MONITORIZACAO: (exame e periodicidade)"
    ].join("\n");
  }
  return [
    "Texto corrido, narrativo-descritivo e cronologico, em paragrafos clinicos.",
    "Nao use titulos, listas, nomes de campos, Markdown ou asteriscos.",
    "Registre de forma impessoal os achados presentes, as negacoes expressas e os dados ausentes, sem inferir normalidade."
  ].join("\n");
}
