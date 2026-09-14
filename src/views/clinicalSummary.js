import { anamnesisText } from "../clinical/narrative.js";
import { scaleSummaryRows } from "../clinical/scoring.js";
import { arrayValue, calculateAge, joinValues, mentalExamKeys, normalizeText } from "../clinical/textFormat.js";
import { orderedAnamnesisSections } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js";
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
    summaryTextRow("Contato", "Fone/WhatsApp", patient.telefone),
    summaryTextRow("Contato", "E-mail", patient.email),
    summaryTextRow("Contato", "Nome e contato de emergência", patient.emergencia),
    summaryTextRow("Endereço", "CEP", patient.cep),
    summaryTextRow("Endereço", "Endereço", address)
  ];
  const narrativeRows = [
    summaryTextRow("Anamnese", "Queixa principal e HDA", conciseQphdaSummary(anamnesisText(form))),
    summaryTextRow("Anamnese", "Antecedentes médicos", joinValues(form.medicos))
  ];
  // Secao de pergunta unica nao repete o proprio nome na coluna do campo, e
  // sem rotulo a coluna fica vazia: o titulo da secao ja identifica a linha.
  // Nunca cair no item.key — nome interno de campo nao vai para prontuario.
  const rotulo = (item, sectionTitle) => {
    const nome = item.label || item.question || "";
    return nome === sectionTitle ? "" : nome;
  };
  const anamnesisRows = orderedAnamnesisSections().flatMap(([sectionTitle, items]) =>
    items.map(item => item.response === "multiple"
      ? summaryGroupedOptionRow(sectionTitle, rotulo(item, sectionTitle), item.key, item.options || [], form, item.otherKey)
      : summaryTextRow(sectionTitle, rotulo(item, sectionTitle), form[item.key])
    )
  );
  const complementaryRows = [
    summaryGroupedOptionRow("Antecedentes", "Psiquiátricos prévios", "psiPrevios", optionGroups.psiPrevios || [], form, "psiPreviosOutro"),
    summaryGroupedOptionRow("Antecedentes", "Tratamentos prévios", "tratamentos", optionGroups.tratamentos || [], form, "tratamentosOutro"),
    summaryGroupedOptionRow("Antecedentes familiares", "História familiar", "familiares", optionGroups.familiares || [], form, "familiaresOutro"),
    summaryGroupedOptionRow("Fatores de piora", "Fatores identificados", "fatores", optionGroups.fatores || [], form, "fatoresOutro"),
    summaryGroupedOptionRow("Fatores de melhora", "Fatores identificados", "fatoresMelhora", optionGroups.fatoresMelhora || [], form, "fatoresMelhoraOutro"),
    summaryGroupedOptionRow("Impacto funcional", "Áreas afetadas", "impacto", optionGroups.impacto || [], form, "impactoOutro")
  ];
  const mentalLabels = {
    aparencia: "Aparência, atitude e contato", consciencia: "Consciência/Orientação", atencao: "Atenção",
    memoria: "Memória", sensopercepcao: "Sensopercepção",
    pensamentoCursoForma: "Pensamento - curso e forma", pensamentoConteudo: "Pensamento - conteúdo",
    linguagem: "Linguagem", humor: "Humor", afeto: "Afeto",
    psicomotricidade: "Psicomotricidade", vontade: "Vontade", juizoCritico: "Juízo crítico"
  };
  // Dominio nao marcado consta como NAO REGISTRADO, desde 11/09/2026. Ate ali
  // constava como normal, e o PDF afirmava "Eutimia (normal)" sobre um humor
  // que ninguem examinou. Normal agora e achado marcado -- um a um, ou pelo
  // botao "sem alteracao" do Exame psiquico. A linha continua na tabela: um
  // dominio em branco tambem e informacao.
  const mentalRows = mentalExamKeys().map(key => {
    const row = summaryGroupedOptionRow("Exame psíquico", mentalLabels[key] || key, key, optionGroups[key] || [], form, `${key}Outro`);
    return row.value ? row : { ...row, value: "Não registrado" };
  });
  // Sem achado registrado, a secao sumia inteira do resumo: um prontuario sem
  // exame fisico e um com exame fisico normal ficavam identicos. Por decisao do
  // Dr. Regis, ausencia de registro aqui significa exame sem alteracao — e o
  // prontuario passa a dizer isso, em vez de nao dizer nada.
  const physicalRows = [
    summaryTextRow("Exame físico", "Achados relevantes",
      String(form.fisico || "").trim() || "Exame físico sem alterações significativas")
  ];
  // Ate 31/08/2026 esta linha era montada CONTRA o catalogo dos trinta sintomas:
  // percorria a lista fixa e mostrava os que estivessem marcados. Com a busca por
  // sintoma no apendice, o que o medico escreve nao esta em catalogo nenhum, e
  // pelo caminho antigo simplesmente nao apareceria no Resumo — o registro
  // perderia em silencio o sintoma que ele digitou. Agora mostra o que esta
  // gravado, seja termo do catalogo antigo ou frase dele. Prontuario ja salvo
  // continua igual: o que la esta gravado sao os proprios rotulos.
  const residualValues = [
    ...arrayValue(form.sintomasResiduais).filter(item => normalizeText(item) !== "outro"),
    String(form.sintomasResiduaisOutro || "").trim()
  ].filter(Boolean);
  const residualRows = [
    { section: "Sintoma-Alvo", item: "Assinalados", value: residualValues.join("; ") }
  ].filter(row => row.value);
  const refinementRows = refinementSummaryRows(form);
  return [
    { title: "Identificação do paciente", rows: identityRows, layout: "item-record" },
    { title: "Dados narrativos", rows: narrativeRows, layout: "item-record" },
    // Tres colunas aqui de proposito. Com "area-record" a coluna do nome da
    // pergunta sumia, e as tres perguntas de risco de suicidio saiam como tres
    // linhas identicas, todas rotuladas "Risco de suicidio e desesperanca",
    // sem dizer qual respondia o que.
    { title: "Anamnese estruturada", rows: [...anamnesisRows, ...complementaryRows], layout: "full" },
    { title: "Exame psíquico", rows: mentalRows.map(row => ({ ...row, section: row.item })), layout: "area-record" },
    { title: "Exame físico", rows: physicalRows },
    // Escala marcada e sem resposta nao aparece: foi aberta, nao aplicada.
    { title: "Escalas aplicadas", rows: scaleSummaryRows(form), layout: "item-record" },
    { title: "Sintomas marginais e residuais", rows: residualRows },
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
