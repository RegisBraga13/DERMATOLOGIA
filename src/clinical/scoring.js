import { scaleById, scales } from "../data/scales.js";
import { arrayValue, lowerFirst, stripFinalPeriod } from "./textFormat.js";

// Motor das escalas: o que se aplicou, quanto deu, o que isso significa e o que
// mudou desde a ultima aplicacao. Funcoes puras -- a tela, o texto do
// prontuario, o resumo e o prompt da IA leem todos daqui, entao o mesmo PHQ-9
// nao tem como sair com um numero numa pagina e outro no PDF.

const CAMPO_ESCALA = /^escala_([a-z0-9-]+)_\d+$/;

// A resposta mora no rascunho como um campo por item, igual ao resto do
// formulario. Nome com o id da escala, e nao com a sigla: "cgi-s" nao muda se
// um dia a sigla na tela mudar.
export function scaleFieldName(scale, index) {
  return `escala_${scale.id}_${index}`;
}

export function appliedScales(form = {}) {
  const ids = new Set(arrayValue(form.escalasAplicadas));
  return scales.filter(scale => ids.has(scale.id));
}

export function optionsFor(scale, item) {
  return item.opcoes || scale.opcoes || [];
}

export function scaleAnswers(scale, form = {}) {
  return scale.itens.map((_, index) => {
    const bruto = arrayValue(form[scaleFieldName(scale, index)])[0];
    if (bruto === undefined || bruto === "") return undefined;
    const valor = Number(bruto);
    return Number.isFinite(valor) ? valor : undefined;
  });
}

function itemRequired(item, respostas) {
  if (item.opcional) return false;
  return item.exigido ? item.exigido(respostas) : true;
}

function bandFor(faixas = [], total) {
  return faixas.find(faixa => total >= faixa.min && total <= faixa.max) || null;
}

function alertFires(alerta, respostas) {
  if (alerta.quando) return alerta.quando(respostas);
  return (alerta.itens || []).some(indice => (respostas[indice] ?? -1) >= alerta.min);
}

export function scoreScale(scale, respostas = []) {
  const faltando = scale.itens.flatMap((item, index) =>
    itemRequired(item, respostas) && respostas[index] === undefined ? [index] : []);
  const pontuados = scale.itens.map((item, index) => [item, index]).filter(([item]) => !item.fora);
  const total = pontuados.reduce((soma, [, index]) => soma + (respostas[index] ?? 0), 0);
  const max = pontuados.reduce((soma, [item]) => soma + Math.max(...optionsFor(scale, item).map(opcao => opcao.valor)), 0);
  const completa = faltando.length === 0;
  // A faixa so com a escala completa: um PHQ-9 com tres itens respondidos daria
  // "sintomas minimos" e seria lido como resultado.
  const faixa = completa ? (scale.classificar ? scale.classificar(respostas, total) : bandFor(scale.faixas, total)) : null;
  // Subescala com ponto de corte proprio (DASS-21): a soma pode ser
  // multiplicada (`subescalaFator`) e classificada (`subescalaFaixas`).
  const subescalas = Object.entries(scale.subescalas || {}).map(([nome, indices]) => {
    const soma = indices.reduce((acumulado, index) => acumulado + (respostas[index] ?? 0), 0);
    const total = soma * (scale.subescalaFator || 1);
    const faixa = scale.subescalaFaixas?.[nome] ? bandFor(scale.subescalaFaixas[nome], total) : null;
    return { nome, total, faixa };
  });
  // O alerta, ao contrario, nao espera: dispara pela resposta do item.
  const alertas = (scale.alertas || []).filter(alerta => alertFires(alerta, respostas));
  const respondidas = respostas.filter(valor => valor !== undefined).length;
  return { total, max, completa, faltando, faixa, subescalas, alertas, respondidas };
}

export function scaleResult(scale, form = {}) {
  return scoreScale(scale, scaleAnswers(scale, form));
}

// Escala marcada e sem nenhuma resposta nao conta: foi aberta, nao aplicada.
export function scaleResults(form = {}) {
  return appliedScales(form)
    .map(scale => ({ scale, result: scaleResult(scale, form) }))
    .filter(({ result }) => result.respondidas > 0);
}

