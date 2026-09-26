import { authHeaders } from "./supabaseService.js";

export function preferredRecordingMimeType() {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]
    .find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function recordingFilename(type = "") {
  if (type.includes("mp4")) return "consulta.mp4";
  if (type.includes("ogg")) return "consulta.ogg";
  if (type.includes("wav")) return "consulta.wav";
  return "consulta.webm";
}

export async function requestConsultationTranscription(audio) {
  const response = await fetch("/api/transcribe-consultation", {
    method: "POST",
    headers: {
      "Content-Type": audio.type || "audio/webm",
      "X-Audio-Filename": recordingFilename(audio.type),
      ...(await authHeaders())
    },
    body: audio
  });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.error || "Falha ao transcrever a gravação.");
  if (!Array.isArray(data.segments) || !data.segments.length) throw new Error("A transcrição não retornou falas reconhecíveis.");
  return data;
}

// Contagem determinística de vozes na diarização -- nunca um palpite de
// identidade, so a base de uma sugestão para o médico confirmar se havia
// acompanhante (ver companionCard, em views/companion.js).
export function countDistinctSpeakers(segments = []) {
  return new Set(segments.map(segment => String(segment.speaker || "").trim()).filter(Boolean)).size;
}

export function formatDiarizedTranscript(segments = []) {
  const lines = [];
  let previousSpeaker = "";
  segments.forEach(segment => {
    const speaker = String(segment.speaker || "?").trim();
    const text = String(segment.text || "").trim();
    if (!text) return;
    if (speaker === previousSpeaker && lines.length) lines[lines.length - 1] += ` ${text}`;
    else lines.push(`Falante ${speaker}: ${text}`);
    previousSpeaker = speaker;
  });
  return lines.join("\n");
}

export function showMicrophonePermissionHelp() {
  alert(
    "O acesso ao microfone está bloqueado para este site.\n\n" +
    "Chrome ou Edge: clique no ícone de cadeado/controles ao lado do endereço, escolha Microfone → Permitir e recarregue a página.\n\n" +
    "Safari: Safari → Ajustes para Este Site → Microfone → Permitir."
  );
}
