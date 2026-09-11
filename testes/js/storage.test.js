// Arquivar em vez de apagar, e a marca que viaja entre aparelhos (11/09/2026).
// Antes "Excluir paciente" apagava tudo sem volta, e a exclusao nao chegava ao
// outro aparelho: o registro voltava na proxima uniao.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  archivePatient, isActive, isArchived, mergeStates, purgePatient, restorePatient, stateSignature
} from "../../src/services/storageService.js";

const ANTES = "2026-09-10T10:00:00.000Z";
const AGORA = "2026-09-11T10:00:00.000Z";
const DEPOIS = "2026-09-12T10:00:00.000Z";

const estado = () => ({
  patients: [
    { id: "p1", nome: "Maria Silva", createdAt: ANTES },
    { id: "p2", nome: "Joao Souza", createdAt: ANTES }
  ],
  consultations: [
    { id: "c1", patientId: "p1", type: "consultation", qphda: "Tristeza", createdAt: ANTES },
    { id: "c2", patientId: "p2", type: "consultation", qphda: "Insonia", createdAt: ANTES }
  ],
  returns: [{ id: "r1", patientId: "p1", type: "return", previousEntryId: "c1", createdAt: ANTES }]
});

describe("arquivar e restaurar", () => {
  it("arquivado sai das listas e continua guardado, com os registros", () => {
    const arquivado = archivePatient(estado(), "p1", AGORA);
    const maria = arquivado.patients.find(item => item.id === "p1");
    assert.equal(isActive(maria), false);
    assert.equal(isArchived(maria), true);
    assert.equal(maria.nome, "Maria Silva");
    assert.equal(maria.updatedAt, AGORA);
    assert.equal(arquivado.consultations.find(item => item.id === "c1").qphda, "Tristeza");
    assert.equal(isActive(arquivado.patients.find(item => item.id === "p2")), true);
  });

  it("restaurar devolve o paciente inteiro", () => {
    const restaurado = restorePatient(archivePatient(estado(), "p1", AGORA), "p1", DEPOIS);
    const maria = restaurado.patients.find(item => item.id === "p1");
    assert.equal(isActive(maria), true);
    assert.equal("arquivadoEm" in maria, false);
    assert.equal(maria.updatedAt, DEPOIS);
  });
});

describe("exclusao definitiva", () => {
  it("tira o conteudo do paciente e dos registros dele, e deixa so a marca", () => {
    const excluido = purgePatient(estado(), "p1", AGORA);
    assert.deepEqual(excluido.patients.find(item => item.id === "p1"), { id: "p1", excluidoEm: AGORA, updatedAt: AGORA });
    assert.deepEqual(excluido.consultations.find(item => item.id === "c1"),
      { id: "c1", patientId: "p1", type: "consultation", excluidoEm: AGORA, updatedAt: AGORA });
    assert.equal(excluido.returns[0].previousEntryId, undefined);
  });

  it("nao toca no outro paciente", () => {
    const excluido = purgePatient(estado(), "p1", AGORA);
    assert.equal(excluido.patients.find(item => item.id === "p2").nome, "Joao Souza");
    assert.equal(excluido.consultations.find(item => item.id === "c2").qphda, "Insonia");
  });
});

describe("a marca viaja entre aparelhos", () => {
  it("arquivar num aparelho arquiva no outro", () => {
    const juntos = mergeStates(estado(), archivePatient(estado(), "p1", AGORA));
    assert.equal(isArchived(juntos.patients.find(item => item.id === "p1")), true);
  });

  it("restaurar depois tambem viaja", () => {
    const restaurado = restorePatient(archivePatient(estado(), "p1", AGORA), "p1", DEPOIS);
    const juntos = mergeStates(archivePatient(estado(), "p1", AGORA), restaurado);
    assert.equal(isActive(juntos.patients.find(item => item.id === "p1")), true);
  });

  it("exclusao definitiva nao volta, nem diante de edicao mais recente do outro aparelho", () => {
    const editadoDepois = estado();
    editadoDepois.consultations[0] = { ...editadoDepois.consultations[0], qphda: "Editado depois", updatedAt: DEPOIS };
    const juntos = mergeStates(editadoDepois, purgePatient(estado(), "p1", AGORA));
    const c1 = juntos.consultations.find(item => item.id === "c1");
    assert.equal(c1.excluidoEm, AGORA);
    assert.equal(c1.qphda, undefined);
  });
});

describe("assinatura do estado", () => {
  it("muda quando um registro muda, e so entao", () => {
    const antes = stateSignature(estado());
    assert.equal(stateSignature(estado()), antes);
    assert.notEqual(stateSignature(archivePatient(estado(), "p1", AGORA)), antes);
  });
});
