import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogoDoFarmaco, gestacaoConfirmadaEm, intervaloMinimoEmDias, medicationLineReview, pisoEmMg, tetoEmMg, treatmentDoseReview } from "../../src/clinical/doseCheck.js";

// A ficha que ele montou errada de proposito em 02/09/2026 para testar a
// revisao do medicamento: 400 mg/dia de sertralina, incremento a cada 3 dias.
// A revisao pegou os dois na epoca, e depois saiu da tela. Esta conferencia
// pega os mesmos dois sem gastar chamada de IA nenhuma.
const FICHA_ERRADA = "Sertralina | Dose inicial: 50 mg/dia | Progressão: 25 mg a cada 3 dias | Dose final: 400 mg/dia";
const FICHA_CERTA = "Sertralina | Dose inicial: 50 mg/dia | Progressão: 25 a 50 mg a cada 2 semanas | Dose final: 150 mg/dia";

describe("teto em mg", () => {
  it("le o topo da faixa, e nao o primeiro numero", () => {
    assert.equal(tetoEmMg("50 a 200 mg/dia"), 200);
    assert.equal(tetoEmMg("200 mg/dia divididos em duas tomadas"), 200);
  });

  it("aceita virgula decimal, como o catalogo escreve", () => {
    assert.equal(tetoEmMg("37,5 a 75 mg/dia"), 75);
  });

  it("recusa unidade que nao e mg, em vez de comparar por fator de mil", () => {
    assert.equal(tetoEmMg("500 mcg/dia"), null);
    assert.equal(tetoEmMg("1 g/dia"), null);
  });

  it("recusa dose por peso: 2 mg/kg/dia nao se compara com teto em mg/dia", () => {
    assert.equal(tetoEmMg("2 mg/kg/dia"), null);
  });

  it("texto sem numero nao vira zero", () => {
    assert.equal(tetoEmMg("conforme resposta clinica"), null);
    assert.equal(tetoEmMg(""), null);
  });
});

describe("piso em mg", () => {
  // O 50 de "50 a 200 mg/dia" nao tem unidade colada. Lido sem a faixa, o piso
  // saia 200 e reprovava toda dose abaixo do topo -- inclusive as 150 mg que
  // sao ensaio adequado de sertralina.
  it("le o piso da faixa, e nao o unico numero com unidade", () => {
    assert.equal(pisoEmMg("50 a 200 mg/dia"), 50);
    assert.equal(pisoEmMg("10 a 20 mg/dia"), 10);
  });

  it("valor unico e piso e teto ao mesmo tempo", () => {
    assert.equal(pisoEmMg("20 mg/dia"), 20);
  });

  it("recusa o que o teto recusa", () => {
    assert.equal(pisoEmMg("500 mcg/dia"), null);
    assert.equal(pisoEmMg("2 mg/kg/dia"), null);
  });
});

describe("intervalo minimo em dias", () => {
  it("le a faixa pelo piso: 1 a 2 semanas autoriza titular em 7 dias", () => {
    assert.equal(intervaloMinimoEmDias("Aumentar em intervalos de 1 a 2 semanas"), 7);
  });

  it("le o intervalo solto", () => {
    assert.equal(intervaloMinimoEmDias("25 mg a cada 3 dias"), 3);
    assert.equal(intervaloMinimoEmDias("aumento semanal"), 7);
  });

  it("sem intervalo nenhum devolve null, e nao um numero inventado", () => {
    assert.equal(intervaloMinimoEmDias("aumentar conforme tolerabilidade"), null);
  });
});

describe("o farmaco sai do titulo da linha", () => {
  it("acha o generico", () => {
    assert.equal(catalogoDoFarmaco(FICHA_CERTA)?.generic, "Sertralina");
  });

  it("acha pela marca", () => {
    assert.equal(catalogoDoFarmaco("Zoloft | Dose inicial: 50 mg/dia")?.generic, "Sertralina");
  });

  // Mesma regra do monitoringFor: o nome citado na justificativa nao pode
  // escolher o farmaco, senao a conferencia usa o teto do fármaco errado.
  it("nome citado depois da primeira barra nao escolhe o farmaco", () => {
    assert.equal(catalogoDoFarmaco("Escitalopram | Observação: evitar associar a sertralina")?.generic, "Escitalopram");
  });
});

