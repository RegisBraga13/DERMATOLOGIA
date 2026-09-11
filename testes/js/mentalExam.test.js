// Exame psiquico: dominio em branco e dominio nao examinado, desde 11/09/2026.
// Ate ali o Resumo e o PDF escreviam a normalidade no lugar do branco, e o
// prontuario afirmava "Eutimia (normal)" sobre um humor que ninguem examinou.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEvolutionNarrative } from "../../src/clinical/narrative.js";
import { MENTAL_EXAM_KEYS, MENTAL_EXAM_NORMAL_OPTIONS } from "../../src/clinical/vocabulary.js";
import { optionGroups } from "../../src/data/examOptions.js";
import { clinicalSummaryGroups } from "../../src/views/clinicalSummary.js";
import { mentalExamNormalFill } from "../../src/views/exams.js";

const MARIA = { nome: "Maria Silva", nascimento: "1984-03-10", sexo: "Feminino" };
const TUDO_NORMAL = Object.fromEntries(MENTAL_EXAM_KEYS.map(key => [key, [...MENTAL_EXAM_NORMAL_OPTIONS[key]]]));
// No Resumo o grupo se chama "Exame psiquico", e a coluna da linha e o dominio.
const linhasDoExame = form => clinicalSummaryGroups(form, {}).find(grupo => grupo.title === "Exame psíquico")?.rows || [];
const paragrafoDoExame = texto => texto.split("\n\n").find(parte => /exame psíquico|sem alterações em/i.test(parte)) || "";

describe("o botao 'sem alteracao'", () => {
  it("toda normalidade existe como chip na tela, com a mesma grafia", () => {
    MENTAL_EXAM_KEYS.forEach(key => MENTAL_EXAM_NORMAL_OPTIONS[key].forEach(opcao =>
      assert.ok((optionGroups[key] || []).includes(opcao), `${key}: "${opcao}" nao e opcao da tela`)));
  });

  it("preenche so os dominios em branco", () => {
    const preenchido = mentalExamNormalFill({ humor: ["Hipotimia"], afetoOutro: "embotado" });
    assert.equal(preenchido.humor, undefined);
    assert.equal(preenchido.afeto, undefined);
    assert.deepEqual(preenchido.consciencia, ["Consciente", "Orientado"]);
    assert.deepEqual(preenchido.sensopercepcao, ["Sem alteracao"]);
  });
});

describe("dominio em branco no Resumo", () => {
  it("consta como nao registrado, e nao como normal", () => {
    const linhas = linhasDoExame({});
    assert.equal(linhas.length, MENTAL_EXAM_KEYS.length);
    linhas.forEach(linha => assert.equal(linha.value, "Não registrado"));
  });

  it("o dominio marcado sai como foi marcado", () => {
    const humor = linhasDoExame({ humor: ["Eutimia (normal)"] }).find(linha => /Humor/.test(linha.section));
    assert.match(humor.value, /Eutimia/);
  });
});

describe("exame psiquico na historia clinica", () => {
  it("todo normal vira uma frase, e nao uma lista de adjetivos soltos", () => {
    assert.equal(paragrafoDoExame(buildEvolutionNarrative({ queixa: "Insonia", ...TUDO_NORMAL }, MARIA)),
      "Exame psíquico sem alterações em todos os domínios.");
  });

  it("achados e normalidades: cada dominio normal pelo nome", () => {
    const paragrafo = paragrafoDoExame(buildEvolutionNarrative({
      queixa: "Insonia", humor: ["Hipotimia"], aparencia: ["Adequada"], atencao: ["Vigil"]
    }, MARIA));
    assert.match(paragrafo, /^No exame psíquico, apresenta hipotimia\./i);
    assert.match(paragrafo, /Sem alterações em aparência e atenção\.$/);
  });

  it("dominio com achado junto da normalidade fica entre os achados", () => {
    const paragrafo = paragrafoDoExame(buildEvolutionNarrative({ queixa: "Insonia", consciencia: ["Consciente", "Desrealizacao"] }, MARIA));
    assert.doesNotMatch(paragrafo, /Sem alterações/);
    assert.match(paragrafo, /desrealiza/i);
  });

  it("exame em branco nao entra na historia", () => {
    assert.equal(paragrafoDoExame(buildEvolutionNarrative({ queixa: "Insonia" }, MARIA)), "");
  });
});
