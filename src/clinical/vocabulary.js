import { optionGroups } from "../data/examOptions.js?v=tratamento-1";

export const MENTAL_EXAM_KEYS = Object.freeze([
  "aparencia",
  "consciencia",
  "atencao",
  "orientacao",
  "memoria",
  "sensopercepcao",
  "pensamentoCursoForma",
  "pensamentoConteudo",
  "linguagem",
  "humor",
  "afeto",
  "psicomotricidade",
  "vontade",
  "juizoCritico"
]);

export const PROFESSIONAL_TERM_REPLACEMENTS = Object.freeze([
  [/\bnao\b/gi, "não"],
  [/\bideacao\b/gi, "ideação"],
  [/\bintencao\b/gi, "intenção"],
  [/\bativacao\b/gi, "ativação"],
  [/\bperseguicao\b/gi, "perseguição"],
  [/\breferencia\b/gi, "referência"],
  [/\bdesconfianca\b/gi, "desconfiança"],
  [/\bvozes ou ruidos\b/gi, "vozes ou ruídos"],
  [/\bdesorganizado\b/gi, "desorganizado"],
  [/\bsensacao\b/gi, "sensação"],
  [/\binterferencia\b/gi, "interferência"],
  [/\bpensamento psicotico\b/gi, "pensamento psicótico"],
  [/\bpsicotico\b/gi, "psicótico"],
  [/\bconcentracao\b/gi, "concentração"],
  [/\balucinacao\b/gi, "alucinação"],
  [/\bdelirio\b/gi, "delírio"],
  [/\bdoenca\b/gi, "doença"],
  [/\bespaco\b/gi, "espaço"],
  [/\bnegacao\b/gi, "negação"],
  [/\bcritica\b/gi, "crítica"],
  [/\bfuncoes mnesicas\b/gi, "funções mnésicas"],
  [/\bantipsicotico\b/gi, "antipsicótico"],
  [/\bprejuizo\b/gi, "prejuízo"],
  [/\bhabitos\b/gi, "hábitos"],
  [/\bsedacao\b/gi, "sedação"],
  [/\balteracao\b/gi, "alteração"],
  [/\bmetabolica\b/gi, "metabólica"],
  [/\bdisfuncao\b/gi, "disfunção"],
  [/\burgencia\b/gi, "urgência"],
  [/\binternacao\b/gi, "internação"]
]);

export const EVOLUTION_REFRESH_PATTERNS = Object.freeze([
  /^\s*Paciente\s+/i,
  /Durante o rastreio/i,
  /Quanto ao\s+/i,
  /No rastreio (depressivo|psicótico)/i,
  /foram registrados:/i,
  /foram assinalados:/i,
  /registra-se nega/i,
  /associa[cç][aã]o com sem fator claro/i,
  /antecedentes m[eé]dicos de nega/i,
  /exame ps[ií]quico, apresenta-se/i
]);

export const RETURN_BOILERPLATE_PHRASES = Object.freeze([
  "Sem antecedentes relevantes informados.",
  "Sem antecedentes ou habitos relevantes informados ate o momento.",
  "Sem alterações descritas no exame psíquico.",
  "Paciente sem alteracoes descritas no exame psiquico.",
  "Hipóteses diagnósticas não selecionadas.",
  "Conduta médica e exames não registrados."
]);

export const consultationPages = [
  ["anamnese", "Anamnese"],
  ["psiquico", "Exame psiquico"],
  ["neurologico", "Exame fisico"],
  ["refinamento", "Refinamento"],
  ["resumo", "Resumo"],
  ["diagnostico", "Diagnostico"],
  ["tratamento", "Tratamento"],
  ["evolucao", "Historia clinica"],
  ["medicamentos", "Medicamentos"]
];

export const returnPages = [
  ["evolucao-retorno", "Evolucao"],
  ["texto-retorno", "Texto final"]
];

export const doctorDiagnosisOptions = [
  "Ausencia de psicopatologia de relevancia clinica - a mente esta funcionando dentro do esperado para os desafios atuais.",
  "Sintomas reativos/adaptativos - sofrimento como reacao a um problema especifico, como luto, termino ou estresse profissional.",
  "Z03.2 (CID-10) - Observacao por suspeita de transtornos mentais e de comportamento, quando a suspeita foi descartada.",
  "Z00.4 (CID-10) - Exame psiquiatrico geral, incluindo exames admissionais sem psicopatologia identificada.",
  "Outro"
];

