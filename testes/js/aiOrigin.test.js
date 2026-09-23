import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createAiOperations } from "../../src/clinical/aiOperations.js";
import { anamnesisAiMarks, hasAiMarks, withoutAiMarks } from "../../src/clinical/anamnesisOrigin.js";

// Duas perguntas que a tela nao respondia: "quem marcou isto?" e "quantas
// chamadas estao em voo?". As duas terminavam no mesmo lugar -- uma proposta da
// IA com aparencia de decisao do medico.

describe("uma chamada de IA por etapa, e a ultima e que vale", () => {
  it("a etapa fica ocupada enquanto a chamada nao volta", () => {
    const ops = createAiOperations();
    assert.equal(ops.ocupada("treatment"), false);
    const primeira = ops.begin("treatment");
    assert.equal(ops.ocupada("treatment"), true);
    primeira.encerrar();
    assert.equal(ops.ocupada("treatment"), false);
  });

  it("a chamada superada nao grava", () => {
    const ops = createAiOperations();
    const primeira = ops.begin("treatment");
    const segunda = ops.begin("treatment");
    assert.equal(primeira.atual(), false, "clicar de novo e pedir outra resposta: a velha nao pode gravar por cima");
    assert.equal(segunda.atual(), true);
  });

  it("a resposta velha que chega primeiro nao reabre o botao", () => {
    // O caso que motiva o teste: duas chamadas em voo, a primeira responde
    // depois da segunda ter saido. Se ela liberasse o botao, a tela ofereceria
    // "Gerar" com uma chamada ainda correndo -- e a terceira resposta cairia
    // sobre a segunda.
    const ops = createAiOperations();
    const primeira = ops.begin("treatment");
    ops.begin("treatment");
    primeira.encerrar();
    assert.equal(ops.ocupada("treatment"), true);
  });

  it("cada etapa tem a sua vaga", () => {
    const ops = createAiOperations();
    ops.begin("treatment");
    assert.equal(ops.ocupada("treatment"), true);
    assert.equal(ops.ocupada("diagnosis"), false,
      "gerar tratamento nao pode fechar o botao do diagnostico: sao campos diferentes");
  });

  it("avisa quem desenha a cada abertura e a cada fechamento", () => {
    let avisos = 0;
    const ops = createAiOperations(() => { avisos += 1; });
    const op = ops.begin("evolution");
    assert.equal(avisos, 1);
    op.encerrar();
    assert.equal(avisos, 2, "sem o segundo aviso o botao ficaria fechado ate o proximo render");
  });

  it("trocar de paciente devolve os botoes abertos", () => {
    const ops = createAiOperations();
    ops.begin("treatment");
    ops.begin("medication");
    ops.reset();
    assert.deepEqual(ops.ocupadasAgora(), [],
      "as respostas em voo serao descartadas pelo draftGuard: o proximo paciente nao herda botao fechado");
  });

  it("reset sem nada em voo nao redesenha atoa", () => {
    let avisos = 0;
    const ops = createAiOperations(() => { avisos += 1; });
    ops.reset();
    assert.equal(avisos, 0);
  });
});

