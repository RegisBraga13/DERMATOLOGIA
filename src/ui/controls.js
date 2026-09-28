import { formatPhone, whatsappLink } from "../clinical/phone.js";
import { arrayValue, normalizedSingleChoiceValue, normalizeText, optionDisplayLabel, optionScreenLabel } from "../clinical/textFormat.js";
import { statusToneClass, statusToneRole } from "../clinical/statusTone.js";
import { escapeAttr, escapeHtml } from "./html.js";
import { microphoneIcon, whatsappIcon } from "./icons.js";

// A caixa de status da IA, com a cor e o papel tirados do TOM da mensagem --
// ver clinical/statusTone.js. Ate 23/09/2026 cada uma das seis caixas escrevia
// o proprio <p class="online-status">, e falha, espera e sucesso saiam iguais.
export function statusLine(texto = "", classeBase = "online-status") {
  const conteudo = String(texto || "").trim();
  if (!conteudo) return "";
  const tom = statusToneClass(conteudo);
  return `<p class="${classeBase}${tom ? ` ${tom}` : ""}" role="${statusToneRole(conteudo)}">${escapeHtml(conteudo)}</p>`;
}

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

// `aiFilled` marca o campo preenchido pela extracao por IA a partir da
// transcricao (identificacao do paciente, hoje) -- mesma logica do `.chip-ai`
// da anamnese, adaptada a campo de texto/select em vez de caixa de marcar. A
// marca some no instante em que o medico edita o campo (ver
// `identificationOrigin.js`).
export function field(name, labelText, value = "", type = "text", aiFilled = false) {
  return `<label${aiFilled ? ` class="field-ai" title="Preenchido pela extração da IA a partir da transcrição. Confira: ao editar, passa a ser seu."` : ""}>${labelText}<input name="${name}" type="${type}" value="${escapeAttr(value || "")}" /></label>`;
}

// Fone e WhatsApp no mesmo campo: teclado numerico no celular, mascara ao
// digitar e, com o numero completo, o atalho que abre a conversa no WhatsApp.
export function phoneField(name, labelText, value = "") {
  const formatted = formatPhone(value);
  const link = whatsappLink(formatted);
  return `<label class="phone-field">${labelText}<span class="phone-input">
    <input name="${name}" type="tel" inputmode="tel" autocomplete="tel" placeholder="(31) 90000-0000" maxlength="20" value="${escapeAttr(formatted)}" />
    <a class="whatsapp-link" href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir conversa no WhatsApp" title="Abrir conversa no WhatsApp"${link ? "" : " hidden"}>${whatsappIcon()}</a>
  </span></label>`;
}

export function selectField(name, labelText, options, value = "", aiFilled = false) {
  return `<label${aiFilled ? ` class="field-ai" title="Preenchido pela extração da IA a partir da transcrição. Confira: ao editar, passa a ser seu."` : ""}>${labelText}<select name="${name}"><option value="">Selecionar</option>${options.map(option => `<option value="${escapeAttr(option)}" ${value === option ? "selected" : ""}>${escapeHtml(optionDisplayLabel(option))}</option>`).join("")}</select></label>`;
}