describe("conferencia da linha de tratamento", () => {
  it("a ficha errada acusa dose acima do teto e titulacao mais rapida", () => {
    const revisao = medicationLineReview(FICHA_ERRADA);
    assert.equal(revisao.estado, "divergencia");
    const codigos = revisao.alertas.map(item => item.codigo);
    assert.deepEqual(codigos.sort(), ["dose_acima_do_teto", "titulacao_mais_rapida"]);
    // O alerta carrega a referencia: sem ela, o medico teria de ir procurar
    // contra o que a linha foi comparada.
    assert.match(revisao.alertas.find(item => item.codigo === "dose_acima_do_teto").texto, /50 a 200 mg\/dia/);
  });

  it("a ficha certa fica conferida, e conferida nao e o mesmo que sem alerta", () => {
    const revisao = medicationLineReview(FICHA_CERTA);
    assert.equal(revisao.estado, "conferido");
    assert.deepEqual(revisao.alertas, []);
    assert.equal(revisao.farmaco, "Sertralina");
  });

  it("titular em 7 dias esta dentro de 1 a 2 semanas e nao acusa nada", () => {
    const revisao = medicationLineReview("Sertralina | Dose inicial: 50 mg/dia | Progressão: 50 mg a cada 7 dias | Dose final: 150 mg/dia");
    assert.equal(revisao.estado, "conferido");
  });

  it("dose no teto exato nao e divergencia", () => {
    const revisao = medicationLineReview("Escitalopram | Dose inicial: 10 mg/dia | Progressão: após 2 semanas | Dose final: 20 mg/dia");
    assert.equal(revisao.estado, "conferido");
  });

  it("farmaco fora do catalogo diz que NAO conferiu, em vez de silenciar", () => {
    const revisao = medicationLineReview("Clonazepam | Dose inicial: 0,5 mg/noite | Progressão: conforme resposta | Dose final: 2 mg/dia");
    assert.equal(revisao.estado, "sem_catalogo");
    assert.deepEqual(revisao.alertas, []);
  });

  it("dose em texto que nao da para ler nao inventa divergencia", () => {
    const revisao = medicationLineReview("Quetiapina | Dose inicial: conforme alvo | Progressão: conforme resposta | Dose final: titular ate resposta");
    assert.equal(revisao.estado, "conferido");
  });
});

describe("teratogenico em gestacao confirmada", () => {
  const litio = "Carbonato de lítio | Dose inicial: 300 mg/noite | Progressão: conforme litemia | Dose final: 900 mg/dia";

  it("acusa quando a gestacao esta confirmada", () => {
    const revisao = medicationLineReview(litio, { gestacaoConfirmada: true });
    assert.equal(revisao.estado, "divergencia");
    assert.equal(revisao.alertas[0].codigo, "teratogenico_em_gestacao");
  });

  it("nao acusa sem gestacao confirmada", () => {
    assert.equal(medicationLineReview(litio).estado, "conferido");
  });

  // Valproato esta em monitoring.js e nao em medications.js: o alerta de
  // teratogenicidade nao depende do catalogo de doses.
  it("vale para teratogenico que nao esta no catalogo de doses", () => {
    const revisao = medicationLineReview("Valproato de sódio | Dose inicial: 500 mg/dia", { gestacaoConfirmada: true });
    assert.equal(revisao.estado, "divergencia");
    assert.equal(revisao.alertas[0].codigo, "teratogenico_em_gestacao");
  });

  it("'nao sabe' nao e gestacao confirmada", () => {
    assert.equal(gestacaoConfirmadaEm({ gravidez: ["Não sabe"] }), false);
    assert.equal(gestacaoConfirmadaEm({ gravidez: ["Sim, com certeza"] }), true);
    assert.equal(gestacaoConfirmadaEm({}), false);
  });
});

describe("conferencia da lista inteira", () => {
  it("uma revisao por linha, na ordem da tela", () => {
    const revisoes = treatmentDoseReview([FICHA_ERRADA, FICHA_CERTA, ""]);
    assert.equal(revisoes.length, 2);
    assert.deepEqual(revisoes.map(item => item.estado), ["divergencia", "conferido"]);
  });
});

describe("os alertas do servidor entram junto", () => {
  const linha = "Clonazepam | Dose inicial: 0,5 mg/noite | Progressão: conforme resposta | Dose final: 2 mg/dia";

  // Com catalogo e casos em dia, os dois lados dizem o mesmo e a uniao nao
  // acrescenta nada. Ela existe para o dia em que NAO disserem.
  it("alerta que so o servidor viu aparece assim mesmo", () => {
    const [revisao] = treatmentDoseReview([linha], {
      alertasDoServidor: [{ linha, codigo: "dose_acima_do_teto", texto: "Dose final proposta (2 mg/dia) acima da faixa usual." }]
    });
    assert.equal(revisao.estado, "divergencia");
    assert.equal(revisao.alertas.length, 1);
  });

  it("alerta repetido nao vira dois na tela", () => {
    const [revisao] = treatmentDoseReview([FICHA_ERRADA], {
      alertasDoServidor: [{
        linha: FICHA_ERRADA,
        codigo: "dose_acima_do_teto",
        texto: "Dose final proposta (400 mg/dia) acima da faixa usual para Sertralina: 50 a 200 mg/dia."
      }]
    });
    assert.equal(revisao.alertas.filter(item => item.codigo === "dose_acima_do_teto").length, 1);
  });

  it("alerta de outra linha nao contamina esta", () => {
    const [revisao] = treatmentDoseReview([FICHA_CERTA], {
      alertasDoServidor: [{ linha: "Outra coisa", codigo: "dose_acima_do_teto", texto: "de outra opcao" }]
    });
    assert.equal(revisao.estado, "conferido");
  });

  it("sem alerta do servidor, a conferencia local continua valendo sozinha", () => {
    const [revisao] = treatmentDoseReview([FICHA_ERRADA]);
    assert.equal(revisao.estado, "divergencia");
  });
});
