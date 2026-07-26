export function exportTextAsPdf(title, text) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    alert("Permita pop-ups para exportar/imprimir a evolucao.");
    return;
  }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    body{font-family:Arial,sans-serif;line-height:1.5;margin:38px;color:#111}
    h1{font-size:20px;margin:0 0 20px}
    pre{white-space:pre-wrap;font:inherit}
    .note{font-size:12px;color:#555;margin-top:28px;border-top:1px solid #ddd;padding-top:10px}
  </style></head><body><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(text)}</pre><div class="note">Documento gerado pelo Regis Braga Psiquiatria. Revisao medica obrigatoria.</div></body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}