export const laboratoryExamRequestItems = [
  "Hemograma",
  "Sodio",
  "Potassio",
  "Glicemia de jejum",
  "Hemoglobina glicada (HbA1c)",
  "Perfil lipidico",
  "Creatinina",
  "Ureia",
  "TGO",
  "TGP",
  "TSH",
  "T4 livre",
  "Vitamina D",
  "Vitamina B12",
  "Folato"
];

export const anamnesisQuestionGroups = [
  {
    title: "",
    items: [
      ["Impacto", [
        {
          key: "impactoSintomas",
          response: "multiple",
          question: "De que forma isso que voce esta sentindo atrapalha o seu trabalho, seus estudos ou suas relacoes?",
          options: ["Nenhuma", "Leve", "Moderado", "Grave", "Outro"],
          otherKey: "impactoSintomasOutro"
        }
      ]],
      ["Mania/hipomania", [
        {
          key: "maniaHipomaniaSintomas",
          response: "multiple",
          question: "Ja teve periodos, por dias, que voce ficou:",
          options: ["Nega sintomas relacionados", "Muito acelerado", "Com muita energia", "Falando mais", "Dormindo pouco", "Fazendo coisas impulsivas", "Outro"],
          otherKey: "maniaHipomaniaSintomasOutro"
        }
      ]],
      ["Ansiedade e panico", [
        {
          key: "ansiedadeSintomas",
          response: "multiple",
          options: [
            "Falta de controle",
            "Preocupacao excessiva",
            "Tensao corporal",
            "Dificuldade de focar",
            "Agitacao",
            "Irritabilidade",
            "Sintomas fisicos"
          ]
        }
      ]],
      ["Sono", [
        {
          key: "sonoCaracteristicas",
          response: "multiple",
          options: [
            "Sono reparador",
            "Sono nao reparador",
            "Dificuldade para adormecer",
            "Despertares noturnos",
            "Despertar precoce",
            "Dormir em excesso"
          ]
        }
      ]],
      ["Apetite", [
        {
          key: "apetiteCaracteristicas",
          response: "multiple",
          options: [
            "Reducao do apetite",
            "Aumento do apetite",
            "Compulsao alimentar",
            "Perda de peso recente",
            "Ganho de peso recente"
          ]
        }
      ]],
      ["Sintomas depressivos", [
        {
          key: "depressaoSintomas",
          response: "multiple",
          options: [
            "Desinteresse ou falta de prazer",
            "Desanimo ou desesperanca",
            "Cansaco ou falta de energia",
            "Dificuldade de concentracao",
            "Fala lenta",
            "Agitacao",
            "Baixa autoestima",
            "Sentimento de ruina",
            "Sentimento de estorvo para a familia"
          ]
        }
      ]]
    ]
  },
  {
    title: "Perguntas apos vinculo com o paciente",
    items: [
      ["Paranoia e sintomas psicoticos", [
        {
          key: "psicoseSintomas",
          response: "multiple",
          options: [
            "Nega sintomas relacionados",
            "Ideias de perseguicao",
            "Sensacao de estar sendo observado ou comentado",
            "Ideias de referencia",
            "Desconfianca excessiva",
            "Vozes ou ruidos sem fonte externa",
            "Visoes sem fonte externa",
            "Sensacoes tateis ou odores sem fonte externa",
            "Pensamento desorganizado",
            "Comportamento desorganizado",
            "Sensacao de controle ou interferencia no pensamento",
            "Outro"
          ],
          otherKey: "psicoseSintomasOutro"
        }
      ]],
      ["Habitos, substancias e comportamentos aditivos", [
        {
          key: "usoSubstanciasComportamentos",
          response: "multiple",
          options: [
            "Nicotina",
            "Alcool",
            "Cafeina",
            "Calmantes",
            "Estimulantes",
            "Cocaina",
            "Opioides",
            "Canabinoides",
            "Jogos de Azar",
            "Redes Sociais",
            "Compras Compulsivas",
            "Transtornos Alimentares"
          ]
        }
      ]],
      ["Risco de suicidio e desesperanca", [
        {
          key: "riscoSuicidioIndicadores",
          // Sem label, a linha do resumo repetia o nome da secao em vez de
          // dizer o que ela responde.
          label: "Indicadores de risco",
          response: "multiple",
          options: [
            "Nega ideacao, plano ou intencao suicida",
            "Desesperanca",
            "Desejo de morrer ou de nao acordar",
            "Ideacao suicida",
            "Plano suicida definido",
            "Intencao suicida",
            "Acesso a meios potencialmente letais",
            "Comportamento preparatorio",
            "Tentativa de suicidio previa",
            "Autoagressao sem intencao suicida"
          ]
        },
        { key: "riscoSuicidioRazoesViver", label: "Fatores impeditivos", question: "O que te impede de fazer isso hoje?", response: "text" },
        { key: "riscoSuicidioRazoesParaViver", label: "Razoes para viver", question: "Quais sao suas razoes para viver?", response: "text" }
      ]]
    ]
  }
];

