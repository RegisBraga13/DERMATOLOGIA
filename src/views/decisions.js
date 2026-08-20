import { diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSpecifierOptionLines, diagnosticSyndromicOptionLines, selectedDiagnosisText, selectedDiagnosisValues, selectedSpecifierValues, treatmentOptionLines } from "../clinical/diagnosis.js";
import { buildEvolutionNarrative, normalizeEvolutionNarrative, outdatedEvolutionText, requestedExamsText, returnEvolutionContainsIdentity, shouldRefreshEvolutionNarrative } from "../clinical/narrative.js";
import { arrayValue, normalizeText } from "../clinical/textFormat.js";
import { doctorDiagnosisOptions } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js?v=tratamento-5";
import { chips, textarea } from "../ui/controls.js";
import { referenceFor } from "../data/references.js";
import { escapeAttr, escapeHtml } from "../ui/html.js";

export function diagnosisModule(form) {
  const syndromicOptions = diagnosticSyndromicOptionLines(form);
  const nosologicalOptions = diagnosticNosologicalOptionLines(form);
  const etiologicalOptions = diagnosticEtiologicalOptionLines(form);
  const specifierOptions = diagnosticSpecifierOptionLines(form);
  const selectedSpecifiers = selectedSpecifierValues(form);
  const selectedValues = selectedDiagnosisValues(form);
  const selectedText = selectedDiagnosisText(form);
  const aiStatus = diagnosisAiStatusText(form.aiStatus);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.aiMode)}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-diagnosis">Gerar</button>
      </div>
      ${aiStatus ? `<p class="online-status">${escapeHtml(aiStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSourcesDiagnostico)}
    </div>
    <textarea hidden name="diagnosticoManual">${escapeHtml(selectedText)}</textarea>
    <textarea hidden name="diagnosticoAiSindromico">${escapeHtml(syndromicOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiNosologico">${escapeHtml(nosologicalOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiEtiologico">${escapeHtml(etiologicalOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiEspecificadores">${escapeHtml(specifierOptions.join("\n"))}</textarea>
    ${diagnosisCategory("Nosológico", nosologicalOptions, selectedValues, "Base do tratamento principal e do seguimento. Linguagem universal entre profissionais — CID-11 e DSM-5-TR —, sustenta atestados, laudos e direitos previdenciários, e é quem recebe os especificadores.")}
    ${diagnosisCategory("Sindrômico", syndromicOptions, selectedValues, "Sinais e sintomas inespecíficos, presentes em vários transtornos. Norteia a conduta imediata — alívio do sofrimento, controle de risco — mesmo antes de saber a causa ou o nome definitivo do quadro.")}
    ${specifierCategory(specifierOptions, selectedSpecifiers)}
    ${diagnosisCategory("Etiológico", etiologicalOptions, selectedValues, "A raiz do mal. Permite o tratamento causal e definitivo — tratar a tireoide em vez de medicar o sintoma —, evita erro grosseiro de manejo e previne recidiva. Pede acompanhamento multiprofissional e longitudinal.")}
    <div class="diagnosis-group diagnosis-doctor-group">
      <h4>Hipóteses do médico</h4>
      <div class="diagnosis-options">${diagnosisOptionCheckboxes(doctorDiagnosisOptions, selectedValues)}</div>
      ${textarea("diagnosticoMedicoOutro", "Ao marcar \"Outro\": escreva a hipótese e os códigos", form.diagnosticoMedicoOutro, "Ex.: Transtorno de ansiedade generalizada - CID-11: 6B00 - DSM-5-TR: F41.1", 2)}
    </div>
  `;
}

// O titulo conta o que esta na tela, nao o teto do grupo. Antes dizia sempre
// "3 hipoteses", inclusive logo acima de "Nenhuma hipotese gerada".
// A ordem das tres camadas na tela e clinica, nao alfabetica nem historica:
// nosologico primeiro porque e a base do tratamento e o que sustenta laudo e
// atestado; sindromico depois, porque orienta a conduta imediata mesmo sem o
// nome definitivo; etiologico por ultimo, a raiz, que pede acompanhamento
// longitudinal. E o core do programa — nao reordenar sem decisao medica.
function diagnosisCategory(label, options, selectedValues, papel = "") {
  const total = options.length
    ? `${options.length} ${options.length === 1 ? "hipótese" : "hipóteses"}`
    : "sem hipóteses";
  return `<div class="diagnosis-group"><h4>${label} — ${total}</h4>
      ${papel ? `<p class="diagnosis-role">${escapeHtml(papel)}</p>` : ""}
      <div class="diagnosis-options">
        ${options.length ? diagnosisOptionCheckboxes(options, selectedValues) : `<p class="diagnosis-empty">O registro atual não sustenta hipótese nesta categoria. Veja <strong>Hipóteses do médico</strong>.</p>`}
      </div>
    </div>`;
}