// Risco agudo pelas escalas: ASQ com pensamento de se matar agora, C-SSRS com
// intencao, plano ou comportamento recente. E o resultado que o nivel de
// cuidado nao pode ignorar -- item 9 da PHQ-9 isolado alerta na propria escala,
// mas nao muda sozinho onde o paciente sera tratado.
export function scaleAcuteRisk(form = {}) {
  return scaleResults(form)
    .filter(({ result }) => result.faixa?.riscoAgudo)
    .map(({ scale, result }) => ({ sigla: scale.sigla, rotulo: result.faixa.rotulo }));
}

// "Nega ideacao, plano ou intencao suicida" na anamnese e escala de suicidio
// positiva na mesma consulta: um dos dois registros esta errado, e o medico
// precisa ver os dois lado a lado.
export function deniesSuicidalIdeation(form = {}) {
  return arrayValue(form.riscoSuicidioIndicadores).includes("Nega ideacao, plano ou intencao suicida");
}

function entryTime(entry = {}) {
  return Date.parse(entry.createdAt || entry.updatedAt || "") || 0;
}

// Os registros anteriores a este, do mais recente para o mais antigo. Reabrir a
// Consulta 1 depois de existir a Consulta 2 nao pode comparar a 1 com a 2.
export function previousScaleEntries(entries = [], current = {}) {
  const limite = current.createdAt ? entryTime(current) : Infinity;
  return entries
    .filter(entry => entry && entry.id !== current.id && entryTime(entry) < limite)
    .sort((a, b) => entryTime(b) - entryTime(a));
}

export function previousScaleResult(scale, entries = []) {
  for (const entry of entries) {
    if (!arrayValue(entry.escalasAplicadas).includes(scale.id)) continue;
    const result = scaleResult(scale, entry);
    if (result.respondidas > 0) return { entry, result };
  }
  return null;
}

// A CARS tem meia nota: 29.5 sai "29,5", como se escreve no prontuario.
export function formatScore(valor) {
  return String(valor).replace(".", ",");
}

function scoreText(scale, result) {
  return scale.semTotal ? "" : `${formatScore(result.total)}/${result.max}`;
}

function bandText(result) {
  if (!result.completa) {
    const n = result.faltando.length;
    return `incompleta, ${n} ${n === 1 ? "item" : "itens"} sem resposta`;
  }
  return lowerFirst(result.faixa?.rotulo || "");
}

const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

// Resposta e remissao, pelo criterio usual de cada escala (campo `mudanca` nos
// dados). "Sem resposta em 8 semanas" e o que muda a conduta -- trocar,
// potencializar, rever o diagnostico --, por isso o intervalo vai junto.
export function scaleChangeStatus(scale, result, anterior, agora = Date.now()) {
  const criterio = scale.mudanca;
  if (!criterio || !anterior || !result.completa || !anterior.result.completa) return null;
  const antes = anterior.result.total;
  const hoje = result.total;
  const desde = Date.parse(anterior.entry?.createdAt || "");
  const semanas = Number.isFinite(desde) && agora > desde ? Math.round((agora - desde) / SEMANA_MS) : 0;
  const quando = semanas ? ` em ${semanas} ${semanas === 1 ? "semana" : "semanas"}` : "";
  const queda = antes > 0 ? Math.round(((antes - hoje) / antes) * 100) : 0;
  if (hoje <= criterio.remissao) {
    return { tipo: "remissao", rotulo: antes <= criterio.remissao ? "remissão mantida" : `remissão${quando}` };
  }
  if (queda >= criterio.resposta * 100) return { tipo: "resposta", rotulo: `resposta, queda de ${queda}%${quando}` };
  if (hoje > antes) return { tipo: "piora", rotulo: `piora${quando}` };
  return { tipo: "sem-resposta", rotulo: queda ? `sem resposta, queda de ${queda}%${quando}` : `sem resposta, sem mudança no total${quando}` };
}

