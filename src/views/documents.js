import { DOCUMENT_TYPES, REFERRAL_DESTINATIONS, SCHOOL_RECOMMENDATIONS, documentField, documentType, shortBrDate, todayIso } from "../clinical/documents.js";
import { arrayValue } from "../clinical/textFormat.js";
import { field, selectField, textarea } from "../ui/controls.js";
import { escapeAttr, escapeHtml } from "../ui/html.js";

// Apendice Documentos, desde 10/09/2026. Escolhe-se o tipo, preenchem-se os
// poucos campos que o prontuario nao sabe (dias, horario, destino), e o texto
// aparece montado logo abaixo, editavel. "Exportar PDF" gera o arquivo e anota
// no atendimento o que foi emitido.
export function documentsBody(form = {}, { doctor = {}, textoGerado = "", isReturn = false } = {}) {
  const tipo = documentType(arrayValue(form.documento_tipo)[0]).id;
  const valor = nome => String(arrayValue(form[documentField(nome)])[0] ?? "");
  const tipos = DOCUMENT_TYPES.map(item => `
    <label class="chip"><input type="radio" name="documento_tipo" value="${escapeAttr(item.id)}" ${item.id === tipo ? "checked" : ""}>${escapeHtml(item.rotulo)}</label>`).join("");
  // A declaracao de comparecimento nunca traz diagnostico: nao ha o que
  // autorizar, e a caixa nao aparece.
  const consentimento = tipo === "comparecimento" ? "" : `
    <label class="chip document-consent"><input type="checkbox" name="documento_autorizaCid" value="sim" ${valor("autorizaCid") === "sim" ? "checked" : ""}>O(a) paciente autorizou incluir o diagnóstico (CID)</label>`;
  const emitidos = Array.isArray(form.documentosEmitidos) ? form.documentosEmitidos : [];
  return `
    <div class="clinical-card document-picker">
      <h4>Tipo de documento</h4>
      <div class="chips">${tipos}</div>
      <div class="document-fields">${documentFields(tipo, valor, form)}</div>
      ${consentimento}
      ${tipo === "escolar" ? `<p class="field-hint">Para pedir atendimento especializado no ENEM, o edital costuma exigir o diagnóstico com CID no laudo: nesse caso, marque a autorização acima.</p>` : ""}
    </div>
    <div class="clinical-card document-editor">
      <h4>${escapeHtml(documentType(tipo).titulo)}</h4>
      <p class="field-hint">Montado a partir do prontuário. Edite à vontade antes de exportar; o que estiver entre colchetes precisa ser completado.</p>
      ${textarea("documento_texto", "", form.documento_texto || textoGerado, "", 16)}
      <div class="actions">
        <button class="secondary" type="button" data-action="generate-document">Montar de novo a partir do prontuário</button>
        <button class="primary" type="button" data-action="export-document">Exportar PDF</button>
      </div>
      ${form.documento_status ? `<p class="medication-source-status">${escapeHtml(form.documento_status)}</p>` : ""}
    </div>
    ${emitidos.length ? `<div class="clinical-card documents-issued">
      <h4>Emitidos neste atendimento</h4>
      <ul>${emitidos.map((item, indice) => `
        <li>
          <span>${escapeHtml(shortBrDate(item.emitidoEm))} · ${escapeHtml(item.titulo || "")}${item.resumo && item.resumo.toLowerCase() !== String(item.titulo || "").toLowerCase() ? ` — ${escapeHtml(item.resumo)}` : ""}</span>
          <button class="secondary inline-action" type="button" data-action="reexport-document" data-indice="${indice}">Exportar de novo</button>
        </li>`).join("")}</ul>
      <p class="field-hint">${isReturn
        ? "A lista entra no retorno quando você salvar, no Ajuste de conduta."
        : "A lista entra na consulta quando você salvar."}</p>
    </div>` : ""}
    ${doctorCard(form, doctor)}
  `;
}

function documentFields(tipo, valor, form) {
  if (tipo === "atestado") {
    return `
      ${field(documentField("dias"), "Dias de afastamento (0 = só comparecimento)", valor("dias"), "number")}
      ${field(documentField("inicio"), "A partir de", valor("inicio") || todayIso(), "date")}
      ${selectField(documentField("finalidade"), "Atividades", ["trabalho", "escola"], valor("finalidade") || "trabalho")}`;
  }
  if (tipo === "comparecimento") {
    return `
      ${field(documentField("inicio"), "Data", valor("inicio") || todayIso(), "date")}
      ${field(documentField("horaInicio"), "Das", valor("horaInicio"), "time")}
      ${field(documentField("horaFim"), "Às", valor("horaFim"), "time")}
      ${field(documentField("acompanhante"), "Acompanhante (opcional)", valor("acompanhante"))}`;
  }
  if (tipo === "relatorio") {
    return field(documentField("destinatario"), "Destinatário (médico do trabalho, INSS, escola…)", valor("destinatario"));
  }
  if (tipo === "escolar") {
    const marcadas = new Set(arrayValue(form[documentField("recomendacoes")]));
    return `<div class="document-recommendations"><label>Recomendações</label><div class="chips">${SCHOOL_RECOMMENDATIONS.map(item => `
      <label class="chip"><input type="checkbox" name="${documentField("recomendacoes")}" value="${escapeAttr(item)}" ${marcadas.has(item) ? "checked" : ""}>${escapeHtml(item)}</label>`).join("")}</div></div>`;
  }
  return `
    ${selectField(documentField("destino"), "Encaminhar para", REFERRAL_DESTINATIONS, valor("destino"))}
    ${valor("destino") === "Outro" ? field(documentField("destinoOutro"), "Qual serviço ou especialidade", valor("destinoOutro")) : ""}
    ${textarea(documentField("motivo"), "Motivo do encaminhamento", valor("motivo"), "", 2)}
    ${textarea(documentField("pergunta"), "O que você pede ao serviço (opcional)", valor("pergunta"), "", 2)}`;
}

// Os dados de assinatura sao do medico, e nao do paciente: ficam guardados a
// parte (state.doctor) e voltam preenchidos em todo documento. O cartao abre
// sozinho enquanto faltar o CRM.
function doctorCard(form, doctor) {
  const valor = chave => String(form[`medico_${chave}`] ?? doctor[chave] ?? "");
  return `<details class="clinical-card doctor-card" ${doctor.crm ? "" : "open"}>
    <summary><strong>Dados do médico para a assinatura</strong>${doctor.crm ? ` · ${escapeHtml(doctor.nome || "")} · CRM ${escapeHtml(doctor.crm)}` : ""}</summary>
    <div class="document-fields">
      ${field("medico_nome", "Nome", valor("nome"))}
      ${field("medico_crm", "CRM (número)", valor("crm"))}
      ${field("medico_uf", "UF do CRM", valor("uf"))}
      ${field("medico_rqe", "RQE (opcional)", valor("rqe"))}
      ${field("medico_cidade", "Cidade (para a data)", valor("cidade"))}
    </div>
    <div class="actions"><button class="secondary" type="button" data-action="save-doctor">Salvar dados do médico</button></div>
  </details>`;
}
