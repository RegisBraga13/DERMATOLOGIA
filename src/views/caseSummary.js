import { caseIndices, curtaData, medicationEventsText, medicationHistory } from "../clinical/caseTimeline.js";
import { escapeHtml } from "../ui/html.js";

// Topo do prontuario longitudinal (leva 4): o caso em numeros e os
// medicamentos do caso inteiro, antes da pilha de atendimentos. Sem
// atendimento salvo, nao aparece.
export function caseSummaryView(entries = [], agora = Date.now()) {
  const indices = caseIndices(entries, agora);
  if (!indices) return "";
  const farmacos = medicationHistory(entries);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  return `<section class="case-summary">
    <h3>Resumo do caso</h3>
    <dl class="case-indices">
      <div><dt>Em acompanhamento desde</dt><dd>${escapeHtml(curtaData(indices.inicio))} · ${escapeHtml(indices.tempoAcompanhamento)}</dd></div>
      <div><dt>Atendimentos</dt><dd>${plural(indices.consultas, "consulta", "consultas")} · ${plural(indices.retornos, "retorno", "retornos")}</dd></div>
      <div><dt>Último atendimento</dt><dd>${escapeHtml(curtaData(indices.ultimoAtendimento))}${indices.desdeUltimo === "hoje" ? " · hoje" : ` · há ${escapeHtml(indices.desdeUltimo)}`}</dd></div>
      <div><dt>Em uso</dt><dd>${indices.emUso.length ? escapeHtml(indices.emUso.join(", ")) : "nenhum medicamento registrado"}</dd></div>
    </dl>
    ${indices.hipoteses.length ? `<p class="case-hypotheses"><b>Hipóteses da última consulta:</b> ${escapeHtml(indices.hipoteses.join("; "))}</p>` : ""}
    ${farmacos.length ? `<h4>Medicamentos ao longo do caso</h4>
    <div class="summary-table-wrap"><table class="summary-table case-medications">
      <thead><tr><th>Medicamento</th><th>Situação</th><th>Início</th><th>Histórico</th></tr></thead>
      <tbody>${farmacos.map(item => `<tr class="${item.situacao === "em uso" ? "med-active" : "med-stopped"}">
        <td>${escapeHtml(item.nome)}</td>
        <td>${escapeHtml(item.situacao || "")}</td>
        <td>${escapeHtml(curtaData(item.inicio))}</td>
        <td>${escapeHtml(medicationEventsText(item))}</td>
      </tr>`).join("")}</tbody>
    </table></div>` : ""}
  </section>`;
}