// "PHQ-9 8/27 (depressão leve; antes 18/27; resposta, queda de 56% em 4
// semanas)". A comparacao vai junto so quando as duas aplicacoes estao
// completas: numero parcial nao se compara.
export function scaleSummaryLine(scale, result, anterior = null, agora = Date.now()) {
  const nota = scoreText(scale, result);
  const antes = anterior && anterior.result.completa && result.completa
    ? `antes ${scale.semTotal ? lowerFirst(anterior.result.faixa?.rotulo || "") : scoreText(scale, anterior.result)}`
    : "";
  const situacao = scaleChangeStatus(scale, result, anterior, agora)?.rotulo || "";
  const detalhe = [bandText(result), antes, situacao].filter(Boolean).join("; ");
  return `${scale.sigla}${nota ? ` ${nota}` : ""}${detalhe ? ` (${detalhe})` : ""}`;
}

export function scaleChangeText(scale, result, anterior, agora = Date.now()) {
  if (!anterior) return "";
  const quando = anterior.entry?.createdAt ? ` em ${new Date(anterior.entry.createdAt).toLocaleDateString("pt-BR")}` : "";
  const antes = anterior.result.completa
    ? [scoreText(scale, anterior.result), anterior.result.faixa?.rotulo].filter(Boolean).join(", ")
    : "incompleta";
  const diferenca = !scale.semTotal && result.completa && anterior.result.completa ? result.total - anterior.result.total : null;
  const variacao = diferenca === null ? "" : diferenca === 0 ? " · sem mudança no total" : ` · ${diferenca > 0 ? "+" : "−"}${formatScore(Math.abs(diferenca))} ${Math.abs(diferenca) < 2 ? "ponto" : "pontos"}`;
  const situacao = scaleChangeStatus(scale, result, anterior, agora);
  return `Aplicação anterior${quando}: ${antes}${variacao}${situacao ? ` · ${situacao.rotulo}` : ""}.`;
}

// O mesmo texto serve ao prontuario e ao prompt da IA. `previous` e o
// atendimento a que o retorno responde; na consulta nao ha comparacao no texto.
// O intervalo conta ate a data do proprio registro, e nao ate hoje: reabrir o
// retorno um mes depois nao pode mudar "em 4 semanas" para "em 8".
export function scalesNarrativeText(form = {}, previous = null) {
  const resultados = scaleResults(form);
  if (!resultados.length) return "";
  const agora = Date.parse(form.createdAt || "") || Date.now();
  const linhas = resultados.map(({ scale, result }) =>
    scaleSummaryLine(scale, result, previous ? previousScaleResult(scale, [previous]) : null, agora));
  const alertas = resultados.flatMap(({ result }) => result.alertas.map(alerta => stripFinalPeriod(alerta.texto)));
  return [
    `Escalas aplicadas: ${linhas.join("; ")}.`,
    alertas.length ? `Alertas das escalas: ${alertas.join("; ")}.` : ""
  ].filter(Boolean).join(" ");
}

export function scaleSummaryRows(form = {}) {
  return scaleResults(form).map(({ scale, result }) => ({
    section: "Escalas",
    item: `${scale.sigla} · ${scale.nome}`,
    value: [
      scaleSummaryLine(scale, result).slice(scale.sigla.length).trim(),
      ...result.subescalas.map(sub => `${sub.nome}: ${sub.total}${sub.faixa ? ` (${sub.faixa.rotulo.toLowerCase()})` : ""}`),
      ...result.alertas.map(alerta => `Alerta: ${stripFinalPeriod(alerta.texto)}.`)
    ].filter(Boolean).join(" · ")
  }));
}

// Desmarcar a escala na tela nao apaga as respostas do rascunho -- os campos
// so saem do DOM. Ao gravar, sai o que nao esta mais aplicado: resposta que
// ninguem ve nao fica no prontuario.
export function withoutUnappliedScaleAnswers(entry = {}) {
  const aplicadas = new Set(arrayValue(entry.escalasAplicadas));
  return Object.fromEntries(Object.entries(entry).filter(([campo]) => {
    const match = campo.match(CAMPO_ESCALA);
    return !match || (aplicadas.has(match[1]) && Boolean(scaleById(match[1])));
  }));
}
