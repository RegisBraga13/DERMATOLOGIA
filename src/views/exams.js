import { CRITERION_SEPARATOR, entityName } from "../clinical/aiDiagnosisResult.js";
import { diagnosticEtiologicalOptionLines } from "../clinical/diagnosis.js";
import { analysisFindingsForReturn, pendingRefinementItems } from "../clinical/returnCarryover.js";
import { arrayValue, normalizeText } from "../clinical/textFormat.js";
import { MENTAL_EXAM_KEYS, MENTAL_EXAM_NORMAL_OPTIONS } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js";
import { chips, singleChoiceWithNotes, textarea } from "../ui/controls.js";
import { escapeAttr, escapeHtml } from "../ui/html.js";

export function consultationAccessPanel(consultations, form) {
  return `<div class="clinical-card record-access">
    <h4>Consultas deste paciente</h4>
    <div class="actions">
      <button class="secondary" type="button" data-action="new-consultation">Nova consulta</button>
      ${consultations.map(entry => `
        <button class="secondary ${entry.id === form.id ? "active" : ""}" type="button" data-action="edit-entry" data-id="${entry.id}" data-type="consultation">
          ${escapeHtml(entry.label)}
        </button>
      `).join("")}
    </div>
  </div>`;
}

export function recordReturnAction(label) {
  return `
    <div class="warning record-opened">
      ${escapeHtml(label)}.
      <button class="secondary inline-action" type="button" data-action="back-to-record">Voltar ao prontuario</button>
    </div>
  `;
}

// A avaliacao de evolucao tem duas metades, desde 31/08/2026.
//
// A ESPINHA e fixa e vale em qualquer retorno, com qualquer diagnostico:
// evolucao global, adesao, efeitos colaterais, eventos e conduta com o
// medicamento. Foi decisao dele manter estes -- "alguns itens fixados sempre
// sao analisados na evolucao".
//
// O BLOCO DO CASO nasce do atendimento anterior. Antes tudo era fixo, e "Sono"
// com as mesmas quatro opcoes servia igual para todo mundo: no retorno de uma
// mania, "reducao da necessidade de sono" e o sinal cardinal de recaida; no
// retorno de um panico, nao diz nada -- la a pergunta e frequencia de crise.
// Era o mesmo defeito dos trinta chips do Sintoma-Alvo, e a mesma raiz: a
// Evolucao tinha o atendimento anterior na mao e nao lia uma linha dele.
//
// Nada disso chama a IA: e derivacao do que ja esta gravado. Sem custo, sem
// espera, e igual toda vez.
// Um vocabulario so para tudo que mede evolucao, decisao dele em 02/09/2026.
// A pagina tinha tres escalas para a mesma pergunta -- "melhora clinica /
// estabilidade / piora / novos sintomas" no topo, "remissao / remissao parcial
// / mantida / piora / descartada / nao avaliada" nas hipoteses, "resolvido /
// melhorou / igual / piorou" nos sintomas-alvo. Tres jeitos de dizer melhora,
// e nenhum comparavel com o outro na hora de ler o retorno seguinte.
//
// "Descartada" e "Nao avaliada" sairam junto: a lista do que ficou por
// perguntar nao vem daqui, vem dos criterios do diagnostico anterior, no bloco
// logo abaixo.
export const EVOLUCAO_OPCOES = ["Inalterado", "Melhora parcial", "Melhora", "Piora", "Outro"];

export function returnAssessmentBody(form, previous = null) {
  return `
    ${singleChoiceWithNotes("evolucaoClinicaRetorno", "Evolucao clinica", EVOLUCAO_OPCOES, form.evolucaoClinicaRetorno, form)}
    ${singleChoiceWithNotes("adesao", "Adesao ao tratamento", ["Adequada", "Parcial ou irregular", "Não iniciou ou interrompeu"], form.adesao)}
    ${chips("efeitos", "Efeitos colaterais", ["Nenhum", "Sedacao ou sonolencia", "Sintomas gastrointestinais", "Alteracao de peso ou metabolica", "Efeitos motores", "Disfuncao sexual", "Outro"], form.efeitos, form)}
    ${chips("funcionalidadeEventosRetorno", "Funcionalidade e eventos relevantes", ["Nenhum", "Prejuizo funcional", "Conflito, estressor ou luto", "Urgencia ou internacao", "Outro"], form.funcionalidadeEventosRetorno, form)}
    ${previousCaseBlocks(form, previous)}
  `;
}

