import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createUnsavedWork } from "../../src/clinical/unsavedWork.js";
import { statusFailure, statusTone, statusToneClass, statusToneRole, TOM } from "../../src/clinical/statusTone.js";
import { hasOptionParts, optionParts } from "../../src/clinical/optionParts.js";

// Quatro achados da avaliacao heuristica de 23/09/2026, na ordem em que doem:
// fechar a aba perdia a consulta; a linha de medicamento era uma frase corrida;
// falha e sucesso saiam no mesmo cinza; e o capitulo do livro abria por cima da
// conduta.

describe("o que esta na tela e ainda nao esta no prontuario", () => {
  it("nada tocado, nada a avisar", () => {
    const pendente = createUnsavedWork();
    assert.equal(pendente.ha(), false);
  });

  it("digitou, ficou pendente; gravou, deixou de estar", () => {
    const pendente = createUnsavedWork();
    pendente.tocou("consultation");
    assert.equal(pendente.ha(), true);
    pendente.salvo("consultation");
    assert.equal(pendente.ha(), false);
  });

  it("gravar a consulta nao grava o cadastro do paciente", () => {
    // Sao dois botoes de salvar diferentes, e salvar um nao pode calar o aviso
    // do outro -- foi o cadastro que ficou por gravar.
    const pendente = createUnsavedWork();
    pendente.tocou("consultation");
    pendente.tocou("patient");
    pendente.salvo("consultation");
    assert.deepEqual(pendente.escopos(), ["patient"]);
  });

  it("tocar duas vezes o mesmo escopo nao acumula pendencia", () => {
    const pendente = createUnsavedWork();
    pendente.tocou("return");
    pendente.tocou("return");
    pendente.salvo("return");
    assert.equal(pendente.ha(), false);
  });

  it("trocar de rascunho descarta o pendente sem avisar", () => {
    // Trocar de paciente ja e decisao dele, e o rascunho antigo foi descartado
    // por essa decisao: nao ha o que perguntar na saida.
    const pendente = createUnsavedWork();
    pendente.tocou("consultation");
    pendente.tocou("patient");
    pendente.limpar();
    assert.equal(pendente.ha(), false);
  });

  it("evento sem escopo nao inventa pendencia", () => {
    // A busca do prontuario e o formulario de entrada tambem disparam `input`,
    // e nenhum dos dois alimenta ramo de rascunho.
    const pendente = createUnsavedWork();
    pendente.tocou("");
    pendente.tocou(undefined);
    assert.equal(pendente.ha(), false);
  });
});

describe("falha nao pode sair com a mesma cara de sucesso", () => {
  it("a falha cunhada aqui e reconhecida como falha", () => {
    const texto = statusFailure("IA indisponível", "timeout ao conectar");
    assert.equal(statusTone(texto), TOM.falha);
    assert.equal(statusToneRole(texto), "alert", "leitor de tela recebe na hora, e nao na fila");
    assert.equal(statusToneClass(texto), "status-falha");
  });

  it("a falha diz a causa e a saida que sobra", () => {
    const texto = statusFailure("RAG indisponível", "502 Bad Gateway", "Use pesquisa online ou prompt manual.");
    assert.equal(texto, "RAG indisponível: 502 Bad Gateway. Use pesquisa online ou prompt manual.");
  });

  it("erro sem mensagem nao vira frase pela metade", () => {
    assert.equal(statusFailure("Capítulo indisponível", ""), "Capítulo indisponível: sem detalhe da causa.");
  });

  it("sucesso nao ganha cor: ele e o normal da caixa", () => {
    const texto = "3 opções medicamentosas e 2 outras abordagens propostas para você assinalar.";
    assert.equal(statusTone(texto), TOM.feito);
    assert.equal(statusToneClass(texto), "");
    assert.equal(statusToneRole(texto), "status");
  });

  it("espera e espera, e nao resultado", () => {
    assert.equal(statusTone("Consultando a literatura de conduta..."), TOM.espera);
    assert.equal(statusTone("Abrindo o capitulo do livro..."), TOM.espera);
    assert.equal(statusToneClass("Carregando ficha clínica e verificando fontes complementares..."), "status-espera");
  });

  it("acento nao decide o tom", () => {
    // O programa escreveu "indisponivel" sem acento por anos, e esses status
    // estao gravados em prontuario.
    assert.equal(statusTone("RAG indisponivel: erro de rede."), TOM.falha);
    assert.equal(statusTone("RAG indisponível: erro de rede."), TOM.falha);
  });

  it("a queda para o catalogo local tambem e falha, com a redacao que ela ja tinha", () => {
    // Esta nao passa por statusFailure: o texto e anterior, esta preso por teste
    // proprio (aiDiagnosisResult) e usa parenteses em vez de dois pontos. A
    // regra que importa nao e a forma -- e o tom: fonte que caiu nao pode sair
    // com a cara de proposta pronta, ainda que haja catalogo local por baixo.
    const texto = "RAG indisponível (tempo esgotado). As hipóteses abaixo vêm do catálogo local, por correspondência de termos do registro.";
    assert.equal(statusTone(texto), TOM.falha);
  });

  it("status vazio nao desenha caixa", () => {
    assert.equal(statusTone(""), "");
    assert.equal(statusTone("   "), "");
  });

  it("falha vence espera quando as duas aparecem", () => {
    assert.equal(statusTone("Consultando... IA indisponível: timeout."), TOM.falha);
  });
});

