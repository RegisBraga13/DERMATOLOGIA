// Escalas padronizadas, decididas com o Dr. Regis em 10/09/2026.
//
// Vieram do catalogo do Dr. Regis (psiescalas, feito no Lovable), mas NAO foram
// copiadas: la o motor so somava, e a revisao item por item achou escala que
// pontuava ao contrario (EPDS e GDS-15), opcao que sobrou da pagina de origem
// ("E-mail (opcional)", valendo 4 pontos na PHQ-9 e na GAD-7), a pergunta de
// prejuizo funcional entrando na soma, e as duas triagens de suicidio
// classificando pelo total -- um "sim" so na pergunta do plano com intencao
// saia como "risco baixo a moderado".
//
// O que mudou no desenho, e por que:
// - `fora`: o item e respondido e registrado, mas nao entra no total (a
//   pergunta de dificuldade da PHQ-9 e da GAD-7; agrupamento e prejuizo do MDQ).
// - `exigido`: pergunta que so se faz dependendo das anteriores (a 5 da ASQ, as
//   de metodo e plano da C-SSRS). Sem resposta, nao deixa a escala incompleta.
// - `classificar`: escala cuja regra nao e soma. A ASQ e a C-SSRS classificam
//   pela pergunta mais grave respondida "sim"; o MDQ exige tres condicoes juntas.
// - `alertas`: disparam pela resposta do ITEM, e ja com a escala incompleta. O
//   item 9 da PHQ-9 positivo nao espera o resto do questionario para aparecer.
//
// Faixas: as dos autores ou da validacao brasileira, com a referencia em cada
// escala. Nenhum terco generico ("baixo / intermediario / elevado").

const NAO_SIM = [
  { rotulo: "Não", valor: 0 },
  { rotulo: "Sim", valor: 1 }
];

const FREQUENCIA_DUAS_SEMANAS = [
  { rotulo: "Nenhuma vez", valor: 0 },
  { rotulo: "Vários dias", valor: 1 },
  { rotulo: "Mais da metade dos dias", valor: 2 },
  { rotulo: "Quase todos os dias", valor: 3 }
];

const DIFICULDADE_FUNCIONAL = [
  { rotulo: "Nenhuma dificuldade", valor: 0 },
  { rotulo: "Alguma dificuldade", valor: 1 },
  { rotulo: "Muita dificuldade", valor: 2 },
  { rotulo: "Extrema dificuldade", valor: 3 }
];

// GDS-15: a resposta que pontua depende do sentido da pergunta. No catalogo,
// todo "Nao" valia 1 -- oito dos quinze itens pontuavam ao contrario.
const PONTUA_SIM = [
  { rotulo: "Sim", valor: 1 },
  { rotulo: "Não", valor: 0 }
];
const PONTUA_NAO = [
  { rotulo: "Sim", valor: 0 },
  { rotulo: "Não", valor: 1 }
];

const FREQUENCIA_AUDIT = [
  { rotulo: "Nunca", valor: 0 },
  { rotulo: "Menos de uma vez por mês", valor: 1 },
  { rotulo: "Mensalmente", valor: 2 },
  { rotulo: "Semanalmente", valor: 3 },
  { rotulo: "Todos ou quase todos os dias", valor: 4 }
];

const OCORRENCIA_AUDIT = [
  { rotulo: "Não", valor: 0 },
  { rotulo: "Sim, mas não no último ano", valor: 2 },
  { rotulo: "Sim, no último ano", valor: 4 }
];

const sim = (respostas, indices) => indices.some(indice => respostas[indice] === 1);
const contaSim = (respostas, indices) => indices.filter(indice => respostas[indice] === 1).length;
const intervalo = (inicio, fim) => Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);

export const SCALE_DOMAINS = [
  "Humor",
  "Ansiedade",
  "Risco de suicídio",
  "Obsessivo-compulsivo",
  "TDAH",
  "Autismo",
  "Substâncias",
  "Rastreio geral",
  "Impressão clínica global"
];

const phq9 = {
  id: "phq9",
  sigla: "PHQ-9",
  nome: "Questionário sobre a Saúde do Paciente",
  dominio: "Humor",
  aplicacao: "Autoaplicável",
  periodo: "Últimas 2 semanas",
  instrucao: "Durante as últimas 2 semanas, com que frequência você foi incomodado(a) por qualquer um dos problemas abaixo?",
  opcoes: FREQUENCIA_DUAS_SEMANAS,
  itens: [
    { texto: "Pouco interesse ou pouco prazer em fazer as coisas" },
    { texto: "Se sentir “para baixo”, deprimido(a) ou sem perspectiva" },
    { texto: "Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que de costume" },
    { texto: "Se sentir cansado(a) ou com pouca energia" },
    { texto: "Falta de apetite ou comendo demais" },
    { texto: "Se sentir mal consigo mesmo(a), ou achar que é um fracasso ou que decepcionou sua família ou você mesmo(a)" },
    { texto: "Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão" },
    { texto: "Lentidão para se movimentar ou falar, a ponto de outras pessoas perceberem; ou o oposto, estar tão agitado(a) ou irrequieto(a) que fica andando de um lado para o outro muito mais do que de costume" },
    { texto: "Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a)" },
    {
      texto: "Se assinalou algum dos problemas, quanta dificuldade eles lhe causaram para trabalhar, cuidar das coisas de casa ou se relacionar com as pessoas?",
      opcoes: DIFICULDADE_FUNCIONAL,
      fora: true,
      opcional: true,
      condicao: "Registra o prejuízo; não entra no total."
    }
  ],
  faixas: [
    { min: 0, max: 4, rotulo: "Sintomas depressivos mínimos", nivel: 0 },
    { min: 5, max: 9, rotulo: "Depressão leve", nivel: 1 },
    { min: 10, max: 14, rotulo: "Depressão moderada", nivel: 2 },
    { min: 15, max: 19, rotulo: "Depressão moderadamente grave", nivel: 3 },
    { min: 20, max: 27, rotulo: "Depressão grave", nivel: 3 }
  ],
  alertas: [
    {
      itens: [8], min: 1, tipo: "suicidio",
      texto: "PHQ-9, item 9 positivo: pensamentos de morte ou de se ferir. Avaliar risco de suicídio nesta consulta, qualquer que seja o total."
    }
  ],
  observacao: "Rastreio, e não diagnóstico. 10 ou mais é o ponto de corte usual para depressão maior. No acompanhamento, queda de 50% ou mais sugere resposta; abaixo de 5, remissão.",
  // Resposta: queda de pelo menos 50% do total. Remissao: total ate 4.
  mudanca: { resposta: 0.5, remissao: 4 },
  referencia: "Kroenke K, Spitzer RL, Williams JBW. J Gen Intern Med. 2001;16(9):606-13. Validação brasileira: Santos IS et al. Cad Saúde Pública. 2013;29(8):1533-43. Uso livre."
};

const gad7 = {
  id: "gad7",
  sigla: "GAD-7",
  nome: "Escala de Transtorno de Ansiedade Generalizada",
  dominio: "Ansiedade",
  aplicacao: "Autoaplicável",
  periodo: "Últimas 2 semanas",
  instrucao: "Durante as últimas 2 semanas, com que frequência você foi incomodado(a) pelos problemas abaixo?",
  opcoes: FREQUENCIA_DUAS_SEMANAS,
  itens: [
    { texto: "Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)" },
    { texto: "Não ser capaz de impedir ou de controlar as preocupações" },
    { texto: "Preocupar-se muito com diversas coisas" },
    { texto: "Dificuldade para relaxar" },
    { texto: "Ficar tão agitado(a) que se torna difícil permanecer sentado(a)" },
    { texto: "Ficar facilmente aborrecido(a) ou irritado(a)" },
    { texto: "Sentir medo como se algo horrível fosse acontecer" },
    {
      texto: "Se assinalou algum dos problemas, quanta dificuldade eles lhe causaram para trabalhar, cuidar das coisas de casa ou se relacionar com as pessoas?",
      opcoes: DIFICULDADE_FUNCIONAL,
      fora: true,
      opcional: true,
      condicao: "Registra o prejuízo; não entra no total."
    }
  ],
  faixas: [
    { min: 0, max: 4, rotulo: "Ansiedade mínima", nivel: 0 },
    { min: 5, max: 9, rotulo: "Ansiedade leve", nivel: 1 },
    { min: 10, max: 14, rotulo: "Ansiedade moderada", nivel: 2 },
    { min: 15, max: 21, rotulo: "Ansiedade grave", nivel: 3 }
  ],
  observacao: "10 ou mais é o ponto de corte usual para investigar ansiedade generalizada. Também rastreia pânico, ansiedade social e estresse pós-traumático.",
  // Mesmo criterio usual da PHQ-9: queda de 50% e resposta; ate 4, remissao.
  mudanca: { resposta: 0.5, remissao: 4 },
  referencia: "Spitzer RL, Kroenke K, Williams JBW, Löwe B. Arch Intern Med. 2006;166(10):1092-7. Uso livre."
};

