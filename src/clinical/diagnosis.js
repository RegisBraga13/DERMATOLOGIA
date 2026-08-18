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

export function formatDiagnosticOption(item) {
  return `${item.name} - CID-11: ${item.cid11} - DSM-5-TR: ${item.dsm5tr}`;
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
  const matches = diagnosticRules()
    .map(rule => ({ ...rule, score: rule.terms.reduce((sum, term) => sum + (text.includes(term) ? 1 : 0), 0) }))
    .filter(rule => rule.score > 0)
    .sort((a, b) => b.score - a.score);
  const ranked = matches.length ? matches : diagnosticRules();
  const options = [
    ...ranked,
    ...diagnosticRules().filter(rule => !ranked.some(item => item.name === rule.name))
  ].slice(0, 8);
  const selectedDoctorOptions = selectedDiagnosisValues(form).filter(option => doctorDiagnosisOptions.includes(option));
  return {
    diagnosticoAiSindromico: options.slice(0, 3).map(formatDiagnosticOption).join("\n"),
    diagnosticoAiNosologico: options.slice(3, 6).map(formatDiagnosticOption).join("\n"),
    diagnosticoAiEtiologico: options.slice(6, 8).map(formatDiagnosticOption).join("\n"),
    diagnosticoAiOpcoes: options.slice(0, 3).map(formatDiagnosticOption).join("\n"),
    diagnosticoAiOutrasOpcoes: options.slice(3, 6).map(formatDiagnosticOption).join("\n"),
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

function diagnosticRules() {
  return [
    {
      name: "Depressao Maior",
      cid11: "6A70 - Episodio depressivo",
      dsm5tr: "Transtorno depressivo maior, episodio depressivo maior",
      terms: ["hipotimia", "anedonia", "deprim", "lentificacao", "hipobulia", "despertar precoce", "ideacao suicida"],
      differential: "luto, transtorno bipolar, uso de substancias, hipotireoidismo e transtorno de ajustamento."
    },
    {
      name: "Transtorno de Ansiedade Generalizada",
      cid11: "6B00 - Transtorno de ansiedade generalizada",
      dsm5tr: "Transtorno de ansiedade generalizada",
      terms: ["humor ansioso", "ansios", "preocupacoes excessivas", "inquietude", "tensao", "panico"],
      differential: "transtorno do panico, ansiedade social, TOC, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Depressao Bipolar",
      cid11: "6A60/6A61 - Transtorno bipolar tipo I/tipo II",
      dsm5tr: "Transtorno bipolar I ou II",
      terms: ["hipertimia", "euforia", "reducao da necessidade de sono", "fuga de ideias", "logorreia", "aceleracao", "hiperbulia"],
      differential: "TDAH, uso de substancias, transtorno de personalidade borderline e episodio depressivo unipolar."
    },
    {
      name: "Transtorno Obsessivo-Compulsivo",
      cid11: "6B20 - Transtorno obsessivo-compulsivo",
      dsm5tr: "Transtorno obsessivo-compulsivo",
      terms: ["obsessoes", "compulsividade", "toc", "rituais", "intrusivos"],
      differential: "ansiedade generalizada, transtornos relacionados a trauma, tiques e transtorno de personalidade obsessivo-compulsiva."
    },
    {
      name: "Transtorno Psicotico Primario ou Secundario",
      cid11: "6A20-6A2Z - Espectro da esquizofrenia e outros transtornos psicoticos primarios",
      dsm5tr: "Espectro da esquizofrenia e outros transtornos psicoticos",
      terms: ["alucinacao", "delirio", "juizo prejudicado", "critica prejudicada", "desconfianca", "afrouxamento", "descarrilamento"],
      differential: "transtorno bipolar com sintomas psicoticos, depressao psicotica, delirium, epilepsia e substancias."
    },
    {
      name: "Transtorno Relacionado a Trauma ou Estresse",
      cid11: "6B40/6B43 - TEPT ou transtorno de ajustamento",
      dsm5tr: "TEPT ou transtorno de ajustamento",
      terms: ["tept", "trauma", "luto", "separacao", "estresse", "conflito", "ajustamento"],
      differential: "depressao maior, ansiedade generalizada, luto prolongado e transtorno de personalidade."
    },
    {
      name: "Transtorno por Uso de Substancias",
      cid11: "6C40-6C4Z - Transtornos por uso de substancias",
      dsm5tr: "Transtornos relacionados a substancias e transtornos aditivos",
      terms: ["alcool", "cannabis", "cocaina", "crack", "opioides", "benzodiazepinicos", "substancias"],
      differential: "transtornos primarios do humor, ansiedade, psicose induzida por substancias e abstinencia/intoxicacao."
    },
    {
      name: "Transtorno do Panico",
      cid11: "6B01 - Transtorno do panico",
      dsm5tr: "Transtorno do panico",
      terms: ["panico", "palpitacoes", "falta de ar", "sudorese", "morte iminente", "crises"],
      differential: "ansiedade generalizada, ansiedade social, arritmias, hipertireoidismo e uso de estimulantes."
    },
    {
      name: "Transtorno de Deficit de Atencao e Hiperatividade",
      cid11: "6A05 - Transtorno de deficit de atencao e hiperatividade",
      dsm5tr: "Transtorno de deficit de atencao/hiperatividade",
      terms: ["desatencao", "dificuldade de concentracao", "impulsividade", "hiperatividade", "procrastinacao"],
      differential: "transtornos do humor, ansiedade, privacao de sono, uso de substancias e dificuldades de aprendizagem."
    },
    {
      name: "Transtorno Alimentar ou da Alimentacao",
      cid11: "6B80-6B8Z - Transtornos alimentares ou da alimentacao",
      dsm5tr: "Transtornos alimentares e da ingestao de alimentos",
      terms: ["compulsao alimentar", "restricao alimentar", "perda de peso", "ganho de peso", "imagem corporal"],
      differential: "depressao, ansiedade, condicoes endocrinas, efeitos medicamentosos e transtorno dismorfico corporal."
    }
  ];
}
