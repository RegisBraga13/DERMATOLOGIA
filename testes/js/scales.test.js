import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scaleById, scales } from "../../src/data/scales.js";
import {
  previousScaleEntries, previousScaleResult, scaleFieldName, scaleResult, scalesNarrativeText,
  scaleSummaryRows, withoutUnappliedScaleAnswers
} from "../../src/clinical/scoring.js";
import { buildEvolutionNarrative } from "../../src/clinical/narrative.js";
import { clinicalSummaryGroups } from "../../src/views/clinicalSummary.js";
import { scalesBody } from "../../src/views/scales.js";

// Monta o rascunho como o formulario deixaria: um campo por item, valor em
// texto. `undefined` na lista = item nao respondido.
function formWith(id, valores, extra = {}) {
  const scale = scaleById(id);
  const form = { escalasAplicadas: [id], ...extra };
  valores.forEach((valor, index) => {
    if (valor !== undefined) form[scaleFieldName(scale, index)] = String(valor);
  });
  return form;
}

function valorDe(id, item, rotulo) {
  const scale = scaleById(id);
  const opcoes = scale.itens[item].opcoes || scale.opcoes;
  return opcoes.find(opcao => opcao.rotulo === rotulo).valor;
}

describe("o catalogo de escalas", () => {
  it("todo item tem opcoes, sem valor repetido, e nada de resto de pagina", () => {
    for (const scale of scales) {
      scale.itens.forEach((item, index) => {
        const opcoes = item.opcoes || scale.opcoes;
        assert.ok(opcoes?.length >= 2, `${scale.sigla} item ${index + 1} sem opcoes`);
        const valores = opcoes.map(opcao => opcao.valor);
        assert.equal(new Set(valores).size, valores.length, `${scale.sigla} item ${index + 1} com valor repetido`);
        assert.ok(!opcoes.some(opcao => /e-mail/i.test(opcao.rotulo)), `${scale.sigla} com opcao "E-mail"`);
      });
    }
  });

  it("toda escala somada tem faixas que cobrem do zero ao maximo, sem buraco", () => {
    for (const scale of scales.filter(item => !item.classificar)) {
      const { max } = scaleResult(scale, {});
      // Do menor total possivel: a SBQ-R vai de 3 a 18, a CGI de 1 a 7.
      const min = scale.itens.filter(item => !item.fora)
        .reduce((soma, item) => soma + Math.min(...(item.opcoes || scale.opcoes).map(opcao => opcao.valor)), 0);
      for (let total = min; total <= max; total += 1) {
        const faixa = scale.faixas.find(item => total >= item.min && total <= item.max);
        if (scale.id.startsWith("cgi") && total === 0) continue;
        assert.ok(faixa, `${scale.sigla} sem faixa para ${total}`);
      }
    }
  });
});

describe("PHQ-9", () => {
  it("a pergunta de dificuldade e registrada, mas nao entra no total", () => {
    const result = scaleResult(scaleById("phq9"), formWith("phq9", [2, 2, 2, 2, 2, 2, 2, 2, 2, 3]));
    assert.equal(result.total, 18);
    assert.equal(result.max, 27);
    assert.equal(result.faixa.rotulo, "Depressão moderadamente grave");
  });

  it("pontos de corte dos autores: 5, 10, 15, 20", () => {
    const faixa = total => {
      const valores = Array(9).fill(0).map((_, i) => (i < total ? 1 : 0));
      const extra = total > 9 ? total - 9 : 0;
      for (let i = 0; i < extra; i += 1) valores[i] += 1;
      return scaleResult(scaleById("phq9"), formWith("phq9", valores)).faixa.rotulo;
    };
    assert.equal(faixa(4), "Sintomas depressivos mínimos");
    assert.equal(faixa(5), "Depressão leve");
    assert.equal(faixa(10), "Depressão moderada");
    assert.equal(faixa(15), "Depressão moderadamente grave");
  });

  it("o item 9 alerta sozinho, antes de a escala ficar completa", () => {
    const result = scaleResult(scaleById("phq9"), formWith("phq9", [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1]));
    assert.equal(result.completa, false);
    assert.equal(result.faixa, null);
    assert.equal(result.alertas.length, 1);
    assert.equal(result.alertas[0].tipo, "suicidio");
  });
});