const asq = {
  id: "asq",
  sigla: "ASQ",
  nome: "Ask Suicide-Screening Questions",
  dominio: "Risco de suicídio",
  aplicacao: "Aplicada pelo médico",
  periodo: "Últimas semanas",
  populacao: "10 anos ou mais",
  instrucao: "Pergunte diretamente. Qualquer “sim” nas quatro primeiras torna a triagem positiva, e aí se faz a quinta.",
  opcoes: NAO_SIM,
  semTotal: true,
  itens: [
    { texto: "Nas últimas semanas, você desejou estar morto(a)?" },
    { texto: "Nas últimas semanas, você sentiu que você ou sua família estariam melhor se você estivesse morto(a)?" },
    { texto: "Na última semana, você teve pensamentos sobre se matar?" },
    { texto: "Alguma vez você já tentou se matar?" },
    {
      texto: "Você está tendo pensamentos de se matar neste momento?",
      fora: true,
      exigido: respostas => sim(respostas, [0, 1, 2, 3]),
      condicao: "Pergunte se houve algum “sim” acima."
    }
  ],
  classificar: respostas => {
    if (respostas[4] === 1) return { rotulo: "Triagem positiva, com risco agudo", nivel: 3, riscoAgudo: true, descricao: "Pensamentos de se matar neste momento. O paciente não sai sem avaliação completa de segurança; considerar emergência." };
    if (sim(respostas, [0, 1, 2, 3])) return { rotulo: "Triagem positiva, sem risco agudo aparente", nivel: 2, descricao: "Fazer avaliação breve de risco de suicídio antes de o paciente sair." };
    return { rotulo: "Triagem negativa", nivel: 0, descricao: "Nenhuma resposta positiva." };
  },
  alertas: [
    {
      quando: respostas => respostas[4] === 1, tipo: "suicidio",
      texto: "ASQ: pensamentos de se matar neste momento. Risco agudo: o paciente não deve sair sem avaliação completa de segurança."
    },
    {
      quando: respostas => sim(respostas, [0, 1, 2, 3]) && respostas[4] !== 1, tipo: "suicidio",
      texto: "ASQ positiva: fazer avaliação de risco de suicídio nesta consulta."
    }
  ],
  referencia: "Horowitz LM, Bridge JA, Teach SJ, et al. Arch Pediatr Adolesc Med. 2012;166(12):1170-6. National Institute of Mental Health, domínio público."
};

const cssrs = {
  id: "cssrs",
  sigla: "C-SSRS",
  nome: "Escala Columbia de Gravidade do Risco de Suicídio, versão de triagem",
  dominio: "Risco de suicídio",
  aplicacao: "Aplicada pelo médico",
  periodo: "Último mês e toda a vida",
  instrucao: "Se a pergunta 2 for “não”, passe direto à 6. As perguntas 3 a 5 só se fazem depois de um “sim” na 2.",
  opcoes: NAO_SIM,
  semTotal: true,
  itens: [
    { texto: "No último mês, você desejou estar morto(a) ou desejou poder dormir e não acordar mais?" },
    { texto: "No último mês, você realmente teve pensamentos de se matar?" },
    { texto: "No último mês, você pensou em como poderia fazer isso?", exigido: respostas => respostas[1] === 1, condicao: "Só depois de “sim” na 2." },
    { texto: "No último mês, você teve esses pensamentos e alguma intenção de colocá-los em prática?", exigido: respostas => respostas[1] === 1, condicao: "Só depois de “sim” na 2." },
    { texto: "No último mês, você começou a elaborar, ou já elaborou, os detalhes de como se matar? Pretende levar esse plano adiante?", exigido: respostas => respostas[1] === 1, condicao: "Só depois de “sim” na 2." },
    { texto: "Alguma vez na vida você fez algo, começou a fazer algo ou se preparou para fazer algo para acabar com a sua vida?" },
    // No catalogo, "na vida" e "nos ultimos 3 meses" eram uma pergunta so. Sao
    // duas porque mudam a classificacao: ha mais de 3 meses e risco moderado;
    // nos ultimos 3 meses, alto.
    { texto: "Isso aconteceu nos últimos 3 meses?", exigido: respostas => respostas[5] === 1, condicao: "Só depois de “sim” na 6." }
  ],
  classificar: respostas => {
    if (sim(respostas, [3, 4]) || (respostas[5] === 1 && respostas[6] === 1)) {
      return { rotulo: "Risco alto", nivel: 3, riscoAgudo: true, descricao: "Ideação com intenção ou plano no último mês, ou comportamento suicida nos últimos 3 meses. Avaliação imediata e medidas de segurança." };
    }
    if (sim(respostas, [2, 5])) {
      return { rotulo: "Risco moderado", nivel: 2, descricao: "Ideação com método, sem intenção nem plano, ou comportamento suicida há mais de 3 meses. Avaliação de risco e plano de segurança." };
    }
    if (sim(respostas, [0, 1])) return { rotulo: "Risco baixo", nivel: 1, descricao: "Desejo de morte ou ideação sem método. Acompanhar e reavaliar." };
    return { rotulo: "Sem indicadores nesta triagem", nivel: 0 };
  },
  alertas: [
    {
      quando: respostas => sim(respostas, [3, 4]), tipo: "suicidio",
      texto: "C-SSRS: ideação com intenção ou plano no último mês. Risco alto: avaliação imediata de segurança."
    },
    {
      quando: respostas => respostas[5] === 1 && respostas[6] === 1, tipo: "suicidio",
      texto: "C-SSRS: comportamento suicida nos últimos 3 meses. Risco alto."
    },
    {
      quando: respostas => sim(respostas, [0, 1, 2]) && !sim(respostas, [3, 4]), tipo: "suicidio",
      texto: "C-SSRS: desejo de morte ou ideação suicida no último mês."
    }
  ],
  referencia: "Posner K, Brown GK, Stanley B, et al. Am J Psychiatry. 2011;168(12):1266-77. Versão de triagem, de uso livre em serviços de saúde."
};

const mdq = {
  id: "mdq",
  sigla: "MDQ",
  nome: "Questionário de Transtornos do Humor",
  dominio: "Humor",
  aplicacao: "Autoaplicável",
  periodo: "Toda a vida",
  instrucao: "Alguma vez houve um período em que você não estava no seu normal e…",
  opcoes: NAO_SIM,
  itens: [
    { texto: "…se sentia tão bem ou tão para cima que as outras pessoas achavam que você não estava no seu normal, ou isso lhe trouxe problemas?" },
    { texto: "…ficava tão irritado(a) que gritava com as pessoas ou começava brigas e discussões?" },
    { texto: "…se sentia muito mais autoconfiante que o normal?" },
    { texto: "…dormia muito menos que o normal e não sentia falta disso?" },
    { texto: "…falava muito mais ou muito mais rápido que o normal?" },
    { texto: "…os pensamentos corriam na cabeça e você não conseguia desacelerar?" },
    { texto: "…se distraía tão facilmente com as coisas ao redor que tinha dificuldade de se concentrar ou de continuar no que fazia?" },
    { texto: "…tinha muito mais energia que o normal?" },
    { texto: "…ficava muito mais ativo(a) ou fazia muito mais coisas que o normal?" },
    { texto: "…ficava muito mais sociável ou expansivo(a) que o normal, telefonando para amigos no meio da noite, por exemplo?" },
    { texto: "…tinha muito mais interesse em sexo que o normal?" },
    { texto: "…fazia coisas fora do comum para você, ou que as pessoas achavam exageradas, tolas ou arriscadas?" },
    { texto: "…gastava tanto dinheiro que isso trouxe problemas para você ou para sua família?" },
    {
      texto: "Se marcou “sim” em mais de uma pergunta, várias delas aconteceram no mesmo período?",
      fora: true,
      exigido: respostas => contaSim(respostas, intervalo(0, 12)) >= 2,
      condicao: "Critério de agrupamento; não entra na soma."
    },
    {
      texto: "Quanto essas situações lhe causaram problemas, como não conseguir trabalhar, problemas na família, com dinheiro ou com a lei, brigas ou discussões?",
      opcoes: [
        { rotulo: "Nenhum problema", valor: 0 },
        { rotulo: "Problema pequeno", valor: 1 },
        { rotulo: "Problema moderado", valor: 2 },
        { rotulo: "Problema sério", valor: 3 }
      ],
      fora: true,
      exigido: respostas => contaSim(respostas, intervalo(0, 12)) >= 1,
      condicao: "Critério de prejuízo; não entra na soma."
    }
  ],
  // O catalogo somava as quinze respostas e dividia em tercos. A regra do MDQ
  // e outra: sete ou mais sintomas, no mesmo periodo, com prejuizo moderado ou
  // serio -- as tres coisas juntas.
  classificar: respostas => {
    const sintomas = contaSim(respostas, intervalo(0, 12));
    if (sintomas >= 7 && respostas[13] === 1 && respostas[14] >= 2) {
      return { rotulo: "Rastreamento positivo", nivel: 2, descricao: "Sete ou mais sintomas, no mesmo período, com prejuízo moderado ou sério. Investigar transtorno do espectro bipolar." };
    }
    if (sintomas >= 7) {
      return { rotulo: "Rastreamento negativo pelo critério original", nivel: 1, descricao: "Sete ou mais sintomas, mas sem agrupamento no mesmo período ou sem prejuízo moderado. Vale investigar história de hipomania." };
    }
    return { rotulo: "Rastreamento negativo", nivel: 0, descricao: "Menos de sete sintomas." };
  },
  referencia: "Hirschfeld RMA, Williams JBW, Spitzer RL, et al. Am J Psychiatry. 2000;157(11):1873-5."
};

const srq20 = {
  id: "srq20",
  sigla: "SRQ-20",
  nome: "Self-Reporting Questionnaire",
  dominio: "Rastreio geral",
  aplicacao: "Autoaplicável",
  periodo: "Últimos 30 dias",
  instrucao: "Responda pensando nos últimos 30 dias.",
  opcoes: NAO_SIM,
  itens: [
    { texto: "Você tem dores de cabeça frequentes?" },
    { texto: "Tem falta de apetite?" },
    { texto: "Dorme mal?" },
    { texto: "Assusta-se com facilidade?" },
    { texto: "Tem tremores nas mãos?" },
    { texto: "Sente-se nervoso(a), tenso(a) ou preocupado(a)?" },
    { texto: "Tem má digestão?" },
    { texto: "Tem dificuldade de pensar com clareza?" },
    { texto: "Tem se sentido triste ultimamente?" },
    { texto: "Tem chorado mais do que de costume?" },
    { texto: "Encontra dificuldade para realizar com satisfação suas atividades diárias?" },
    { texto: "Tem dificuldade para tomar decisões?" },
    { texto: "Tem dificuldades no trabalho (seu trabalho é penoso, lhe causa sofrimento)?" },
    { texto: "É incapaz de desempenhar um papel útil em sua vida?" },
    { texto: "Tem perdido o interesse pelas coisas?" },
    { texto: "Você se sente uma pessoa inútil, sem valor?" },
    { texto: "Tem tido ideia de acabar com a vida?" },
    { texto: "Sente-se cansado(a) o tempo todo?" },
    { texto: "Você se cansa com facilidade?" },
    { texto: "Tem sensações desagradáveis no estômago?" }
  ],
  faixas: [
    { min: 0, max: 7, rotulo: "Abaixo do ponto de corte", nivel: 0 },
    { min: 8, max: 20, rotulo: "Suspeita de transtorno mental comum", nivel: 2 }
  ],
  alertas: [
    {
      itens: [16], min: 1, tipo: "suicidio",
      texto: "SRQ-20: ideia de acabar com a vida. Avaliar risco de suicídio nesta consulta."
    }
  ],
  observacao: "Rastreia transtornos mentais comuns (depressivos, ansiosos e somatoformes), não psicose.",
  referencia: "Harding TW et al. Psychol Med. 1980;10(2):231-41 (OMS). Validação brasileira: Mari JJ, Williams P. Br J Psychiatry. 1986;148:23-6, ponto de corte 7/8."
};

