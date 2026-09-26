import { countLabel } from "./aiDiagnosisResult.js";
import { formatMedicationTreatmentOption, formatNonPharmacologicalOption, treatmentOptionLines } from "./diagnosis.js";
import { requestedExamsText } from "./narrative.js";
import { arrayValue } from "./textFormat.js";

// Transformacao do que a IA devolve no Tratamento e no Ajuste de conduta no que
// o formulario guarda. Funcoes puras, como as do diagnostico.
//
// `target` e o rascunho de AGORA, lido depois da espera pela IA -- nao o que
// estava na tela quando ela foi chamada. A chamada leva dezenas de segundos e o
// formulario continua editavel: o que o medico marcou nesse intervalo tem de
// sobreviver, e uma copia velha do rascunho desfaria a escolha dele.
//
// Os seletores de modo (pharmaAiMode, returnPlanAiMode) ficam de fora do que
// volta: guardam a ESCOLHA dele. O servidor cai do RAG para a web quando o
// acervo nao sustenta a resposta, e gravar o modo que respondeu trocaria o radio
// -- e mandaria toda geracao seguinte para a web -- sem ele pedir. A fonte que
// respondeu ja aparece no painel de fontes.

export function treatmentSuggestionFromAi({ result = {}, target = {}, sources = [], mode = "", revisao = false }) {
  const medicationOptions = result.medication_options.map(formatMedicationTreatmentOption);
  const approachOptions = result.non_pharmacological_options.map(formatNonPharmacologicalOption);
  return {
    // A IA propoe o nivel; quem assinala e o medico, como em todo o resto do
    // programa. Privar alguem de liberdade nao e decisao que se aceita por
    // omissao, entao o radio nao vem marcado.
    nivelCuidadoAi: result.care_level?.level || "",
    nivelCuidadoAiJustificativa: result.care_level?.justification || "",
    nivelCuidado: target?.nivelCuidado || "",
    nivelCuidadoJustificativa: target?.nivelCuidadoJustificativa || "",
    tratamentoAiMedicamentos: medicationOptions.join("\n"),
    tratamentoAiAbordagens: approachOptions.join("\n"),
    // Mesmo criterio ja aplicado ao diagnostico: a IA propoe, quem assinala
    // e o medico. Marcar as tres opcoes de saida inverte o onus — passaria a
    // ser preciso descartar duas prescricoes em vez de escolher uma.
    tratamentoMedicamentosSelecionados: arrayValue(target?.tratamentoMedicamentosSelecionados),
    abordagensSelecionadas: arrayValue(target?.abordagensSelecionadas),
    tratamentoMedicamentoso: "",
    abordagensTerapeuticas: "",
    examesLaboratoriais: requestedExamsText(target || {}),
    condutaMedica: target?.condutaMedica || "",
    ragSourcesTratamento: sources,
    // A primeira proposta, guardada quando o refino a substitui. Geracao nova
    // limpa: a comparacao so vale entre a proposta e a revisao dela.
    tratamentoRefinoAnterior: revisao ? {
      em: new Date().toISOString(),
      medicamentos: treatmentOptionLines(target?.tratamentoAiMedicamentos),
      abordagens: treatmentOptionLines(target?.tratamentoAiAbordagens),
      retiradas: [...arrayValue(target?.tratamentoMedicamentosSelecionados), ...arrayValue(target?.abordagensSelecionadas)]
        .filter(item => !medicationOptions.includes(item) && !approachOptions.includes(item))
    } : null,
    treatmentStatus: `${revisao ? (mode === "rag" ? "Refinado pela fonte especializada: " : "Refinado pela web, porque o acervo não sustentou: ") : ""}${result.care_level ? `Nível de cuidado proposto: ${result.care_level.level}. ` : "Nenhum nível de cuidado foi proposto — a resposta veio sem modalidade ou sem justificativa. "}${countLabel(medicationOptions.length, "opção medicamentosa", "opções medicamentosas")} e ${countLabel(approachOptions.length, "outra abordagem", "outras abordagens")} propostas para você assinalar. Suas escolhas anteriores foram mantidas.`,
    aiStatus: revisao ? "Tratamento refinado pela fonte especializada, para revisão médica." : "Sugestões de tratamento geradas pela IA para revisão médica."
  };
}

// Uma linha por hipotese, no mesmo espirito de returnPlanMedicationLines: a
// linha carrega a decisao inteira, para a caixa assinalada nao virar marca sem
// contexto no prontuario. O prefixo "Hipotese nova: " so entra quando a IA
// marcou 'nova' -- e o que impede o medico de ler uma proposta de diferencial
// como se fosse a confirmacao de uma hipotese que ja existia.
export function returnPlanHypothesisLines(result = {}) {
  return (result.hypothesis_updates || []).flatMap(item => {
    const rotulo = String(item?.rotulo || "").trim();
    const decisao = String(item?.decisao || "").trim();
    if (!rotulo || !decisao) return [];
    const prefixo = item?.nova ? "Hipótese nova: " : "";
    return [`${prefixo}${rotulo} — ${decisao}`];
  }).filter((linha, index, lista) => lista.indexOf(linha) === index);
}

// Uma linha por farmaco, e a linha carrega a decisao inteira: sem o "por que", a
// caixa assinalada vira ordem sem motivo no prontuario, e o motivo e o que o
// medico esta conferindo quando aceita ou recusa.
export function returnPlanMedicationLines(result = {}) {
  return (result.medication_actions || []).flatMap(item => {
    const farmaco = String(item?.medication || "").trim();
    const acao = String(item?.action || "").trim();
    if (!farmaco || !acao) return [];
    const detalhe = String(item?.detail || "").trim();
    const porque = String(item?.rationale || "").trim();
    return [[`${farmaco} — ${acao}`, detalhe, porque].filter(Boolean).join(" | ")];
  }).filter((linha, index, lista) => lista.indexOf(linha) === index);
}

export function returnPlanSuggestionFromAi({ result = {}, target = {}, sources = [], mode = "" }) {
  const hipoteses = returnPlanHypothesisLines(result);
  const medicacao = returnPlanMedicationLines(result);
  const conduta = (result.conduct_options || []).map(item => String(item || "").trim()).filter(Boolean);
  return {
    ajusteAiHipoteses: hipoteses.join("\n"),
    ajusteAiMedicacao: medicacao.join("\n"),
    ajusteAiConduta: conduta.join("\n"),
    // As escolhas anteriores sobrevivem a uma nova geracao, como no
    // Diagnostico e no Tratamento: regerar nao pode apagar o que ele ja
    // decidiu. As linhas que sumirem da nova proposta caem sozinhas, porque a
    // caixa so existe enquanto a linha existir.
    ajusteHipotesesSelecionada: arrayValue(target?.ajusteHipotesesSelecionada),
    ajusteMedicacaoSelecionada: arrayValue(target?.ajusteMedicacaoSelecionada),
    ajusteCondutaSelecionada: arrayValue(target?.ajusteCondutaSelecionada),
    ragSourcesAjuste: sources,
    returnPlanStatus: hipoteses.length || medicacao.length || conduta.length
      ? `${countLabel(hipoteses.length, "hipótese", "hipóteses")}, ${countLabel(medicacao.length, "decisão de medicamento", "decisões de medicamento")} e ${countLabel(conduta.length, "ajuste de conduta", "ajustes de conduta")} para você assinalar. Nada entra no prontuário sem a sua marcação.`
      : "A IA não propôs ajuste algum. Verifique se o atendimento anterior tem medicamento assinalado."
  };
}
