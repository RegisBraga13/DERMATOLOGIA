// O item do protocolo de entrevista pelo id, agora por indice. O indice e
// montado para cada protocolo carregado: antes de carregar ha so os blocos da
// faixa etaria, depois ha tambem os 31 blocos dos livros.
//
// Rodar a partir da raiz do projeto:
//     node --test 'testes/js/*.test.js'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { loadProtocol, protocolItemById } from "../../src/clinical/protocol.js";

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

describe("item do protocolo pelo id", () => {
  it("antes de carregar, acha as perguntas da faixa etaria e so elas", () => {
    assert.equal(protocolItemById("p:idoso#0")?.campo, "idoso");
    assert.equal(protocolItemById("p:afetividade#0"), null);
  });

  it("depois de carregar, o indice e refeito e acha as duas origens", async () => {
    globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(RAIZ, url), "utf8")) });
    await loadProtocol();
    assert.equal(protocolItemById("p:afetividade#0")?.pergunta, "O que está acontecendo com o senhor?");
    assert.equal(protocolItemById("s:afetividade#0")?.sinal, "Desesperança");
    assert.equal(protocolItemById("p:idoso#0")?.campo, "idoso");
  });

  it("id inventado ou vazio devolve null", () => {
    assert.equal(protocolItemById("p:inventado#9"), null);
    assert.equal(protocolItemById(""), null);
  });
});