// EPDS completa. O catalogo tinha seis dos dez itens, e cinco deles com a
// pontuacao invertida -- inclusive o de autolesao, em que "Sim, muitas vezes"
// valia zero. Aqui cada opcao carrega o proprio valor, na ordem do original.
const epds = {
  id: "epds",
  sigla: "EPDS",
  nome: "Escala de Depressão Pós-Parto de Edimburgo",
  dominio: "Humor",
  aplicacao: "Autoaplicável",
  periodo: "Últimos 7 dias",
  populacao: "Gestação e pós-parto",
  instrucao: "Marque a resposta que mais se aproxima de como você tem se sentido nos últimos 7 dias, e não apenas hoje.",
  itens: [
    { texto: "Eu tenho sido capaz de rir e achar graça das coisas", opcoes: [
      { rotulo: "Como eu sempre fiz", valor: 0 },
      { rotulo: "Não tanto quanto antes", valor: 1 },
      { rotulo: "Sem dúvida, menos que antes", valor: 2 },
      { rotulo: "De jeito nenhum", valor: 3 }
    ] },
    { texto: "Eu tenho pensado no futuro com alegria", opcoes: [
      { rotulo: "Sim, como de costume", valor: 0 },
      { rotulo: "Um pouco menos que de costume", valor: 1 },
      { rotulo: "Muito menos que de costume", valor: 2 },
      { rotulo: "Praticamente não", valor: 3 }
    ] },
    { texto: "Eu tenho me culpado sem necessidade quando as coisas dão errado", opcoes: [
      { rotulo: "Sim, na maioria das vezes", valor: 3 },
      { rotulo: "Sim, algumas vezes", valor: 2 },
      { rotulo: "Não muitas vezes", valor: 1 },
      { rotulo: "Não, nenhuma vez", valor: 0 }
    ] },
    { texto: "Eu tenho me sentido ansiosa ou preocupada sem uma boa razão", opcoes: [
      { rotulo: "Não, de maneira alguma", valor: 0 },
      { rotulo: "Pouquíssimas vezes", valor: 1 },
      { rotulo: "Sim, algumas vezes", valor: 2 },
      { rotulo: "Sim, muitas vezes", valor: 3 }
    ] },
    { texto: "Eu tenho me sentido assustada ou em pânico sem um bom motivo", opcoes: [
      { rotulo: "Sim, muitas vezes", valor: 3 },
      { rotulo: "Sim, algumas vezes", valor: 2 },
      { rotulo: "Não muitas vezes", valor: 1 },
      { rotulo: "Não, nenhuma vez", valor: 0 }
    ] },
    { texto: "Eu tenho me sentido sobrecarregada pelas tarefas e acontecimentos do meu dia a dia", opcoes: [
      { rotulo: "Sim, na maioria das vezes não consigo lidar com eles", valor: 3 },
      { rotulo: "Sim, algumas vezes não consigo lidar com eles tão bem quanto antes", valor: 2 },
      { rotulo: "Não, na maioria das vezes consigo lidar bem com eles", valor: 1 },
      { rotulo: "Não, consigo lidar com eles tão bem quanto antes", valor: 0 }
    ] },
    { texto: "Eu tenho me sentido tão infeliz que tenho tido dificuldade para dormir", opcoes: [
      { rotulo: "Sim, na maioria das vezes", valor: 3 },
      { rotulo: "Sim, algumas vezes", valor: 2 },
      { rotulo: "Não muitas vezes", valor: 1 },
      { rotulo: "Não, nenhuma vez", valor: 0 }
    ] },
    { texto: "Eu tenho me sentido triste ou arrasada", opcoes: [
      { rotulo: "Sim, na maioria das vezes", valor: 3 },
      { rotulo: "Sim, muitas vezes", valor: 2 },
      { rotulo: "Não muitas vezes", valor: 1 },
      { rotulo: "Não, de jeito nenhum", valor: 0 }
    ] },
    { texto: "Eu tenho me sentido tão infeliz que tenho chorado", opcoes: [
      { rotulo: "Sim, quase todo o tempo", valor: 3 },
      { rotulo: "Sim, muitas vezes", valor: 2 },
      { rotulo: "De vez em quando", valor: 1 },
      { rotulo: "Não, nunca", valor: 0 }
    ] },
    { texto: "A ideia de fazer mal a mim mesma passou pela minha cabeça", opcoes: [
      { rotulo: "Sim, muitas vezes, ultimamente", valor: 3 },
      { rotulo: "Algumas vezes, nos últimos dias", valor: 2 },
      { rotulo: "Pouquíssimas vezes, ultimamente", valor: 1 },
      { rotulo: "Nenhuma vez", valor: 0 }
    ] }
  ],
  faixas: [
    { min: 0, max: 9, rotulo: "Abaixo do ponto de corte", nivel: 0 },
    { min: 10, max: 12, rotulo: "Possível depressão", nivel: 2 },
    { min: 13, max: 30, rotulo: "Provável depressão", nivel: 3 }
  ],
  alertas: [
    {
      itens: [9], min: 1, tipo: "suicidio",
      texto: "EPDS, item 10 positivo: pensamentos de fazer mal a si mesma. Avaliar risco nesta consulta, qualquer que seja o total."
    }
  ],
  observacao: "Valores na ordem do original de Cox; a redação é tradução para este app. Para pesquisa, confira o texto com a versão brasileira validada.",
  referencia: "Cox JL, Holden JM, Sagovsky R. Br J Psychiatry. 1987;150:782-6. Validação brasileira: Santos IS et al. Cad Saúde Pública. 2007;23(11):2577-88, ponto de corte 10."
};

const gds15 = {
  id: "gds15",
  sigla: "GDS-15",
  nome: "Escala de Depressão Geriátrica",
  dominio: "Humor",
  aplicacao: "Autoaplicável ou lida ao paciente",
  periodo: "Última semana",
  populacao: "60 anos ou mais",
  instrucao: "Responda como você tem se sentido na última semana.",
  itens: [
    { texto: "Você está satisfeito(a) com a sua vida?", opcoes: PONTUA_NAO },
    { texto: "Você deixou de lado muitos de seus interesses e atividades?", opcoes: PONTUA_SIM },
    { texto: "Você sente que a sua vida está vazia?", opcoes: PONTUA_SIM },
    { texto: "Você se aborrece com frequência?", opcoes: PONTUA_SIM },
    { texto: "Você se sente de bom humor a maior parte do tempo?", opcoes: PONTUA_NAO },
    { texto: "Você tem medo de que algum mal vá lhe acontecer?", opcoes: PONTUA_SIM },
    { texto: "Você se sente feliz a maior parte do tempo?", opcoes: PONTUA_NAO },
    { texto: "Você se sente desamparado(a) com frequência?", opcoes: PONTUA_SIM },
    { texto: "Você prefere ficar em casa a sair e fazer coisas novas?", opcoes: PONTUA_SIM },
    { texto: "Você acha que tem mais problemas de memória do que a maioria das pessoas?", opcoes: PONTUA_SIM },
    { texto: "Você acha maravilhoso estar vivo(a)?", opcoes: PONTUA_NAO },
    { texto: "Você se sente inútil do jeito que está agora?", opcoes: PONTUA_SIM },
    { texto: "Você se sente cheio(a) de energia?", opcoes: PONTUA_NAO },
    { texto: "Você sente que a sua situação não tem esperança?", opcoes: PONTUA_SIM },
    { texto: "Você acha que a maioria das pessoas está melhor do que você?", opcoes: PONTUA_SIM }
  ],
  faixas: [
    { min: 0, max: 5, rotulo: "Abaixo do ponto de corte", nivel: 0 },
    { min: 6, max: 10, rotulo: "Sugestivo de depressão", nivel: 2 },
    { min: 11, max: 15, rotulo: "Sugestivo de depressão grave", nivel: 3 }
  ],
  observacao: "A redação segue o sentido do original de Yesavage, e cada item pontua pela resposta que indica depressão. Para pesquisa, confira o texto com a versão brasileira validada.",
  referencia: "Yesavage JA, Sheikh JI. Clin Gerontol. 1986;5:165-73. Validação brasileira: Almeida OP, Almeida SA. Arq Neuropsiquiatr. 1999;57(2B):421-6, ponto de corte 5/6. Domínio público."
};

