import { arrayValue, normalizedSingleChoiceValue, normalizeText, optionDisplayLabel } from "../clinical/textFormat.js";
import { escapeAttr, escapeHtml } from "./html.js";
import { microphoneIcon } from "./icons.js";

export function formatSummaryDate(value = "") {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || "");
}

export function summaryTextRow(section, item, value) {
  const text = String(value || "").trim();
  return { section, item, value: text };
}

export function summaryGroupedOptionRow(section, item, key, options, form, otherKey = "") {
  const selected = arrayValue(form[key]);
  const normalizedSelected = new Set(selected.map(normalizeText));
  const values = options.flatMap(option => {
    const isOther = normalizeText(option) === "outro";
    const otherValue = isOther && otherKey ? String(form[otherKey] || "").trim() : "";
    const marked = normalizedSelected.has(normalizeText(option)) || Boolean(otherValue);
    return marked ? [otherValue || optionDisplayLabel(option)] : [];
  });
  if (otherKey && String(form[otherKey] || "").trim() && !options.some(option => normalizeText(option) === "outro")) {
    values.push(String(form[otherKey]).trim());
  }
  return { section, item, value: values.join("; ") };
}

/* Layouts de resumo:
   "full"        -> Área | Campo | Registro
   "area-record" -> Área | Registro  (o campo repetiria a area)
   "item-record" -> Campo | Registro (a area repetiria o titulo do bloco)   */

export function summaryColumns(layout = "full") {
  return { area: layout !== "item-record", item: layout !== "area-record" };
}

export function summaryTable(title, rows = [], layout = "full") {
  const columns = summaryColumns(layout);
  const cells = (section, item, value, tag) => [
    columns.area ? `<${tag}>${escapeHtml(section)}</${tag}>` : "",
    columns.item ? `<${tag}>${escapeHtml(item)}</${tag}>` : "",
    `<${tag}>${escapeHtml(value)}</${tag}>`
  ].join("");
  return `<section class="summary-section"><h4>${escapeHtml(title)}</h4><div class="summary-table-wrap"><table class="summary-table">
    <thead><tr>${cells("Área", "Campo", "Registro", "th")}</tr></thead>
    <tbody>${rows.map(row => `<tr>${cells(row.section, row.item, row.value, "td")}</tr>`).join("")}</tbody>
  </table></div></section>`;
}

export function section(title, body, open = false) {
  return `<details class="section" ${open ? "open" : ""}><summary><strong>${title}</strong></summary><div class="section-body">${body}</div></details>`;
}

export function field(name, labelText, value = "", type = "text") {
  return `<label>${labelText}<input name="${name}" type="${type}" value="${escapeAttr(value || "")}" /></label>`;
}

export function selectField(name, labelText, options, value = "") {
  return `<label>${labelText}<select name="${name}"><option value="">Selecionar</option>${options.map(option => `<option value="${escapeAttr(option)}" ${value === option ? "selected" : ""}>${escapeHtml(optionDisplayLabel(option))}</option>`).join("")}</select></label>`;
}

export function textarea(name, labelText, value = "", placeholder = "", rows = "") {
  const rowsAttr = rows ? ` rows="${rows}"` : "";
  const evolutionAttrs = name === "evolution" ? ` class="evolution-textarea" data-auto-expand="true" rows="12"`
    : name === "qphda" ? ` class="auto-expand" data-auto-expand="true" rows="5"`
      : ["queixa", "hdaManual"].includes(name) ? ` class="auto-expand" data-auto-expand="true" rows="1"`
        : name === "historia" ? ` class="auto-expand" data-auto-expand="true" rows="3"` : rowsAttr;
  return `<label>${labelText}<textarea name="${name}"${evolutionAttrs} placeholder="${escapeAttr(placeholder)}">${escapeHtml(value || "")}</textarea></label>`;
}

export function voiceTextarea(name, labelText, value = "", placeholder = "") {
  return `<div class="voice-field">${textarea(name, labelText, value, placeholder)}<div class="voice-controls">
    <button class="voice-button" type="button" data-action="voice" data-target="${name}" aria-label="Iniciar gravação da conversa" title="Iniciar gravação">
      ${microphoneIcon()}<span class="voice-pulse" aria-hidden="true"></span>
    </button>
    <span class="voice-status" aria-live="polite">Clique no microfone para iniciar a gravação integral</span>
  </div></div>`;
}

export function anamnesisStructuredFields(questions, form) {
  return `<div class="structured-fields">
    ${questions.map(item => {
      if (typeof item === "string") return `<ul><li>${escapeHtml(item)}</li></ul>`;
      if (item.response === "multiple") return multipleChoiceField(item, form);
      return suicideRiskFields([item], form);
    }).join("")}
  </div>`;
}

function multipleChoiceField(item, form) {
  const values = Array.isArray(form[item.key]) ? form[item.key] : form[item.key] ? [form[item.key]] : [];
  const set = new Set(values);
  const otherInput = "";
  return `<div class="risk-fields">
    ${item.question ? `<p class="structured-question">${escapeHtml(item.question)}</p>` : ""}
    <div class="multi-choice-options">
      ${item.options.map(option => `
        <label>
          <input type="checkbox" name="${item.key}" value="${escapeAttr(option)}" ${set.has(option) ? "checked" : ""} />
          ${escapeHtml(optionDisplayLabel(option))}
        </label>
      `).join("")}
    </div>
    ${otherInput}
  </div>`;
}

function suicideRiskFields(questions, form) {
  return `<div class="risk-fields">
    ${questions.map(item => item.response === "text" ? `
      <label class="risk-text">
        <b>${escapeHtml(item.label)}:</b> ${escapeHtml(item.question)}
        <textarea name="${item.key}" rows="2">${escapeHtml(form[item.key] || "")}</textarea>
      </label>
    ` : `
      <div class="risk-choice">
        <p><b>${escapeHtml(item.label)}:</b> ${escapeHtml(item.question)}</p>
        <div class="segmented-options">
          ${["SIM", "NAO"].map(option => `
            <label>
              <input type="radio" name="${item.key}" value="${option}" ${form[item.key] === option ? "checked" : ""} />
              ${option}
            </label>
          `).join("")}
        </div>
      </div>
    `).join("")}
  </div>`;
}

export function chips(name, labelText, options, values = []) {
  const normalizedValues = Array.isArray(values) ? values : values ? [values] : [];
  const set = new Set(normalizedValues);
  return `<div><label>${labelText}</label><div class="chips">${options.map(option => `<label class="chip"><input type="checkbox" name="${name}" value="${escapeAttr(option)}" ${set.has(option) ? "checked" : ""}>${escapeHtml(optionDisplayLabel(option))}</label>`).join("")}</div></div>`;
}

export function singleChoiceWithNotes(name, labelText, options, value = "") {
  const selectedValue = normalizedSingleChoiceValue(name, value);
  return `<div>
    <label>${labelText}</label>
    <div class="chips">
      ${options.map(option => `<label class="chip"><input type="radio" name="${name}" value="${escapeAttr(option)}" ${selectedValue === option ? "checked" : ""}>${escapeHtml(option)}</label>`).join("")}
    </div>
  </div>`;
}