describe("a linha de medicamento, separada em campos", () => {
  it("a proposta de tratamento abre em titulo e campos", () => {
    const { titulo, partes } = optionParts("Sertralina | Dose inicial: 50 mg/dia | Progressão: 50 mg a cada 2 semanas | Dose final: 150 mg/dia");
    assert.equal(titulo, "Sertralina");
    assert.deepEqual(partes, [
      { rotulo: "Dose inicial", valor: "50 mg/dia" },
      { rotulo: "Progressão", valor: "50 mg a cada 2 semanas" },
      { rotulo: "Dose final", valor: "150 mg/dia" }
    ]);
  });

  it("os dois pontos do TITULO nao viram rotulo", () => {
    // "Insônia · 1ª opção: Trazodona" tem dois pontos e e titulo. Por isso o
    // rotulo vem de lista fechada, e nao do que estiver antes do sinal.
    const { titulo, partes } = optionParts("Insônia · 1ª opção: Trazodona | Dose inicial: 25 mg | Interação: evitar com ISRS");
    assert.equal(titulo, "Insônia · 1ª opção: Trazodona");
    assert.deepEqual(partes.map(parte => parte.rotulo), ["Dose inicial", "Interação"]);
  });

  it("detalhe livre com dois pontos continua texto, e nao vira campo inventado", () => {
    const { partes } = optionParts("Sertralina — aumentar | manhã: 100 mg | resposta parcial em 6 semanas");
    assert.deepEqual(partes, [
      { rotulo: "", valor: "manhã: 100 mg" },
      { rotulo: "", valor: "resposta parcial em 6 semanas" }
    ]);
  });

  it("rotulo sem valor nao vira campo vazio", () => {
    // Campo vazio afirmaria que nao ha dose; o que houve foi a IA nao ter dito.
    const { partes } = optionParts("Quetiapina | Dose inicial:");
    assert.deepEqual(partes, [{ rotulo: "", valor: "Dose inicial:" }]);
  });

  it("frase de um campo so nao vira ficha", () => {
    assert.deepEqual(optionParts("Psicoterapia cognitivo-comportamental"), {
      titulo: "Psicoterapia cognitivo-comportamental", partes: []
    });
    assert.equal(hasOptionParts("Psicoterapia cognitivo-comportamental"), false);
    assert.equal(hasOptionParts("Sertralina | Dose inicial: 50 mg"), true);
  });

  it("barra sobrando nao produz campo em branco", () => {
    assert.deepEqual(optionParts("Lítio |  | Dose alvo: 900 mg/dia").partes, [{ rotulo: "Dose alvo", valor: "900 mg/dia" }]);
  });

  it("linha vazia nao quebra", () => {
    assert.deepEqual(optionParts(""), { titulo: "", partes: [] });
    assert.deepEqual(optionParts(), { titulo: "", partes: [] });
  });
});