const ybocs = {
  id: "ybocs",
  sigla: "Y-BOCS",
  nome: "Escala Yale-Brown de Obsessões e Compulsões",
  dominio: "Obsessivo-compulsivo",
  aplicacao: "Aplicada pelo médico",
  periodo: "Última semana",
  instrucao: "Aplique depois de levantar com o paciente quais são as obsessões e as compulsões. Os itens 1 a 5 são das obsessões; 6 a 10, das compulsões.",
  itens: [
    { texto: "Quanto do seu tempo é ocupado por pensamentos obsessivos?", opcoes: [
      { rotulo: "Nenhum", valor: 0 },
      { rotulo: "Menos de 1 hora por dia, ou intrusões ocasionais", valor: 1 },
      { rotulo: "De 1 a 3 horas por dia, ou intrusões frequentes", valor: 2 },
      { rotulo: "De 3 a 8 horas por dia, ou intrusões muito frequentes", valor: 3 },
      { rotulo: "Mais de 8 horas por dia, ou intrusões quase constantes", valor: 4 }
    ] },
    { texto: "Quanto os pensamentos obsessivos interferem na sua vida social ou profissional?", opcoes: [
      { rotulo: "Nenhuma interferência", valor: 0 },
      { rotulo: "Leve, sem prejuízo do desempenho global", valor: 1 },
      { rotulo: "Moderada, clara, mas ainda consegue desempenhar", valor: 2 },
      { rotulo: "Grave, com prejuízo considerável", valor: 3 },
      { rotulo: "Extrema, incapacitante", valor: 4 }
    ] },
    { texto: "Quanto os pensamentos obsessivos o(a) perturbam ou causam mal-estar?", opcoes: [
      { rotulo: "Nenhuma perturbação", valor: 0 },
      { rotulo: "Leve, pouca perturbação", valor: 1 },
      { rotulo: "Moderada, perturba mas é controlável", valor: 2 },
      { rotulo: "Grave, muito perturbador", valor: 3 },
      { rotulo: "Extrema, mal-estar quase constante e incapacitante", valor: 4 }
    ] },
    { texto: "Quanto você se esforça para resistir aos pensamentos obsessivos?", opcoes: [
      { rotulo: "Sempre se esforça, ou os sintomas são mínimos", valor: 0 },
      { rotulo: "Tenta resistir na maior parte das vezes", valor: 1 },
      { rotulo: "Faz algum esforço para resistir", valor: 2 },
      { rotulo: "Cede a todas as obsessões, com alguma relutância", valor: 3 },
      { rotulo: "Cede completamente, de modo voluntário", valor: 4 }
    ] },
    { texto: "Quanto controle você tem sobre os pensamentos obsessivos?", opcoes: [
      { rotulo: "Controle total", valor: 0 },
      { rotulo: "Bom controle, afasta com algum esforço", valor: 1 },
      { rotulo: "Controle moderado, às vezes consegue afastar", valor: 2 },
      { rotulo: "Pouco controle, raramente consegue afastar", valor: 3 },
      { rotulo: "Nenhum controle, são completamente involuntários", valor: 4 }
    ] },
    { texto: "Quanto tempo você gasta executando compulsões (rituais)?", opcoes: [
      { rotulo: "Nenhum", valor: 0 },
      { rotulo: "Menos de 1 hora por dia, ou rituais ocasionais", valor: 1 },
      { rotulo: "De 1 a 3 horas por dia, ou rituais frequentes", valor: 2 },
      { rotulo: "De 3 a 8 horas por dia, ou rituais muito frequentes", valor: 3 },
      { rotulo: "Mais de 8 horas por dia, ou rituais quase constantes", valor: 4 }
    ] },
    { texto: "Quanto as compulsões interferem na sua vida social ou profissional?", opcoes: [
      { rotulo: "Nenhuma interferência", valor: 0 },
      { rotulo: "Leve, sem prejuízo do desempenho global", valor: 1 },
      { rotulo: "Moderada, clara, mas ainda consegue desempenhar", valor: 2 },
      { rotulo: "Grave, com prejuízo considerável", valor: 3 },
      { rotulo: "Extrema, incapacitante", valor: 4 }
    ] },
    { texto: "Como você se sentiria se fosse impedido(a) de executar as compulsões?", opcoes: [
      { rotulo: "Nenhum desconforto", valor: 0 },
      { rotulo: "Ligeiramente ansioso(a)", valor: 1 },
      { rotulo: "A ansiedade subiria, mas controlável", valor: 2 },
      { rotulo: "Aumento acentuado e muito perturbador da ansiedade", valor: 3 },
      { rotulo: "Ansiedade incapacitante", valor: 4 }
    ] },
    { texto: "Quanto você se esforça para resistir às compulsões?", opcoes: [
      { rotulo: "Sempre se esforça, ou os sintomas são mínimos", valor: 0 },
      { rotulo: "Tenta resistir na maior parte das vezes", valor: 1 },
      { rotulo: "Faz algum esforço para resistir", valor: 2 },
      { rotulo: "Cede a quase todas, com alguma relutância", valor: 3 },
      { rotulo: "Cede completamente, de modo voluntário", valor: 4 }
    ] },
    { texto: "Quanto você se sente pressionado(a) a executar as compulsões, e quanto consegue controlá-las?", opcoes: [
      { rotulo: "Controle total", valor: 0 },
      { rotulo: "Bom controle, sente pressão mas controla", valor: 1 },
      { rotulo: "Controle moderado, controla com dificuldade", valor: 2 },
      { rotulo: "Pouco controle, só consegue adiar com dificuldade", valor: 3 },
      { rotulo: "Nenhum controle, a pressão é involuntária", valor: 4 }
    ] }
  ],
  subescalas: {
    "Obsessões": intervalo(0, 4),
    "Compulsões": intervalo(5, 9)
  },
  faixas: [
    { min: 0, max: 7, rotulo: "Subclínico", nivel: 0 },
    { min: 8, max: 15, rotulo: "Leve", nivel: 1 },
    { min: 16, max: 23, rotulo: "Moderado", nivel: 2 },
    { min: 24, max: 31, rotulo: "Grave", nivel: 3 },
    { min: 32, max: 40, rotulo: "Extremo", nivel: 3 }
  ],
  observacao: "No acompanhamento, queda de 35% ou mais costuma definir resposta, e total de até 12, remissão.",
  // Criterios de consenso para TOC: resposta com queda de pelo menos 35%;
  // remissao com total ate 12.
  mudanca: { resposta: 0.35, remissao: 12 },
  referencia: "Goodman WK, Price LH, Rasmussen SA, et al. Arch Gen Psychiatry. 1989;46(11):1006-11. Instrumento com direitos autorais; uso clínico."
};

const audit = {
  id: "audit",
  sigla: "AUDIT",
  nome: "Teste para Identificação de Problemas Relacionados ao Uso de Álcool",
  dominio: "Substâncias",
  aplicacao: "Autoaplicável ou entrevista",
  periodo: "Último ano",
  instrucao: "Uma dose é uma lata de cerveja (350 ml), uma taça de vinho (100 a 150 ml) ou uma dose de destilado (40 ml). Se a resposta à pergunta 1 for “Nunca”, passe direto à 9.",
  itens: [
    { texto: "Com que frequência você toma bebidas alcoólicas?", opcoes: [
      { rotulo: "Nunca", valor: 0 },
      { rotulo: "Mensalmente ou menos", valor: 1 },
      { rotulo: "De 2 a 4 vezes por mês", valor: 2 },
      { rotulo: "De 2 a 3 vezes por semana", valor: 3 },
      { rotulo: "4 ou mais vezes por semana", valor: 4 }
    ] },
    { texto: "Nas ocasiões em que bebe, quantas doses você costuma tomar?", exigido: respostas => respostas[0] !== 0, opcoes: [
      { rotulo: "1 ou 2", valor: 0 },
      { rotulo: "3 ou 4", valor: 1 },
      { rotulo: "5 ou 6", valor: 2 },
      { rotulo: "De 7 a 9", valor: 3 },
      { rotulo: "10 ou mais", valor: 4 }
    ] },
    { texto: "Com que frequência você toma seis ou mais doses de uma vez?", opcoes: FREQUENCIA_AUDIT, exigido: respostas => respostas[0] !== 0 },
    { texto: "No último ano, com que frequência percebeu que não conseguia parar de beber depois de começar?", opcoes: FREQUENCIA_AUDIT, exigido: respostas => respostas[0] !== 0 },
    { texto: "No último ano, com que frequência deixou de fazer o que era esperado de você por causa da bebida?", opcoes: FREQUENCIA_AUDIT, exigido: respostas => respostas[0] !== 0 },
    { texto: "No último ano, com que frequência precisou beber pela manhã para se sentir bem depois de ter bebido muito no dia anterior?", opcoes: FREQUENCIA_AUDIT, exigido: respostas => respostas[0] !== 0 },
    { texto: "No último ano, com que frequência se sentiu culpado(a) ou com remorso depois de beber?", opcoes: FREQUENCIA_AUDIT, exigido: respostas => respostas[0] !== 0 },
    { texto: "No último ano, com que frequência não conseguiu lembrar o que aconteceu na noite anterior por causa da bebida?", opcoes: FREQUENCIA_AUDIT, exigido: respostas => respostas[0] !== 0 },
    { texto: "Você ou outra pessoa já se machucou por causa da sua bebida?", opcoes: OCORRENCIA_AUDIT },
    { texto: "Algum parente, amigo, médico ou outro profissional de saúde já se preocupou com o seu modo de beber ou sugeriu que você parasse?", opcoes: OCORRENCIA_AUDIT }
  ],
  subescalas: {
    "Consumo": intervalo(0, 2),
    "Dependência": intervalo(3, 5),
    "Problemas": intervalo(6, 9)
  },
  faixas: [
    { min: 0, max: 7, rotulo: "Zona I, uso de baixo risco", nivel: 0, descricao: "Orientação sobre o consumo." },
    { min: 8, max: 15, rotulo: "Zona II, uso de risco", nivel: 1, descricao: "Aconselhamento breve." },
    { min: 16, max: 19, rotulo: "Zona III, uso nocivo", nivel: 2, descricao: "Aconselhamento breve e monitoramento." },
    { min: 20, max: 40, rotulo: "Zona IV, provável dependência", nivel: 3, descricao: "Avaliação diagnóstica e encaminhamento para tratamento." }
  ],
  referencia: "Babor TF, Higgins-Biddle JC, Saunders JB, Monteiro MG. AUDIT: guia para uso na atenção primária. 2ª ed. OMS; 2001. Domínio público."
};

// CGI: uma nota so, dada pelo medico. Nao e soma, entao mostra o rotulo com o
// numero -- e o numero e o que se compara de um retorno para o outro.
const CGI_GRAVIDADE = [
  "Normal, não doente",
  "No limite da doença mental",
  "Levemente doente",
  "Moderadamente doente",
  "Acentuadamente doente",
  "Gravemente doente",
  "Entre os pacientes mais gravemente doentes"
];

