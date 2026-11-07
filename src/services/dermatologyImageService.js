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
