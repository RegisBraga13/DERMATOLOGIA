import { diagnosticCodes, diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSyndromicOptionLines, selectedDiagnosisText, selectedDiagnosisValues, treatmentOptionLines } from "../clinical/diagnosis.js";
import { buildEvolutionNarrative, normalizeEvolutionNarrative, outdatedEvolutionText, requestedExamsText, returnEvolutionContainsIdentity, shouldRefreshEvolutionNarrative } from "../clinical/narrative.js";
import { arrayValue, normalizeText } from "../clinical/textFormat.js";
import { doctorDiagnosisOptions } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js?v=tratamento-1";
import { chips, textarea } from "../ui/controls.js";
import { escapeAttr, escapeHtml } from "../ui/html.js";

export function diagnosisModule(form) {
  const syndromicOptions = diagnosticSyndromicOptionLines(form);
  const nosologicalOptions = diagnosticNosologicalOptionLines(form);
  const etiologicalOptions = diagnosticEtiologicalOptionLines(form);
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
      ${ragSourcesView(form.ragSources)}
    </div>
    <textarea hidden name="diagnosticoManual">${escapeHtml(selectedText)}</textarea>
    <textarea hidden name="diagnosticoAiSindromico">${escapeHtml(syndromicOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiNosologico">${escapeHtml(nosologicalOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiEtiologico">${escapeHtml(etiologicalOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAncoras">${escapeHtml(form.diagnosticoAncoras || "")}</textarea>
    <textarea hidden name="diagnosticoCodigos">${escapeHtml(form.diagnosticoCodigos || "")}</textarea>
    ${diagnosisCategory("Sindrômico", syndromicOptions, selectedValues)}
    ${diagnosisCategory("Nosológico", nosologicalOptions, selectedValues)}
    ${diagnosisCategory("Etiológico", etiologicalOptions, selectedValues)}
    <div class="diagnosis-group diagnosis-doctor-group">
      <h4>Hipóteses do médico</h4>
      <div class="diagnosis-options">${diagnosisOptionCheckboxes(doctorDiagnosisOptions, selectedValues)}</div>
    </div>
    ${diagnosisCodingPanel(form, selectedValues)}
  `;
}

// Codificacao e passo separado, sob pedido, depois da decisao. A hipotese na
// tela nao carrega codigo: o codigo pertence ao diagnostico que o medico
// aprovou, e so entao gravidade e recorrencia estao decididas.
function diagnosisCodingPanel(form, selectedValues) {
  const codes = diagnosticCodes(form);
  return `<div class="diagnosis-group diagnosis-coding">
    <h4>Codificação</h4>
    ${selectedValues.length
      ? `<div class="actions">
           <button class="primary" type="button" data-action="code-diagnosis">Fornecer CID-11 e DSM-5-TR</button>
         </div>`
      : `<p class="diagnosis-empty">Assinale um diagnóstico para poder codificá-lo.</p>`}
    ${form.codingStatus ? `<p class="online-status">${escapeHtml(form.codingStatus)}</p>` : ""}
    ${codes.itens.length ? `<ul class="diagnosis-codes">${codes.itens.map(codeRow).join("")}</ul>` : ""}
  </div>`;
}

function codeRow(item = {}) {
  const nome = escapeHtml(item.name || "");
  if (!item.cid11) {
    const sugestoes = Array.isArray(item.sugestoes) ? item.sugestoes : [];
    return `<li class="diagnosis-code diagnosis-code-open">
      <strong>${nome}</strong>
      ${sugestoes.length
        ? `<p>Sem correspondência direta. Escolha a entidade da CID-11:</p>
           <div class="diagnosis-options">${sugestoes.map(s => `
             <label class="diagnosis-option"><input type="radio" name="codigoEscolha__${escapeAttr(item.name || "")}" value="${escapeAttr(s.cid11)}" data-action="pick-diagnosis-code" data-alvo="${escapeAttr(item.name || "")}" /><span>${escapeHtml(s.cid11)} — ${escapeHtml(s.title)}</span></label>`).join("")}</div>`
        : `<p>Sem correspondência na CID-11 capítulo 6. Síndrome descritiva não tem código próprio.</p>`}
    </li>`;
  }
  const candidatos = Array.isArray(item.candidatos) ? item.candidatos : [];
  return `<li class="diagnosis-code">
    <strong>${nome}</strong>
    <span class="diagnosis-code-value">CID-11 ${escapeHtml(item.cid11)}${item.cid11Title ? ` — ${escapeHtml(item.cid11Title)}` : ""}</span>
    <span class="diagnosis-code-value">DSM-5-TR ${escapeHtml(item.dsm5tr || "sem correspondência no mapa oficial")}${item.dsm5trTitle ? ` — ${escapeHtml(item.dsm5trTitle)}` : ""}</span>
    ${candidatos.length ? `
      <p>Código de categoria: especifique a gravidade para completá-lo.</p>
      <div class="diagnosis-options">${candidatos.map(c => `
        <label class="diagnosis-option"><input type="radio" name="codigoDsm__${escapeAttr(item.name || "")}" value="${escapeAttr(c.code)}" ${item.dsm5trEscolhido === c.code ? "checked" : ""} data-action="pick-dsm-code" data-alvo="${escapeAttr(item.name || "")}" /><span>${escapeHtml(c.code)} — ${escapeHtml(c.name)}</span></label>`).join("")}</div>` : ""}
  </li>`;
}

// O titulo conta o que esta na tela, nao o teto do grupo. Antes dizia sempre
// "3 hipoteses", inclusive logo acima de "Nenhuma hipotese gerada".
function diagnosisCategory(label, options, selectedValues) {
  const total = options.length
    ? `${options.length} ${options.length === 1 ? "hipótese" : "hipóteses"}`
    : "sem hipóteses";
  return `<div class="diagnosis-group"><h4>${label} — ${total}</h4>
      <div class="diagnosis-options">
        ${options.length ? diagnosisOptionCheckboxes(options, selectedValues) : `<p class="diagnosis-empty">O registro atual não sustenta hipótese nesta categoria.</p>`}
      </div>
    </div>`;
}

function diagnosisOptionCheckboxes(options, selectedValues) {
  return options.map(option => `
    <label class="diagnosis-option">
      <input type="checkbox" name="diagnosticoSelecionado" value="${escapeAttr(option)}" ${selectedValues.includes(option) ? "checked" : ""} />
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

export function ragSourcesView(sources = []) {
  if (!Array.isArray(sources) || !sources.length) return "";
  return `<details class="rag-sources"><summary>${sources.length} fonte(s) recuperada(s)</summary><ol>${sources.map(source => `
    <li><strong>${escapeHtml(source.filename || "Fonte")}</strong><span>Relevancia: ${Math.round(Number(source.score || 0) * 100)}%</span></li>`).join("")}</ol></details>`;
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
      ${ragSourcesView(form.ragSources)}
    </div>
    <div class="treatment-card-grid">
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