// Uma linha por item do atendimento anterior, com o rotulo viajando num campo
// oculto. Sem ele, a resposta ficaria gravada como "retornoHipotese_0 =
// Remissao parcial" e o prontuario nao saberia dizer remissao parcial DE QUE --
// a lista muda de um atendimento para o outro, e o indice sozinho nao e
// ancora nenhuma.
function previousCaseRow(prefix, index, rotulo, opcoes, form) {
  const name = `${prefix}_${index}`;
  const selecionado = arrayValue(form[name])[0] || "";
  return `<article class="return-case-item">
    <strong>${escapeHtml(rotulo)}</strong>
    <input type="hidden" name="${name}Rotulo" value="${escapeAttr(rotulo)}" />
    <div class="chips">${opcoes.map(opcao => opcao === "Outro"
      ? radioOther(name, opcao, form[`${name}Outro`] || "", selecionado === opcao)
      : `<label class="chip"><input type="radio" name="${name}" value="${escapeAttr(opcao)}" ${selecionado === opcao ? "checked" : ""}>${escapeHtml(opcao)}</label>`
    ).join("")}</div>
  </article>`;
}

// "Outro" sem onde escrever nao e opcao, e uma pergunta sem resposta. Mesmo
// arranjo dos chips de multipla escolha: o campo mora ao lado e so aparece com
// a opcao marcada.
function radioOther(name, opcao, valor = "", marcado = false) {
  return `<div class="chip-other">
    <label class="chip"><input type="radio" name="${name}" value="${escapeAttr(opcao)}" ${marcado ? "checked" : ""}>${escapeHtml(opcao)}</label>
    <input class="chip-note" type="text" name="${name}Outro" value="${escapeAttr(valor)}" placeholder="Descreva" aria-label="Descreva o outro" />
  </div>`;
}

// AS HIPOTESES QUE EVOLUEM, e nao todas as que ele assinalou.
//
// A camada etiologica fica de fora. "Vulnerabilidade genetica para transtornos
// do humor" chegou ao retorno pedindo melhora, piora ou inalterado -- e ela nao
// e nenhuma das tres: nao evolui, nao muda, e nao ha o que responder ali. As
// tres camadas respondem a perguntas diferentes, e so duas delas respondem "como
// esta hoje": a nosologica diz QUAL entidade, a sindromica QUAL agrupamento --
// as duas descrevem o quadro, e quadro melhora ou piora. A etiologica diz POR
// QUE, e uma causa nao remite entre uma consulta e outra.
//
// O casamento e pelo nome da entidade porque a linha guardada carrega os codigos
// e a etiologica declarada guarda a mesma entidade com outra formatacao.
export function returnHypothesisLabels(previous = {}) {
  const etiologicas = new Set(diagnosticEtiologicalOptionLines(previous)
    .map(linha => normalizeText(entityName(linha))));
  return arrayValue(previous.diagnosticoSelecionado)
    .filter(item => !etiologicas.has(normalizeText(entityName(item))));
}