// Grupo proprio, e nao mais uma "categoria": especificador nao e hipotese, e
// atributo da hipotese — marcar um nao e escolher um diagnostico a mais. Por
// isso vai em caixa separada, com nome de campo proprio, e nao entra na conta
// de hipoteses assinaladas.
function specifierCategory(options, selectedSpecifiers) {
  const marcados = new Set(selectedSpecifiers.map(normalizeText));
  return `<div class="diagnosis-group">
    <h4>Especificadores — ${options.length ? `${options.length}` : "nenhum"}</h4>
    <div class="diagnosis-options">
      ${options.length ? options.map(option => `
        <label class="diagnosis-option">
          <input type="checkbox" name="especificadorSelecionado" value="${escapeAttr(option)}" ${marcados.has(normalizeText(option)) ? "checked" : ""} />
          <span>${escapeHtml(option)}</span>
        </label>
      `).join("") : `<p class="diagnosis-empty">Nenhum especificador proposto. O catálogo local não propõe especificador — gravidade, remissão e curso não se leem por correspondência de termo.</p>`}
    </div>
  </div>`;
}

function diagnosisOptionCheckboxes(options, selectedValues) {
  // Comparacao sem acento: os nomes do catalogo foram acentuados, e um
  // prontuario salvo antes disso guarda "Sindrome Ansiosa". Comparando literal,
  // a marcacao do medico sumia da tela sem sumir do registro.
  const marcados = new Set(selectedValues.map(normalizeText));
  return options.map(option => `
    <label class="diagnosis-option">
      <input type="checkbox" name="diagnosticoSelecionado" value="${escapeAttr(option)}" ${marcados.has(normalizeText(option)) ? "checked" : ""} />
      <span>${escapeHtml(option)}</span>
    </label>
  `).join("");
}

function diagnosisAiStatusText(message = "") {
  if (!message) return "";
  if (/OPENAI_API_KEY|IA indisponivel/i.test(message)) return "6 hipoteses locais aplicadas.";
  return message;
}

export function aiModeSelector(value = "current", name = "aiMode") {
  return `<fieldset class="ai-mode-selector">
    <legend>Fonte da resposta</legend>
    <label><input type="radio" name="${name}" value="current" ${value !== "rag" ? "checked" : ""} /><span>IA atual</span><small>Modelo e regras clinicas atuais</small></label>
    <label><input type="radio" name="${name}" value="rag" ${value === "rag" ? "checked" : ""} /><span>RAG com literatura</span><small>Restringe a resposta às fontes indexadas (psicopatologia e psicofarmacologia)</small></label>
  </fieldset>`;
}

// "Fontes consultadas nesta geracao", nunca "de onde veio a resposta". O RAG
// restringe a busca; nao garante que cada frase saiu dali — o modelo ainda
// generaliza. Prometer mais do que o mecanismo entrega e pior do que nao
// mostrar nada.
export function ragSourcesView(sources = []) {
  if (!Array.isArray(sources) || !sources.length) return "";
  const refs = sources.map(source => ({ ...source, ref: referenceFor(source.filename) }));
  const nomes = [...new Set(refs.map(item => item.ref.curto))];
  return `
    <p class="rag-consulted">Consultado: ${nomes.map(nome => `<strong>${escapeHtml(nome)}</strong>`).join(" · ")}</p>
    <details class="rag-sources"><summary>${sources.length} ${sources.length === 1 ? "trecho recuperado" : "trechos recuperados"}</summary><ol>${refs.map(item => `
      <li><strong>${escapeHtml(item.ref.completo)}</strong><span>Relevancia: ${Math.round(Number(item.score || 0) * 100)}%</span></li>`).join("")}</ol></details>`;
}

