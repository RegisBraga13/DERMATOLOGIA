import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCALE_DOMAINS, scaleById, scales } from "../../src/data/scales.js";
import { scaleFieldName, scaleResult, scaleSummaryRows } from "../../src/clinical/scoring.js";
import { ageInMonths, suggestedScales } from "../../src/clinical/scaleSuggestions.js";

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

// Autismo (11/09/2026): RAADS-R, M-CHAT-R/F e CARS.

describe("RAADS-R", () => {
  const raads = scaleById("raadsr");
  const todosNaOpcao = posicao => raads.itens.map(item => item.opcoes[posicao].valor);

  it("oitenta itens, e as quatro subescalas cobrem todos, sem repetir", () => {
    assert.equal(raads.itens.length, 80);
    const indices = Object.values(raads.subescalas).flat().sort((a, b) => a - b);
    assert.deepEqual(indices, Array.from({ length: 80 }, (_, i) => i));
    assert.deepEqual(Object.values(raads.subescalas).map(lista => lista.length), [39, 14, 7, 20]);
  });

  it("o sintoma presente pontua 3, e os 17 itens normativos pontuam ao contrario", () => {
    // Tudo "verdadeiro agora e quando jovem": 63 itens de sintoma valem 3, os
    // normativos, 0. Tudo "nunca": so os normativos pontuam.
    assert.equal(scaleResult(raads, formWith("raadsr", todosNaOpcao(0))).total, 63 * 3);
    assert.equal(scaleResult(raads, formWith("raadsr", todosNaOpcao(3))).total, 17 * 3);
    assert.equal(scaleResult(raads, formWith("raadsr", todosNaOpcao(3))).max, 240);
  });

  it("65 passa do corte original; 120, tambem do corte de saude mental", () => {
    const comTotal = alvo => {
      let resta = alvo;
      return raads.itens.map(item => {
        const valor = Math.min(3, resta);
        resta -= valor;
        return item.opcoes.find(opcao => opcao.valor === valor).valor;
      });
    };
    assert.equal(scaleResult(raads, formWith("raadsr", comTotal(64))).faixa.rotulo, "Abaixo do ponto de corte");
    assert.equal(scaleResult(raads, formWith("raadsr", comTotal(65))).faixa.rotulo, "Acima do ponto de corte original");
    assert.equal(scaleResult(raads, formWith("raadsr", comTotal(120))).faixa.rotulo, "Acima do ponto de corte para saúde mental");
  });

  it("o item 69 e o de ficar sozinho, como no original", () => {
    assert.match(raads.itens[68].texto, /ficar sozinho/);
  });
});

describe("M-CHAT-R/F", () => {
  const mchat = scaleById("mchat");
  // 0 = resposta tipica: "Sim" em quase tudo, "Nao" nas perguntas 2, 5 e 12.
  const tipica = () => mchat.itens.slice(0, 20).map(item => item.opcoes.find(opcao => opcao.valor === 0).valor);
  const comRisco = (quantos, seguimento) => {
    const valores = tipica().map((valor, indice) => (indice < quantos ? 1 : valor));
    return [...valores, seguimento];
  };

  it("pontua o 'Nao', menos nas perguntas 2, 5 e 12, em que pontua o 'Sim'", () => {
    const pontuaSim = mchat.itens.slice(0, 20).flatMap((item, i) => (item.opcoes.find(opcao => opcao.rotulo === "Sim").valor === 1 ? [i + 1] : []));
    assert.deepEqual(pontuaSim, [2, 5, 12]);
    assert.equal(scaleResult(mchat, formWith("mchat", tipica())).faixa.rotulo, "Baixo risco");
  });

  it("de 3 a 7 pede o seguimento, e o seguimento fecha a triagem", () => {
    assert.equal(scaleResult(mchat, formWith("mchat", comRisco(3))).faixa.rotulo, "Risco moderado");
    assert.equal(scaleResult(mchat, formWith("mchat", comRisco(5, 1))).faixa.rotulo, "Triagem positiva após o seguimento");
    assert.equal(scaleResult(mchat, formWith("mchat", comRisco(5, 0))).faixa.rotulo, "Triagem negativa após o seguimento");
  });

  it("8 ou mais encaminha direto, e o seguimento nao entra na soma", () => {
    const result = scaleResult(mchat, formWith("mchat", comRisco(8, 1)));
    assert.equal(result.faixa.rotulo, "Risco alto");
    assert.equal(result.total, 8);
    assert.equal(result.max, 20);
  });
});

describe("CARS", () => {
  const cars = scaleById("cars");
  it("15 dominios de 1 a 4, com meia nota: vai de 15 a 60", () => {
    assert.equal(scaleResult(cars, formWith("cars", Array(15).fill(1))).total, 15);
    assert.equal(scaleResult(cars, formWith("cars", Array(15).fill(1))).max, 60);
  });

  it("29,5 ainda e sem autismo; 30 e leve a moderado; 37, grave", () => {
    const quase = [...Array(14).fill(2), 1.5];
    assert.equal(scaleResult(cars, formWith("cars", quase)).faixa.rotulo, "Sem autismo");
    assert.equal(scaleResult(cars, formWith("cars", Array(15).fill(2))).faixa.rotulo, "Autismo leve a moderado");
    assert.equal(scaleResult(cars, formWith("cars", [...Array(14).fill(2.5), 2])).faixa.rotulo, "Autismo grave");
  });

  it("a meia nota sai com virgula no resumo", () => {
    const linha = scaleSummaryRows(formWith("cars", [...Array(14).fill(2), 1.5]))[0].value;
    assert.match(linha, /^29,5\/60/);
  });
});

describe("sugestao da M-CHAT-R/F", () => {
  const nascidoHa = meses => {
    const data = new Date();
    data.setDate(1);
    data.setMonth(data.getMonth() - meses);
    return data.toISOString().slice(0, 10);
  };

  it("sugere de 16 a 30 meses, e nao fora da janela", () => {
    const sugere = meses => suggestedScales({}, { nascimento: nascidoHa(meses) }).some(item => item.id === "mchat");
    assert.ok(sugere(20));
    assert.ok(!sugere(12));
    assert.ok(!sugere(40));
  });

  it("conta os meses pelo dia do aniversario", () => {
    assert.equal(ageInMonths("2024-03-15", new Date(2026, 2, 14)), 23);
    assert.equal(ageInMonths("2024-03-15", new Date(2026, 2, 15)), 24);
    assert.equal(ageInMonths(""), null);
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