const CGI_MELHORA = [
  "Muito melhor",
  "Melhor",
  "Um pouco melhor",
  "Sem alteração",
  "Um pouco pior",
  "Pior",
  "Muito pior"
];

const notaCgi = (rotulos, niveis) => ({
  opcoes: rotulos.map((rotulo, indice) => ({ rotulo: `${indice + 1} · ${rotulo}`, valor: indice + 1 })),
  faixas: rotulos.map((rotulo, indice) => ({ min: indice + 1, max: indice + 1, rotulo: `${indice + 1} · ${rotulo}`, nivel: niveis[indice] }))
});

const cgiS = {
  id: "cgi-s",
  sigla: "CGI-S",
  nome: "Impressão Clínica Global, gravidade",
  dominio: "Impressão clínica global",
  aplicacao: "Aplicada pelo médico",
  periodo: "Hoje",
  semTotal: true,
  ...(({ opcoes, faixas }) => ({ faixas, itens: [{ texto: "Considerando a sua experiência clínica com esta população, quão gravemente doente está o paciente neste momento?", opcoes }] }))(notaCgi(CGI_GRAVIDADE, [0, 0, 1, 2, 3, 3, 3])),
  referencia: "Guy W. ECDEU Assessment Manual for Psychopharmacology. Rockville: NIMH; 1976. Domínio público."
};

const cgiI = {
  id: "cgi-i",
  sigla: "CGI-I",
  nome: "Impressão Clínica Global, melhora",
  dominio: "Impressão clínica global",
  aplicacao: "Aplicada pelo médico",
  periodo: "Desde o início do tratamento",
  semTotal: true,
  ...(({ opcoes, faixas }) => ({ faixas, itens: [{ texto: "Comparado ao estado do paciente no início do tratamento, como está o paciente agora?", opcoes }] }))(notaCgi(CGI_MELHORA, [0, 0, 1, 1, 2, 3, 3])),
  observacao: "Faz sentido a partir do primeiro retorno: compara com o início do tratamento, e não com a última consulta.",
  referencia: "Guy W. ECDEU Assessment Manual for Psychopharmacology. Rockville: NIMH; 1976. Domínio público."
};

// Segunda leva do catalogo, revisada em 10/09/2026: DASS-21, ASRS-18, SNAP-IV
// e SBQ-R. No catalogo as quatro estavam com tercos genericos; a ASRS ainda
// trazia, na ultima pergunta, tres opcoes que eram o resto do formulario da
// pagina de origem ("— Selecionar —Feminino Masculino...", valendo 6, 7 e 8).

const APLICOU_DASS = [
  { rotulo: "Não se aplicou de maneira alguma", valor: 0 },
  { rotulo: "Aplicou-se em algum grau, ou por pouco tempo", valor: 1 },
  { rotulo: "Aplicou-se em grau considerável, ou por boa parte do tempo", valor: 2 },
  { rotulo: "Aplicou-se muito, ou na maior parte do tempo", valor: 3 }
];

const DASS_SUBESCALAS = {
  "Depressão": [2, 4, 9, 12, 15, 16, 20],
  "Ansiedade": [1, 3, 6, 8, 14, 18, 19],
  "Estresse": [0, 5, 7, 10, 11, 13, 17]
};

// Limites dos autores, ja na escala da versao de 42 itens (a soma de cada
// subescala da DASS-21 e multiplicada por 2 antes de comparar).
const gravidadeDass = ([normal, leve, moderada, grave]) => [
  { min: 0, max: normal, rotulo: "Normal", nivel: 0 },
  { min: normal + 1, max: leve, rotulo: "Leve", nivel: 1 },
  { min: leve + 1, max: moderada, rotulo: "Moderada", nivel: 2 },
  { min: moderada + 1, max: grave, rotulo: "Grave", nivel: 3 },
  { min: grave + 1, max: 42, rotulo: "Extremamente grave", nivel: 3 }
];

const DASS_FAIXAS = {
  "Depressão": gravidadeDass([9, 13, 20, 27]),
  "Ansiedade": gravidadeDass([7, 9, 14, 19]),
  "Estresse": gravidadeDass([14, 18, 25, 33])
};

const dass21 = {
  id: "dass21",
  sigla: "DASS-21",
  nome: "Escalas de Depressão, Ansiedade e Estresse",
  dominio: "Rastreio geral",
  aplicacao: "Autoaplicável",
  periodo: "Última semana",
  instrucao: "Leia cada afirmação e marque o quanto ela se aplicou a você durante a última semana.",
  opcoes: APLICOU_DASS,
  // O total geral nao tem ponto de corte: o resultado sao as tres subescalas.
  semTotal: true,
  itens: [
    { texto: "Achei difícil me acalmar." },
    { texto: "Senti minha boca seca." },
    { texto: "Não consegui vivenciar nenhum sentimento positivo." },
    { texto: "Tive dificuldade em respirar em alguns momentos (respiração ofegante, falta de ar, sem ter feito esforço físico)." },
    { texto: "Achei difícil ter iniciativa para fazer as coisas." },
    { texto: "Tive a tendência de reagir de forma exagerada às situações." },
    { texto: "Senti tremores (por exemplo, nas mãos)." },
    { texto: "Senti que estava sempre nervoso(a)." },
    { texto: "Preocupei-me com situações em que eu pudesse entrar em pânico e parecer ridículo(a)." },
    { texto: "Senti que não tinha nada a desejar." },
    { texto: "Senti-me agitado(a)." },
    { texto: "Achei difícil relaxar." },
    { texto: "Senti-me depressivo(a) e sem ânimo." },
    { texto: "Fui intolerante com as coisas que me impediam de continuar o que eu estava fazendo." },
    { texto: "Senti que ia entrar em pânico." },
    { texto: "Não consegui me entusiasmar com nada." },
    { texto: "Senti que não tinha valor como pessoa." },
    { texto: "Senti que estava um pouco emotivo(a) ou sensível demais." },
    { texto: "Senti meu coração alterado mesmo sem ter feito esforço físico (aumento da frequência, palpitações)." },
    { texto: "Senti medo sem motivo." },
    { texto: "Senti que a vida não tinha sentido." }
  ],
  subescalas: DASS_SUBESCALAS,
  subescalaFator: 2,
  subescalaFaixas: DASS_FAIXAS,
  classificar: respostas => {
    const partes = Object.entries(DASS_SUBESCALAS).map(([nome, indices]) => {
      const valor = indices.reduce((soma, indice) => soma + (respostas[indice] ?? 0), 0) * 2;
      return { nome, faixa: DASS_FAIXAS[nome].find(faixa => valor >= faixa.min && valor <= faixa.max) };
    });
    return {
      rotulo: partes.map(parte => `${parte.nome}: ${parte.faixa.rotulo.toLowerCase()}`).join(" · "),
      nivel: Math.max(...partes.map(parte => parte.faixa.nivel))
    };
  },
  observacao: "Cada subescala é somada e multiplicada por 2, para usar os pontos de corte da versão de 42 itens.",
  referencia: "Lovibond SH, Lovibond PF. Manual for the Depression Anxiety Stress Scales. 2ª ed. Sydney: Psychology Foundation; 1995. Validação brasileira: Vignola RCB, Tucci AM. J Affect Disord. 2014;155:104-9. Domínio público."
};

const FREQUENCIA_ASRS = [
  { rotulo: "Nunca", valor: 0 },
  { rotulo: "Raramente", valor: 1 },
  { rotulo: "Às vezes", valor: 2 },
  { rotulo: "Frequentemente", valor: 3 },
  { rotulo: "Muito frequentemente", valor: 4 }
];

// Parte A da ASRS v1.1: as seis perguntas da triagem e o limiar de cada uma.
// Nas tres primeiras (detalhes finais, organizacao, compromissos) conta a
// partir de "As vezes"; nas outras tres (adiar, mexer maos e pes, "motor
// ligado"), a partir de "Frequentemente". Os indices sao os desta lista, que
// segue a ordem do DSM (desatencao, depois hiperatividade/impulsividade).
const ASRS_PARTE_A = [
  { item: 3, min: 2 }, { item: 4, min: 2 }, { item: 8, min: 2 },
  { item: 5, min: 3 }, { item: 9, min: 3 }, { item: 13, min: 3 }
];
const PARTE_A = "Parte A da triagem.";