// Nada em branco sai da Evolucao, decisao dele em 02/09/2026: "garanta que eu
// nao saia da pagina, exceto tudo marcado".
//
// Nao e rigor de formulario, e o que a pagina seguinte precisa. O Ajuste de
// conduta deduz o estado de cada hipotese e o destino de cada farmaco a partir
// DAQUI; campo em branco vira lacuna que a IA preenche por conta, e proposta
// construida sobre buraco parece igual a proposta construida sobre dado.
//
// A lista de perguntas nasce da mesma fonte que desenha a tela -- os blocos do
// caso vem do atendimento anterior e mudam a cada retorno, entao uma lista fixa
// de campos obrigatorios estaria errada no primeiro paciente com quatro
// hipoteses.
export function missingReturnAssessment(form = {}, previous = null) {
  const respondido = campo => arrayValue(form[campo]).filter(Boolean).length > 0;
  const semNota = campo => arrayValue(form[campo]).includes("Outro")
    && !String(form[`${campo}Outro`] || "").trim();
  const faltando = [];
  const exige = (campo, rotulo) => {
    if (!respondido(campo)) faltando.push(rotulo);
    else if (semNota(campo)) faltando.push(`${rotulo} — descreva o "Outro"`);
  };
  exige("evolucaoClinicaRetorno", "Evolução clínica");
  exige("adesao", "Adesão ao tratamento");
  exige("efeitos", "Efeitos colaterais");
  exige("funcionalidadeEventosRetorno", "Funcionalidade e eventos relevantes");
  if (!previous) return faltando;
  const linhas = [
    ["retornoHipotese", returnHypothesisLabels(previous)],
    ["retornoCriterio", pendingCriteriaFromPrevious(previous)],
    ["retornoFarmaco", arrayValue(previous.tratamentoMedicamentosSelecionados)],
    ["retornoAlvo", arrayValue(previous.sintomasAlvoSelecionados)],
    ["retornoAchado", analysisFindingsForReturn(previous)],
    ["retornoPendencia", pendingRefinementForReturn(previous)]
  ];
  linhas.forEach(([prefixo, itens]) => itens.forEach((rotulo, index) => exige(`${prefixo}_${index}`, rotulo)));
  return faltando;
}

function previousCaseSection(titulo, ajuda, itens) {
  if (!itens.length) return "";
  return `<section class="return-case-section">
    <h4>${escapeHtml(titulo)}</h4>
    <p class="field-hint">${escapeHtml(ajuda)}</p>
    ${itens.join("")}
  </section>`;
}

function previousCaseBlocks(form, previous) {
  if (!previous) return "";
  const hipoteses = returnHypothesisLabels(previous);
  const farmacos = arrayValue(previous.tratamentoMedicamentosSelecionados);
  const alvos = arrayValue(previous.sintomasAlvoSelecionados);
  // O retorno do investimento dos criterios: o que ficou "nao avaliavel" no
  // atendimento anterior e, literalmente, a lista do que perguntar hoje. Antes
  // essa duvida morria na tela do diagnostico.
  const pendentes = pendingCriteriaFromPrevious(previous);
  const achados = analysisFindingsForReturn(previous);
  const pendenciasRefino = pendingRefinementForReturn(previous);
  const blocos = [
    previousCaseSection("Hipóteses do atendimento anterior",
      "Como está cada hipótese que você assinalou da última vez.",
      hipoteses.map((item, index) => previousCaseRow("retornoHipotese", index, item,
        EVOLUCAO_OPCOES, form))),
    previousCaseSection("Critérios que ficaram sem poder avaliar",
      "Ficaram pendentes na última avaliação. São o que investigar hoje.",
      pendentes.map((item, index) => previousCaseRow("retornoCriterio", index, item,
        ["Confirmado", "Descartado", "Ainda não avaliado"], form))),
    previousCaseSection("Medicamentos prescritos",
      "Um por linha, como foi assinalado no tratamento anterior.",
      farmacos.map((item, index) => previousCaseRow("retornoFarmaco", index, item,
        ["Em uso como prescrito", "Em uso com dose alterada", "Interrompeu", "Nunca iniciou"], form))),
    previousCaseSection("Sintomas-alvo",
      "O manejo imediato que você levou para o tratamento.",
      alvos.map((item, index) => previousCaseRow("retornoAlvo", index, item,
        EVOLUCAO_OPCOES, form))),
    previousCaseSection("Achados psicopatológicos",
      "Da análise da consulta anterior, o que ainda não tem linha acima. É o seguimento do sintoma ao longo do tempo.",
      achados.map((item, index) => previousCaseRow("retornoAchado", index, item,
        EVOLUCAO_OPCOES, form))),
    previousCaseSection("Ficou sem esclarecer no refinamento",
      "Perguntas, red flags e pontos que o refinamento deixou em aberto. São o que investigar hoje.",
      pendenciasRefino.map((item, index) => previousCaseRow("retornoPendencia", index, item,
        ["Confirmado", "Descartado", "Ainda não avaliado"], form)))
  ].filter(Boolean);
  if (!blocos.length) return "";
  return `<div class="return-case-blocks">${blocos.join("")}</div>`;
}

