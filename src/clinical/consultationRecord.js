import { documentDraftFields, withoutDocumentDraftFields } from "./documents.js";
import { withoutUnappliedScaleAnswers } from "./scoring.js";
import { arrayValue } from "./textFormat.js";

// Movido de App.js em 23/09/2026: transformacao pura de dado, sem DOM, que
// vivia misturada com codigo de tela e por isso nunca tinha teste proprio.

// O capitulo do livro e tela, e nao registro: 13 a 30 mil caracteres de obra
// licenciada por farmaco. Ate 10/09/2026 ele ia junto com a consulta para o
// localStorage e para o Supabase -- o rascunho carregava o capitulo, e salvar
// gravava o rascunho inteiro. Agora sai do registro ao salvar e ao carregar; o
// segundo limpa o que ja tinha sido gravado antes. Na tela ele continua.
export function screenOnlyFields(entry = {}) {
  const campos = {};
  ["medicationChapter", "medicationChapterStatus"].forEach(campo => {
    if (entry && Object.hasOwn(entry, campo)) campos[campo] = entry[campo];
  });
  // Os campos de tela dos Documentos (documento_*, medico_*) seguem a mesma
  // regra desde 10/09/2026: continuam na tela depois de salvar, e nao vao para
  // o registro. Do documento, o prontuario guarda so documentosEmitidos.
  return { ...campos, ...documentDraftFields(entry) };
}

export function withoutScreenOnlyFields(entry = {}) {
  const clean = { ...entry };
  delete clean.medicationChapter;
  delete clean.medicationChapterStatus;
  return withoutDocumentDraftFields(clean);
}

export function withoutBookChapters(current = {}) {
  return {
    ...current,
    consultations: (current.consultations || []).map(withoutScreenOnlyFields),
    returns: (current.returns || []).map(withoutScreenOnlyFields)
  };
}

export function sanitizeConsultationRecord(data = {}) {
  const clean = withoutUnappliedScaleAnswers(withoutScreenOnlyFields(data));
  clean.diagnosticoManual = arrayValue(clean.diagnosticoSelecionado).join("\n");
  clean.tratamentoMedicamentoso = arrayValue(clean.tratamentoMedicamentosSelecionados).join("\n");
  clean.abordagensTerapeuticas = arrayValue(clean.abordagensSelecionadas).join("\n");
  return clean;
}
