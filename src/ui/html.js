const HTML_ESCAPE_ENTITIES = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
});

export function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => HTML_ESCAPE_ENTITIES[char]);
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
