import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCALE_DOMAINS, scaleById, scales } from "../../src/data/scales.js";
import { scaleFieldName, scaleResult, scaleSummaryRows } from "../../src/clinical/scoring.js";
import { suggestedScales } from "../../src/clinical/scaleSuggestions.js";

// Segunda leva do catalogo psiescalas (10/09/2026): DASS-21, ASRS-18, SNAP-IV
// e SBQ-R, cada uma com a regra do instrumento, e nao com tercos genericos.

function formWith(id, valores, extra = {}) {
  const scale = scaleById(id);
  const form = { escalasAplicadas: [id], ...extra };
  valores.forEach((valor, index) => {
    if (valor !== undefined) form[scaleFieldName(scale, index)] = String(valor);
  });
  return form;
}

describe("o catalogo inteiro", () => {
  it("nenhuma opcao e resto do formulario da pagina de origem", () => {
    for (const scale of scales) {
      for (const item of scale.itens) {
        for (const opcao of item.opcoes || scale.opcoes) {
          assert.doesNotMatch(opcao.rotulo, /selecionar|autorizo|e-mail/i, `${scale.sigla}: ${opcao.rotulo}`);
        }
      }
    }
  });

  it("toda escala esta num dominio que aparece na tela", () => {
    for (const scale of scales) assert.ok(SCALE_DOMAINS.includes(scale.dominio), scale.sigla);
  });
});

describe("DASS-21", () => {
  const dass = scaleById("dass21");
  const comValor = (indices, valor) => Array.from({ length: 21 }, (_, i) => (indices.includes(i) ? valor : 0));

  it("cada subescala soma sete itens e multiplica por 2", () => {
    const depressao = [2, 4, 9, 12, 15, 16, 20];
    const result = scaleResult(dass, formWith("dass21", comValor(depressao, 1)));
    const sub = Object.fromEntries(result.subescalas.map(item => [item.nome, item]));
    assert.equal(sub["Depressão"].total, 14);
    assert.equal(sub["Depressão"].faixa.rotulo, "Moderada");
    assert.equal(sub["Ansiedade"].total, 0);
    assert.equal(result.faixa.rotulo, "Depressão: moderada · Ansiedade: normal · Estresse: normal");
  });

  it("os limites diferem por subescala: 10 e ansiedade moderada, mas estresse normal", () => {
    const ansiedade = [1, 3, 6, 8, 14, 18, 19];
    const estresse = [0, 5, 7, 10, 11, 13, 17];
    const valores = comValor([...ansiedade.slice(0, 5), ...estresse.slice(0, 5)], 1);
    const sub = Object.fromEntries(scaleResult(dass, formWith("dass21", valores)).subescalas.map(item => [item.nome, item]));
    assert.equal(sub["Ansiedade"].faixa.rotulo, "Moderada");
    assert.equal(sub["Estresse"].faixa.rotulo, "Normal");
  });

  it("o resumo leva a faixa de cada subescala", () => {
    const linha = scaleSummaryRows(formWith("dass21", comValor([2, 4, 9, 12, 15, 16, 20], 3)))[0].value;
    assert.match(linha, /Depressão: 42 \(extremamente grave\)/);
  });
});

describe("ASRS-18", () => {
  const asrs = scaleById("asrs18");
  const parteA = { 3: 2, 4: 2, 8: 2, 5: 3, 9: 3, 13: 3 };
  const respostas = (sobre = {}) => Array.from({ length: 18 }, (_, i) => sobre[i] ?? 0);

  it("quatro ou mais da Parte A no limiar e triagem positiva", () => {
    const result = scaleResult(asrs, formWith("asrs18", respostas({ 3: 2, 4: 2, 8: 2, 5: 3 })));
    assert.equal(result.faixa.rotulo, "Triagem positiva na Parte A");
  });

  it("o limiar muda: 'As vezes' conta nas tres primeiras, nao nas outras tres", () => {
    const result = scaleResult(asrs, formWith("asrs18", respostas({ 3: 2, 4: 2, 5: 2, 9: 2, 13: 2 })));
    assert.equal(result.faixa.rotulo, "Triagem negativa na Parte A");
    assert.match(result.faixa.descricao, /Parte A: 2 de 6/);
  });

  it("as seis perguntas da Parte A estao marcadas na tela", () => {
    const marcadas = asrs.itens.flatMap((item, i) => (item.condicao ? [i] : []));
    assert.deepEqual(marcadas, Object.keys(parteA).map(Number).sort((a, b) => a - b));
  });
});

describe("SNAP-IV", () => {
  const snap = scaleById("snap4");
  it("conta 'bastante' e 'demais': seis de desatencao bastam", () => {
    const valores = Array.from({ length: 18 }, (_, i) => (i < 6 ? 2 : i < 9 ? 1 : 0));
    const result = scaleResult(snap, formWith("snap4", valores));
    assert.equal(result.faixa.rotulo, "Desatenção acima do esperado");
  });

  it("'so um pouco' em tudo nao e TDAH, por maior que seja a soma", () => {
    const result = scaleResult(snap, formWith("snap4", Array(18).fill(1)));
    assert.equal(result.faixa.rotulo, "Abaixo do esperado para TDAH");
  });
});

describe("SBQ-R", () => {
  const sbq = scaleById("sbqr");
  it("vai de 3 a 18, e 7 e o ponto de corte", () => {
    assert.equal(scaleResult(sbq, formWith("sbqr", [1, 1, 1, 0])).total, 3);
    assert.equal(scaleResult(sbq, formWith("sbqr", [4, 5, 3, 6])).max, 18);
    assert.equal(scaleResult(sbq, formWith("sbqr", [2, 2, 1, 2])).faixa.rotulo, "Acima do ponto de corte");
  });

  it("plano ou tentativa, e chance provavel, alertam", () => {
    const result = scaleResult(sbq, formWith("sbqr", [3, 1, 1, 4]));
    assert.equal(result.alertas.length, 2);
    assert.ok(result.alertas.every(alerta => alerta.tipo === "suicidio"));
  });
});

describe("sugestao das escalas de TDAH", () => {
  it("TDAH previo: ASRS no adulto, SNAP-IV no menor de 18", () => {
    assert.ok(suggestedScales({ psiPrevios: ["TDAH"] }, { nascimento: "1990-01-01" }).some(item => item.id === "asrs18"));
    assert.ok(suggestedScales({ psiPrevios: ["TDAH"] }, { nascimento: "2016-01-01" }).some(item => item.id === "snap4"));
  });

  it("queixa escolar na crianca sugere SNAP-IV", () => {
    assert.ok(suggestedScales({ escolaridadeContexto: ["Queda de rendimento"] }, { nascimento: "2016-01-01" }).some(item => item.id === "snap4"));
  });
});