const asrs18 = {
  id: "asrs18",
  sigla: "ASRS-18",
  nome: "Escala de Autorrelato de TDAH no Adulto, versão 1.1",
  dominio: "TDAH",
  aplicacao: "Autoaplicável",
  periodo: "Últimos 6 meses",
  populacao: "18 anos ou mais",
  instrucao: "Marque com que frequência cada situação aconteceu nos últimos 6 meses. As seis perguntas marcadas como Parte A são as da triagem.",
  opcoes: FREQUENCIA_ASRS,
  semTotal: true,
  itens: [
    { texto: "Com que frequência você comete erros por falta de atenção quando tem de trabalhar num projeto chato ou difícil?" },
    { texto: "Com que frequência você tem dificuldade para manter a atenção quando está fazendo algo chato ou repetitivo?" },
    { texto: "Com que frequência você tem dificuldade para se concentrar no que as pessoas dizem, mesmo quando elas estão falando diretamente com você?" },
    { texto: "Com que frequência você tem dificuldade para acabar os detalhes finais de um projeto, depois de já ter feito as partes mais difíceis?", condicao: PARTE_A },
    { texto: "Com que frequência você tem dificuldade para pôr as coisas em ordem quando precisa fazer uma tarefa que exige organização?", condicao: PARTE_A },
    { texto: "Quando você tem uma tarefa que exige muita concentração, com que frequência você evita ou adia o início?", condicao: PARTE_A },
    { texto: "Com que frequência você coloca as coisas fora do lugar ou tem dificuldade de encontrá-las em casa ou no trabalho?" },
    { texto: "Com que frequência você se distrai com atividades ou barulho à sua volta?" },
    { texto: "Com que frequência você tem dificuldade para lembrar de compromissos ou obrigações?", condicao: PARTE_A },
    { texto: "Com que frequência você fica se mexendo na cadeira ou balançando as mãos ou os pés quando precisa ficar sentado(a) por muito tempo?", condicao: PARTE_A },
    { texto: "Com que frequência você se levanta da cadeira em reuniões ou em outras situações em que deveria ficar sentado(a)?" },
    { texto: "Com que frequência você se sente inquieto(a) ou agitado(a)?" },
    { texto: "Com que frequência você tem dificuldade para sossegar e relaxar quando tem tempo livre?" },
    { texto: "Com que frequência você se sente ativo(a) demais e compelido(a) a fazer coisas, como se estivesse “com um motor ligado”?", condicao: PARTE_A },
    { texto: "Com que frequência você se pega falando demais em situações sociais?" },
    { texto: "Numa conversa, com que frequência você termina as frases das pessoas antes delas?" },
    { texto: "Com que frequência você tem dificuldade para esperar a sua vez quando isso é necessário?" },
    { texto: "Com que frequência você interrompe os outros quando eles estão ocupados?" }
  ],
  subescalas: {
    "Desatenção": intervalo(0, 8),
    "Hiperatividade/impulsividade": intervalo(9, 17)
  },
  classificar: respostas => {
    const positivos = ASRS_PARTE_A.filter(({ item, min }) => (respostas[item] ?? -1) >= min).length;
    const frequentes = (inicio, fim) => intervalo(inicio, fim).filter(indice => (respostas[indice] ?? 0) >= 3).length;
    const detalhe = `Parte A: ${positivos} de 6 no limiar. Frequentes ou muito frequentes: desatenção ${frequentes(0, 8)} de 9; hiperatividade/impulsividade ${frequentes(9, 17)} de 9.`;
    return positivos >= 4
      ? { rotulo: "Triagem positiva na Parte A", nivel: 2, descricao: `${detalhe} Quatro ou mais na Parte A: sintomas muito compatíveis com TDAH no adulto. Confirmar pela entrevista e pela história desde a infância.` }
      : { rotulo: "Triagem negativa na Parte A", nivel: 0, descricao: detalhe };
  },
  referencia: "Kessler RC, Adler L, Ames M, et al. Psychol Med. 2005;35(2):245-56. Versão brasileira: Mattos P et al. Rev Psiquiatr Clín. 2006;33(4):188-94. Organização Mundial da Saúde, uso livre."
};

const INTENSIDADE_SNAP = [
  { rotulo: "Nem um pouco", valor: 0 },
  { rotulo: "Só um pouco", valor: 1 },
  { rotulo: "Bastante", valor: 2 },
  { rotulo: "Demais", valor: 3 }
];

// SNAP-IV nao se soma: conta-se quantos sintomas foram marcados como
// "bastante" ou "demais". Seis ou mais entre os nove de cada dominio indicam
// mais sintomas do que o esperado -- e so isso, sem o informante da escola e
// sem a entrevista.
const snap4 = {
  id: "snap4",
  sigla: "SNAP-IV",
  nome: "Escala SNAP-IV, versão MTA",
  dominio: "TDAH",
  aplicacao: "Pais ou professores",
  periodo: "Comportamento habitual",
  populacao: "Crianças e adolescentes",
  instrucao: "Para cada item, marque o quanto ele descreve a criança ou o adolescente. O ideal é ter uma aplicação respondida pelos pais e outra pela escola.",
  opcoes: INTENSIDADE_SNAP,
  semTotal: true,
  itens: [
    { texto: "Não consegue prestar muita atenção a detalhes ou comete erros por descuido nos trabalhos da escola ou em tarefas." },
    { texto: "Tem dificuldade de manter a atenção em tarefas ou atividades de lazer." },
    { texto: "Parece não estar ouvindo quando se fala diretamente com ele(a)." },
    { texto: "Não segue instruções até o fim e não termina deveres da escola, tarefas ou obrigações." },
    { texto: "Tem dificuldade para organizar tarefas e atividades." },
    { texto: "Evita, não gosta ou não se envolve em tarefas que exigem esforço mental prolongado." },
    { texto: "Perde coisas necessárias para as atividades (brinquedos, deveres da escola, lápis, livros)." },
    { texto: "Distrai-se com estímulos externos." },
    { texto: "É esquecido(a) em atividades do dia a dia." },
    { texto: "Mexe com as mãos ou os pés, ou se remexe na cadeira." },
    { texto: "Sai do lugar na sala de aula ou em outras situações em que se espera que fique sentado(a)." },
    { texto: "Corre de um lado para o outro ou sobe demais nas coisas em situações em que isso é inapropriado." },
    { texto: "Tem dificuldade em brincar ou em se envolver em atividades de lazer de forma calma." },
    { texto: "Não para, ou frequentemente está “a mil por hora”." },
    { texto: "Fala em excesso." },
    { texto: "Responde às perguntas de forma precipitada, antes de elas terem sido terminadas." },
    { texto: "Tem dificuldade de esperar a sua vez." },
    { texto: "Interrompe os outros ou se intromete (nas conversas, nos jogos)." }
  ],
  subescalas: {
    "Desatenção": intervalo(0, 8),
    "Hiperatividade/impulsividade": intervalo(9, 17)
  },
  classificar: respostas => {
    const marcados = (inicio, fim) => intervalo(inicio, fim).filter(indice => (respostas[indice] ?? 0) >= 2).length;
    const desatencao = marcados(0, 8);
    const hiperatividade = marcados(9, 17);
    const descricao = `${desatencao} de 9 sintomas de desatenção e ${hiperatividade} de 9 de hiperatividade/impulsividade marcados como “bastante” ou “demais”. Precisa ser confirmado por mais de um informante e pela entrevista.`;
    if (desatencao >= 6 && hiperatividade >= 6) return { rotulo: "Desatenção e hiperatividade/impulsividade acima do esperado", nivel: 2, descricao };
    if (desatencao >= 6) return { rotulo: "Desatenção acima do esperado", nivel: 2, descricao };
    if (hiperatividade >= 6) return { rotulo: "Hiperatividade/impulsividade acima do esperado", nivel: 2, descricao };
    return { rotulo: "Abaixo do esperado para TDAH", nivel: 0, descricao };
  },
  referencia: "Swanson JM et al. SNAP-IV. Versão brasileira: Mattos P, Serra-Pinheiro MA, Rohde LA, Pinto D. Rev Psiquiatr RS. 2006;28(3):290-7."
};

// SBQ-R, com a pontuacao de Osman (2001): a pergunta 3 vai de 1 a 3, e a 4, de
// 0 a 6. Onde o original separa "querendo" e "sem querer morrer" com o mesmo
// valor, as opcoes foram juntadas: duas respostas com o mesmo valor nao se
// distinguem na tela.
const sbqr = {
  id: "sbqr",
  sigla: "SBQ-R",
  nome: "Questionário de Comportamentos Suicidas, revisado",
  dominio: "Risco de suicídio",
  aplicacao: "Autoaplicável ou entrevista",
  periodo: "Toda a vida e último ano",
  itens: [
    { texto: "Você já pensou em se matar ou já tentou se matar?", opcoes: [
      { rotulo: "Nunca", valor: 1 },
      { rotulo: "Foi só um pensamento passageiro", valor: 2 },
      { rotulo: "Já tive um plano para me matar, pelo menos uma vez, mas não tentei", valor: 3 },
      { rotulo: "Já tentei me matar", valor: 4 }
    ] },
    { texto: "Com que frequência você pensou em se matar no último ano?", opcoes: [
      { rotulo: "Nunca", valor: 1 },
      { rotulo: "Raramente (1 vez)", valor: 2 },
      { rotulo: "Às vezes (2 vezes)", valor: 3 },
      { rotulo: "Frequentemente (3 a 4 vezes)", valor: 4 },
      { rotulo: "Muito frequentemente (5 vezes ou mais)", valor: 5 }
    ] },
    { texto: "Você já disse a alguém que ia se matar, ou que talvez fizesse isso?", opcoes: [
      { rotulo: "Não", valor: 1 },
      { rotulo: "Sim, uma vez", valor: 2 },
      { rotulo: "Sim, mais de uma vez", valor: 3 }
    ] },
    { texto: "Qual é a chance de você tentar se matar algum dia?", opcoes: [
      { rotulo: "Nunca", valor: 0 },
      { rotulo: "Nenhuma chance", valor: 1 },
      { rotulo: "Bem improvável", valor: 2 },
      { rotulo: "Improvável", valor: 3 },
      { rotulo: "Provável", valor: 4 },
      { rotulo: "Bem provável", valor: 5 },
      { rotulo: "Muito provável", valor: 6 }
    ] }
  ],
  faixas: [
    { min: 3, max: 6, rotulo: "Abaixo do ponto de corte", nivel: 0 },
    { min: 7, max: 18, rotulo: "Acima do ponto de corte", nivel: 2, descricao: "7 ou mais na população geral; em pacientes psiquiátricos internados, o ponto de corte é 8. Avaliar o risco atual." }
  ],
  alertas: [
    {
      itens: [0], min: 3, tipo: "suicidio",
      texto: "SBQ-R: plano ou tentativa de suicídio ao longo da vida. Avaliar o risco atual."
    },
    {
      itens: [3], min: 4, tipo: "suicidio",
      texto: "SBQ-R: considera provável tentar se matar. Avaliar o risco agudo nesta consulta (C-SSRS ou ASQ)."
    }
  ],
  referencia: "Osman A, Bagge CL, Gutierrez PM, et al. Assessment. 2001;8(4):443-54."
};

// Autismo, decidido com o Dr. Regis em 11/09/2026: RAADS-R no adulto, M-CHAT-R/F
// na crianca pequena e CARS aplicada pelo medico. A escala infantil de 12 itens
// do catalogo ficou de fora: nao corresponde a nenhum instrumento validado.

