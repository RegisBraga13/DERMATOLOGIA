import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { carryEncounterSetup, encounterSetupValues } from "../../src/clinical/encounterSetup.js";
import { transcriptionRoute } from "../../src/ui/voiceRecording.js";
import { dermatologyConsultationPage, dermatologyReportText, dermatologyReturnPage } from "../../src/views/dermatologyFlow.js";

describe("configuração inicial dermatológica", () => {
  it("exige escolha explícita entre presencial e online", () => {
    assert.throws(() => encounterSetupValues({}), /Presencial ou Online/);
    assert.throws(() => encounterSetupValues({ consultationMode: "HYBRID" }), /Presencial ou Online/);
  });

  it("inicia manual sem microfone quando a transcrição não foi aceita", () => {
    const setup = encounterSetupValues({ consultationMode: "IN_PERSON", acceptsTranscription: [] });
    assert.equal(setup.anamnesisInputMode, "manual");
    assert.equal(setup.acceptsTranscription, false);
    assert.doesNotMatch(dermatologyConsultationPage("anamnese", setup), /data-action="voice"/);
    assert.doesNotMatch(dermatologyReturnPage("evolucao-retorno", setup), /data-action="voice"/);
  });

  it("inicia transcrição e mantém escolha ao selecionar outro paciente", () => {
    const setup = encounterSetupValues({
      consultationMode: "TELECONSULTATION",
      acceptsTranscription: "yes",
      teleconsultaConsentimento: ["Consentimento registrado"],
      teleconsultaLocalPaciente: " Fortaleza/CE "
    });
    assert.equal(setup.anamnesisInputMode, "microphone");
    assert.equal(setup.teleconsultaLocalPaciente, "Fortaleza/CE");
    assert.match(dermatologyConsultationPage("anamnese", setup), /data-target="dermTranscricao"/);
    assert.match(dermatologyReturnPage("evolucao-retorno", setup), /data-target="dermRetTranscricao"/);
    assert.deepEqual(carryEncounterSetup({ ...setup, id: "anterior" }), setup);
  });

  it("encaminha a transcrição dermatológica sem extração psiquiátrica e a inclui no relatório", () => {
    assert.deepEqual(transcriptionRoute("dermTranscricao"), { isDermatology: true, isReturnField: false });
    assert.deepEqual(transcriptionRoute("dermRetTranscricao"), { isDermatology: true, isReturnField: true });
    assert.match(dermatologyReportText({ dermTranscricao: "Relato da consulta" }), /Relato da consulta/);
    assert.match(dermatologyReportText({ dermRetTranscricao: "Relato do retorno" }), /Relato do retorno/);
  });
});
