import { authHeaders } from "./supabaseService.js";

const LABELS = [
  ["localizacao", "Localização visível"],
  ["numero_distribuicao", "Número e distribuição"],
  ["morfologia", "Morfologia aparente"],
  ["forma_limites", "Forma e limites"],
  ["cor", "Cor"],
  ["superficie", "Superfície"],
  ["dimensoes", "Dimensões"],
  ["outros_achados", "Outros achados visíveis"],
  ["limitacoes", "Limitações da fotografia"]
];

export function formatDermatologyImageDescription(description = {}) {
  return LABELS.filter(([key]) => typeof description[key] === "string" && description[key].trim())
    .map(([key, label]) => `${label}: ${description[key].trim()}`).join("\n");
}

export async function prepareDermatologyImage(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error("Selecione uma foto JPEG, PNG ou WebP de até 10 MB.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Não foi possível abrir a foto."));
      image.src = objectUrl;
    });
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto neste navegador.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    if (dataUrl.length > 11 * 1024 * 1024) throw new Error("A foto preparada excedeu o limite de envio.");
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function requestDermatologyImageDescription(dataUrl) {
  const response = await fetch("/api/dermatology-image", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ image: dataUrl })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Falha ao analisar a fotografia.");
  const text = formatDermatologyImageDescription(result.description);
  if (!text) throw new Error("A análise não trouxe achados visíveis suficientes.");
  return text;
}

export async function prepareDermatologyDocument(file) {
  if (!file) throw new Error("Selecione um exame ou laudo.");
  if (file.type !== "application/pdf") return prepareDermatologyImage(file);
  if (file.size > 8 * 1024 * 1024) throw new Error("O PDF deve ter até 8 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível ler o PDF."));
    reader.readAsDataURL(file);
  });
}

export async function requestDermatologyDocument(dataUrl) {
  const response = await fetch("/api/dermatology-document", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ file: dataUrl })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Falha ao analisar o exame.");
  const document = result.document || {};
  const dateText = String(document.data_no_documento || "").trim();
  return {
    type: String(document.tipo || "").trim(),
    date: normalizeDocumentDate(dateText),
    dateText,
    description: [
    ...(dateText && !normalizeDocumentDate(dateText) ? [["Data transcrita do documento (confira)", dateText]] : []),
    ["Achados extraídos", document.achados],
    ["Incertezas e trechos ilegíveis", document.incertezas]
    ].filter(([, value]) => typeof value === "string" && value.trim())
      .map(([label, value]) => `${label}: ${value.trim()}`).join("\n")
  };
}

function normalizeDocumentDate(value) {
  const candidate = String(value || "").trim();
  let year, month, day;
  let match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) [, year, month, day] = match;
  else {
    match = candidate.match(/^(\d{2})[/.\-](\d{2})[/.\-](\d{4})$/);
    if (match) [, day, month, year] = match;
  }
  if (!year) return "";
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === iso ? iso : "";
}