// No primeiro retorno o "anterior" e a propria consulta e as pendencias saem
// dela; nos seguintes vem ja filtradas pela cadeia (caseViewForReturn), sem as
// que um retorno confirmou ou descartou.
function pendingRefinementForReturn(previous = {}) {
  return Array.isArray(previous.pendenciasRefino) ? previous.pendenciasRefino : pendingRefinementItems(previous);
}

// Le as linhas de criterio gravadas pelo diagnostico e devolve so os que
// ficaram sem poder avaliar, com a pendencia que a IA apontou. Formato:
// hipotese ::: criterio ::: status ::: evidencia.
export function pendingCriteriaFromPrevious(previous = {}) {
  return String(previous.diagnosticoAiCriterios || "").split("\n")
    .map(linha => linha.split(CRITERION_SEPARATOR).map(parte => parte.trim()))
    .filter(partes => partes.length === 4 && partes.every(Boolean) && partes[2] === "nao avaliavel")
    .map(([, criterio, , pendencia]) => `${criterio} — falta: ${pendencia}`);
}

export function mentalExamBody(form) {
  const groups = [
    ["aparencia", "Aparencia, Atitude e Contato"],
    // consciencia estava fora desta lista: era lida no resumo, na evolucao e no
    // diagnostico, mas nao tinha controle na tela e chegava sempre vazia.
    ["consciencia", "Consciencia/Orientacao"],
    ["atencao", "Atencao/Vigilancia"],
    ["memoria", "Memoria"], ["sensopercepcao", "Sensopercepcao"],
    ["pensamentoCursoForma", "Pensamento (Curso e Forma)"], ["pensamentoConteudo", "Pensamento (Conteudo)"],
    ["linguagem", "Linguagem"], ["humor", "Humor (Estado Basal)"], ["afeto", "Afeto (Resposta)"],
    ["psicomotricidade", "Psicomotricidade"], ["vontade", "Vontade"], ["juizoCritico", "Juizo Critico (Insight)"]
  ];
  return `
    <div class="actions">
      <button class="secondary" type="button" data-action="mental-exam-normal">Marcar "sem alteração" nos domínios em branco</button>
    </div>
    <p class="field-hint">Domínio em branco consta como não registrado no resumo e fica fora da história clínica.</p>
    ${groups.map(([key, label]) => chips(key, label, optionGroups[key], form[key], form)).join("")}
  `;
}

// O que o botao "sem alteracao" marca: a normalidade de cada dominio que esta
// em branco. Dominio com achado -- marcado ou escrito no "Outro" -- fica como
// esta: o botao nunca troca achado por normalidade.
export function mentalExamNormalFill(form = {}) {
  const preenchido = {};
  MENTAL_EXAM_KEYS.forEach(key => {
    const temAchado = arrayValue(form[key]).filter(Boolean).length > 0 || String(form[`${key}Outro`] || "").trim();
    if (!temAchado) preenchido[key] = [...(MENTAL_EXAM_NORMAL_OPTIONS[key] || [])];
  });
  return preenchido;
}

export function neurologicExamBody(form) {
  return `
    ${textarea("fisico", "Achados fisicos e neurologicos relevantes", form.fisico)}
  `;
}
