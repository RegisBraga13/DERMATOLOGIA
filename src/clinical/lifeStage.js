// A IDADE COMO DADO CLINICO, e nao como enfeite da identificacao.
//
// Ate 02/09/2026 a idade e o sexo chegavam a IA numa linha so -- "paciente
// feminino, 42 anos, solteira, agricultora" -- perdida entre trinta outras, e
// nenhuma regra em nenhuma etapa mandava usa-las. Na pratica o programa
// raciocinava como se todo paciente tivesse 35 anos.
//
// O custo disso e clinico, e nao cosmetico. Depressao na crianca se apresenta
// como irritabilidade e queixa somatica, e nao como tristeza relatada; no idoso,
// como queixa cognitiva e somatica. Primeiro episodio psicotico aos 70 anos
// quase nunca e esquizofrenia. TDAH e autismo comecam na infancia por
// definicao, e nao "surgem" aos 40. Idoso comeca com metade da dose. Nada disso
// e recuperavel pelo RAG se a pergunta nao disser a idade.
//
// Este modulo nao decide nada sozinho: ele traduz a data de nascimento numa
// faixa, e a faixa num paragrafo que entra no prompt e em quais blocos a tela
// mostra. Quem decide continua sendo o medico, e a hipotese continua vindo da
// literatura.
import { calculateAge } from "./textFormat.js";

// Os cortes sao os do uso clinico, e nao os do estatuto: o que separa as faixas
// aqui e a apresentacao do quadro e o leque de transtornos que comeca em cada
// uma. A adolescencia comeca junto com a puberdade, e nao no aniversario de 12;
// 12 e a aproximacao que uma data de nascimento permite.
export const LIFE_STAGES = [
  { id: "crianca", label: "Criança", min: 0, max: 11 },
  { id: "adolescente", label: "Adolescente", min: 12, max: 17 },
  { id: "adulto-jovem", label: "Adulto jovem", min: 18, max: 24 },
  { id: "adulto", label: "Adulto", min: 25, max: 59 },
  { id: "idoso", label: "Idoso", min: 60, max: 200 }
];

export function lifeStageOf(patient = {}) {
  const idade = calculateAge(patient.nascimento);
  if (idade === "") return null;
  return LIFE_STAGES.find(faixa => idade >= faixa.min && idade <= faixa.max) || null;
}

export function patientAge(patient = {}) {
  const idade = calculateAge(patient.nascimento);
  return idade === "" ? null : idade;
}