// RAADS-R. No catalogo a pontuacao estava invertida em todos os itens --
// "verdadeiro agora e quando era jovem" valia 0 --, a pergunta 80 trazia as
// opcoes-resto de formulario, e a 69 dizia "ser eu mesmo" onde o original diz
// "ficar sozinho". A redacao dos demais itens e a do catalogo, revista.
const RAADS_RESPOSTAS = [
  "Verdadeiro agora e quando eu era jovem",
  "Verdadeiro só agora",
  "Verdadeiro só antes dos 16 anos",
  "Nunca foi verdadeiro"
];
const RAADS_SINTOMA = RAADS_RESPOSTAS.map((rotulo, indice) => ({ rotulo, valor: 3 - indice }));
const RAADS_NORMATIVO = RAADS_RESPOSTAS.map((rotulo, indice) => ({ rotulo, valor: indice }));
// Numeracao do original (1 a 80): os 17 itens em que a resposta tipica e
// "verdadeiro" pontuam ao contrario.
const RAADS_NORMATIVOS = new Set([1, 6, 11, 18, 23, 26, 33, 37, 43, 47, 48, 53, 58, 62, 68, 72, 77]);
const doOriginal = numeros => numeros.map(numero => numero - 1);

const RAADS_FRASES = [
  "Sou uma pessoa simpática.",
  "Sempre uso frases de filmes e de TV nas conversas.",
  "Sempre me surpreendo quando os outros me dizem que fui rude.",
  "Às vezes falo alto ou baixo demais, sem perceber.",
  "Frequentemente não sei como reagir nas situações sociais.",
  "Consigo “me pôr no lugar do outro”.",
  "Para mim é difícil entender o que algumas frases significam, como “você é a menina dos meus olhos”.",
  "Só gosto de falar com pessoas que tenham os mesmos interesses que os meus.",
  "Foco mais nos detalhes do que na ideia geral.",
  "Sempre noto a sensação da comida na boca; isso é mais importante do que o próprio gosto.",
  "Tenho saudades dos meus melhores amigos ou da minha família quando ficamos separados por muito tempo.",
  "Às vezes ofendo os outros por dizer o que penso, mesmo sem querer.",
  "Gosto de pensar e de falar só sobre algumas poucas coisas que me interessam.",
  "Prefiro ir a um restaurante sozinho(a) a ir com alguém que eu conheço.",
  "Não consigo imaginar como seria estar na pele de outra pessoa.",
  "Já me disseram que sou desajeitado(a) ou descoordenado(a).",
  "As pessoas me acham estranho(a) ou diferente.",
  "Percebo quando meus amigos precisam ser confortados.",
  "Sou muito sensível ao toque das roupas; a sensação delas no corpo é mais importante do que o modelo.",
  "Gosto de copiar o jeito de falar e de agir de certas pessoas; isso me ajuda a parecer mais normal.",
  "Falar com mais de uma pessoa ao mesmo tempo pode ser muito intimidante para mim.",
  "Tenho de “agir como se fosse normal” para agradar aos outros e fazer com que gostem de mim.",
  "Conhecer pessoas costuma ser fácil para mim.",
  "Quando alguém me interrompe enquanto falo de algo que me interessa muito, fico extremamente confuso(a).",
  "É difícil para mim entender o que as outras pessoas estão sentindo quando falam.",
  "Gosto de conversar com várias pessoas ao mesmo tempo, como à mesa num jantar, na escola ou no trabalho.",
  "Levo as coisas muito ao pé da letra e acabo não entendendo o que as pessoas estão querendo dizer.",
  "É muito difícil para mim perceber quando as pessoas estão envergonhadas ou com inveja.",
  "Algumas texturas que não incomodam os outros são totalmente agressivas ao meu toque.",
  "Fico extremamente aborrecido(a) quando o jeito como costumo fazer as coisas muda de repente.",
  "Nunca quis nem precisei do que as outras pessoas chamam de “relacionamento íntimo”.",
  "É muito difícil para mim começar ou terminar uma conversa.",
  "Falo num ritmo normal.",
  "O mesmo som, cor ou textura pode mudar de repente de muito delicado para muito grosseiro.",
  "A frase “estou virado no avesso” me deixa desconfortável.",
  "Às vezes o som de uma palavra ou um barulho agudo chega a doer nos meus ouvidos.",
  "Sou uma pessoa compreensiva.",
  "Não me conecto com personagens de filmes e não consigo sentir o que eles sentem.",
  "Não consigo perceber se alguém está me paquerando.",
  "Consigo ver na mente, com detalhes exatos, as coisas que me interessam.",
  "Faço listas das coisas que me interessam, mesmo que não tenham uso prático (estatísticas de esportes, fatos históricos, datas).",
  "Quando meus sentidos ficam sobrecarregados, tenho de me isolar para que eles “se desliguem”.",
  "Gosto de conversar sobre as coisas com meus amigos.",
  "Não sei dizer se alguém está interessado ou entediado com o que estou falando.",
  "Pode ser difícil para mim ler o rosto, as mãos e o corpo de quem está falando comigo.",
  "A mesma coisa (uma roupa, uma temperatura) pode parecer bem diferente para mim em ocasiões diferentes.",
  "Fico muito à vontade em encontros e ocasiões sociais.",
  "Tento ajudar o máximo possível quando as pessoas me contam seus problemas pessoais.",
  "Já me disseram que tenho uma voz incomum (monótona, infantil ou estridente).",
  "Às vezes um assunto fica “emperrado” na minha cabeça e tenho de falar sobre ele, mesmo que ninguém esteja interessado.",
  "Faço certos movimentos repetitivos com as mãos (agitá-las, girar pauzinhos ou fios, mexer coisas diante dos olhos).",
  "Nunca me interessei pelo que a maioria das pessoas acha interessante.",
  "Sou considerado(a) uma pessoa compassiva.",
  "Quando lido com pessoas, sigo uma lista de regras específicas que me ajudam a parecer normal.",
  "É muito difícil para mim trabalhar em grupo ou fazer parte de um grupo.",
  "Quando falo com alguém, é difícil mudar de assunto; se a outra pessoa muda, fico muito aborrecido(a) e confuso(a).",
  "Às vezes tapo os ouvidos para bloquear barulhos que doem (aspirador de pó, gente que fala demais ou alto demais).",
  "Consigo conversar e bater papo com as pessoas.",
  "Às vezes, coisas que deveriam doer não doem (quando me machuco ou queimo a mão no forno, por exemplo).",
  "Quando estou conversando, acho difícil saber quando é a minha vez de falar e quando é a de ouvir.",
  "Quem me conhece me considera uma pessoa solitária.",
  "Costumo falar num tom de voz normal.",
  "Gosto que as coisas sejam feitas exatamente do mesmo jeito todos os dias, e até pequenas mudanças na rotina me chateiam.",
  "Fazer amigos e socializar é um mistério para mim.",
  "Quando estou estressado(a), girar ou balançar numa cadeira me acalma.",
  "A frase “ele faz tudo de barriga” não faz sentido para mim.",
  "Num lugar com muitos cheiros, texturas, barulhos ou luzes fortes, fico ansioso(a) ou com medo.",
  "Percebo quando alguém diz uma coisa querendo dizer outra.",
  "Gosto de ficar sozinho(a) o máximo possível.",
  "Guardo os pensamentos na memória como em fichas de arquivo e pego os que preciso procurando na “pilha” (ou por algum outro método só meu).",
  "O mesmo som às vezes me parece muito alto e às vezes muito baixo, mesmo sabendo que o volume não mudou.",
  "Gosto de passar o tempo comendo e conversando com a família e os amigos.",
  "Não tolero coisas de que não gosto (cheiros, texturas, sons ou cores).",
  "Não gosto de ser abraçado(a) ou segurado(a).",
  "Quando vou a algum lugar, tenho de seguir uma rotina conhecida, ou posso ficar muito confuso(a) e aborrecido(a).",
  "É difícil descobrir o que os outros esperam de mim.",
  "Gosto de ter amigos próximos.",
  "As pessoas me dizem que sou detalhista demais.",
  "Sempre me dizem que faço perguntas constrangedoras.",
  "Costumo apontar os erros dos outros."
];

const raadsr = {
  id: "raadsr",
  sigla: "RAADS-R",
  nome: "Escala Diagnóstica de Autismo e Asperger de Ritvo, revisada",
  dominio: "Autismo",
  aplicacao: "Autoaplicável, com o médico presente",
  periodo: "Agora e antes dos 16 anos",
  populacao: "Adultos",
  instrucao: "Para cada frase, marque se ela vale para você agora e também valia quando era jovem, se vale só agora, se valia só antes dos 16 anos, ou se nunca valeu. Na validação, o médico ficava junto para esclarecer dúvidas.",
  itens: RAADS_FRASES.map((texto, indice) => ({
    texto,
    opcoes: RAADS_NORMATIVOS.has(indice + 1) ? RAADS_NORMATIVO : RAADS_SINTOMA
  })),
  subescalas: {
    "Relação social": doOriginal([1, 3, 5, 6, 8, 11, 12, 14, 17, 18, 20, 21, 22, 23, 25, 26, 28, 31, 37, 38, 39, 43, 44, 45, 47, 48, 53, 54, 55, 60, 61, 64, 68, 69, 72, 76, 77, 79, 80]),
    "Interesses restritos": doOriginal([9, 13, 24, 30, 32, 40, 41, 50, 52, 56, 63, 70, 75, 78]),
    "Linguagem": doOriginal([2, 7, 15, 27, 35, 58, 66]),
    "Sensório-motor": doOriginal([4, 10, 16, 19, 29, 33, 34, 36, 42, 46, 49, 51, 57, 59, 62, 65, 67, 71, 73, 74])
  },
  // 65 e o corte da validacao original (sensibilidade de 97%). Em servico de
  // saude mental, porem, mais da metade dos pacientes sem autismo passa de 65;
  // Brugha (2020) achou 120 melhor nessa populacao, que e a do consultorio.
  faixas: [
    { min: 0, max: 64, rotulo: "Abaixo do ponto de corte", nivel: 0 },
    { min: 65, max: 119, rotulo: "Acima do ponto de corte original", nivel: 1, descricao: "Em serviços de saúde mental, 65 tem especificidade baixa: ansiedade, depressão e traços de personalidade também elevam o total. Confirmar com avaliação diagnóstica e história do desenvolvimento." },
    { min: 120, max: 240, rotulo: "Acima do ponto de corte para saúde mental", nivel: 2, descricao: "Acima de 120, o corte proposto para pacientes de serviços de saúde mental. Indica avaliação diagnóstica de autismo, que continua sendo clínica." }
  ],
  observacao: "Rastreio, e não diagnóstico. As subescalas mostram onde o total se concentra; não têm ponto de corte próprio validado.",
  referencia: "Ritvo RA, Ritvo ER, Guthrie D, et al. J Autism Dev Disord. 2011;41(8):1076-89. Corte em saúde mental: Brugha T, Tyrer F, Leaver A, et al. Int J Methods Psychiatr Res. 2020;29(1):e1814."
};

