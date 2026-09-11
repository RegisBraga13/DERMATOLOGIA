import { appliedScales, deniesSuicidalIdeation, formatScore, optionsFor, previousScaleResult, scaleAnswers, scaleChangeText, scaleFieldName, scaleResult, scoreScale } from "../clinical/scoring.js";
import { arrayValue } from "../clinical/textFormat.js";
import { SCALE_DOMAINS, scales } from "../data/scales.js";
import { escapeAttr, escapeHtml } from "../ui/html.js";

// Apendice, como Medicamentos: a mao em qualquer ponto do atendimento, e fora
// da sequencia de "Salvar e avancar". O que se escolhe aqui volta ao registro
// pelo rascunho, como qualquer outro campo.
//
// `sugestoes` vem de clinical/scaleSuggestions.js: a escala sugerida ganha
// destaque no catalogo e o motivo aparece por extenso, mas ninguem marca por
// ele.
export function scalesBody(form = {}, history = [], isReturn = false, sugestoes = []) {
  const marcadas = new Set(arrayValue(form.escalasAplicadas));
  const sugeridas = new Map(sugestoes.map(sugestao => [sugestao.id, sugestao.motivos]));
  const catalogo = SCALE_DOMAINS.map(dominio => {
    const doDominio = scales.filter(scale => scale.dominio === dominio);
    return `<div class="scale-domain">
      <span>${escapeHtml(dominio)}</span>
      <div class="chips">${doDominio.map(scale => {
        const motivos = sugeridas.get(scale.id);
        return `
        <label class="chip${motivos ? " scale-suggested" : ""}" title="${escapeAttr(motivos ? `${scale.nome}. Sugerida: ${motivos.join("; ")}` : scale.nome)}">
          <input type="checkbox" name="escalasAplicadas" value="${escapeAttr(scale.id)}" ${marcadas.has(scale.id) ? "checked" : ""}>${escapeHtml(scale.sigla)}
        </label>`;
      }).join("")}</div>
    </div>`;
  }).join("");
  const cartoes = appliedScales(form).map(scale => scaleCard(scale, form, history)).join("");
  return `
    <div class="clinical-card scale-picker">
      <h4>Escolha as escalas</h4>
      <p class="field-hint">${isReturn
        ? "O resultado entra no retorno quando você salvar, no Ajuste de conduta."
        : "O resultado entra na consulta quando você salvar."} Cada escala marcada abre logo abaixo.</p>
      ${sugestoes.length ? `<div class="scale-suggestions">
        <b>Sugeridas para este caso</b>
        <ul>${sugestoes.map(sugestao => `<li><strong>${escapeHtml(sugestao.sigla)}</strong>: ${escapeHtml(sugestao.motivos.join("; "))}</li>`).join("")}</ul>
      </div>` : ""}
      <div class="scale-catalogue">${catalogo}</div>
    </div>
    ${cartoes || `<p class="diagnosis-empty">Nenhuma escala escolhida.</p>`}
  `;
}

function scaleCard(scale, form, history) {
  const respostas = scaleAnswers(scale, form);
  const meta = [scale.aplicacao, scale.periodo, scale.populacao].filter(Boolean).join(" · ");
  return `<article class="scale-card" id="escala-${escapeAttr(scale.id)}">
    <header class="scale-card-head">
      <div>
        <h4>${escapeHtml(scale.sigla)} <span>${escapeHtml(scale.nome)}</span></h4>
        <p class="scale-meta">${escapeHtml(meta)}</p>
      </div>
      <button class="secondary inline-action" type="button" data-action="clear-scale" data-escala="${escapeAttr(scale.id)}">Limpar respostas</button>
    </header>
    ${scale.instrucao ? `<p class="scale-instruction">${escapeHtml(scale.instrucao)}</p>` : ""}
    <ol class="scale-items">${scale.itens.map((item, index) => scaleItem(scale, item, index, respostas)).join("")}</ol>
    ${scaleResultView(scale, form, history)}
    <p class="scale-reference">${escapeHtml(scale.referencia)}</p>
  </article>`;
}