describe("EPDS e GDS-15 pontuam no sentido do original", () => {
  it("EPDS: 'Sim, muitas vezes' em fazer mal a si mesma vale 3 e alerta", () => {
    assert.equal(valorDe("epds", 9, "Sim, muitas vezes, ultimamente"), 3);
    assert.equal(valorDe("epds", 4, "Sim, muitas vezes"), 3);
    assert.equal(valorDe("epds", 0, "De jeito nenhum"), 3);
    const result = scaleResult(scaleById("epds"), formWith("epds", [0, 0, 0, 0, 0, 0, 0, 0, 0, 3]));
    assert.equal(result.total, 3);
    assert.equal(result.alertas.length, 1);
  });

  it("EPDS: 10 e o ponto de corte da validacao brasileira", () => {
    const result = scaleResult(scaleById("epds"), formWith("epds", [1, 1, 1, 1, 1, 1, 1, 1, 2, 0]));
    assert.equal(result.total, 10);
    assert.equal(result.faixa.rotulo, "Possível depressão");
  });

  it("GDS-15: pontua a resposta que indica depressao, seja 'Sim' ou 'Nao'", () => {
    assert.equal(valorDe("gds15", 0, "Não"), 1); // satisfeito com a vida
    assert.equal(valorDe("gds15", 2, "Sim"), 1); // vida vazia
    assert.equal(valorDe("gds15", 10, "Não"), 1); // maravilhoso estar vivo
    assert.equal(valorDe("gds15", 13, "Sim"), 1); // situacao sem esperanca
  });
});

describe("triagens de suicidio classificam pela pergunta, e nao pela soma", () => {
  it("ASQ: so 'sim' em pensamentos de se matar agora ja e risco agudo", () => {
    const result = scaleResult(scaleById("asq"), formWith("asq", [0, 0, 0, 1, 1]));
    assert.equal(result.faixa.rotulo, "Triagem positiva, com risco agudo");
    assert.equal(result.alertas.length, 1);
  });

  it("ASQ: quatro 'nao' fecham a triagem sem a quinta pergunta", () => {
    const result = scaleResult(scaleById("asq"), formWith("asq", [0, 0, 0, 0]));
    assert.equal(result.completa, true);
    assert.equal(result.faixa.rotulo, "Triagem negativa");
    assert.equal(result.alertas.length, 0);
  });

  it("C-SSRS: plano com intencao e risco alto, mesmo com um 'sim' so no resto", () => {
    const result = scaleResult(scaleById("cssrs"), formWith("cssrs", [0, 1, 0, 0, 1, 0]));
    assert.equal(result.faixa.rotulo, "Risco alto");
  });

  it("C-SSRS: comportamento ha mais de 3 meses e moderado; nos ultimos 3, alto", () => {
    const antigo = scaleResult(scaleById("cssrs"), formWith("cssrs", [0, 0, undefined, undefined, undefined, 1, 0]));
    assert.equal(antigo.faixa.rotulo, "Risco moderado");
    const recente = scaleResult(scaleById("cssrs"), formWith("cssrs", [0, 0, undefined, undefined, undefined, 1, 1]));
    assert.equal(recente.faixa.rotulo, "Risco alto");
  });

  it("C-SSRS: sem 'sim' na 2, as perguntas de metodo e plano nao sao exigidas", () => {
    const result = scaleResult(scaleById("cssrs"), formWith("cssrs", [1, 0, undefined, undefined, undefined, 0]));
    assert.equal(result.completa, true);
    assert.equal(result.faixa.rotulo, "Risco baixo");
  });
});

