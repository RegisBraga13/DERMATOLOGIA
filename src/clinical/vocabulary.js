import { optionGroups } from "../data/examOptions.js";

export const MENTAL_EXAM_KEYS = Object.freeze([
  "aparencia",
  "consciencia",
  "atencao",
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
  ["psiquico", "Exame psíquico"],
  ["neurologico", "Exame físico"],
  ["refinamento", "Refinamento"],
  ["diagnostico", "Diagnóstico"],
  // O Sintoma-Alvo teve pagina propria de 21/08 a 31/08/2026. Saiu do fluxo por
  // decisao dele: a escolha era feita numa lista fixa de trinta sintomas, igual
  // para todo paciente, e o sintoma que nao estivesse nela nao existia. A busca
  // passou para o apendice de Medicamentos, onde se digita o sintoma; o que ele
  // adota de la volta para o Tratamento, que e onde conduta mora e o que o
  // prontuario registra. Uma etapa a menos, e o campo continua no registro.
  ["tratamento", "Tratamento"],
  ["evolucao", "História clínica"],
  // Movido para o fim do ciclo em 24/09/2026 -- por decisao do Dr. Regis. Ate
  // ali ficava antes do Diagnostico, como conferencia previa; nessa posicao
  // nunca podia mostrar diagnostico nem tratamento, porque eles ainda nao
  // existiam. No fim ele fecha o atendimento: anamnese, exame, diagnostico,
  // tratamento e historia clinica, mais os retornos ja salvos deste paciente.
  ["resumo", "Resumo"],
  ["medicamentos", "Medicamentos"],
  // Escalas entrou em 10/09/2026, apendice como Medicamentos: aplica-se quando
  // o caso pede, em qualquer ponto do atendimento, e nao numa etapa fixa.
  ["escalas", "Escalas"],
  // Documentos, tambem apendice (10/09/2026): atestado, declaracao, relatorio
  // e encaminhamento saem do que ja esta registrado no atendimento.
  ["documentos", "Documentos"]
];

// A segunda pagina do retorno era "Texto final", e o titulo dela dizia
// "Evolucao do Retorno", e o botao dizia "Atualizar evolucao": tres nomes para
// a mesma etapa, e a palavra "Evolucao" repetida na aba anterior, que e outra
// coisa. Virou "Ajuste de conduta" em 02/09/2026, que e o que ela faz.
// Medicamentos entrou no retorno em 10/09/2026, como na consulta: apendice, e
// nao etapa. O Ajuste de conduta decide sobre farmaco em uso, e a ficha e o
// capitulo do livro faziam falta justamente ali.
export const returnPages = [
  ["evolucao-retorno", "Evolução"],
  ["texto-retorno", "Ajuste de conduta"],
  ["medicamentos", "Medicamentos"],
  // No retorno as escalas sao onde se ve a mudanca: o resultado sai ao lado do
  // da aplicacao anterior.
  ["escalas", "Escalas"],
  ["documentos", "Documentos"]
];

// As quatro saidas de "nenhum transtorno" carregam codigo pelo mesmo motivo da
// camada nosologica: sem codigo nao sustentam atestado, laudo nem faturamento.
// CID-10 e o da OMS; DSM-5-TR codifica pela CID-10-CM, que diverge nos Z --
// Z03.2 da OMS corresponde a Z03.89 la, e por isso os dois aparecem separados.
export const doctorDiagnosisOptions = [
  "Ausência de psicopatologia de relevância clínica - a mente está funcionando dentro do esperado para os desafios atuais. - CID-10: Z03.2 - DSM-5-TR: Z03.89 (Nenhum diagnóstico ou condição)",
  "Sintomas reativos/adaptativos - sofrimento como reação a um problema específico, como luto, término ou estresse profissional. - CID-10: F43.2 - DSM-5-TR: F43.2x (Transtorno de adaptação, com subtipo)",
  // Sem codigo por decisao dele (31/08/2026): exame psiquiatrico geral e
  // admissional e ato administrativo, e nao achado clinico -- codificar
  // sugeriria que houve avaliacao diagnostica com desfecho, que nao e o caso.
  "Exame psiquiátrico geral, incluindo exames admissionais sem psicopatologia identificada.",
  "Outro"
];

// Rotulos que ja foram gravados em prontuario e mudaram de forma. O texto do
// registro nao muda; o que este mapa faz e reencontrar a opcao correspondente
// para que a marcacao continue aparecendo na tela. So entra aqui quem e a MESMA
// opcao com outra redacao -- o Z00.4, que apenas perdeu os codigos.
// A "Z03.2 (CID-10) - Observacao por suspeita..." nao entra: ela foi excluida
// em 31/08/2026, e por decisao dele desaparece de vez. Prontuario que a tenha
// marcado guarda o texto no registro, mas nao mostra mais a marcacao -- fazer
// ela virar outra opcao seria reescrever uma escolha clinica ja tomada.
export const doctorDiagnosisAliases = new Map([
  ["Z00.4 (CID-10) - Exame psiquiátrico geral, incluindo exames admissionais sem psicopatologia identificada.", 2]
]);

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
      // O grupo "Impacto" saiu daqui por decisao dele: a pagina da anamnese
      // perguntava impacto duas vezes — o grau, neste guia, e as areas
      // afetadas, em "Impacto funcional", no fim da pagina. Fica a segunda,
      // que e a que o diagnostico le para saber se ha marca de transtorno.
      ["Sintomas de Mania/Hipomania", [
        {
          key: "maniaHipomaniaSintomas",
          response: "multiple",
          options: ["Nega sintomas relacionados", "Muito acelerado", "Com muita energia", "Falando mais", "Dormindo pouco", "Fazendo coisas impulsivas", "Outro"],
          otherKey: "maniaHipomaniaSintomasOutro"
        }
      ]],
      ["Sintomas de Ansiedade/Pânico", [
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
      ["Sintomas Psicóticos/Paranoia", [
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

// Ordem das secoes da anamnese estruturada, a mesma na tela e no Resumo. Ate
// 14/09/2026 a lista morava dentro do guia da tela, e o Resumo seguia a ordem
// em que as secoes estao escritas acima -- a mesma anamnese saia em duas
// sequencias diferentes. Secao fora da lista vai para o fim, e nao para o topo.
export const anamnesisSectionOrder = [
  "Sintomas de Ansiedade/Pânico",
  "Sintomas depressivos",
  "Sintomas de Mania/Hipomania",
  "Sintomas Psicóticos/Paranoia",
  "Sono",
  "Apetite",
  "Impacto",
  "Habitos, substancias e comportamentos aditivos",
  "Risco de suicidio e desesperanca"
];

export function orderedAnamnesisSections() {
  const posicao = titulo => {
    const indice = anamnesisSectionOrder.indexOf(titulo);
    return indice === -1 ? anamnesisSectionOrder.length : indice;
  };
  return anamnesisQuestionGroups
    .flatMap(group => group.items)
    .sort(([tituloA], [tituloB]) => posicao(tituloA) - posicao(tituloB));
}

export const optionDisplayLabels = {
  IN_PERSON: "Presencial",
  TELECONSULTATION: "Online",
  HYBRID: "Híbrida"
};

// Rotulo curto so para a caixa na tela. O valor gravado, a narrativa, o
// resumo e o que a IA devolve continuam com a frase inteira -- a IA casa a
// resposta pelo texto exato da opcao, e prontuario nao se escreve abreviado.
// A frase inteira fica no title da caixa, ao passar o mouse.
// Escalas ficam de fora: a redacao delas e a do instrumento validado.
export const optionShortLabels = {
  "Sensacao de controle ou interferencia no pensamento": "Interferencia no pensamento",
  "Sensacao de estar sendo observado ou comentado": "Sente-se vigiado ou comentado",
  "Incapacidade de prever consequencias dos atos": "Nao preve consequencias",
  "Alucinacoes marginais com critica preservada": "Alucinacoes com critica",
  "Sensacoes tateis ou odores sem fonte externa": "Toques ou odores sem fonte",
  "Nega ideacao, plano ou intencao suicida": "Nega ideacao/plano/intencao",
  "Transtorno de ansiedade generalizada": "Ansiedade generalizada",
  "Sentimento de estorvo para a familia": "Sente-se um estorvo",
  "Acesso a meios potencialmente letais": "Acesso a meios letais",
  "Desejo de morrer ou de nao acordar": "Desejo de morrer",
  "Instabilidade de ritmo circadiano": "Ritmo circadiano instavel",
  "Disforia (irritabilidade extrema)": "Disforia",
  "Vozes ou ruidos sem fonte externa": "Vozes ou ruidos sem fonte",
  "Autoagressao sem intencao suicida": "Autoagressao nao suicida",
  "Conflito com colegas ou bullying": "Conflitos ou bullying",
  "Benzodiazepinicos sem prescricao": "BZD sem prescricao",
  "Memoria operacional prejudicada": "Memoria operacional",
  "Desinteresse ou falta de prazer": "Anedonia",
  "Contato visual esquivo ou fixo": "Olhar esquivo ou fixo",
  "Piora na semana pre-menstrual": "Piora pre-menstrual",
  "Desde a infancia/adolescencia": "Infancia/adolescencia",
  "Lentificacao do processamento": "Processamento lento",
  "Paramnesia (falsas memorias)": "Paramnesia",
  "Tentativa de suicidio previa": "Tentativa previa",
  "Cansaco ou falta de energia": "Falta de energia",
  "Dificuldade de concentracao": "Baixa concentracao",
  "Comportamento desorganizado": "Conduta desorganizada",
  "Nega sintomas relacionados": "Nega sintomas",
  "Nega uso de substancias ou comportamentos": "Nega uso/comportamento",
  "Nega diagnostico psiquiatrico previo": "Nega diagnostico previo",
  "Nega historico familiar psiquiatrico": "Nega historico familiar",
  "Sem fator de melhora identificado": "Sem fator de melhora",
  "Dificuldade para adormecer": "Insonia inicial",
  "Comportamento preparatorio": "Atos preparatorios",
  "Fazendo coisas impulsivas": "Impulsividade",
  "Com muita energia": "Muita energia",
  "Afastamento de estressor": "Longe do estressor",
  "Desanimo ou desesperanca": "Desanimo/desesperanca",
  "Visoes sem fonte externa": "Visoes sem fonte",
  "Plano suicida definido": "Plano suicida",
  "Desconfianca excessiva": "Desconfianca",
  "Alteracao de peso ou metabolica": "Peso ou metabolismo",
  "Conflito, estressor ou luto": "Estressor ou luto"
};

export const ANAMNESIS_AI_FIELDS = {
  depressive_symptoms: ["depressaoSintomas", ["Nega sintomas relacionados", "Desinteresse ou falta de prazer", "Desanimo ou desesperanca", "Cansaco ou falta de energia", "Dificuldade de concentracao", "Fala lenta", "Agitacao", "Baixa autoestima", "Sentimento de ruina", "Sentimento de estorvo para a familia"]],
  mania_hypomania: ["maniaHipomaniaSintomas", ["Nega sintomas relacionados", "Muito acelerado", "Com muita energia", "Falando mais", "Dormindo pouco", "Fazendo coisas impulsivas", "Outro"]],
  anxiety_symptoms: ["ansiedadeSintomas", ["Nega sintomas relacionados", "Falta de controle", "Preocupacao excessiva", "Tensao corporal", "Dificuldade de focar", "Agitacao", "Irritabilidade", "Sintomas fisicos"]],
  sleep: ["sonoCaracteristicas", ["Sono reparador", "Sono nao reparador", "Dificuldade para adormecer", "Despertares noturnos", "Despertar precoce", "Dormir em excesso"]],
  appetite: ["apetiteCaracteristicas", ["Apetite preservado", "Reducao do apetite", "Aumento do apetite", "Compulsao alimentar", "Perda de peso recente", "Ganho de peso recente"]],
  // symptom_impact continua no schema do servidor, mas nao tem mais campo na
  // tela: o grau de impacto saiu da anamnese. O que fica e functional_impact.
  substances_behaviors: ["usoSubstanciasComportamentos", ["Nega uso de substancias ou comportamentos", "Nicotina", "Alcool", "Cafeina", "Calmantes", "Estimulantes", "Cocaina", "Opioides", "Canabinoides", "Jogos de Azar", "Redes Sociais", "Compras Compulsivas", "Transtornos Alimentares"]],
  psychosis: ["psicoseSintomas", ["Nega sintomas relacionados", "Ideias de perseguicao", "Sensacao de estar sendo observado ou comentado", "Ideias de referencia", "Desconfianca excessiva", "Vozes ou ruidos sem fonte externa", "Visoes sem fonte externa", "Sensacoes tateis ou odores sem fonte externa", "Pensamento desorganizado", "Comportamento desorganizado", "Sensacao de controle ou interferencia no pensamento", "Outro"]],
  suicide_risk: ["riscoSuicidioIndicadores", ["Nega ideacao, plano ou intencao suicida", "Desesperanca", "Desejo de morrer ou de nao acordar", "Ideacao suicida", "Plano suicida definido", "Intencao suicida", "Acesso a meios potencialmente letais", "Comportamento preparatorio", "Tentativa de suicidio previa", "Autoagressao sem intencao suicida"]],
  previous_diagnoses: ["psiPrevios", optionGroups.psiPrevios],
  previous_treatments: ["tratamentos", optionGroups.tratamentos],
  family_history: ["familiares", optionGroups.familiares],
  worsening_factors: ["fatores", optionGroups.fatores],
  improving_factors: ["fatoresMelhora", optionGroups.fatoresMelhora],
  functional_impact: ["impacto", optionGroups.impacto]
};

// Identificacao do paciente que pode surgir na fala espontanea durante a
// anamnese -- nome social, data de nascimento, ocupacao, religiao, estado
// civil, CEP. Mesmo formato de ANAMNESIS_AI_FIELDS: [chave do formulario,
// opcoes permitidas ou null]. `null` marca campo de texto/formato livre (nome
// social, data, CEP), onde nao ha lista fechada para casar.
export const IDENTIFICATION_AI_FIELDS = {
  nome_social: ["nomeSocial", null],
  nascimento: ["nascimento", null],
  ocupacao: ["ocupacao", null],
  religiao: ["religiao", optionGroups.religiao],
  estado_civil: ["estadoCivil", optionGroups.estadoCivil],
  cep: ["cep", null]
};

// O que o resumo registra quando o medico nao marcou nada no dominio. Mesma
// decisao do exame fisico: ausencia de marcacao significa exame sem alteracao,
// e o prontuario passa a dizer isso em vez de deixar a celula muda.
// Escrito a mao, e nao "a primeira opcao do grupo": se alguem reordenar as
// opcoes um dia, o padrao viraria um achado patologico sem ninguem notar.
export const MENTAL_EXAM_NORMAL = {
  aparencia: "Adequada",
  consciencia: "Consciente/orientado",
  atencao: "Vigil",
  memoria: "Preservada",
  sensopercepcao: "Sem alteração",
  pensamentoCursoForma: "Adequado",
  pensamentoConteudo: "Adequado",
  linguagem: "Adequada",
  humor: "Eutimia (normal)",
  afeto: "Preservado",
  psicomotricidade: "Sem alteração",
  vontade: "Normal",
  juizoCritico: "Preservado"
};

// As mesmas normalidades, com a grafia EXATA dos chips da tela. O mapa acima
// escreve "Consciente/orientado" e "Sem alteração", e a tela tem "Consciente",
// "Orientado" e "Sem alteracao": marcar por ele deixaria o chip desmarcado.
//
// Desde 11/09/2026 dominio em branco e dominio nao examinado, e nao normal.
// "Sem alteracao" passou a ser achado que se marca -- um a um ou pelo botao do
// Exame psiquico, que usa esta lista.
export const MENTAL_EXAM_NORMAL_OPTIONS = Object.freeze({
  aparencia: ["Adequada"],
  consciencia: ["Consciente", "Orientado"],
  atencao: ["Vigil"],
  memoria: ["Preservada"],
  sensopercepcao: ["Sem alteracao"],
  pensamentoCursoForma: ["Adequado"],
  pensamentoConteudo: ["Adequado"],
  linguagem: ["Adequada"],
  humor: ["Eutimia (normal)"],
  afeto: ["Preservado"],
  psicomotricidade: ["Sem alteracao"],
  vontade: ["Normal"],
  juizoCritico: ["Preservado"]
});

// O nome do dominio como entra na frase "sem alterações em ...".
export const MENTAL_EXAM_DOMAIN_NAMES = Object.freeze({
  aparencia: "aparência",
  consciencia: "consciência e orientação",
  atencao: "atenção",
  memoria: "memória",
  sensopercepcao: "sensopercepção",
  pensamentoCursoForma: "curso e forma do pensamento",
  pensamentoConteudo: "conteúdo do pensamento",
  linguagem: "linguagem",
  humor: "humor",
  afeto: "afeto",
  psicomotricidade: "psicomotricidade",
  vontade: "vontade",
  juizoCritico: "juízo crítico"
});

// Teleconsulta (Res. CFM 2.314/2022): o atendimento a distancia se registra no
// prontuario, com o consentimento do paciente.
export const TELECONSULTA_CONSENTIMENTO = "Paciente consentiu com o atendimento por telemedicina";

// Aparencia e psicomotricidade sairam daqui: sao observacao visual, e a IA as
// preenchia a partir do audio, onde nao ha o que observar. Ficam do medico.
// Consciencia ja estava de fora pelo mesmo motivo.
export const MENTAL_EXAM_AI_FIELDS = {
  attention: "atencao", orientation: "consciencia", memory: "memoria",
  perception: "sensopercepcao", thought_course: "pensamentoCursoForma", thought_content: "pensamentoConteudo",
  language: "linguagem", mood: "humor", affect: "afeto",
  volition: "vontade", judgment: "juizoCritico"
};

export function pagesForScope(scope) {
  return scope === "consultation" ? consultationPages : returnPages;
}
