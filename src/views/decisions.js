import { diagnosticAggravatingOptionLines, diagnosticComorbidityOptionLines, diagnosticEtiologicalOptionLines, diagnosticNosologicalOptionLines, diagnosticSpecifierOptionLines, diagnosticSyndromicOptionLines, selectedAggravatingValues, selectedComorbidityValues, selectedDiagnosisText, selectedDiagnosisValues, selectedSpecifierValues, treatmentOptionLines } from "../clinical/diagnosis.js";
import { buildEvolutionNarrative, normalizeEvolutionNarrative, outdatedEvolutionText, requestedExamsText, returnEvolutionContainsIdentity, shouldRefreshEvolutionNarrative } from "../clinical/narrative.js";
import { CRITERION_SEPARATOR } from "../clinical/aiDiagnosisResult.js";
import { arrayValue, normalizeText } from "../clinical/textFormat.js";
import { doctorDiagnosisOptions } from "../clinical/vocabulary.js";
import { optionGroups } from "../data/examOptions.js";
import { CARE_LEVELS_REQUIRING_JUSTIFICATION, careLevelNotes, careLevelOptions } from "../data/careLevels.js";
import { chips, textarea } from "../ui/controls.js";
import { referenceFor } from "../data/references.js";
import { escapeAttr, escapeHtml } from "../ui/html.js";

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
      ${aiModeSelector(form.aiMode)}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-diagnosis">Gerar</button>
        ${refineButton("refine-diagnosis", selectedValues.length > 0)}
      </div>
      ${aiStatus ? `<p class="online-status">${escapeHtml(aiStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSourcesDiagnostico)}
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
    ${diagnosisCategory("Sindrômico", syndromicOptions, selectedValues, "Sinais e sintomas inespecíficos, presentes em vários transtornos. Norteia a conduta imediata — alívio do sofrimento, controle de risco — mesmo antes de saber a causa ou o nome definitivo do quadro.")}
    ${diagnosisCategory("Nosológico", nosologicalOptions, selectedValues, "Base do tratamento principal e do seguimento. Linguagem universal entre profissionais — CID-11 e DSM-5-TR —, sustenta atestados, laudos e direitos previdenciários, e é quem recebe os especificadores.", false, diagnosticCriteriaByOption(form))}
    ${checklistGroup({
      label: "Especificadores", campo: "especificadorSelecionado",
      options: specifierOptions, selecionados: selectedSpecifiers,
      vazio: "Nenhum especificador proposto. O catálogo local não propõe especificador — gravidade, remissão e curso não se leem por correspondência de termo."
    })}
    ${checklistGroup({
      label: "Comorbidades", campo: "comorbidadeSelecionada", compacto: true,
      options: comorbidityOptions, selecionados: selectedComorbidities,
      papel: "Entidade que coexiste com a hipótese principal, e não alternativa a ela. Leva código pelo mesmo motivo da camada nosológica: é entidade dos manuais.",
      vazio: "Nenhuma comorbidade proposta. Afirmar que duas entidades coexistem não se lê por correspondência de termo — vem da IA."
    })}
    ${checklistGroup({
      label: "Fatores agravantes", campo: "agravanteSelecionado", compacto: true,
      options: aggravatingOptions, selecionados: selectedAggravating,
      papel: "Não são diagnóstico: são o que piora o curso, a resposta ao tratamento e o prognóstico — insônia crônica, uso nocivo de álcool, baixa adesão, conflito conjugal, doença clínica descompensada.",
      vazio: "Nenhum fator agravante proposto."
    })}
    ${diagnosisCategory("Etiológico", etiologicalOptions, selectedValues, "A raiz do mal. Permite o tratamento causal e definitivo — tratar a tireoide em vez de medicar o sintoma —, evita erro grosseiro de manejo e previne recidiva. Pede acompanhamento multiprofissional e longitudinal.", true)}
    <div class="diagnosis-group diagnosis-group-compact diagnosis-doctor-group">
      <h4>Hipóteses do médico</h4>
      <div class="diagnosis-options">${diagnosisOptionCheckboxes(doctorDiagnosisOptions, selectedValues)}</div>
      ${textarea("diagnosticoMedicoOutro", "Ao marcar \"Outro\": escreva a hipótese e os códigos", form.diagnosticoMedicoOutro, "Ex.: Transtorno de ansiedade generalizada - CID-11: 6B00 - DSM-5-TR: F41.1", 2)}
    </div>
  `;
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
function diagnosisCategory(label, options, selectedValues, papel = "", compacto = false, criterios = new Map()) {
  const total = options.length
    ? `${options.length} ${options.length === 1 ? "hipótese" : "hipóteses"}`
    : "sem hipóteses";
  return `<div class="diagnosis-group${compacto ? " diagnosis-group-compact" : ""}"><h4>${label} — ${total}</h4>
      ${papel ? `<p class="diagnosis-role">${escapeHtml(papel)}</p>` : ""}
      <div class="diagnosis-options">
        ${options.length ? diagnosisOptionCheckboxes(options, selectedValues, criterios) : `<p class="diagnosis-empty">O registro atual não sustenta hipótese nesta categoria. Veja <strong>Hipóteses do médico</strong>.</p>`}
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
      <li class="criterion-${item.status.replace(/\s+/g, "-")}">
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
function checklistGroup({ label, campo, options, selecionados, vazio, papel = "", compacto = false }) {
  const marcados = new Set(selecionados.map(normalizeText));
  return `<div class="diagnosis-group${compacto ? " diagnosis-group-compact" : ""}">
    <h4>${label} — ${options.length ? `${options.length}` : "nenhum"}</h4>
    ${papel ? `<p class="diagnosis-role">${escapeHtml(papel)}</p>` : ""}
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

function diagnosisOptionCheckboxes(options, selectedValues, criterios = new Map()) {
  // Comparacao sem acento: os nomes do catalogo foram acentuados, e um
  // prontuario salvo antes disso guarda "Sindrome Ansiosa". Comparando literal,
  // a marcacao do medico sumia da tela sem sumir do registro.
  const marcados = new Set(selectedValues.map(normalizeText));
  return options.map(option => {
    // Os criterios ficam FORA do <label>: dentro dele, clicar para abrir a lista
    // marcaria a caixa de selecao, e ele assinalaria a hipotese so por querer
    // conferir por que ela foi proposta.
    const lista = criterionList(criterios.get(normalizeText(option)) || []);
    return `<div class="diagnosis-option-block">
      <label class="diagnosis-option">
        <input type="checkbox" name="diagnosticoSelecionado" value="${escapeAttr(option)}" ${marcados.has(normalizeText(option)) ? "checked" : ""} />
        <span>${escapeHtml(option)}</span>
      </label>
      ${lista}
    </div>`;
  }).join("");
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

export function aiModeSelector(value = "current", name = "aiMode") {
  return `<fieldset class="ai-mode-selector">
    <legend>Fonte da resposta</legend>
    <label><input type="radio" name="${name}" value="current" ${value !== "rag" ? "checked" : ""} /><span>IA Nuvem</span><small>Pesquisa na web: bula vigente, alerta de agência, diretriz recente. Não lê os livros indexados</small></label>
    <label><input type="radio" name="${name}" value="rag" ${value === "rag" ? "checked" : ""} /><span>RAG com literatura</span><small>Restringe a resposta às fontes indexadas (psicopatologia e psicofarmacologia)</small></label>
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
      ...paginas.map(item => `
      <li><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.url)}</a><span>${escapeHtml(item.site || "")}</span></li>`),
      // Sem URL, a procedencia possivel e a CONSULTA: o que ele foi procurar.
      // Vale mostrar — e o que permite ver que a busca foi ao lugar certo, e que
      // nao levou nada do paciente junto.
      ...consultas.map(item => `<li><span>${escapeHtml(item.query)}</span></li>`)
    ].join("")}</ol></details>`;
}

export function treatmentModule(form) {
  const examesText = requestedExamsText(form);
  const medicationOptions = treatmentOptionLines(form.tratamentoAiMedicamentos);
  const approachOptions = treatmentOptionLines(form.tratamentoAiAbordagens);
  const selectedApproaches = arrayValue(form.abordagensSelecionadas);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.pharmaAiMode || "rag", "pharmaAiMode")}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-treatment">Gerar</button>
        ${refineButton("refine-treatment", medicationOptions.length || approachOptions.length)}
      </div>
      ${form.treatmentStatus ? `<p class="online-status">${escapeHtml(form.treatmentStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSourcesTratamento)}
    </div>
    ${careLevelView(form)}
    <div class="treatment-card-grid">
      <div class="treatment-card">
        <h4>Abordagem medicamentosa</h4>
        <textarea hidden name="tratamentoAiMedicamentos">${escapeHtml(medicationOptions.join("\n"))}</textarea>
        <textarea hidden name="tratamentoMedicamentoso">${escapeHtml(form.tratamentoMedicamentoso || "")}</textarea>
        <div class="diagnosis-options">
          ${medicationOptions.length ? medicationOptions.map((option, index) => `<article class="treatment-card"><h4>${index === 0 ? "1ª opção" : index === 1 ? "2ª opção" : "Off-label"}</h4><label class="diagnosis-option treatment-option"><input type="checkbox" name="tratamentoMedicamentosSelecionados" value="${escapeAttr(option)}" ${arrayValue(form.tratamentoMedicamentosSelecionados).includes(option) ? "checked" : ""} /><span>${escapeHtml(option)}</span></label></article>`).join("") : `<p class="diagnosis-empty">As opções aparecerão após a geração.</p>`}
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
      <span>${escapeHtml(option)}</span>
    </label>
  `).join("");
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
export function returnPlanModule(form) {
  const medicacao = treatmentOptionLines(form.ajusteAiMedicacao);
  const conduta = treatmentOptionLines(form.ajusteAiConduta);
  const gerado = medicacao.length || conduta.length;
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.returnPlanAiMode || "rag", "returnPlanAiMode")}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-return-plan">Gerar</button>
      </div>
      ${form.returnPlanStatus ? `<p class="online-status">${escapeHtml(form.returnPlanStatus)}</p>` : ""}
      ${ragSourcesView(form.ragSourcesAjuste)}
    </div>
    <div class="treatment-card-grid">
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
  return arrayValue(form.ajusteMedicacaoSelecionada).length > 0
    || arrayValue(form.ajusteCondutaSelecionada).length > 0
    || Boolean(String(form.ajusteAcrescimo || "").trim());
}

