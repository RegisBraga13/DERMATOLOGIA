import { diagnosticAggravatingOptionLines, diagnosticComorbidityOptionLines, diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSpecifierOptionLines, diagnosticSyndromicOptionLines, selectedAggravatingValues, selectedComorbidityValues, selectedDiagnosisText, selectedDiagnosisValues, selectedSpecifierValues, treatmentOptionLines } from "../clinical/diagnosis.js";
import { buildEvolutionNarrative, evolutionNeedsRebuild, normalizeEvolutionNarrative, requestedExamsText } from "../clinical/narrative.js";
import { CRITERION_SEPARATOR } from "../clinical/aiDiagnosisResult.js";
import { arrayValue, normalizeText } from "../clinical/textFormat.js";
import { doctorDiagnosisOptions } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js";
import { CARE_LEVELS_REQUIRING_JUSTIFICATION, careLevelNotes, careLevelOptions } from "../data/careLevels.js";
import { scaleAcuteRisk } from "../clinical/scoring.js";
import { monitoringFor } from "../data/monitoring.js";
import { medicationTrials, reportedMedicationTreatmentLines } from "../clinical/medicationTrial.js";
import { optionParts } from "../clinical/optionParts.js";
import { chips, statusLine, textarea } from "../ui/controls.js";
import { referenceFor } from "../data/references.js";
import { escapeAttr, escapeHtml, safeExternalUrl } from "../ui/html.js";
import { aiSourcesFor, aiSourcesUnavailable } from "../services/aiSourceCatalog.js";

