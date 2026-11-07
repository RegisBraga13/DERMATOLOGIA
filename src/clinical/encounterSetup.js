// Configuração única de cada novo atendimento, antes da identificação.
export function encounterSetupValues(fields = {}) {
  const consultationMode = fields.consultationMode;
  if (!["IN_PERSON", "TELECONSULTATION"].includes(consultationMode)) {
    throw new Error("Selecione Presencial ou Online.");
  }
  const acceptsTranscription = fields.acceptsTranscription === "yes" || fields.acceptsTranscription === true;
  const online = consultationMode === "TELECONSULTATION";
  return {
    consultationMode,
    acceptsTranscription,
    anamnesisInputMode: acceptsTranscription ? "microphone" : "manual",
    teleconsultaConsentimento: online ? (Array.isArray(fields.teleconsultaConsentimento)
      ? fields.teleconsultaConsentimento : fields.teleconsultaConsentimento ? [fields.teleconsultaConsentimento] : []) : [],
    teleconsultaLocalPaciente: online ? String(fields.teleconsultaLocalPaciente || "").trim() : ""
  };
}

export function carryEncounterSetup(record = {}) {
  return {
    consultationMode: record.consultationMode,
    acceptsTranscription: record.acceptsTranscription,
    anamnesisInputMode: record.anamnesisInputMode,
    teleconsultaConsentimento: record.teleconsultaConsentimento,
    teleconsultaLocalPaciente: record.teleconsultaLocalPaciente
  };
}