describe("MDQ", () => {
  const sete = [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
  it("positivo so com as tres condicoes juntas", () => {
    assert.equal(scaleResult(scaleById("mdq"), formWith("mdq", [...sete, 1, 2])).faixa.rotulo, "Rastreamento positivo");
    assert.equal(scaleResult(scaleById("mdq"), formWith("mdq", [...sete, 1, 1])).faixa.rotulo, "Rastreamento negativo pelo critério original");
    assert.equal(scaleResult(scaleById("mdq"), formWith("mdq", [...sete, 0, 3])).faixa.rotulo, "Rastreamento negativo pelo critério original");
  });

  it("o total conta sintomas, de 0 a 13", () => {
    assert.equal(scaleResult(scaleById("mdq"), formWith("mdq", [...sete, 1, 3])).max, 13);
  });
});

describe("Y-BOCS, AUDIT e CGI", () => {
  it("Y-BOCS separa obsessoes e compulsoes", () => {
    const result = scaleResult(scaleById("ybocs"), formWith("ybocs", [3, 3, 3, 2, 2, 1, 1, 1, 1, 1]));
    assert.equal(result.total, 18);
    assert.equal(result.faixa.rotulo, "Moderado");
    assert.deepEqual(result.subescalas.map(sub => sub.total), [13, 5]);
  });

  it("AUDIT: quem nunca bebe responde so a 1, a 9 e a 10", () => {
    const result = scaleResult(scaleById("audit"), formWith("audit", [0, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 0, 2]));
    assert.equal(result.completa, true);
    assert.equal(result.total, 2);
    assert.equal(result.faixa.rotulo, "Zona I, uso de baixo risco");
  });

  it("CGI-S mostra a nota com o rotulo", () => {
    const result = scaleResult(scaleById("cgi-s"), formWith("cgi-s", [5]));
    assert.equal(result.faixa.rotulo, "5 · Acentuadamente doente");
  });
});

describe("o resultado chega ao prontuario", () => {
  const consulta = formWith("phq9", [2, 2, 2, 2, 2, 2, 2, 2, 2], { id: "c1", createdAt: "2026-08-01T10:00:00Z" });

  it("a historia clinica traz a escala e o alerta", () => {
    const texto = buildEvolutionNarrative(consulta, { nome: "Paciente Teste" });
    assert.ok(texto.includes("Escalas aplicadas: PHQ-9 18/27 (depressão moderadamente grave)."));
    assert.ok(texto.includes("Alertas das escalas: PHQ-9, item 9 positivo"));
  });

  it("o retorno compara com o atendimento anterior", () => {
    const retorno = formWith("phq9", [1, 1, 1, 1, 1, 1, 1, 1, 0], { id: "r1", createdAt: "2026-09-01T10:00:00Z" });
    assert.equal(scalesNarrativeText(retorno, consulta), "Escalas aplicadas: PHQ-9 8/27 (depressão leve; antes 18/27; resposta, queda de 56% em 4 semanas).");
  });

  it("o resumo ganha a tabela das escalas; sem escala, nao ha tabela", () => {
    assert.ok(clinicalSummaryGroups(consulta, {}).some(group => group.title === "Escalas aplicadas"));
    assert.ok(!clinicalSummaryGroups({}, {}).some(group => group.title === "Escalas aplicadas"));
    assert.ok(scaleSummaryRows(consulta)[0].value.startsWith("18/27"));
  });

  it("escala desmarcada nao deixa resposta gravada", () => {
    const limpo = withoutUnappliedScaleAnswers({ ...consulta, escalasAplicadas: [], escala_gad7_0: "2" });
    assert.ok(!Object.keys(limpo).some(campo => campo.startsWith("escala_")));
    assert.equal(limpo.id, "c1");
  });

  it("reabrir uma consulta antiga nao a compara com a mais nova", () => {
    const nova = formWith("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 0], { id: "c2", createdAt: "2026-09-05T10:00:00Z" });
    const antigas = previousScaleEntries([nova, consulta], consulta);
    assert.equal(antigas.length, 0);
    const paraNova = previousScaleEntries([nova, consulta], nova);
    assert.equal(previousScaleResult(scaleById("phq9"), paraNova).result.total, 18);
  });
});

describe("a tela das escalas", () => {
  it("so abre o cartao da escala marcada", () => {
    const html = scalesBody(formWith("gad7", []), []);
    assert.ok(html.includes('id="escala-gad7"'));
    assert.ok(!html.includes('id="escala-phq9"'));
  });

  it("aponta a divergencia com a anamnese que nega ideacao suicida", () => {
    const form = formWith("phq9", [0, 0, 0, 0, 0, 0, 0, 0, 1], { riscoSuicidioIndicadores: ["Nega ideacao, plano ou intencao suicida"] });
    assert.ok(scalesBody(form, []).includes("nega ideação suicida, e esta escala veio positiva"));
  });
});