// Altura inicial de quem nao se contenta com as duas linhas padrao. E so o
// ponto de partida: daqui em diante TODA caixa cresce com o que se digita, e
// nao havia razao para "fatores impeditivos" ou "razoes para viver" rolarem
// dentro de duas linhas enquanto a QP crescia.
// TODA caixa comeca com uma linha, como a QP. Ate 28/09/2026 cada uma tinha a
// sua altura de partida -- 5 linhas na QP/HDA, 3 na historia, 12 na historia
// clinica -- e o resultado era meia tela de branco esperando texto que
// costumava caber em duas linhas. Agora a altura e sempre o que esta escrito:
// uma linha quando nao ha nada, e cresce a cada linha digitada
// (bindAutoExpandingTextareas, em App.js).
export function textarea(name, labelText, value = "", placeholder = "", rows = "") {
  // `evolution` guarda a classe propria (entrelinha e overflow sao dela), mas
  // leva `auto-expand` junto: sem essa classe ela ganhava piso de 300px, e a
  // Historia clinica era a unica caixa que nao acompanhava o texto de verdade.
  const atributos = name === "evolution"
    ? ` class="evolution-textarea auto-expand" data-auto-expand="true" rows="1"`
    : ` class="auto-expand" data-auto-expand="true" rows="1"`;
  return `<label>${labelText}<textarea name="${name}"${atributos} placeholder="${escapeAttr(placeholder)}">${escapeHtml(value || "")}</textarea></label>`;
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

// A caixa de marcar do programa inteiro. Chip, multipla escolha da anamnese e
// SIM/NAO do risco eram tres markups com tres CSS, e cada um derivou para um
// lado (em 14/09/2026 a multipla escolha empilhava a caixinha em cima do texto).
// Rotulo curto na tela, frase inteira no title quando as duas diferem.
function chipLabel(type, name, option, checked) {
  const shown = optionScreenLabel(option);
  const full = optionDisplayLabel(option);
  const title = shown !== full ? ` title="${escapeAttr(full)}"` : "";
  return `<label class="chip"${title}><input type="${type}" name="${name}" value="${escapeAttr(option)}" ${checked ? "checked" : ""}>${escapeHtml(shown)}</label>`;
}

function multipleChoiceField(item, form) {
  const values = Array.isArray(form[item.key]) ? form[item.key] : form[item.key] ? [form[item.key]] : [];
  const set = new Set(values);
  // Mesmo caso do chip: "Outro" aqui tambem nao tinha onde escrever. A variavel
  // otherInput existia e era string vazia.
  const otherKey = item.otherKey || `${item.key}Outro`;
  const otherValue = String(form[otherKey] || "");
  return `<div class="risk-fields">
    ${item.question ? `<p class="structured-question">${escapeHtml(item.question)}</p>` : ""}
    <div class="chips">
      ${item.options.map(option => isOtherOption(option) ? `
        <div class="chip-other">
          ${chipLabel("checkbox", item.key, option, set.has(option))}
          <input class="chip-note" type="text" name="${otherKey}" value="${escapeAttr(otherValue)}" placeholder="Descreva" aria-label="Descreva o outro" />
        </div>
      ` : chipLabel("checkbox", item.key, option, set.has(option))).join("")}
    </div>
  </div>`;
}

function suicideRiskFields(questions, form) {
  return `<div class="risk-fields">
    ${questions.map(item => item.response === "text" ? `
      <label class="risk-text">
        <b>${escapeHtml(item.label)}:</b> ${escapeHtml(item.question)}
        <textarea name="${item.key}" class="auto-expand" data-auto-expand="true" rows="1">${escapeHtml(form[item.key] || "")}</textarea>
      </label>
    ` : `
      <div class="risk-choice">
        <p><b>${escapeHtml(item.label)}:</b> ${escapeHtml(item.question)}</p>
        <div class="chips">
          ${["SIM", "NAO"].map(option => chipLabel("radio", item.key, option, form[item.key] === option)).join("")}
        </div>
      </div>
    `).join("")}
  </div>`;
}

// O chip "Outro" existia sem lugar para escrever o que era esse outro: o campo
// ja estava no modelo de dados, e o resumo ja o lia, mas nenhuma tela o
// oferecia. Agora ele abre uma anotacao ao lado, so quando marcado.
//
// A expansao e de CSS, nao de JavaScript: o campo esta sempre no DOM, entao o
// que o medico escreve e capturado pelo formulario do mesmo jeito que os
// demais, e marcar o chip nao precisa redesenhar a pagina — a marcacao se
// perderia no meio da digitacao. Onde :has() nao existir, o campo aparece
// sempre, que e o pior caso aceitavel.
function chipOther(name, option, value = "", checked = false, otherKey = `${name}Outro`) {
  return `<div class="chip-other">
    ${chipLabel("checkbox", name, option, checked)}
    <input class="chip-note" type="text" name="${otherKey}" value="${escapeAttr(value)}" placeholder="Descreva" aria-label="Descreva o outro" />
  </div>`;
}

function isOtherOption(option) {
  return normalizeText(option) === "outro";
}

export function chips(name, labelText, options, values = [], form = null, otherKey = `${name}Outro`) {
  const normalizedValues = Array.isArray(values) ? values : values ? [values] : [];
  const set = new Set(normalizedValues);
  const otherValue = form ? String(form[otherKey] || "") : "";
  return `<div><label>${labelText}</label><div class="chips">${options.map(option => isOtherOption(option)
    ? chipOther(name, option, otherValue, set.has(option), otherKey)
    : chipLabel("checkbox", name, option, set.has(option))).join("")}</div></div>`;
}

export function singleChoiceWithNotes(name, labelText, options, value = "", form = null) {
  const selectedValue = normalizedSingleChoiceValue(name, value);
  const nota = form ? String(form[`${name}Outro`] || "") : "";
  return `<div>
    <label>${labelText}</label>
    <div class="chips">
      ${options.map(option => {
        const marcado = selectedValue === option ? "checked" : "";
        const botao = chipLabel("radio", name, option, Boolean(marcado));
        // O "Outro" carrega o campo de texto que a narrativa ja lia
        // (`${name}Outro`) e que ate 02/09/2026 nao tinha onde ser escrito:
        // o nome da funcao prometia a nota, e a nota nao existia na tela.
        return option === "Outro" ? `<div class="chip-other">${botao}
          <input class="chip-note" type="text" name="${name}Outro" value="${escapeAttr(nota)}" placeholder="Descreva" aria-label="Descreva o outro" /></div>` : botao;
      }).join("")}
    </div>
  </div>`;
}
