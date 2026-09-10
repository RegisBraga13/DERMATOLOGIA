// `rodape`: o texto fixo do rodape. O padrao ("Revisao medica obrigatoria")
// serve ao resumo e a evolucao, que sao material de trabalho; num atestado ou
// num encaminhamento, que o paciente leva para fora, ele nao cabe -- ali o
// rodape e so a pagina.
export function exportTextAsPdf(title, text, filename = "", { rodape } = {}) {
  const safeTitle = String(title || "Documento clínico").trim();
  const pdfBytes = buildPdf(safeTitle, String(text || ""), rodape);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(filename || safeTitle)}.pdf`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function buildPdf(title, text, rodape) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 50;
  const bodyFontSize = 10.5;
  const lineHeight = 14;
  const linesPerPage = 45;
  const bodyLines = wrapClinicalText(text, 92);
  const pages = [];

  for (let index = 0; index < Math.max(bodyLines.length, 1); index += linesPerPage) {
    pages.push(bodyLines.slice(index, index + linesPerPage));
  }

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageReferences = pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Kids [${pageReferences}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  pages.forEach((pageLines, index) => {
    const pageObject = 4 + index * 2;
    const contentObject = pageObject + 1;
    const commands = [
      "BT",
      "/F1 16 Tf",
      `${margin} ${pageHeight - 58} Td`,
      `(${escapePdfString(title)}) Tj`,
      "ET",
      "BT",
      `/F1 ${bodyFontSize} Tf`,
      `${margin} ${pageHeight - 92} Td`
    ];

    pageLines.forEach((line, lineIndex) => {
      if (lineIndex) commands.push(`0 -${lineHeight} Td`);
      commands.push(`(${escapePdfString(line || " ")}) Tj`);
    });

    commands.push(
      "ET",
      "BT",
      "/F1 8 Tf",
      `${margin} 34 Td`,
      rodape === undefined
        ? `(Documento gerado pelo Regis Braga Psiquiatria. Revisao medica obrigatoria. Pagina ${index + 1} de ${pages.length}.) Tj`
        : `(${escapePdfString(`${rodape ? `${rodape} ` : ""}Página ${index + 1} de ${pages.length}`)}) Tj`,
      "ET"
    );

    const stream = commands.join("\n");
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${asciiLength(stream)} >>\nstream\n${stream}\nendstream`;
  });

  return assemblePdf(objects);
}

function wrapClinicalText(text, maxCharacters) {
  const paragraphs = String(text || "").replace(/\r/g, "").split("\n");
  const lines = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    words.forEach(word => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= maxCharacters) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    });
    if (line) lines.push(line);
    if (!words.length || paragraphIndex < paragraphs.length - 1) lines.push("");
  });

  return lines;
}

function assemblePdf(objects) {
  let pdf = "%PDF-1.4\n%âãÏÓ\n";
  const offsets = [0];

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = asciiLength(pdf);
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = asciiLength(pdf);
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function escapePdfString(value) {
  const windows1252 = {
    0x2013: 0x96,
    0x2014: 0x97,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2026: 0x85
  };

  return [...String(value || "")].map(character => {
    const codePoint = character.codePointAt(0);
    const byte = codePoint <= 0xff ? codePoint : windows1252[codePoint];
    if (byte === undefined) return "?";
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) return `\\${String.fromCharCode(byte)}`;
    if (byte < 0x20 || byte > 0x7e) return `\\${byte.toString(8).padStart(3, "0")}`;
    return String.fromCharCode(byte);
  }).join("");
}

function sanitizeFilename(value) {
  return String(value || "documento-clinico")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "documento-clinico";
}

function asciiLength(value) {
  return new TextEncoder().encode(value).length;
}
