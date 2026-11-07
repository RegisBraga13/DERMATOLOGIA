import assert from "node:assert/strict";
import { it } from "node:test";
import { formatDermatologyImageDescription } from "../../src/services/dermatologyImageService.js";

it("formata apenas achados visuais não vazios para revisão médica", () => {
  const text = formatDermatologyImageDescription({
    morfologia: "Placa aparente", dimensoes: "", limitacoes: "Sem escala visível"
  });
  assert.match(text, /Morfologia aparente: Placa aparente/);
  assert.match(text, /Limitações da fotografia: Sem escala visível/);
  assert.doesNotMatch(text, /Dimensões:/);
});