describe("de quem e cada caixa marcada na anamnese", () => {
  const proposto = { psiPrevios: new Set(["Depressao", "Ansiedade"]) };

  it("marca o que a IA propos e ficou marcado", () => {
    const marcas = anamnesisAiMarks({ psiPrevios: ["Depressao", "Ansiedade"] }, proposto, {});
    assert.deepEqual(marcas, { "psiPrevios:Depressao": true, "psiPrevios:Ansiedade": true });
  });

  it("nao marca o que o medico ja tinha decidido, mesmo coincidindo com a IA", () => {
    // O ponto inteiro da marca: ela responde "isto aqui fui eu?". Uma caixa que
    // ele marcou continua dele ainda que a IA proponha a mesma coisa.
    const marcas = anamnesisAiMarks(
      { psiPrevios: ["Depressao", "Ansiedade"] },
      proposto,
      { "psiPrevios:Depressao": true }
    );
    assert.deepEqual(marcas, { "psiPrevios:Ansiedade": true });
  });

  it("nao marca proposta que nao sobreviveu: marca em caixa desmarcada e marca em nada", () => {
    const marcas = anamnesisAiMarks({ psiPrevios: ["Ansiedade"] }, proposto, {});
    assert.deepEqual(marcas, { "psiPrevios:Ansiedade": true });
  });

  it("campo sem nada marcado nao produz marca", () => {
    assert.deepEqual(anamnesisAiMarks({}, proposto, {}), {});
    assert.equal(hasAiMarks({}), false);
  });

  it("tocar a caixa derruba a marca", () => {
    const marcas = { "psiPrevios:Depressao": true, "psiPrevios:Ansiedade": true };
    assert.deepEqual(withoutAiMarks(marcas, ["psiPrevios:Depressao"]), { "psiPrevios:Ansiedade": true });
  });

  it("a regra de negacao derruba as caixas que ela mexeu por tabela", () => {
    // Marcar "Nega sintomas relacionados" desmarca o resto do grupo. Esse
    // desmarcar tambem e decisao do medico, e nao pode deixar marca de IA para
    // tras numa caixa que ele acabou de negar.
    const marcas = { "psicoseSintomas:Ideias de perseguicao": true, "psicoseSintomas:Desconfianca excessiva": true };
    const depois = withoutAiMarks(marcas, ["psicoseSintomas:Nega sintomas relacionados",
      "psicoseSintomas:Ideias de perseguicao", "psicoseSintomas:Desconfianca excessiva"]);
    assert.deepEqual(depois, {});
  });

  it("nao altera o objeto recebido", () => {
    const marcas = { "psiPrevios:Depressao": true };
    withoutAiMarks(marcas, ["psiPrevios:Depressao"]);
    assert.deepEqual(marcas, { "psiPrevios:Depressao": true });
  });
});

describe("as tres correcoes chegam de fato a tela", () => {
  const app = readFileSync(new URL("../../src/App.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/styles/theme.css", import.meta.url), "utf8");

  it("o aviso de que o acervo nao tinha o farmaco e renderizado", () => {
    // Existia desde sempre e nunca chegou a tela: era escrito em
    // `medicationStatus`, que nenhum view lia. Se este teste cair, o aviso de
    // menor sustentacao da ficha voltou a nao existir.
    assert.ok(app.includes("form.medicationAcervoAviso ?"),
      "o campo precisa ser desenhado, e nao so gravado");
    assert.ok(/medicationAcervoAviso[^\n]*\n?[^\n]*class="warning"/.test(app)
      || app.includes('${form.medicationAcervoAviso ? `<p class="warning"'),
      "em bloco de aviso, e nao no cinza que o sucesso tambem usa");
  });

  it("o atalho de quem ja tem o diagnostico salva antes de destravar", () => {
    const corpo = app.slice(app.indexOf("function skipToDiagnosis"), app.indexOf("function medicationDetour"));
    assert.ok(corpo.includes("saveClinicalRecord(\"consultation\")"), "sem salvar, volta o problema das abas livres");
    assert.ok(corpo.indexOf("saveClinicalRecord") < corpo.indexOf("unlockAllPages"),
      "salvar TEM de vir antes de destravar");
    assert.ok(corpo.includes('consultationPage = "diagnostico"'));
  });

  it("o botao em voo e fechado a partir do estado, nao do DOM", () => {
    assert.ok(app.includes("function paintAiBusyState"));
    assert.ok(app.includes("paintAiBusyState();\n  bindMedicationLookup")
      || /bindViewEvents\(\)[\s\S]{0,200}paintAiBusyState\(\)/.test(app),
      "render() recria os botoes: sem repintar depois de desenhar, o disabled se perde");
  });

  it("cada begin tem o seu encerrar", () => {
    const abre = (app.match(/aiOperations\.begin\(/g) || []).length;
    const fecha = (app.match(/operacao\.encerrar\(\)/g) || []).length;
    assert.equal(abre, fecha, "etapa que abre e nao fecha deixa o botao morto ate trocar de paciente");
    assert.equal(abre, 6, "as seis etapas de IA da jornada");
  });

  it("a marca de origem nao e so cor", () => {
    assert.ok(/\.chip\.chip-ai\s*\{[^}]*border-style:\s*dashed/.test(css),
      "cor sozinha nao serve a quem nao a distingue");
    assert.ok(app.includes("Marcado pela extração da IA"), "e precisa existir por extenso para leitor de tela");
  });
});