export function treatmentModule(form) {
  const examesText = requestedExamsText(form);
  const medicationOptions = treatmentOptionLines(form.tratamentoAiMedicamentos);
  const approachOptions = treatmentOptionLines(form.tratamentoAiAbordagens);
  const selectedApproaches = arrayValue(form.abordagensSelecionadas);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.pharmaAiMode || "rag", "pharmaAiMode")}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-treatment">Gerar</button>
      </div>
      ${form.treatmentStatus ? `<p class="online-status">${escapeHtml(form.treatmentStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSourcesTratamento)}
    </div>
    <div class="treatment-card-grid">
      <div class="treatment-card">
        <h4>Sintomas marginais e residuais</h4>
        <p class="field-hint">O que persiste depois de controlado o quadro agudo. Tratam-se por si, independentemente do transtorno de base.</p>
        ${chips("sintomasResiduais", "", optionGroups.sintomasResiduais, form.sintomasResiduais)}
        ${textarea("sintomasResiduaisOutro", "Ao marcar \"Outro\": descreva", form.sintomasResiduaisOutro, "", 2)}
      </div>
      <div class="treatment-card">
        <h4>Abordagem medicamentosa</h4>
        <textarea hidden name="tratamentoAiMedicamentos">${escapeHtml(medicationOptions.join("\n"))}</textarea>
        <textarea hidden name="tratamentoMedicamentoso">${escapeHtml(form.tratamentoMedicamentoso || "")}</textarea>
        <div class="diagnosis-options">
          ${medicationOptions.length ? medicationOptions.map((option, index) => `<article class="treatment-card"><h4>${index === 0 ? "1ª opção" : index === 1 ? "2ª opção" : "Off-label"}</h4><label class="diagnosis-option treatment-option"><input type="checkbox" name="tratamentoMedicamentosSelecionados" value="${escapeAttr(option)}" ${arrayValue(form.tratamentoMedicamentosSelecionados).includes(option) ? "checked" : ""} /><span>${escapeHtml(option)}</span></label></article>`).join("") : `<p class="diagnosis-empty">As opções aparecerão após a geração.</p>`}
        </div>
      </div>
      <div class="treatment-card">
        <h4>Outras abordagens</h4>
        <textarea hidden name="tratamentoAiAbordagens">${escapeHtml(approachOptions.join("\n"))}</textarea>
        <textarea hidden name="abordagensTerapeuticas">${escapeHtml(form.abordagensTerapeuticas || "")}</textarea>
        <div class="diagnosis-options">
          ${approachOptions.length ? treatmentOptionCheckboxes("abordagensSelecionadas", approachOptions, selectedApproaches) : `<p class="diagnosis-empty">As abordagens aparecerão após a geração.</p>`}
        </div>
      </div>
      <div class="treatment-card">
        <h4>Exames solicitados</h4>
        ${chips("examesSolicitados", "", optionGroups.examesPsiquiatria, form.examesSolicitados)}
        <textarea hidden name="examesLaboratoriais">${escapeHtml(examesText)}</textarea>
      </div>
      <div class="treatment-card physician-adjustments">
        <h4>Ajustes do medico</h4>
        ${textarea("condutaMedica", "", form.condutaMedica, "", 3)}
      </div>
    </div>
  `;
}

function treatmentOptionCheckboxes(name, options, selectedValues) {
  return options.map(option => `
    <label class="diagnosis-option treatment-option">
      <input type="checkbox" name="${name}" value="${escapeAttr(option)}" ${selectedValues.includes(option) ? "checked" : ""} />
      <span>${escapeHtml(option)}</span>
    </label>
  `).join("");
}

export function evolutionBody(form, patient, previous = null, isReturn = false) {
  const evolution = outdatedEvolutionText(form.evolution)
    || shouldRefreshEvolutionNarrative(form.evolution)
    || (isReturn && returnEvolutionContainsIdentity(form.evolution, patient))
    || (isReturn && form.evolutionAutoGenerated && !normalizeText(form.evolution).startsWith("paciente retornou"))
    ? ""
    : normalizeEvolutionNarrative(form.evolution);
  const generatedEvolution = buildEvolutionNarrative(form, patient, previous, isReturn);
  return `
    <div class="actions">
      <button class="primary" type="button" data-action="generate-evolution">${isReturn ? "Atualizar evolução" : "Atualizar história clínica"}</button>
    </div>
    ${form.aiStatus ? `<p class="online-status">${escapeHtml(form.aiStatus)}</p>` : ""}
    ${textarea("evolution", "", evolution || generatedEvolution)}
  `;
}