describe("as quatro correcoes chegam de fato a tela", () => {
  const app = readFileSync(new URL("../../src/App.js", import.meta.url), "utf8");
  const decisions = readFileSync(new URL("../../src/views/decisions.js", import.meta.url), "utf8");
  const medication = readFileSync(new URL("../../src/views/medication.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/styles/theme.css", import.meta.url), "utf8");

  it("a pergunta de saida existe, e e registrada uma vez so", () => {
    assert.ok(app.includes('window.addEventListener("beforeunload"'),
      "sem isto, fechar a aba com a consulta na tela descarta tudo em silêncio");
    assert.ok(!/bindViewEvents\(\)[\s\S]*?addEventListener\("beforeunload"/.test(app),
      "registrar dentro de bindViewEvents empilharia um ouvinte por render()");
    assert.equal((app.match(/addEventListener\("beforeunload"/g) || []).length, 1);
  });

  it("gravacao em andamento tambem segura a saida", () => {
    const corpo = app.slice(app.indexOf("function haTrabalhoNaoSalvo"), app.indexOf("Promise.all([loadState()"));
    assert.ok(corpo.includes("voiceRecording.isBusy()"), "o áudio ainda não virou texto: recarregar o perde inteiro");
    assert.ok(corpo.includes("unsavedWork.ha()"));
  });

  it("cada gravacao limpa a pendencia do seu escopo", () => {
    ["consultation", "return", "patient"].forEach(escopo => {
      assert.ok(app.includes(`unsavedWork.salvo("${escopo}")`), `${escopo} salva e continuaria pedindo confirmação ao sair`);
    });
    assert.equal((app.match(/unsavedWork\.limpar\(\)/g) || []).length, 5,
      "as cinco trocas de rascunho: paciente, novo cadastro, nova consulta, exclusão e fim de sessão");
  });

  it("nenhuma caixa de status escreve o proprio <p> por fora do tom", () => {
    const sobraram = [app, decisions, medication]
      .join("\n")
      .match(/<p class="(online-status|medication-source-status)"/g) || [];
    assert.deepEqual(sobraram, [], "status desenhado à mão volta a sair no mesmo cinza da falha");
  });

  it("a falha e cunhada por statusFailure, e nao concatenada a mao", () => {
    assert.ok(app.includes('import { statusFailure } from "./clinical/statusTone.js";'));
    assert.ok(!/Status: `[^`]*indispon[ií]vel: \$\{error\.message\}/.test(app),
      "falha montada à mão foge do classificador");
    assert.ok((app.match(/statusFailure\(/g) || []).length >= 6, "os seis pontos de falha da jornada");
  });

  it("a falha nao se distingue so pela cor", () => {
    assert.ok(css.includes(".status-falha::before"), "cor sozinha não serve a quem não a distingue");
    assert.ok(/\.online-status\.status-falha[\s\S]{0,200}border-left/.test(css));
  });

  it("a linha de medicamento e desenhada em campos nas duas listas", () => {
    assert.ok(decisions.includes("function optionLabelBody"));
    assert.equal((decisions.match(/\$\{optionLabelBody\(option\)\}/g) || []).length, 2,
      "a lista de opções medicamentosas e a de abordagens/ajustes usam o mesmo desenho");
    assert.ok(!decisions.includes("<span>${escapeHtml(option)}</span></label>"),
      "a frase corrida separada por barras não pode voltar");
  });

  it("a string guardada continua sendo a linha inteira", () => {
    // E contrato: e o valor da caixa e o formato que a narrativa e o Resumo
    // leem de volta ao remontar o prontuario.
    assert.ok(decisions.includes('value="${escapeAttr(option)}"'),
      "o desenho mudou; o que vai para o prontuário, não");
  });

  it("o capitulo do livro nao abre mais por cima da conduta", () => {
    assert.ok(medication.includes('<details class="book-chapter">'));
    assert.ok(!medication.includes('<details class="book-chapter" open>'),
      "13 a 30 mil caracteres abertos empurram a conduta para fora da tela");
    assert.ok(medication.includes("mil caracteres"), "fechado, o cabeçalho precisa dizer o tamanho do que esconde");
  });
});