// O QUE MUDA EM CADA FAIXA, em uma linha por eixo. Vai inteiro para o prompt.
//
// Nao e conteudo diagnostico e nao substitui o RAG: e o enquadramento da
// pergunta. Diz a IA onde olhar; o que ela vai achar continua saindo da
// literatura indexada.
const ORIENTACAO = {
  crianca: [
    "Apresentacao: depressao aparece como irritabilidade, recusa escolar, queixa somatica (dor de barriga, dor de cabeca) e regressao, e raramente como tristeza relatada. Ansiedade aparece como apego, birra na separacao e mutismo.",
    "Leque: transtornos do neurodesenvolvimento sao a regra desta faixa — TDAH, autismo, transtornos de aprendizagem, tiques, enurese, transtorno de ansiedade de separacao. Psicose e bipolaridade sao raras e exigem cautela redobrada.",
    "Sempre considerar: maus-tratos, negligencia, violencia domestica e bullying como causa do quadro, e nao como comorbidade.",
    "O relato e de terceiro. Distinga o que a crianca disse do que o acompanhante interpretou, e registre divergencia entre casa e escola em vez de resolve-la."
  ],
  adolescente: [
    "Apresentacao: humor deprimido aparece como irritabilidade, isolamento e queda de rendimento escolar. Oscilacao de humor propria da idade nao e ciclagem.",
    "Leque: e a faixa de inicio da esquizofrenia, do transtorno bipolar, dos transtornos alimentares e do uso de substancias. Primeiro episodio psicotico aqui e compativel com a idade.",
    "Sempre considerar: risco suicida (segunda causa de morte na faixa), autolesao sem intencao suicida, uso de substancias, identidade e orientacao, e violencia — inclusive online.",
    "Antidepressivo nesta faixa exige vigilancia de ativacao e de ideacao suicida nas primeiras semanas."
  ],
  "adulto-jovem": [
    "Leque: pico de incidencia do primeiro episodio psicotico, do transtorno bipolar e do transtorno de panico. Transtorno de personalidade so se sustenta com padrao ja estavel, e nao com crise recente.",
    "Sempre considerar: uso de substancias, primeiro episodio, e o impacto sobre formacao e trabalho, que e o que define prejuizo funcional nesta faixa."
  ],
  adulto: [
    "Leque: depressao unipolar, transtornos ansiosos, uso de substancias e causas medicas gerais. Quadro que comeca depois dos 40 pede busca ativa de causa organica, medicamentosa e de uso de substancia antes de fechar hipotese primaria.",
    "Sempre considerar: sobrecarga laboral, perdas, e doenca clinica cronica como causa e como agravante."
  ],
  idoso: [
    "Apresentacao: depressao aparece como queixa cognitiva, somatica e apatia, e frequentemente sem tristeza relatada. Distinga depressao com prejuizo cognitivo (pseudodemencia) de demencia com sintomas depressivos.",
    "Leque: transtorno neurocognitivo, delirium e causas medicas dominam. PRIMEIRO episodio de psicose, mania ou depressao grave nesta idade e, ate prova em contrario, secundario — a doenca medica, ao medicamento ou a lesao.",
    "Sempre considerar: delirium diante de inicio agudo e flutuante; polifarmacia e medicamento com acao anticolinergica; deficit sensorial; quedas; e luto.",
    "Prescricao: comecar com metade da dose do adulto e subir mais devagar. Evitar benzodiazepinico e anticolinergico pelo risco de queda e de piora cognitiva."
  ]
};

// SAUDE REPRODUTIVA, e nao "saude da mulher": o recorte e a capacidade
// gestacional e o eixo hormonal, que e o que muda diagnostico e prescricao.
// Vale para quem tem essa fisiologia, independentemente de como a pessoa se
// identifica — por isso a leitura e do campo sexo, e nao do campo genero.
export function needsReproductiveHistory(patient = {}) {
  const idade = patientAge(patient);
  if (idade === null || idade < 10) return false;
  return String(patient.sexo || "").trim().toLowerCase() === "feminino";
}

export function needsCaregiverHistory(patient = {}) {
  const faixa = lifeStageOf(patient);
  return faixa?.id === "crianca" || faixa?.id === "adolescente";
}

// O paragrafo que entra no prompt. Sem faixa — data de nascimento em branco —
// devolve vazio: melhor nao dizer nada do que afirmar uma idade que ninguem
// informou.
export function lifeStagePromptText(patient = {}) {
  const faixa = lifeStageOf(patient);
  if (!faixa) return "";
  const idade = patientAge(patient);
  const linhas = ORIENTACAO[faixa.id] || [];
  const reprodutivo = needsReproductiveHistory(patient)
    ? ["Saude reprodutiva: considere ciclo menstrual, gestacao, puerperio, amamentacao, contracepcao hormonal e climaterio como parte do quadro e como restricao de prescricao. Gestacao e amamentacao mudam a ESCOLHA do farmaco, e nao apenas a dose."]
    : [];
  return [
    `Faixa etaria: ${faixa.label}${idade === null ? "" : ` (${idade} anos)`}. A idade nao e dado de cadastro: ela muda a apresentacao esperada, o leque de hipoteses plausiveis e a prescricao.`,
    ...linhas,
    ...reprodutivo
  ].join("\n");
}
