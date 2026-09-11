import { scaleById } from "../data/scales.js";
import { patientAge } from "./lifeStage.js";
import { arrayValue, normalizeText } from "./textFormat.js";

// Escalas sugeridas para o caso, desde 10/09/2026. Sugestao, e nao obrigacao:
// a tela destaca a escala e diz por que, e quem marca e o medico. O motivo
// sempre vem de um dado ja registrado -- a anamnese, a idade, a gestacao, o
// atendimento anterior --, nunca de palpite.
//
// No retorno a anamnese e a da consulta a que ele responde: o retorno nao
// refaz o rastreio, e o que motivou a escala continua valendo.

const NEGACOES = new Set(["nega sintomas relacionados", "nega ideacao, plano ou intencao suicida", "nenhum"]);

function marcados(form, campo) {
  return arrayValue(form[campo]).filter(valor => !NEGACOES.has(normalizeText(valor)));
}

function temOpcao(form, campo, opcoes) {
  const procuradas = opcoes.map(normalizeText);
  return arrayValue(form[campo]).some(valor => procuradas.includes(normalizeText(valor)));
}

export function ageInMonths(nascimento, hoje = new Date()) {
  if (!nascimento) return null;
  const inicio = new Date(`${nascimento}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return null;
  let meses = (hoje.getFullYear() - inicio.getFullYear()) * 12 + hoje.getMonth() - inicio.getMonth();
  if (hoje.getDate() < inicio.getDate()) meses -= 1;
  return meses >= 0 ? meses : null;
}

export function suggestedScales(form = {}, patient = {}, { isReturn = false, previous = null } = {}) {
  const sugestoes = new Map();
  const sugerir = (id, motivo) => {
    if (!scaleById(id)) return;
    const motivos = sugestoes.get(id) || [];
    if (!motivos.includes(motivo)) motivos.push(motivo);
    sugestoes.set(id, motivos);
  };

  if (isReturn) {
    arrayValue(previous?.escalasAplicadas).forEach(id => sugerir(id, "aplicada no atendimento anterior, para comparar"));
    sugerir("cgi-i", "retorno: melhora desde o início do tratamento");
  }

  const anamnese = isReturn ? (previous || {}) : form;
  if (marcados(anamnese, "riscoSuicidioIndicadores").length) sugerir("cssrs", "indicador de risco de suicídio na anamnese");
  if (marcados(anamnese, "depressaoSintomas").length) sugerir("phq9", "sintomas depressivos na anamnese");
  if (marcados(anamnese, "ansiedadeSintomas").length) sugerir("gad7", "sintomas ansiosos na anamnese");
  if (marcados(anamnese, "maniaHipomaniaSintomas").length) sugerir("mdq", "rastreio de mania positivo");
  if (temOpcao(anamnese, "usoSubstanciasComportamentos", ["Alcool"]) || temOpcao(anamnese, "substancias", ["Alcool"])) {
    sugerir("audit", "uso de álcool registrado");
  }
  if (temOpcao(anamnese, "psiPrevios", ["TOC"])) sugerir("ybocs", "TOC entre os diagnósticos prévios");

  const idade = patientAge(patient);
  const menor = idade !== null && idade < 18;
  // TDAH: ASRS no adulto, SNAP-IV na crianca e no adolescente. Sem idade
  // registrada, fica a do adulto, que e o paciente habitual do consultorio.
  if (temOpcao(anamnese, "psiPrevios", ["TDAH"])) sugerir(menor ? "snap4" : "asrs18", "TDAH entre os diagnósticos prévios");
  if (menor && temOpcao(anamnese, "escolaridadeContexto", ["Queda de rendimento", "Dificuldade de aprendizagem"])) {
    sugerir("snap4", "queixa escolar registrada");
  }
  // M-CHAT-R/F: a janela da triagem de autismo e de 16 a 30 meses, e a idade
  // em anos nao a enxerga.
  const meses = ageInMonths(patient.nascimento);
  if (meses !== null && meses >= 16 && meses <= 30) sugerir("mchat", "16 a 30 meses, idade da triagem de autismo");
  if (idade !== null && idade >= 60) sugerir("gds15", "60 anos ou mais");
  if (arrayValue(anamnese.gravidez)[0] === "Sim, com certeza") sugerir("epds", "gestação");
  if (temOpcao(anamnese, "cicloReprodutivo", ["Puerperio", "Amamentando"])) sugerir("epds", "pós-parto ou amamentação");

  return [...sugestoes].map(([id, motivos]) => ({ id, sigla: scaleById(id).sigla, motivos }));
}
