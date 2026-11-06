import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DERMATOLOGY_ALARM_OPTIONS,
  DERMATOLOGY_EXPOSURE_OPTIONS,
  DERMATOLOGY_ONSET_OPTIONS,
  DERMATOLOGY_SYMPTOM_OPTIONS,
  LESION_ARRANGEMENTS,
  LESION_COLORS,
  LESION_MORPHOLOGY,
  LESION_PALPATION,
  LESION_SURFACE
} from "../../src/specialties/dermatologia/index.js";

describe("vocabulário de semiologia dermatológica", () => {
  it("cobre morfologia primária e não usa categorias de exame psíquico", () => {
    assert.ok(LESION_MORPHOLOGY.includes("Mácula"));
    assert.ok(LESION_MORPHOLOGY.includes("Pústula"));
    assert.ok(LESION_MORPHOLOGY.includes("Ulceração"));
    assert.equal(LESION_MORPHOLOGY.includes("Humor"), false);
  });

  it("separa dimensões clínicas do exame", () => {
    for (const catalog of [LESION_ARRANGEMENTS, LESION_COLORS, LESION_SURFACE, LESION_PALPATION]) {
      assert.ok(catalog.length >= 5);
      assert.equal(new Set(catalog).size, catalog.length);
    }
  });

  it("oferece opções próprias para história e sinais de alarme", () => {
    assert.ok(DERMATOLOGY_SYMPTOM_OPTIONS.includes("Prurido"));
    assert.ok(DERMATOLOGY_ONSET_OPTIONS.includes("Progressivo"));
    assert.ok(DERMATOLOGY_EXPOSURE_OPTIONS.includes("Sol"));
    assert.ok(DERMATOLOGY_ALARM_OPTIONS.includes("Crescimento rápido"));
  });
});
