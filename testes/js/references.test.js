// A tela cita a fonte que sustentou a resposta. O vector store devolve nome de
// arquivo -- "2_Clínica_Psiquiátrica_FMUSP_Euripedes_Constantino_Miguel_et_al.pdf"
// --, e isso nao e referencia: nao diz autor, nao diz volume, e o medico nao
// consegue julgar a fonte. Este teste fixa que os livros da biblioteca chegam
// a tela como referencia, e nao como nome de arquivo.
//
// Os nomes abaixo estao escritos a mao de proposito: rag_sources.local.json
// fica fora do Git, e um teste que dependesse dele nao rodaria em outra maquina.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { referenceFor } from "../../src/data/references.js";

// Os 16 arquivos indexados, com o GENERO de cada um. A etiqueta diz o que o
// livro e; quem le cada genero fica em RAG_SCOPE_BY_KIND, no server.py.
const BIBLIOTECA = [
  ["Psicopatologia - Dalgalarrondo.pdf", "psicopatologia"],
  ["Manual_de_Psicopatologia_6ª_Edição_Elie_Cheniaux_2021.pdf", "psicopatologia"],
  ["1_Clínica_Psiquiátrica_FMUSP_Euripedes_Constantino_Miguel_et_al.pdf", "psicopatologia"],
  ["Psicopatologia clínica: entrevista psiquiátrica.pdf", "entrevista"],
  ["A entrevista psiquiátrica na prática clínica .pdf", "entrevista"],
  ["2_Clínica_Psiquiátrica_FMUSP_Euripedes_Constantino_Miguel_et_al.pdf", "sindromes"],
  ["DSM 5 TR - português.pdf", "criterios"],
  ["CID-11 (1).pdf", "criterios"],
  ["3_Clínica_Psiquiátrica_FMUSP_Euripedes_Constantino_Miguel_et_al.pdf", "terapeutica"],
  ["Clínica_Psiquiátrica_USP_Volume_4_Guia_Prático（1）.pdf", "terapeutica"],
  ["Clínica psiquiátrica de bolso 3ed 2023 IPq HCFMUSP.pdf", "terapeutica"],
  ["Condutas_em_Psiquiatria_Leonardo_Baldaçara_Teng_Chei_Tung_Manole.pdf", "terapeutica"],
  ["Tratado psiquiatria  ABP.pdf", "tratado"],
  ["2017 Compendio de Psiquiatria (Kaplan).pdf", "tratado"],
  ["Stahl - Guia de Prescrição .pdf", "prescricao"],
  ["Psicofarmacologia_Da_Teoria_à_Clínica_1ª_edição,_2025.pdf", "psicofarmacologia"],
  ["Psiquiatria_da_Infância_e_Adolescência_HCFMUSP_2ª_edição,_2026.pdf", "infantojuvenil"]
];

describe("toda fonte indexada chega a tela como referencia", () => {
  for (const [filename, escopo] of BIBLIOTECA) {
    it(`${escopo}: ${filename.slice(0, 42)}`, () => {
      const ref = referenceFor(filename);
      assert.ok(ref.conhecida, `sem referencia; a tela mostraria "${filename}"`);
      assert.ok(!ref.curto.endsWith(".pdf"), "o nome curto ainda e o arquivo");
    });
  }
});

describe("os dois volumes da FMUSP sao livros diferentes", () => {
  // Os nomes de arquivo so diferem no numero da frente. Chave sem o numero
  // faria o primeiro do catalogo responder pelos dois, e a tela citaria o
  // volume errado -- o de sindromes no lugar do de terapeutica.
  const vol2 = referenceFor("2_Clínica_Psiquiátrica_FMUSP_Euripedes_Constantino_Miguel_et_al.pdf");
  const vol3 = referenceFor("3_Clínica_Psiquiátrica_FMUSP_Euripedes_Constantino_Miguel_et_al.pdf");

  it("o volume 2 responde no Diagnostico, o 3 no Tratamento", () => {
    assert.match(vol2.completo, /vol\. 2/);
    assert.match(vol3.completo, /vol\. 3/);
    assert.notEqual(vol2.curto, vol3.curto);
  });
});

describe("referencia incompleta e melhor do que atribuida a quem nao escreveu", () => {
  it("o livro sem autor conhecido sai com titulo e edicao, e sem autor inventado", () => {
    const ref = referenceFor("Psicofarmacologia_Da_Teoria_à_Clínica_1ª_edição,_2025.pdf");
    assert.match(ref.completo, /Psicofarmacologia: da teoria à clínica/);
    assert.match(ref.completo, /1ª ed\., 2025/);
    assert.doesNotMatch(ref.completo, /Stahl|Cordioli|Miguel/);
  });

  it("fonte fora do catalogo aparece com o proprio nome, sem autor chutado", () => {
    const ref = referenceFor("livro-que-ninguem-catalogou.pdf");
    assert.equal(ref.conhecida, false);
    assert.equal(ref.curto, "livro-que-ninguem-catalogou.pdf");
  });
});

describe("titulo contido em outro titulo cita a obra certa", () => {
  // "A entrevista psiquiatrica na pratica clinica" CONTEM "entrevista
  // psiquiatrica", que e a chave do outro livro. find() para no primeiro que
  // casa, entao a chave especifica precisa vir antes -- senao os dois livros
  // sao citados como o mesmo, e o medico julga a fonte errada.
  it("os dois livros de entrevista nao se confundem", () => {
    const pratica = referenceFor("A entrevista psiquiátrica na prática clínica .pdf");
    const usp = referenceFor("Psicopatologia clínica: entrevista psiquiátrica.pdf");
    assert.match(pratica.completo, /na prática clínica/);
    assert.match(usp.completo, /Psicopatologia clínica/);
    assert.notEqual(pratica.curto, usp.curto);
  });

  it("os quatro volumes da FMUSP sao quatro livros", () => {
    const volumes = ["1", "2", "3"].map(n =>
      referenceFor(`${n}_Clínica_Psiquiátrica_FMUSP_Euripedes_Constantino_Miguel_et_al.pdf`).curto);
    const guia = referenceFor("Clínica_Psiquiátrica_USP_Volume_4_Guia_Prático（1）.pdf").curto;
    const bolso = referenceFor("Clínica psiquiátrica de bolso 3ed 2023 IPq HCFMUSP.pdf").curto;
    assert.equal(new Set([...volumes, guia, bolso]).size, 5, "volumes da FMUSP se confundindo");
  });
});

describe("nao confundir livros de nome parecido", () => {
  it("Psicofarmacologia (2025) nao vira Psicofarmacos (Cordioli) nem Stahl", () => {
    assert.equal(referenceFor("Psicofarmacologia_Da_Teoria_à_Clínica_1ª_edição,_2025.pdf").curto, "Psicofarmacologia 2025");
    assert.equal(referenceFor("1 Psicofármacos - consulta rápida - 6 ed-1.pdf").curto, "Psicofármacos");
    assert.equal(referenceFor("STHAL_Psicofarmacologia_Clínica_Bases_Neurocientíficase_Aplicações.pdf").curto, "Stahl — Psicofarmacologia");
  });
});