export function evolutionBody(form, patient, previous = null, isReturn = false) {
  const evolution = outdatedEvolutionText(form.evolution)
    || shouldRefreshEvolutionNarrative(form.evolution)
    || (isReturn && returnEvolutionContainsIdentity(form.evolution, patient))
    || (isReturn && form.evolutionAutoGenerated && !normalizeText(form.evolution).startsWith("paciente retornou"))
    ? ""
    : normalizeEvolutionNarrative(form.evolution);
  const generatedEvolution = buildEvolutionNarrative(form, patient, previous, isReturn);
  return `
    <div class="diagnosis-ai-panel">
      ${aiModeSelector(form.evolutionAiMode || "rag", "evolutionAiMode")}
      <div class="actions">
        <button class="primary" type="button" data-action="generate-evolution">${isReturn ? "Atualizar evolução" : "Atualizar história clínica"}</button>
      </div>
      ${form.aiStatus ? `<p class="online-status">${escapeHtml(form.aiStatus)}</p>` : ""}
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
    <p class="online-status">Cada achado vem com o trecho do registro que o sustenta. Achado sem evidência no prontuário não entra — e o catálogo local, que casa termo, não produz esta análise.</p>
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
      <small>${escapeHtml(careLevelNotes[nivel] || "")}</small></span>
    </label>`;
  }).join("");
  // Aviso, e nao bloqueio: quem decide e ele, e um programa que se recusa a
  // salvar no meio de uma urgencia atrapalha em vez de ajudar. Mas indicar leito
  // sem escrever por que e o que nao pode ficar calado no prontuario.
  const exigeJustificativa = CARE_LEVELS_REQUIRING_JUSTIFICATION.has(escolhido) && !justificativa;
  return `<div class="clinical-card care-card">
    <h4>Nível de cuidado</h4>
    <p class="online-status">${proposto
      ? `Proposto pela literatura: <strong>${escapeHtml(proposto)}</strong>${justificativaIa ? ` — ${escapeHtml(justificativaIa)}` : ""}`
      : "A IA propõe uma modalidade após a geração. A escolha é sempre sua."}</p>
    <textarea hidden name="nivelCuidadoAi">${escapeHtml(proposto)}</textarea>
    <textarea hidden name="nivelCuidadoAiJustificativa">${escapeHtml(justificativaIa)}</textarea>
    <div class="care-levels">${opcoes}</div>
    ${exigeJustificativa
      ? `<p class="care-warning">Registre abaixo por que ${escapeHtml(escolhido.toLowerCase())} — a indicação de leito precisa da justificativa no prontuário.</p>`
      : ""}
    ${textarea("nivelCuidadoJustificativa", "Justificativa do médico", justificativa, "Por que este nível de cuidado, neste momento.", 2)}
  </div>`;
}