// M-CHAT-R/F. A resposta que pontua e "Nao", menos nas perguntas 2, 5 e 12,
// em que e "Sim". De 3 a 7 pontos a triagem so se fecha depois da Entrevista
// de Seguimento, que o medico faz item a item; o resultado dela vai no ultimo
// item, que nao entra na soma.
const mchat = {
  id: "mchat",
  sigla: "M-CHAT-R/F",
  nome: "Lista de Verificação Modificada para Autismo em Crianças Pequenas, revisada, com Entrevista de Seguimento",
  dominio: "Autismo",
  aplicacao: "Pais ou cuidadores; seguimento pelo médico",
  periodo: "Comportamento habitual",
  populacao: "16 a 30 meses",
  instrucao: "Responda pensando em como a criança costuma se comportar. Se ela fez algo poucas vezes, mas não costuma fazer, responda “não”.",
  itens: [
    { texto: "Se você aponta para alguma coisa do outro lado do cômodo, a criança olha para o que você apontou? (Por exemplo, um brinquedo ou um animal.)", opcoes: PONTUA_NAO },
    { texto: "Você já se perguntou se a criança pode ser surda?", opcoes: PONTUA_SIM },
    { texto: "A criança brinca de faz de conta? (Por exemplo, finge beber num copo vazio, falar ao telefone ou dar comida a uma boneca.)", opcoes: PONTUA_NAO },
    { texto: "A criança gosta de subir nas coisas? (Móveis, brinquedos do parquinho, escadas.)", opcoes: PONTUA_NAO },
    { texto: "A criança faz movimentos incomuns com os dedos perto dos olhos?", opcoes: PONTUA_SIM },
    { texto: "A criança aponta com um dedo para pedir alguma coisa ou pedir ajuda? (Por exemplo, um lanche ou um brinquedo fora do alcance.)", opcoes: PONTUA_NAO },
    { texto: "A criança aponta com um dedo para mostrar a você algo interessante? (Por exemplo, um avião no céu ou um caminhão na rua.)", opcoes: PONTUA_NAO },
    { texto: "A criança se interessa por outras crianças? (Observa, sorri para elas, vai até elas.)", opcoes: PONTUA_NAO },
    { texto: "A criança traz ou levanta coisas para mostrar a você, só para compartilhar, e não para pedir ajuda? (Uma flor, um bicho de pelúcia, um carrinho.)", opcoes: PONTUA_NAO },
    { texto: "A criança responde quando você a chama pelo nome? (Olha, fala, balbucia ou para o que está fazendo.)", opcoes: PONTUA_NAO },
    { texto: "Quando você sorri para a criança, ela sorri de volta?", opcoes: PONTUA_NAO },
    { texto: "A criança fica incomodada com barulhos do dia a dia? (Por exemplo, grita ou chora com o aspirador de pó ou com música alta.)", opcoes: PONTUA_SIM },
    { texto: "A criança anda?", opcoes: PONTUA_NAO },
    { texto: "A criança olha nos seus olhos quando você fala com ela, brinca com ela ou a veste?", opcoes: PONTUA_NAO },
    { texto: "A criança tenta imitar o que você faz? (Dar tchau, bater palmas, repetir um barulho engraçado.)", opcoes: PONTUA_NAO },
    { texto: "Se você vira a cabeça para olhar alguma coisa, a criança olha em volta para ver o que você está olhando?", opcoes: PONTUA_NAO },
    { texto: "A criança tenta fazer você olhar para ela? (Olha esperando um elogio, ou diz “olha” ou “me vê”.)", opcoes: PONTUA_NAO },
    { texto: "A criança entende quando você pede para ela fazer alguma coisa, sem apontar? (Por exemplo, “põe o livro na cadeira” ou “me traz o cobertor”.)", opcoes: PONTUA_NAO },
    { texto: "Quando acontece algo novo, a criança olha para o seu rosto para ver como você reage? (Um barulho estranho, um brinquedo novo.)", opcoes: PONTUA_NAO },
    { texto: "A criança gosta de atividades de movimento? (Ser balançada, pular nos seus joelhos.)", opcoes: PONTUA_NAO },
    {
      texto: "Entrevista de Seguimento: depois de repassar cada item que pontuou, quantos continuam positivos?",
      opcoes: [
        { rotulo: "Nenhum ou 1", valor: 0 },
        { rotulo: "2 ou mais", valor: 1 }
      ],
      fora: true,
      opcional: true,
      condicao: "Só com 3 a 7 pontos, feita pelo médico. Não entra na soma."
    }
  ],
  classificar: (respostas, total) => {
    if (total >= 8) return { rotulo: "Risco alto", nivel: 3, descricao: "Encaminhar logo para avaliação diagnóstica e para intervenção precoce, sem esperar a Entrevista de Seguimento." };
    if (total >= 3) {
      if (respostas[20] === 1) return { rotulo: "Triagem positiva após o seguimento", nivel: 2, descricao: "Dois ou mais itens continuaram positivos. Encaminhar para avaliação diagnóstica e para intervenção precoce." };
      if (respostas[20] === 0) return { rotulo: "Triagem negativa após o seguimento", nivel: 1, descricao: "Menos de dois itens continuaram positivos. Rastrear de novo nas próximas consultas; a preocupação dos pais continua valendo por si." };
      return { rotulo: "Risco moderado", nivel: 2, descricao: "Fazer a Entrevista de Seguimento com os pais, item a item, e marcar o resultado na última pergunta." };
    }
    return { rotulo: "Baixo risco", nivel: 0, descricao: "Se a criança tem menos de 24 meses, repetir aos 24 meses." };
  },
  observacao: "Redação deste app, no sentido do original. A versão brasileira oficial (Losapio et al., 2022) e os fluxogramas da Entrevista de Seguimento estão em mchatscreen.com; para uso formal, prefira o texto oficial.",
  referencia: "Robins DL, Casagrande K, Barton M, et al. Pediatrics. 2014;133(1):37-45. Versão brasileira: Losapio MF, Siquara GM, Lampreia C, Lázaro CP, Pondé MP. Rev Paul Pediatr. 2022;41:e2021262. © 2009 Robins, Fein e Barton; uso clínico livre."
};

// CARS: nota de 1 a 4, com meia nota, em cada um dos 15 dominios, dada pelo
// medico que observa a crianca. As descricoes de cada nota sao do manual, que
// tem direitos autorais; aqui ficam os dominios e a regra de soma.
const NOTA_CARS = [
  { rotulo: "1 · Normal para a idade", valor: 1 },
  { rotulo: "1,5", valor: 1.5 },
  { rotulo: "2 · Levemente anormal", valor: 2 },
  { rotulo: "2,5", valor: 2.5 },
  { rotulo: "3 · Moderadamente anormal", valor: 3 },
  { rotulo: "3,5", valor: 3.5 },
  { rotulo: "4 · Gravemente anormal", valor: 4 }
];

const cars = {
  id: "cars",
  sigla: "CARS",
  nome: "Escala de Avaliação do Autismo na Infância",
  dominio: "Autismo",
  aplicacao: "Aplicada pelo médico, por observação",
  periodo: "Observação e relato dos pais",
  populacao: "A partir de 2 anos",
  instrucao: "Pontue cada domínio comparando a criança com outra da mesma idade, pelas descrições do manual. Use a meia nota quando o comportamento fica entre duas descrições.",
  opcoes: NOTA_CARS,
  itens: [
    { texto: "Relações pessoais" },
    { texto: "Imitação" },
    { texto: "Resposta emocional" },
    { texto: "Uso do corpo" },
    { texto: "Uso de objetos" },
    { texto: "Resposta a mudanças" },
    { texto: "Resposta visual" },
    { texto: "Resposta auditiva" },
    { texto: "Resposta e uso do paladar, do olfato e do tato" },
    { texto: "Medo ou nervosismo" },
    { texto: "Comunicação verbal" },
    { texto: "Comunicação não verbal" },
    { texto: "Nível de atividade" },
    { texto: "Nível e consistência da resposta intelectual" },
    { texto: "Impressão geral" }
  ],
  faixas: [
    { min: 15, max: 29.5, rotulo: "Sem autismo", nivel: 0 },
    { min: 30, max: 36.5, rotulo: "Autismo leve a moderado", nivel: 2 },
    { min: 37, max: 60, rotulo: "Autismo grave", nivel: 3 }
  ],
  observacao: "O corte de 30 é o da criança. Em adolescentes e adultos, a literatura usa 28.",
  referencia: "Schopler E, Reichler RJ, DeVellis RF, Daly K. J Autism Dev Disord. 1980;10(1):91-103. Versão brasileira: Pereira A, Riesgo RS, Wagner MB. J Pediatr (Rio J). 2008;84(6):487-94. Instrumento com direitos autorais; aplicar com o manual."
};

export const scales = [phq9, gad7, mdq, epds, gds15, dass21, asq, cssrs, sbqr, ybocs, asrs18, snap4, raadsr, mchat, cars, audit, srq20, cgiS, cgiI];

export function scaleById(id) {
  return scales.find(scale => scale.id === id);
}
