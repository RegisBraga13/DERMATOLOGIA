import { anamnesisText } from "../clinical/narrative.js";
import { calculateAge, joinValues, mentalExamKeys, normalizeText } from "../clinical/textFormat.js";
import { anamnesisQuestionGroups } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js?v=tratamento-1";
import { formatSummaryDate, section, summaryGroupedOptionRow, summaryTable, summaryTextRow } from "../ui/controls.js";

export function clinicalSummaryPage(form = {}, patient = {}) {
  const groups = clinicalSummaryGroups(form, patient);
  return groups.map(group => summaryTable(group.title, group.rows, group.layout)).join("");
}

export function clinicalSummaryGroups(form = {}, patient = {}) {
  const age = calculateAge(patient.nascimento);
  const address = [patient.endereco, patient.numero, patient.complemento, patient.bairro, patient.cidade, patient.estado]
    .filter(Boolean).join(", ");
  const identityRows = [
    summaryTextRow("Identidade", "Nome", patient.nome),
    summaryTextRow("Identidade", "Data de nascimento", formatSummaryDate(patient.nascimento)),
    summaryTextRow("Identidade", "Idade", age ? `${age} anos` : ""),
    summaryTextRow("Identidade", "Sexo", patient.sexo),
    summaryTextRow("Identidade", "Estado civil", patient.estadoCivil),
    summaryTextRow("Identidade", "Ocupação", patient.ocupacao),
    summaryTextRow("Identidade", "Escolaridade", patient.escolaridade),
    summaryTextRow("Identidade", "Religião", patient.religiao),
    summaryTextRow("Contato", "Telefone", patient.telefone),
    summaryTextRow("Contato", "E-mail", patient.email),
    summaryTextRow("Contato", "Nome e contato de emergência", patient.emergencia),
    summaryTextRow("Endereço", "CEP", patient.cep),
    summaryTextRow("Endereço", "Endereço", address)
  ];
  const narrativeRows = [
    summaryTextRow("Anamnese", "Queixa principal e HDA", conciseQphdaSummary(anamnesisText(form))),
    summaryTextRow("Anamnese", "Antecedentes médicos", joinValues(form.medicos))
  ];
  const anamnesisRows = anamnesisQuestionGroups.flatMap(group => group.items.flatMap(([sectionTitle, items]) =>
    items.map(item => item.response === "multiple"
      ? summaryGroupedOptionRow(sectionTitle, item.label || item.question || sectionTitle, item.key, item.options || [], form, item.otherKey)
      : summaryTextRow(sectionTitle, item.label || item.question || item.key, form[item.key])
    )
  ));
  const complementaryRows = [
    summaryGroupedOptionRow("Antecedentes", "Psiquiátricos prévios", "psiPrevios", optionGroups.psiPrevios || [], form, "psiPreviosOutro"),
    summaryGroupedOptionRow("Antecedentes", "Tratamentos prévios", "tratamentos", optionGroups.tratamentos || [], form, "tratamentosOutro"),
    summaryGroupedOptionRow("Antecedentes familiares", "História familiar", "familiares", optionGroups.familiares || [], form, "familiaresOutro"),
    summaryGroupedOptionRow("Fatores de piora", "Fatores identificados", "fatores", optionGroups.fatores || [], form, "fatoresOutro"),
    summaryGroupedOptionRow("Fatores de melhora", "Fatores identificados", "fatoresMelhora", optionGroups.fatoresMelhora || [], form, "fatoresMelhoraOutro"),
    summaryGroupedOptionRow("Impacto funcional", "Áreas afetadas", "impacto", optionGroups.impacto || [], form, "impactoOutro")
  ];
  const mentalLabels = {
    aparencia: "Aparência, atitude e contato", consciencia: "Consciência", atencao: "Atenção",
    orientacao: "Orientação", memoria: "Memória", sensopercepcao: "Sensopercepção",
    pensamentoCursoForma: "Pensamento - curso e forma", pensamentoConteudo: "Pensamento - conteúdo",
    linguagem: "Linguagem", humor: "Humor", afeto: "Afeto",
    psicomotricidade: "Psicomotricidade", vontade: "Vontade", juizoCritico: "Juízo crítico"
  };
  const mentalRows = mentalExamKeys().map(key =>
    summaryGroupedOptionRow("Exame psíquico", mentalLabels[key] || key, key, optionGroups[key] || [], form, `${key}Outro`)
  );
  const physicalRows = [
    summaryTextRow("Exame físico", "Achados relevantes", form.fisico)
  ].filter(row => row.value);
  const refinementRows = refinementSummaryRows(form);
  return [
    { title: "Identificação do paciente", rows: identityRows, layout: "item-record" },
    { title: "Dados narrativos", rows: narrativeRows, layout: "item-record" },
    { title: "Anamnese estruturada", rows: [...anamnesisRows, ...complementaryRows], layout: "area-record" },
    { title: "Exame psíquico", rows: mentalRows.map(row => ({ ...row, section: row.item })), layout: "area-record" },
    { title: "Exame físico", rows: physicalRows },
    { title: "Refinamento clínico", rows: refinementRows, layout: "area-record" }
    // Exame fisico e Refinamento so tem linhas depois de preenchidos; sem o
    // filtro, o resumo mostraria a tabela vazia (so o cabecalho).
  ].filter(group => group.rows.length);
}

function refinementSummaryRows(form = {}) {
  const plan = form.refinementPlan || {};
  const rows = [];
  (plan.questions || []).forEach((item, index) => rows.push(summaryTextRow(item.topic || "Pergunta", item.prompt, joinValues(form[`refinementQuestion_${index}`]))));
  [["Red flags", "red_flags", "refinementRedFlag"], ["Observacoes", "observations", "refinementObservation"], ["Pontos importantes", "important_points", "refinementImportant"]].forEach(([sectionTitle, key, prefix]) => {
    (plan[key] || []).forEach((item, index) => rows.push(summaryTextRow(item.topic || sectionTitle, item.reason, form[`${prefix}_${index}`])));
  });
  if (form.refinementDoctorNotes) rows.push(summaryTextRow("Medico", "Observacoes", form.refinementDoctorNotes));
  return rows.filter(row => row.value);
}

function conciseQphdaSummary(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map(sentence => sentence.trim()).filter(Boolean) || [text];
  const selected = [sentences[0]];
  const addMatch = pattern => {
    const match = sentences.find(sentence => !selected.includes(sentence) && pattern.test(normalizeText(sentence)));
    if (match) selected.push(match);
  };
  addMatch(/(ha |desde|mes|ano|evolu|inicio|duracao)/);
  addMatch(/(prejuizo|afastamento|trabalho|risco|suicid|funcional|tratamento)/);
  for (const sentence of sentences) {
    if (selected.length >= 3) break;
    if (!selected.includes(sentence)) selected.push(sentence);
  }
  const summary = selected.slice(0, 3).sort((a, b) => sentences.indexOf(a) - sentences.indexOf(b)).join(" ");
  if (summary.length <= 210) return summary;
  return `${summary.slice(0, 207).replace(/\s+\S*$/, "").replace(/[,:;.-]+$/, "")}...`;
}
