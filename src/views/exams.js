import { CRITERION_SEPARATOR } from "../clinical/aiDiagnosisResult.js";
import { arrayValue } from "../clinical/textFormat.js";
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
export function returnAssessmentBody(form, previous = null) {
  return `
    ${singleChoiceWithNotes("evolucaoClinicaRetorno", "Evolucao clinica", ["Melhora clínica", "Estabilidade clínica", "Piora clínica", "Novos sintomas"], form.evolucaoClinicaRetorno)}
    ${singleChoiceWithNotes("adesao", "Adesao ao tratamento", ["Adequada", "Parcial ou irregular", "Não iniciou ou interrompeu"], form.adesao)}
    ${chips("efeitos", "Efeitos colaterais", ["Nenhum", "Sedacao ou sonolencia", "Sintomas gastrointestinais", "Alteracao de peso ou metabolica", "Efeitos motores", "Disfuncao sexual", "Outro"], form.efeitos, form)}
    ${chips("funcionalidadeEventosRetorno", "Funcionalidade e eventos relevantes", ["Nenhum", "Prejuizo funcional", "Conflito, estressor ou luto", "Urgencia ou internacao", "Risco ou autoagressao", "Outro"], form.funcionalidadeEventosRetorno, form)}
    ${chips("condutaMedicamentoRetorno", "Medicamento", ["Manter dose", "Aumentar dose", "Diminuir dose", "Retirar", "Trocar medicamento", "Acrescentar medicamento", "Outro"], form.condutaMedicamentoRetorno, form)}
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
    <div class="chips">${opcoes.map(opcao => `
      <label class="chip"><input type="radio" name="${name}" value="${escapeAttr(opcao)}" ${selecionado === opcao ? "checked" : ""}>${escapeHtml(opcao)}</label>
    `).join("")}</div>
  </article>`;
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
  const hipoteses = arrayValue(previous.diagnosticoSelecionado);
  const farmacos = arrayValue(previous.tratamentoMedicamentosSelecionados);
  const alvos = arrayValue(previous.sintomasAlvoSelecionados);
  // O retorno do investimento dos criterios: o que ficou "nao avaliavel" no
  // atendimento anterior e, literalmente, a lista do que perguntar hoje. Antes
  // essa duvida morria na tela do diagnostico.
  const pendentes = pendingCriteriaFromPrevious(previous);
  const blocos = [
    previousCaseSection("Hipóteses do atendimento anterior",
      "Como está cada hipótese que você assinalou da última vez.",
      hipoteses.map((item, index) => previousCaseRow("retornoHipotese", index, item,
        ["Remissão", "Remissão parcial", "Mantida", "Piora", "Descartada", "Não avaliada"], form))),
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
        ["Resolvido", "Melhorou", "Igual", "Piorou"], form)))
  ].filter(Boolean);
  if (!blocos.length) return "";
  return `<div class="return-case-blocks">${blocos.join("")}</div>`;
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
  return groups.map(([key, label]) => `
    ${chips(key, label, optionGroups[key], form[key], form)}
  `).join("");
}

export function neurologicExamBody(form) {
  return `
    ${textarea("fisico", "Achados fisicos e neurologicos relevantes", form.fisico)}
  `;
}
