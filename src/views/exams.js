import { optionGroups } from "../data/examOptions.js?v=tratamento-3";
import { chips, singleChoiceWithNotes, textarea } from "../ui/controls.js";
import { escapeHtml } from "../ui/html.js";

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

export function returnAssessmentBody(form) {
  return `
    ${singleChoiceWithNotes("evolucaoClinicaRetorno", "Evolucao clinica", ["Melhora clínica", "Estabilidade clínica", "Piora clínica", "Novos sintomas"], form.evolucaoClinicaRetorno)}
    ${singleChoiceWithNotes("sonoRetorno", "Sono", ["Adequado e reparador", "Insônia", "Hipersonia", "Redução da necessidade de sono"], form.sonoRetorno)}
    ${singleChoiceWithNotes("humorAnsiedadeRetorno", "Humor e ansiedade", ["Eutímico", "Deprimido", "Ansioso", "Irritável", "Elevado ou oscilante", "Crise de pânico"], form.humorAnsiedadeRetorno)}
    ${singleChoiceWithNotes("adesao", "Adesao ao tratamento", ["Adequada", "Parcial ou irregular", "Não iniciou ou interrompeu"], form.adesao)}
    ${chips("efeitos", "Efeitos colaterais", ["Nenhum", "Sedacao ou sonolencia", "Sintomas gastrointestinais", "Alteracao de peso ou metabolica", "Efeitos motores", "Disfuncao sexual", "Outro"], form.efeitos)}
    ${chips("funcionalidadeEventosRetorno", "Funcionalidade e eventos relevantes", ["Nenhum", "Prejuizo funcional", "Conflito, estressor ou luto", "Urgencia ou internacao", "Risco ou autoagressao", "Outro"], form.funcionalidadeEventosRetorno)}
    ${chips("condutaMedicamentoRetorno", "Medicamento", ["Manter dose", "Aumentar dose", "Diminuir dose", "Retirar", "Trocar medicamento", "Acrescentar medicamento", "Outro"], form.condutaMedicamentoRetorno)}
  `;
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
    ${chips(key, label, optionGroups[key], form[key])}
  `).join("");
}

export function neurologicExamBody(form) {
  return `
    ${textarea("fisico", "Achados fisicos e neurologicos relevantes", form.fisico)}
  `;
}
