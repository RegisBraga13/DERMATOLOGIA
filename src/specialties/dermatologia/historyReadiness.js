// Checklist determinística de completude antes da história clínica.
// A IA nunca decide se a avaliação está completa: o médico confirma cobertura,
// registra complementos ou justifica os itens que não se aplicam.

export const DERMATOLOGY_HISTORY_DOMAINS = Object.freeze([
  { id: "complaint_location", question: "Queixa principal, localização inicial e distribuição das lesões foram abordadas?" },
  { id: "timeline_changes", question: "Início, duração, velocidade de evolução e mudanças de aparência foram esclarecidos?" },
  { id: "symptoms", question: "Prurido, dor, ardor, sensibilidade, sangramento e secreção foram investigados?" },
  { id: "exposures_treatment", question: "Exposições, medicamentos/produtos novos, tratamentos prévios e resposta foram verificados?" },
  { id: "relevant_history", question: "Alergias, medicamentos, dermatoses/neoplasias prévias e imunossupressão/comorbidades foram revisados?" },
  { id: "skin_exam", question: "O exame da pele descreve número, morfologia, cor, superfície, bordas, dimensões e distribuição, quando observáveis?" },
  { id: "other_sites_systems", question: "Unhas, cabelos, mucosas, linfonodos, estado geral e sistemas pertinentes foram avaliados?" },
  { id: "complementary_exams", question: "Exames e laudos disponíveis foram conferidos e colocados na cronologia? Se não há, isso foi confirmado?" },
]);

export const DERMATOLOGY_RED_FLAGS = Object.freeze([
  { id: "systemic_illness", question: "Febre, prostração ou comprometimento do estado geral?" },
  { id: "rapid_progression_pain", question: "Progressão rápida/extensa ou dor cutânea intensa/desproporcional?" },
  { id: "mucosal_eyes_genitals", question: "Acometimento ocular, oral ou genital, dor ocular ou dificuldade para engolir/urinar?" },
  { id: "blisters_detachment", question: "Bolhas, erosões extensas ou descolamento/descamação da pele?" },
  { id: "purpura_necrosis", question: "Púrpura, áreas enegrecidas ou necrose?" },
  { id: "airway_angioedema", question: "Edema de face/língua/garganta, falta de ar, sibilância, tontura ou síncope?" },
  { id: "other_case_specific", question: "Outros sinais de alarme pertinentes ao caso foram investigados?" },
]);

const DOMAIN_STATES = new Set(["covered", "supplemented", "not_applicable"]);
const RED_FLAG_STATES = new Set(["negative", "present", "not_applicable"]);

export function dermatologyHistoryReadiness(form = {}, priorEntries = []) {
  const missing = [];
  const documentedValues = Object.entries(form)
    .filter(([key]) => /^(dermVoiceTranscript|dermA_|dermH_|dermE_|dermS_|dermSystemsExam|dermExameComplementar|dermR_|dermRet_|dermSintomas|dermInicio|dermExposicoes|dermMorfologia|dermDistribuicao|dermArranjo|dermCor|dermSuperficie|dermPalpacao)/.test(key))
    .map(([, value]) => value);
  documentedValues.push(...(Array.isArray(form.dermLesions) ? form.dermLesions.flatMap(item => [item?.localizacao, item?.dimensoes, item?.evolucao]) : []));
  documentedValues.push(...(Array.isArray(form.dermImages) ? form.dermImages.map(item => item?.description) : []));
  documentedValues.push(...(Array.isArray(form.dermExams) ? form.dermExams.map(item => item?.description) : []));
  documentedValues.push(...priorEntries.filter(entry => entry.id !== form.id)
    .flatMap(entry => [
      ...(Array.isArray(entry.dermImages) ? entry.dermImages.map(item => item?.description) : entry.dermApprovedDescription ? [entry.dermApprovedDescription] : []),
      ...(Array.isArray(entry.dermExams) ? entry.dermExams.map(item => item?.description) : [])
    ]));
  if (!documentedValues.some(value => String(value || "").trim()))
    missing.push({ id: "clinical-evidence", label: "Anamnese, descrição cutânea ou exame complementar", reason: "registre ao menos uma fonte clínica antes da história" });
  for (const item of DERMATOLOGY_HISTORY_DOMAINS) {
    const state = form[`dermCompleteness__${item.id}`];
    const note = String(form[`dermCompletenessNote__${item.id}`] || "").trim();
    if (!DOMAIN_STATES.has(state)) missing.push({ id: item.id, label: item.question, reason: "pendente de revisão" });
    else if (["supplemented", "not_applicable"].includes(state) && !note)
      missing.push({ id: item.id, label: item.question, reason: state === "supplemented" ? "registre o complemento" : "justifique por que não se aplica" });
  }
  for (const item of DERMATOLOGY_RED_FLAGS) {
    const state = form[`dermRedFlag__${item.id}`];
    const note = String(form[`dermRedFlagNote__${item.id}`] || "").trim();
    if (!RED_FLAG_STATES.has(state)) missing.push({ id: item.id, label: item.question, reason: "sinal de alarme não investigado" });
    else if (["present", "not_applicable"].includes(state) && !note)
      missing.push({ id: item.id, label: item.question, reason: state === "present" ? "registre o achado e a avaliação/disposição médica" : "justifique por que não se aplica" });
  }
  return { complete: missing.length === 0, missing };
}

export function dermatologyHistoryReadinessText(form = {}) {
  const lines = [];
  for (const item of DERMATOLOGY_HISTORY_DOMAINS) {
    const state = form[`dermCompleteness__${item.id}`];
    const note = String(form[`dermCompletenessNote__${item.id}`] || "").trim();
    if (!state) continue;
    const status = state === "covered" ? "conferido no material clínico"
      : state === "supplemented" ? "complementado nesta revisão"
      : "não se aplica";
    const includeNote = ["supplemented", "not_applicable"].includes(state) && note;
    lines.push(`${item.question} ${status}${includeNote ? `: ${note}` : "."}`);
  }
  for (const item of DERMATOLOGY_RED_FLAGS) {
    const state = form[`dermRedFlag__${item.id}`];
    const note = String(form[`dermRedFlagNote__${item.id}`] || "").trim();
    if (!state) continue;
    const status = state === "negative" ? "investigado e negado"
      : state === "present" ? "presente"
      : "não se aplica";
    const includeNote = ["present", "not_applicable"].includes(state) && note;
    lines.push(`Sinal de alarme — ${item.question} ${status}${includeNote ? `: ${note}` : "."}`);
  }
  return lines.join("\n");
}