export const optionDisplayLabels = {
  IN_PERSON: "Presencial",
  TELECONSULTATION: "Online",
  HYBRID: "Híbrida"
};

export const ANAMNESIS_AI_FIELDS = {
  depressive_symptoms: ["depressaoSintomas", ["Desinteresse ou falta de prazer", "Desanimo ou desesperanca", "Cansaco ou falta de energia", "Dificuldade de concentracao", "Fala lenta", "Agitacao", "Baixa autoestima", "Sentimento de ruina", "Sentimento de estorvo para a familia"]],
  mania_hypomania: ["maniaHipomaniaSintomas", ["Nega sintomas relacionados", "Muito acelerado", "Com muita energia", "Falando mais", "Dormindo pouco", "Fazendo coisas impulsivas", "Outro"]],
  anxiety_symptoms: ["ansiedadeSintomas", ["Falta de controle", "Preocupacao excessiva", "Tensao corporal", "Dificuldade de focar", "Agitacao", "Irritabilidade", "Sintomas fisicos"]],
  sleep: ["sonoCaracteristicas", ["Sono reparador", "Sono nao reparador", "Dificuldade para adormecer", "Despertares noturnos", "Despertar precoce", "Dormir em excesso"]],
  appetite: ["apetiteCaracteristicas", ["Reducao do apetite", "Aumento do apetite", "Compulsao alimentar", "Perda de peso recente", "Ganho de peso recente"]],
  symptom_impact: ["impactoSintomas", ["Nenhuma", "Leve", "Moderado", "Grave", "Outro"]],
  substances_behaviors: ["usoSubstanciasComportamentos", ["Nicotina", "Alcool", "Cafeina", "Calmantes", "Estimulantes", "Cocaina", "Opioides", "Canabinoides", "Jogos de Azar", "Redes Sociais", "Compras Compulsivas", "Transtornos Alimentares"]],
  psychosis: ["psicoseSintomas", ["Nega sintomas relacionados", "Ideias de perseguicao", "Sensacao de estar sendo observado ou comentado", "Ideias de referencia", "Desconfianca excessiva", "Vozes ou ruidos sem fonte externa", "Visoes sem fonte externa", "Sensacoes tateis ou odores sem fonte externa", "Pensamento desorganizado", "Comportamento desorganizado", "Sensacao de controle ou interferencia no pensamento", "Outro"]],
  suicide_risk: ["riscoSuicidioIndicadores", ["Nega ideacao, plano ou intencao suicida", "Desesperanca", "Desejo de morrer ou de nao acordar", "Ideacao suicida", "Plano suicida definido", "Intencao suicida", "Acesso a meios potencialmente letais", "Comportamento preparatorio", "Tentativa de suicidio previa", "Autoagressao sem intencao suicida"]],
  previous_diagnoses: ["psiPrevios", optionGroups.psiPrevios],
  previous_treatments: ["tratamentos", optionGroups.tratamentos],
  family_history: ["familiares", optionGroups.familiares],
  worsening_factors: ["fatores", optionGroups.fatores],
  improving_factors: ["fatoresMelhora", optionGroups.fatoresMelhora],
  functional_impact: ["impacto", optionGroups.impacto]
};

export const MENTAL_EXAM_AI_FIELDS = {
  appearance: "aparencia", attention: "atencao", orientation: "orientacao", memory: "memoria",
  perception: "sensopercepcao", thought_course: "pensamentoCursoForma", thought_content: "pensamentoConteudo",
  language: "linguagem", mood: "humor", affect: "afeto", psychomotor: "psicomotricidade",
  volition: "vontade", judgment: "juizoCritico"
};

export function pagesForScope(scope) {
  return scope === "consultation" ? consultationPages : returnPages;
}