export function diagnosisModule(form) {
  const syndromicOptions = diagnosticSyndromicOptionLines(form);
  const nosologicalOptions = diagnosticNosologicalOptionLines(form);
  const etiologicalOptions = diagnosticEtiologicalOptionLines(form);
  const specifierOptions = diagnosticSpecifierOptionLines(form);
  const selectedSpecifiers = selectedSpecifierValues(form);
  const comorbidityOptions = diagnosticComorbidityOptionLines(form);
  const selectedComorbidities = selectedComorbidityValues(form);
  const aggravatingOptions = diagnosticAggravatingOptionLines(form);
  const selectedAggravating = selectedAggravatingValues(form);
  const selectedValues = selectedDiagnosisValues(form);
  const selectedText = selectedDiagnosisText(form);
  const aiStatus = diagnosisAiStatusText(form.aiStatus);
  const analysisLines = psychopathologicalAnalysisLines(form);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.aiMode, "aiMode", { kind: "diagnosis" })}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-diagnosis">Gerar</button>
        ${refineButton("refine-diagnosis", selectedValues.length > 0)}
      </div>
      ${statusLine(aiStatus)}
      ${ragSourcesView(form.ragSourcesDiagnostico)}
      ${firstPassView(form.diagnosticoRefinoAnterior, [["Sindrômico", "sindromico"], ["Nosológico", "nosologico"], ["Etiológico", "etiologico"]])}
    </div>
    ${psychopathologicalAnalysisView(analysisLines)}
    <textarea hidden name="analisePsicopatologica">${escapeHtml(analysisLines.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoManual">${escapeHtml(selectedText)}</textarea>
    <textarea hidden name="diagnosticoAiSindromico">${escapeHtml(syndromicOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiNosologico">${escapeHtml(nosologicalOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiEtiologico">${escapeHtml(etiologicalOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiEspecificadores">${escapeHtml(specifierOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiComorbidades">${escapeHtml(comorbidityOptions.join("\n"))}</textarea>
    <textarea hidden name="diagnosticoAiAgravantes">${escapeHtml(aggravatingOptions.join("\n"))}</textarea>
    ${diagnosisCategory("Sindrômico", syndromicOptions, selectedValues)}
    ${diagnosisCategory("Nosológico", nosologicalOptions, selectedValues, false, diagnosticCriteriaByOption(form), diagnosticRangeByOption(form))}
    ${checklistGroup({
      label: "Especificadores", campo: "especificadorSelecionado",
      options: specifierOptions, selecionados: selectedSpecifiers,
      vazio: "Nenhum especificador proposto. O catálogo local não propõe especificador — gravidade, remissão e curso não se leem por correspondência de termo."
    })}
    ${checklistGroup({
      label: "Comorbidades", campo: "comorbidadeSelecionada", compacto: true,
      options: comorbidityOptions, selecionados: selectedComorbidities,
      vazio: "Nenhuma comorbidade proposta. Afirmar que duas entidades coexistem não se lê por correspondência de termo — vem da IA."
    })}
    ${checklistGroup({
      label: "Fatores agravantes", campo: "agravanteSelecionado", compacto: true,
      options: aggravatingOptions, selecionados: selectedAggravating,
      vazio: "Nenhum fator agravante proposto."
    })}
    ${diagnosisCategory("Etiológico", etiologicalOptions, selectedValues, true)}
    <div class="diagnosis-group diagnosis-group-compact diagnosis-doctor-group">
      <h4>Hipóteses do médico</h4>
      <div class="diagnosis-options">${diagnosisOptionCheckboxes(doctorDiagnosisOptions, selectedValues)}</div>
      ${textarea("diagnosticoMedicoOutro", "Ao marcar \"Outro\": escreva a hipótese e os códigos", form.diagnosticoMedicoOutro, "Ex.: Transtorno de ansiedade generalizada - CID-11: 6B00 - DSM-5-TR: F41.1", 2)}
    </div>
  `;
}

// O refino substitui a tela inteira, por decisao dele. O que a primeira
// passada propunha fica guardado no registro, e aqui, recolhido, para conferir
// o que a revisao tirou -- a comecar pelo que ele tinha assinalado.
export function firstPassView(anterior, grupos = []) {
  if (!anterior) return "";
  const retiradas = arrayValue(anterior.retiradas);
  const linhas = grupos
    .filter(([, chave]) => arrayValue(anterior[chave]).length)
    .map(([rotulo, chave]) => `<p><strong>${escapeHtml(rotulo)}:</strong> ${escapeHtml(arrayValue(anterior[chave]).join("; "))}</p>`);
  if (!linhas.length && !retiradas.length) return "";
  return `<details class="first-pass">
    <summary>Primeira proposta, antes do refino</summary>
    ${retiradas.length ? `<p><strong>Assinaladas por você e retiradas pela revisão:</strong> ${escapeHtml(retiradas.join("; "))}</p>` : ""}
    ${linhas.join("")}
  </details>`;
}

// O titulo conta o que esta na tela, nao o teto do grupo. Antes dizia sempre
// "3 hipoteses", inclusive logo acima de "Nenhuma hipotese gerada".
// A ordem das tres camadas na tela e clinica, nao alfabetica nem historica, e
// segue o raciocinio a beira do leito: sindromico primeiro, porque e o que se
// reconhece antes de qualquer nome e o que orienta a conduta imediata --
// alivio do sofrimento e controle de risco; nosologico depois, a base do
// tratamento e o que sustenta laudo, atestado e direito previdenciario;
// etiologico por ultimo, a raiz, que pede acompanhamento longitudinal.
// Invertido em 31/08/2026 por decisao do medico. E o core do programa -- nao
// reordenar sem decisao medica.
function diagnosisCategory(label, options, selectedValues, compacto = false, criterios = new Map(), faixas = new Map()) {
  const total = options.length
    ? `${options.length} ${options.length === 1 ? "hipótese" : "hipóteses"}`
    : "sem hipóteses";
  return `<div class="diagnosis-group${compacto ? " diagnosis-group-compact" : ""}"><h4>${label} — ${total}</h4>
      <div class="diagnosis-options">
        ${faixas.size ? `<p class="diagnosis-range-note">As faixas não precisam somar 100% e não entram nos documentos.</p>` : ""}
        ${options.length ? diagnosisOptionCheckboxes(options, selectedValues, criterios, faixas) : `<p class="diagnosis-empty">O registro atual não sustenta hipótese nesta categoria. Veja <strong>Hipóteses do médico</strong>.</p>`}
      </div>
    </div>`;
}

// Os criterios da hipotese, conferidos um a um contra este paciente. So a camada
// nosologica os tem: sindrome e conjunto de sinais, sem lista operacional, e
// etiologia e causa, nao entidade.
//
// Dobrado por padrao. Aberto, cada hipotese ocuparia meia tela de texto antes
// de ele conseguir comparar as hipoteses entre si -- e comparar e o que se faz
// aqui. O resumo na aba ja da a leitura rapida: quantos preenchidos, e o que
// ficou sem poder avaliar, que e o que ele vai perguntar no retorno.
function criterionList(linhas) {
  if (!linhas.length) return "";
  const conta = status => linhas.filter(item => item.status === status).length;
  const preenchidos = conta("preenchido");
  const naoAvaliaveis = conta("nao avaliavel");
  const resumo = [
    `${preenchidos} de ${linhas.length} preenchido${preenchidos === 1 ? "" : "s"}`,
    naoAvaliaveis ? `${naoAvaliaveis} sem poder avaliar` : ""
  ].filter(Boolean).join(", ");
  return `<details class="diagnosis-criteria">
    <summary>Critérios — ${escapeHtml(resumo)}</summary>
    <ul>${linhas.map(item => `
      <li class="criterion-${escapeAttr(item.status.replace(/\s+/g, "-"))}">
        <strong>${escapeHtml(item.criterion)}</strong>
        <span class="criterion-status">${escapeHtml(item.status)}</span>
        <span class="criterion-evidence">${escapeHtml(item.evidence)}</span>
      </li>`).join("")}</ul>
  </details>`;
}

// Grupo proprio, e nao mais uma "categoria": especificador nao e hipotese, e
// atributo da hipotese — marcar um nao e escolher um diagnostico a mais. Por
// isso vai em caixa separada, com nome de campo proprio, e nao entra na conta
// de hipoteses assinaladas.
// Comorbidade e fator agravante seguem o mesmo desenho, tambem em blocos
// separados a pedido dele: comorbidade e uma segunda entidade que COEXISTE com
// a hipotese principal — nao concorre com ela, como concorrem as do diagnostico
// diferencial; agravante nao e diagnostico nenhum, e o que piora curso,
// resposta ao tratamento e prognostico. Sao tres coisas diferentes, e por isso
// tres caixas, cada uma com o seu campo.
function checklistGroup({ label, campo, options, selecionados, vazio, compacto = false }) {
  const marcados = new Set(selecionados.map(normalizeText));
  return `<div class="diagnosis-group${compacto ? " diagnosis-group-compact" : ""}">
    <h4>${label} — ${options.length ? `${options.length}` : "nenhum"}</h4>
    <div class="diagnosis-options">
      ${options.length ? options.map(option => `
        <label class="diagnosis-option">
          <input type="checkbox" name="${campo}" value="${escapeAttr(option)}" ${marcados.has(normalizeText(option)) ? "checked" : ""} />
          <span>${escapeHtml(option)}</span>
        </label>
      `).join("") : `<p class="diagnosis-empty">${escapeHtml(vazio)}</p>`}
    </div>
  </div>`;
}

function diagnosisOptionCheckboxes(options, selectedValues, criterios = new Map(), faixas = new Map()) {
  // Comparacao sem acento: os nomes do catalogo foram acentuados, e um
  // prontuario salvo antes disso guarda "Sindrome Ansiosa". Comparando literal,
  // a marcacao do medico sumia da tela sem sumir do registro.
  const marcados = new Set(selectedValues.map(normalizeText));
  return options.map(option => {
    // Os criterios ficam FORA do <label>: dentro dele, clicar para abrir a lista
    // marcaria a caixa de selecao, e ele assinalaria a hipotese so por querer
    // conferir por que ela foi proposta.
    const lista = criterionList(criterios.get(normalizeText(option)) || []);
    // A faixa fica FORA do <label> pelo mesmo motivo dos criterios, e fora do
    // texto da hipotese: o que vai para laudo e atestado e o nome, nunca ela.
    const faixa = faixas.get(normalizeText(option));
    const selo = faixa
      ? `<span class="diagnosis-range" title="Estimativa da IA, não calibrada: quanto o registro atual sustenta esta hipótese. Não é probabilidade.">~${faixa.min}–${faixa.max}% <small>estimativa da IA, não calibrada</small></span>`
      : "";
    return `<div class="diagnosis-option-block">
      <label class="diagnosis-option">
        <input type="checkbox" name="diagnosticoSelecionado" value="${escapeAttr(option)}" ${marcados.has(normalizeText(option)) ? "checked" : ""} />
        <span>${escapeHtml(option)}</span>
      </label>
      ${selo}
      ${lista}
    </div>`;
  }).join("");
}

// Faixa de sustentacao por hipotese, so para a tela. Linha malformada some, e
// a hipotese aparece como sempre apareceu: sem faixa nao ha o que inventar.
export function diagnosticRangeByOption(form = {}) {
  const mapa = new Map();
  String(form.diagnosticoAiFaixas || "").split("\n").forEach(linha => {
    const [hipotese, baixo, alto, ...resto] = linha.split(CRITERION_SEPARATOR).map(parte => parte.trim());
    const min = Number(baixo), max = Number(alto);
    if (!hipotese || resto.length || !/^\d+$/.test(baixo) || !/^\d+$/.test(alto) || !Number.isInteger(min) || !Number.isInteger(max) || min < 0 || min > max || max > 100) return;
    mapa.set(normalizeText(hipotese), { min, max });
  });
  return mapa;
}

// As linhas de criterio chegam como texto, uma por linha, chaveadas pela mesma
// linha que rotula a hipotese. Chave normalizada pela mesma razao das caixas de
// selecao: prontuario salvo antes de um rotulo mudar continua casando.
export function diagnosticCriteriaByOption(form = {}) {
  const mapa = new Map();
  String(form.diagnosticoAiCriterios || "").split("\n").forEach(linha => {
    const partes = linha.split(CRITERION_SEPARATOR).map(parte => parte.trim());
    if (partes.length !== 4 || partes.some(parte => !parte)) return;
    const [hipotese, criterion, status, evidence] = partes;
    const chave = normalizeText(hipotese);
    if (!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push({ criterion, status, evidence });
  });
  return mapa;
}

function diagnosisAiStatusText(message = "") {
  if (!message) return "";
  if (/OPENAI_API_KEY|IA indisponivel/i.test(message)) return "6 hipoteses locais aplicadas.";
  return message;
}

// A segunda passada e opcional, e por isso e um botao separado, e nao uma etapa
// automatica: quem decide se o caso pede a fonte especializada e o medico.
// No diagnostico fica desabilitado ate o medico ASSINALAR as hipoteses, e nao
// apenas gera-las: por decisao dele (31/08/2026), o medico primeiro escolhe
// entre IA Nuvem e RAG -- podendo alternar e gerar de novo quantas vezes
// quiser --, decide o que fica, e so entao refina. Refinar sobre uma lista nao
// escolhida seria revisar hipotese que o medico ja tinha descartado.
export function refineButton(action, liberado) {
  return `<button class="secondary" type="button" data-action="${action}" ${liberado ? "" : "disabled"}
    title="Revisa com a fonte especializada, sempre pelo RAG. Substitui o que esta na tela.">Refinar</button>`;
}

// O Tratamento ganhou campo PROPRIO em 23/09/2026. Ate aqui dividia o
// `pharmaAiMode` com a pagina Medicamentos: um valor so, dois radios em telas
// diferentes, e trocar a fonte numa trocava na outra sem dizer. Era surpresa;
// com o terceiro modo viraria erro, porque Guidelines escolhido no Tratamento
// faria a ficha do farmaco pedir ao servidor um modo que aquela etapa recusa.
//
// O valor antigo segue valendo como padrao: registro salvo antes da separacao
// reabre no modo em que foi gerado, em vez de aparecer em outro sem explicacao.
export function treatmentAiMode(form = {}) {
  return form.treatmentAiMode || form.pharmaAiMode || "rag";
}

// O catálogo é entregue pelo servidor. Se a fonte salva saiu da lista desta
// etapa, nenhuma opção é marcada: o médico escolhe outra explicitamente.
export function aiModeSelector(value = "current", name = "aiMode", { kind = "" } = {}) {
  const options = aiSourcesFor(kind);
  const atual = options.some(item => item.id === value) ? value : "";
  return `<fieldset class="ai-mode-selector" ${options.length ? "" : "disabled"}>
    <legend>Fonte da resposta</legend>
    ${options.map(item => `<label><input type="radio" name="${escapeAttr(name)}" value="${escapeAttr(item.id)}" ${atual === item.id ? "checked" : ""} /><span>${escapeHtml(item.label)}</span></label>`).join("")}
    ${!options.length ? `<span>${aiSourcesUnavailable() ? "Fontes de IA indisponíveis. Recarregue a página." : "Carregando fontes de IA…"}</span>` : ""}
    ${options.length && !atual ? "<span>Fonte salva indisponível nesta etapa. Escolha outra antes de gerar.</span>" : ""}
  </fieldset>`;
}

// "Fontes consultadas nesta geracao", nunca "de onde veio a resposta". O RAG
// restringe a busca; nao garante que cada frase saiu dali — o modelo ainda
// generaliza. Prometer mais do que o mecanismo entrega e pior do que nao
// mostrar nada.
// A procedencia da resposta, nas duas colunas. O mesmo campo do formulario
// guarda as duas formas porque so uma existe por vez -- a resposta veio de um
// modo ou do outro --, e o item diz qual e: fonte do RAG tem 'filename' e
// pontuacao de relevancia, pagina da web tem 'url'.
//
// Desde 31/08/2026 a IA Nuvem pesquisa na web, e passou a ter procedencia
// tambem. Antes ela respondia de cabeca e esta caixa ficava vazia do lado dela
// -- o que era honesto, e era exatamente a fraqueza: afirmacao sem origem.
export function ragSourcesView(sources = []) {
  if (!Array.isArray(sources) || !sources.length) return "";
  if (sources.every(source => source?.url || source?.query)) return webSourcesView(sources);
  const refs = sources.map(source => ({ ...source, ref: referenceFor(source.filename) }));
  const nomes = [...new Set(refs.map(item => item.ref.curto))];
  return `
    <p class="rag-consulted">Consultado: ${nomes.map(nome => `<strong>${escapeHtml(nome)}</strong>`).join(" · ")}</p>
    <details class="rag-sources"><summary>${sources.length} ${sources.length === 1 ? "trecho recuperado" : "trechos recuperados"}</summary><ol>${refs.map(item => `
      <li><strong>${escapeHtml(item.ref.completo)}</strong><span>Relevancia: ${Math.round(Number(item.score || 0) * 100)}%</span></li>`).join("")}</ol></details>`;
}

// O link abre em aba nova, com rel="noopener noreferrer": a pagina vem de busca
// na web, e nao se entrega o contexto do prontuario a um destino que ninguem
// auditou.
function webSourcesView(sources) {
  const paginas = sources.filter(item => item.url);
  const consultas = sources.filter(item => item.query && !item.url);
  const sites = [...new Set(paginas.map(item => item.site).filter(Boolean))];
  const total = paginas.length || consultas.length;
  return `
    <p class="rag-consulted">${sites.length
      ? `Pesquisado na web: ${sites.map(site => `<strong>${escapeHtml(site)}</strong>`).join(" · ")}`
      : "Pesquisado na web"}</p>
    <details class="rag-sources"><summary>${total} ${paginas.length
      ? (total === 1 ? "página citada" : "páginas citadas")
      : (total === 1 ? "consulta feita" : "consultas feitas")}</summary><ol>${[
      ...paginas.map(item => {
        const url = safeExternalUrl(item.url);
        return `<li>${url
          ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.url)}</a>`
          : escapeHtml(item.title || item.url)}<span>${escapeHtml(item.site || "")}</span></li>`;
      }),
      // Sem URL, a procedencia possivel e a CONSULTA: o que ele foi procurar.
      // Vale mostrar — e o que permite ver que a busca foi ao lugar certo, e que
      // nao levou nada do paciente junto.
      ...consultas.map(item => `<li><span>${escapeHtml(item.query)}</span></li>`)
    ].join("")}</ol></details>`;
}

// Monitorizacao dos farmacos assinalados, no cartao de Exames (dados em
// data/monitoring.js). Aparece so com farmaco marcado, e o botao marca os
// exames; nao marca sozinho, porque pedir exame e decisao do medico.
function monitoringView(form, podeEngravidar) {
  const blocos = monitoringFor(form.tratamentoMedicamentosSelecionados, { podeEngravidar });
  if (!blocos.length) return "";
  return `<div class="monitoring-block">
    <p class="monitoring-title">Monitorização dos medicamentos assinalados</p>
    <ul>${blocos.map(bloco => {
      const exames = [...bloco.exames, ...bloco.extras];
      return `<li><strong>${escapeHtml(bloco.rotulo)}</strong>: ${escapeHtml(bloco.nota)}${exames.length ? ` <span class="monitoring-exams">Exames: ${escapeHtml(exames.join(", "))}.</span>` : ""}</li>`;
    }).join("")}</ul>
    <button class="secondary" type="button" data-action="apply-monitoring-exams">Marcar estes exames</button>
  </div>`;
}


// O historico farmacologico como o medico o le, com os mesmos vereditos que
// foram ao prompt. So os ensaios ENCERRADOS: o que esta em uso ja esta na tela
// inteira, e repeti-lo aqui faria a lista do passado competir com a do presente.
function pharmacologicalHistoryView(historico = []) {
  const ensaios = medicationTrials(historico).filter(item => item.veredito !== "EM_USO");
  if (!ensaios.length) return "";
  return `<div class="trial-history">
    <p class="trial-history-title">Histórico farmacológico considerado pela IA</p>
    <ul>${ensaios.map(ensaio => `<li>
      <strong>${escapeHtml(ensaio.nome)}</strong>
      <span class="trial-verdict trial-${ROTULO_DA_CLASSE[ensaio.veredito] || "neutro"}">${escapeHtml(ROTULO_NA_TELA[ensaio.veredito] || ensaio.veredito)}</span>
      <span class="trial-evidence">${escapeHtml(trialEvidenceText(ensaio))}</span>
    </li>`).join("")}</ul>
  </div>`;
}

const ROTULO_NA_TELA = {
  RESPOSTA_BOA: "respondeu bem antes",
  ENSAIO_INSUFICIENTE: "ensaio insuficiente",
  NAO_TESTADO: "não testado",
  INTOLERANCIA: "intolerância",
  INDETERMINADO: "sem dados suficientes"
};

// Verde para o que se deve repetir, vermelho para o que nao se deve, neutro
// para o que nao foi testado: o terceiro grupo nao e uma nota intermediaria
// entre os dois, e uma pergunta ainda em aberto.
const ROTULO_DA_CLASSE = {
  RESPOSTA_BOA: "bom",
  INTOLERANCIA: "ruim"
};

// So transporte, sem veredito -- ver reportedMedicationTreatmentLines em
// medicationTrial.js. Nenhum codigo classifica isto; a tela mostra a frase
// exatamente como o paciente contou (ou como a extracao por IA a registrou),
// para o medico ler e decidir. Decisao do Dr. Regis, 24/09/2026.
function previousPharmacologicalTreatmentReportView(linhas = []) {
  if (!linhas.length) return "";
  return `<div class="trial-history trial-history-reported">
    <p class="trial-history-title">Tratamento farmacológico prévio relatado pelo paciente (fora deste programa)</p>
    <ul>${linhas.map(linha => `<li>${escapeHtml(linha)}</li>`).join("")}</ul>
  </div>`;
}

function trialEvidenceText(ensaio) {
  return [
    ensaio.doseTexto ? `dose ${ensaio.doseTexto}` : "dose não registrada",
    ensaio.semanas === null ? "" : `${ensaio.semanas} semana(s)`,
    ensaio.evolucao ? ensaio.evolucao.toLowerCase() : "",
    ensaio.motivo ? `"${ensaio.motivo}"` : ""
  ].filter(Boolean).join(" · ");
}

export function treatmentModule(form, { podeEngravidar = false, historico = [] } = {}) {
  const examesText = requestedExamsText(form);
  const medicationOptions = treatmentOptionLines(form.tratamentoAiMedicamentos);
  const approachOptions = treatmentOptionLines(form.tratamentoAiAbordagens);
  const selectedApproaches = arrayValue(form.abordagensSelecionadas);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(treatmentAiMode(form), "treatmentAiMode", { kind: "treatment" })}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-treatment">Gerar</button>
        ${treatmentAiMode(form) === "guidelines" ? "" : refineButton("refine-treatment", medicationOptions.length || approachOptions.length)}
      </div>
      ${statusLine(form.treatmentStatus)}
      ${ragSourcesView(form.ragSourcesTratamento)}
      ${firstPassView(form.tratamentoRefinoAnterior, [["Medicamentos", "medicamentos"], ["Outras abordagens", "abordagens"]])}
      ${pharmacologicalHistoryView(historico)}
      ${previousPharmacologicalTreatmentReportView(reportedMedicationTreatmentLines(form))}
    </div>
    ${careLevelView(form)}
    <div class="treatment-card-grid">
      <div class="treatment-card">
        <h4>Abordagem medicamentosa</h4>
        <textarea hidden name="tratamentoAiMedicamentos">${escapeHtml(medicationOptions.join("\n"))}</textarea>
        <textarea hidden name="tratamentoMedicamentoso">${escapeHtml(form.tratamentoMedicamentoso || "")}</textarea>
        <div class="diagnosis-options">
          ${medicationOptions.length ? medicationOptions.map((option, index) => `<article class="treatment-card"><h4>${index === 0 ? "1ª opção" : index === 1 ? "2ª opção" : "Off-label"}</h4><label class="diagnosis-option treatment-option"><input type="checkbox" name="tratamentoMedicamentosSelecionados" value="${escapeAttr(option)}" ${arrayValue(form.tratamentoMedicamentosSelecionados).includes(option) ? "checked" : ""} />${optionLabelBody(option)}</label></article>`).join("") : `<p class="diagnosis-empty">As opções aparecerão após a geração.</p>`}
        </div>
      </div>
      <div class="treatment-card">
        <h4>Outras abordagens</h4>
        <textarea hidden name="tratamentoAiAbordagens">${escapeHtml(approachOptions.join("\n"))}</textarea>
        <textarea hidden name="abordagensTerapeuticas">${escapeHtml(form.abordagensTerapeuticas || "")}</textarea>
        <div class="diagnosis-options">
          ${approachOptions.length ? treatmentOptionCheckboxes("abordagensSelecionadas", approachOptions, selectedApproaches) : `<p class="diagnosis-empty">As abordagens aparecerão após a geração.</p>`}
        </div>
      </div>
      <div class="treatment-card">
        <h4>Exames solicitados</h4>
        ${chips("examesSolicitados", "", optionGroups.examesPsiquiatria, form.examesSolicitados, form)}
        <textarea hidden name="examesLaboratoriais">${escapeHtml(examesText)}</textarea>
        ${monitoringView(form, podeEngravidar)}
      </div>
      ${targetSymptomCard(form)}
      <div class="treatment-card physician-adjustments">
        <h4>Ajustes do medico</h4>
        ${textarea("condutaMedica", "", form.condutaMedica, "", 3)}
      </div>
    </div>
  `;
}

// O Sintoma-Alvo dentro do Tratamento, desde 31/08/2026. Nao ha aqui o que
// gerar: quem procura conduta de sintoma e a busca do apendice, e o que chega
// nesta caixa e o que ele adotou de la, ja assinalado. A caixa existe para ele
// poder DESMARCAR — adotar e ato dele, mas mudar de ideia antes de salvar
// tambem — e para o sintoma aparecer no prontuario junto com a conduta.
//
// Sem nada adotado a caixa nao aparece: um card vazio no Tratamento sugeriria
// que falta preencher alguma coisa, quando nao ha nada pendente.
function targetSymptomCard(form) {
  const options = treatmentOptionLines(form.tratamentoAiSintomasAlvo);
  const selected = arrayValue(form.sintomasAlvoSelecionados);
  const sintomas = arrayValue(form.sintomasResiduais);
  if (!options.length && !sintomas.length) return "";
  return `
    <div class="treatment-card">
      <h4>Sintoma-Alvo</h4>
      <p class="field-hint">A queixa mais urgente, incômoda ou incapacitante, que orienta a conduta imediata — independentemente de já haver diagnóstico nosológico. Procure o manejo em <strong>Medicamentos</strong> e traga de lá o que adotar.</p>
      ${sintomas.length ? `<p class="field-hint"><strong>Sintomas:</strong> ${escapeHtml(sintomas.join("; "))}</p>` : ""}
      <textarea hidden name="tratamentoAiSintomasAlvo">${escapeHtml(options.join("\n"))}</textarea>
      ${sintomas.map(sintoma => `<input type="hidden" name="sintomasResiduais" value="${escapeAttr(sintoma)}" />`).join("")}
      <div class="diagnosis-options">
        ${options.length
          ? treatmentOptionCheckboxes("sintomasAlvoSelecionados", options, selected)
          : `<p class="diagnosis-empty">Nenhuma conduta trazida do apêndice.</p>`}
      </div>
    </div>
  `;
}


function treatmentOptionCheckboxes(name, options, selectedValues) {
  return options.map(option => `
    <label class="diagnosis-option treatment-option">
      <input type="checkbox" name="${name}" value="${escapeAttr(option)}" ${selectedValues.includes(option) ? "checked" : ""} />
      ${optionLabelBody(option)}
    </label>
  `).join("");
}

// O texto da caixa de marcar. A STRING nao muda -- continua inteira no `value`,
// porque e ela que a narrativa, o Resumo e o Tratamento leem de volta. Muda o
// desenho: o farmaco no topo, e dose, progressao e interacao como campos, em vez
// de uma frase corrida separada por barras. Ver clinical/optionParts.js.
//
// Linha sem barra -- "Psicoterapia cognitivo-comportamental" -- continua uma
// frase: frase de um campo so nao vira ficha.
function optionLabelBody(option) {
  const { titulo, partes } = optionParts(option);
  if (!partes.length) return `<span>${escapeHtml(option)}</span>`;
  return `<span class="option-parts">
    <span class="option-title">${escapeHtml(titulo)}</span>
    ${partes.map(({ rotulo, valor }) => rotulo
      ? `<span class="option-part"><span class="option-part-rotulo">${escapeHtml(rotulo)}</span><span class="option-part-valor">${escapeHtml(valor)}</span></span>`
      : `<span class="option-part option-part-livre"><span class="option-part-valor">${escapeHtml(valor)}</span></span>`).join("")}
  </span>`;
}

// A segunda pagina do retorno, criada em 02/09/2026. Ordem da tela e a ordem da
// decisao: primeiro a medicacao, depois o resto da conduta, depois o que o
// medico acrescenta, e so entao o texto.
//
// A medicacao vem primeiro por exigencia dele -- "sempre tem que ser
// contemporizada". Nenhum farmaco em uso sai do retorno sem decisao, nem que a
// decisao seja manter: retorno que nao diz nada sobre um farmaco prescrito e
// retorno que esqueceu dele.
//
// As caixas nascem DESMARCADAS. A pagina anterior e observacao do medico e nao
// deixa avancar incompleta; esta e inferencia da IA sobre aquilo, e vai errar
// alguma. Caixa ja marcada e mais facil de deixar passar do que campo vazio --
// o custo de errar aqui e uma receita.
export function returnPlanModule(form, { historico = [] } = {}) {
  const hipoteses = treatmentOptionLines(form.ajusteAiHipoteses);
  const medicacao = treatmentOptionLines(form.ajusteAiMedicacao);
  const conduta = treatmentOptionLines(form.ajusteAiConduta);
  const gerado = hipoteses.length || medicacao.length || conduta.length;
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.returnPlanAiMode || "rag", "returnPlanAiMode", { kind: "return_plan" })}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-return-plan">Gerar</button>
      </div>
      ${statusLine(form.returnPlanStatus)}
      ${ragSourcesView(form.ragSourcesAjuste)}
      ${pharmacologicalHistoryView(historico)}
      ${previousPharmacologicalTreatmentReportView(reportedMedicationTreatmentLines(form))}
    </div>
    ${riscoAgudoView(scaleAcuteRisk(form), "deste retorno", "O retorno não tem nível de cuidado próprio: se a conduta seguir ambulatorial, registre a razão em Acrescentar.")}
    <div class="treatment-card-grid">
      <div class="treatment-card">
        <h4>Hipóteses diagnósticas</h4>
        <textarea hidden name="ajusteAiHipoteses">${escapeHtml(hipoteses.join("\n"))}</textarea>
        <div class="diagnosis-options">
          ${hipoteses.length
            ? treatmentOptionCheckboxes("ajusteHipotesesSelecionada", hipoteses, arrayValue(form.ajusteHipotesesSelecionada))
            : `<p class="diagnosis-empty">${gerado ? "Nenhuma hipótese do atendimento anterior a confirmar." : "As hipóteses aparecerão após a geração."}</p>`}
        </div>
      </div>
      <div class="treatment-card">
        <h4>Medicação</h4>
        <textarea hidden name="ajusteAiMedicacao">${escapeHtml(medicacao.join("\n"))}</textarea>
        <div class="diagnosis-options">
          ${medicacao.length
            ? treatmentOptionCheckboxes("ajusteMedicacaoSelecionada", medicacao, arrayValue(form.ajusteMedicacaoSelecionada))
            : `<p class="diagnosis-empty">${gerado ? "Nenhum medicamento em uso no atendimento anterior." : "As decisões por medicamento aparecerão após a geração."}</p>`}
        </div>
      </div>
      <div class="treatment-card">
        <h4>Ajustes de conduta</h4>
        <textarea hidden name="ajusteAiConduta">${escapeHtml(conduta.join("\n"))}</textarea>
        <div class="diagnosis-options">
          ${conduta.length
            ? treatmentOptionCheckboxes("ajusteCondutaSelecionada", conduta, arrayValue(form.ajusteCondutaSelecionada))
            : `<p class="diagnosis-empty">${gerado ? "Nenhum ajuste além da medicação." : "Os ajustes aparecerão após a geração."}</p>`}
        </div>
      </div>
      <div class="treatment-card physician-adjustments">
        <h4>Acrescentar</h4>
        <p class="field-hint">O que a IA não viu. Entra no prontuário do mesmo jeito que o assinalado acima.</p>
        ${textarea("ajusteAcrescimo", "", form.ajusteAcrescimo, "", 3)}
      </div>
    </div>
  `;
}

// O texto da evolucao so existe depois do ajuste, e nao ao lado dele.
//
// A ordem e dele, e e a ordem da consulta: salva a Evolucao, cai no Ajuste de
// conduta sem texto nenhum, ajusta, e SO ENTAO o texto aparece -- ja com o que
// foi ajustado dentro. Ate 02/09/2026 o texto abria junto com a pagina, escrito
// antes de existir a decisao que ele deveria registrar: quem lesse, leria a
// evolucao de um retorno em que nada tinha sido decidido ainda.
//
// Escrever no "Acrescentar" tambem conta como ajuste: e a saida para o caso em
// que a IA nao propos nada de util e a conduta e toda dele.
export function returnPlanSettled(form = {}) {
  return arrayValue(form.ajusteHipotesesSelecionada).length > 0
    || arrayValue(form.ajusteMedicacaoSelecionada).length > 0
    || arrayValue(form.ajusteCondutaSelecionada).length > 0
    || Boolean(String(form.ajusteAcrescimo || "").trim());
}

export function evolutionBody(form, patient, previous = null, isReturn = false) {
  // O texto do medico aparece como ele escreveu; o do modelo e remontado com o
  // que esta registrado agora. Mesma regra do salvar (evolutionNeedsRebuild).
  const evolution = evolutionNeedsRebuild(form, patient) ? "" : normalizeEvolutionNarrative(form.evolution);
  const generatedEvolution = buildEvolutionNarrative(form, patient, previous, isReturn);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.evolutionAiMode || "rag", "evolutionAiMode", { kind: "evolution" })}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-evolution">${isReturn ? "Atualizar evolução" : "Atualizar história clínica"}</button>
      </div>
      ${statusLine(form.aiStatus)}
      ${ragSourcesView(form.ragSourcesEvolucao)}
    </div>
    ${textarea("evolution", "", evolution || generatedEvolution)}
  `;
}

// A analise psicopatologica: o raciocinio que sustenta as hipoteses, um dominio
// por linha, cada achado com a evidencia do registro entre parenteses.
//
// Nao e checklist e nao tem caixa de selecao: nao ha o que assinalar num
// raciocinio. O que o medico assinala sao as hipoteses, logo abaixo — e e por
// isso que a analise vem antes delas na tela, na mesma ordem em que se pensa.
export function psychopathologicalAnalysisLines(form = {}) {
  return String(form.analisePsicopatologica || "")
    .split("\n")
    .map(linha => linha.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function psychopathologicalAnalysisView(linhas) {
  if (!linhas.length) return "";
  return `<div class="clinical-card analysis-card">
    <h4>Análise psicopatológica</h4>
    <p class="panel-note">Cada achado vem com o trecho do registro que o sustenta. Achado sem evidência no prontuário não entra — e o catálogo local, que casa termo, não produz esta análise.</p>
    <ul class="analysis-list">
      ${linhas.map(linha => {
        const [dominio, ...resto] = linha.split(/:\s*/);
        const corpo = resto.join(": ");
        return corpo
          ? `<li><strong>${escapeHtml(dominio)}:</strong> ${escapeHtml(corpo)}</li>`
          : `<li>${escapeHtml(linha)}</li>`;
      }).join("")}
    </ul>
  </div>`;
}


// Nivel de cuidado: a PRIMEIRA decisao da Conduta, e por isso o primeiro bloco
// da tela — onde tratar decide-se antes de com o que tratar.
//
// Existe porque nao existia. Num caso de depressao psicotica com sindrome de
// Cotard, recusa alimentar, perda de 11 kg e ideacao suicida, o programa propos
// antidepressivo e psicoeducacao sem em nenhum momento dizer que aquilo era
// indicacao de leito. Nao havia onde escrever: a conduta caia num campo de texto
// livre que nada confere e que nao volta para o raciocinio.
export function careLevelView(form = {}) {
  const proposto = String(form.nivelCuidadoAi || "").trim();
  const justificativaIa = String(form.nivelCuidadoAiJustificativa || "").trim();
  const escolhido = String(form.nivelCuidado || "").trim();
  const justificativa = String(form.nivelCuidadoJustificativa || "").trim();
  // Radio, e nao caixa de selecao como o resto do programa: nao se esta ao
  // mesmo tempo em ambulatorio e internado.
  const opcoes = careLevelOptions.map(nivel => {
    const sugerido = normalizeText(nivel) === normalizeText(proposto);
    return `<label class="diagnosis-option care-option${sugerido ? " care-suggested" : ""}">
      <input type="radio" name="nivelCuidado" value="${escapeAttr(nivel)}" ${escolhido === nivel ? "checked" : ""} />
      <span><strong>${escapeHtml(nivel)}</strong>${sugerido ? ' <em class="care-tag">sugerido</em>' : ""}
      ${careLevelNotes[nivel] ? `<small>${escapeHtml(careLevelNotes[nivel])}</small>` : ""}</span>
    </label>`;
  }).join("");
  // Aviso, e nao bloqueio: quem decide e ele, e um programa que se recusa a
  // salvar no meio de uma urgencia atrapalha em vez de ajudar. Mas indicar leito
  // sem escrever por que e o que nao pode ficar calado no prontuario.
  const exigeJustificativa = CARE_LEVELS_REQUIRING_JUSTIFICATION.has(escolhido) && !justificativa;
  // Risco agudo nas escalas desta consulta (ASQ, C-SSRS), desde 10/09/2026. Ate
  // entao a C-SSRS podia dar "risco alto" e o ambulatorial ser marcado sem uma
  // palavra. Aviso, pelo mesmo motivo do de cima: tratar em ambulatorio com esse
  // resultado pode ser a decisao certa -- plano de seguranca, rede de apoio,
  // retorno em dias --, mas a razao tem de estar escrita.
  const riscoAgudo = scaleAcuteRisk(form);
  const ambulatorialSemRazao = riscoAgudo.length > 0 && escolhido === "Ambulatorial" && !justificativa;
  return `<div class="clinical-card care-card">
    <h4>Nível de cuidado</h4>
    <p class="panel-note">${proposto
      ? `Proposto pela literatura: <strong>${escapeHtml(proposto)}</strong>${justificativaIa ? ` — ${escapeHtml(justificativaIa)}` : ""}`
      : "A IA propõe uma modalidade após a geração. A escolha é sempre sua."}</p>
    ${riscoAgudoView(riscoAgudo, "desta consulta")}
    <textarea hidden name="nivelCuidadoAi">${escapeHtml(proposto)}</textarea>
    <textarea hidden name="nivelCuidadoAiJustificativa">${escapeHtml(justificativaIa)}</textarea>
    <div class="care-levels">${opcoes}</div>
    ${exigeJustificativa
      ? `<p class="care-warning">Registre abaixo por que ${escapeHtml(escolhido.toLowerCase())} — a indicação de leito precisa da justificativa no prontuário.</p>`
      : ""}
    ${ambulatorialSemRazao
      ? `<p class="care-warning">Tratamento ambulatorial com risco agudo nas escalas: registre abaixo por que é seguro agora, qual o plano de segurança e quando é o retorno.</p>`
      : ""}
    ${textarea("nivelCuidadoJustificativa", "Justificativa do médico", justificativa, "Por que este nível de cuidado, neste momento.", 2)}
  </div>`;
}

// O mesmo aviso nos dois lugares em que se decide a conduta: o Nivel de cuidado
// da consulta e o Ajuste de conduta do retorno.
function riscoAgudoView(riscos = [], onde = "desta consulta", complemento = "") {
  if (!riscos.length) return "";
  const lista = riscos.map(item => `${item.sigla}: ${item.rotulo.toLowerCase()}`).join("; ");
  return `<p class="scale-alert care-scale-risk" role="alert">Risco agudo nas escalas ${escapeHtml(onde)}: ${escapeHtml(lista)}.${complemento ? ` ${escapeHtml(complemento)}` : ""}</p>`;
}