function scaleItem(scale, item, index, respostas) {
  const nome = scaleFieldName(scale, index);
  return `<li class="scale-item${item.fora ? " scale-item-unscored" : ""}">
    <p>${escapeHtml(item.texto)}${item.condicao ? ` <span class="scale-condition">${escapeHtml(item.condicao)}</span>` : ""}</p>
    <div class="chips scale-options">${optionsFor(scale, item).map(opcao => `
      <label class="chip"><input type="radio" name="${nome}" value="${opcao.valor}" data-escala="${escapeAttr(scale.id)}" ${respostas[index] === opcao.valor ? "checked" : ""}>${escapeHtml(opcao.rotulo)}</label>`).join("")}
    </div>
  </li>`;
}

// Redesenhada sozinha a cada resposta (ver refreshScaleResult no App): trocar
// a pagina inteira a cada clique jogaria a rolagem para longe do item.
export function scaleResultView(scale, form = {}, history = []) {
  const result = scoreScale(scale, scaleAnswers(scale, form));
  const anterior = previousScaleResult(scale, history);
  const alertas = result.alertas.map(alerta => `<p class="scale-alert" role="alert">${escapeHtml(alerta.texto)}</p>`).join("");
  const conflito = result.alertas.some(alerta => alerta.tipo === "suicidio") && deniesSuicidalIdeation(form)
    ? `<p class="scale-alert scale-alert-conflict">A anamnese registra que o paciente nega ideação suicida, e esta escala veio positiva. Vale retomar a pergunta na consulta.</p>`
    : "";
  const faltam = result.faltando.length;
  const corpo = !result.respondidas
    ? `<p class="scale-pending">Sem respostas ainda.</p>`
    : !result.completa
      ? `<p class="scale-pending">${faltam === 1 ? "Falta 1 resposta" : `Faltam ${faltam} respostas`} para o resultado.</p>`
      : `<div class="scale-score nivel-${result.faixa?.nivel ?? 0}">
          ${scale.semTotal ? "" : `<strong>${formatScore(result.total)}</strong><span>de ${result.max}</span>`}
          <b>${escapeHtml(result.faixa?.rotulo || "")}</b>
        </div>
        ${result.faixa?.descricao ? `<p class="scale-band-note">${escapeHtml(result.faixa.descricao)}</p>` : ""}
        ${result.subescalas.length ? `<p class="scale-subscales">${result.subescalas.map(sub => `${escapeHtml(sub.nome)}: <b>${sub.total}</b>${sub.faixa ? ` (${escapeHtml(sub.faixa.rotulo.toLowerCase())})` : ""}`).join(" · ")}</p>` : ""}`;
  const mudanca = anterior ? `<p class="scale-change">${escapeHtml(scaleChangeText(scale, result, anterior))}</p>` : "";
  return `<div class="scale-result" id="resultado-${escapeAttr(scale.id)}" aria-live="polite">
    ${alertas}${conflito}${corpo}${mudanca}
    ${scale.observacao ? `<p class="field-hint">${escapeHtml(scale.observacao)}</p>` : ""}
  </div>`;
}

// A evolucao de cada escala no prontuario, desde 10/09/2026. O retorno compara
// so com o atendimento anterior; aqui aparece o caso inteiro, de modo que uma
// PHQ-9 que desce, sobe e desce de novo nao se esconde atras da ultima
// comparacao. Entra a escala com pelo menos duas aplicacoes completas.
export function scaleTrendsView(entries = []) {
  const ordem = [...entries].sort((a, b) => (Date.parse(a.createdAt || "") || 0) - (Date.parse(b.createdAt || "") || 0));
  const series = scales.map(scale => ({
    scale,
    pontos: ordem.flatMap(entry => {
      if (!arrayValue(entry.escalasAplicadas).includes(scale.id)) return [];
      const result = scaleResult(scale, entry);
      return result.completa
        ? [{ quando: entry.createdAt, registro: entry.label || "", total: result.total, max: result.max, faixa: result.faixa?.rotulo || "" }]
        : [];
    })
  })).filter(serie => serie.pontos.length >= 2);
  if (!series.length) return "";
  return `<section class="scale-trends">
    <h3>Evolução das escalas</h3>
    <div class="scale-trend-grid">${series.map(trendView).join("")}</div>
  </section>`;
}

function shortDate(value) {
  const data = new Date(value || "");
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function trendView({ scale, pontos }) {
  const ultimo = pontos[pontos.length - 1];
  const legenda = `${pontos.map(ponto => scale.semTotal && !scale.id.startsWith("cgi") ? ponto.faixa : formatScore(ponto.total)).join(" → ")}`;
  // ASQ e C-SSRS nao tem numero que se possa pôr em eixo: a classificacao e a
  // informacao. Viram lista, na ordem do tempo.
  if (scale.semTotal && !scale.id.startsWith("cgi")) {
    return `<article class="scale-trend">
      <h4>${escapeHtml(scale.sigla)}</h4>
      <ol class="scale-trend-list">${pontos.map(ponto => `<li><span>${escapeHtml(shortDate(ponto.quando))}</span>${escapeHtml(ponto.faixa)}</li>`).join("")}</ol>
    </article>`;
  }
  const L = 30, R = 12, T = 18, B = 26, W = 320, H = 150;
  const minimo = scale.id.startsWith("cgi") ? 1 : 0;
  const maximo = ultimo.max || 1;
  const tempos = pontos.map(ponto => Date.parse(ponto.quando || "") || 0);
  const inicio = Math.min(...tempos);
  const fim = Math.max(...tempos);
  const x = (tempo, indice) => fim > inicio
    ? L + ((tempo - inicio) / (fim - inicio)) * (W - L - R)
    : L + (indice / Math.max(pontos.length - 1, 1)) * (W - L - R);
  const y = valor => T + (1 - (valor - minimo) / Math.max(maximo - minimo, 1)) * (H - T - B);
  const coordenadas = pontos.map((ponto, indice) => [x(tempos[indice], indice), y(ponto.total)]);
  // Linhas de corte das faixas: onde a escala muda de nome. Sem rotulo, para
  // nao disputar espaco com os valores; o nome da faixa atual vai na legenda.
  const cortes = scale.classificar ? [] : (scale.faixas || [])
    .map(faixa => faixa.min)
    .filter(valor => valor > minimo && valor <= maximo);
  const mostrarData = indice => pontos.length <= 6 || indice === 0 || indice === pontos.length - 1;
  return `<article class="scale-trend">
    <h4>${escapeHtml(scale.sigla)} <span>${escapeHtml(legenda)}</span></h4>
    <svg class="scale-trend-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeAttr(`${scale.sigla} ao longo dos atendimentos: ${legenda}`)}">
      <line class="trend-axis" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"></line>
      <line class="trend-axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"></line>
      ${cortes.map(valor => `<line class="trend-cut" x1="${L}" y1="${y(valor)}" x2="${W - R}" y2="${y(valor)}"><title>${escapeHtml(`Mudança de faixa em ${valor}`)}</title></line>`).join("")}
      <text class="trend-tick" x="${L - 6}" y="${y(maximo) + 4}" text-anchor="end">${maximo}</text>
      <text class="trend-tick" x="${L - 6}" y="${y(minimo) + 4}" text-anchor="end">${minimo}</text>
      <polyline class="trend-line" points="${coordenadas.map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`).join(" ")}"></polyline>
      ${coordenadas.map(([cx, cy], indice) => `
        <circle class="trend-dot${indice === coordenadas.length - 1 ? " trend-dot-last" : ""}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${indice === coordenadas.length - 1 ? 4.5 : 3.5}"><title>${escapeHtml(`${pontos[indice].registro} · ${shortDate(pontos[indice].quando)}: ${formatScore(pontos[indice].total)} (${pontos[indice].faixa})`)}</title></circle>
        <text class="trend-value" x="${cx.toFixed(1)}" y="${Math.max(cy - 8, 11).toFixed(1)}" text-anchor="middle">${formatScore(pontos[indice].total)}</text>
        ${mostrarData(indice) ? `<text class="trend-tick" x="${cx.toFixed(1)}" y="${H - B + 16}" text-anchor="${indice === 0 && pontos.length > 1 ? "start" : indice === coordenadas.length - 1 && pontos.length > 1 ? "end" : "middle"}">${escapeHtml(shortDate(pontos[indice].quando))}</text>` : ""}`).join("")}
    </svg>
    <p class="scale-trend-caption">Última: ${escapeHtml(ultimo.faixa)}</p>
  </article>`;
}
