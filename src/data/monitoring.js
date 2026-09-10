import { arrayValue, normalizeText } from "../clinical/textFormat.js";

// Monitorizacao laboratorial por medicamento, decidida com o Dr. Regis em
// 10/09/2026, depois da comparacao com o TribeMD, que tem modelo de exame
// pronto para valproato, carbamazepina, antipsicoticos e clozapina.
//
// Isto NAO e escolha de tratamento -- essa continua com o RAG, pelo mesmo
// motivo que tirou a tabela de manejo dos Sintomas-Alvo. E o que se pede
// DEPOIS que o farmaco esta escolhido: exame de seguranca, estavel, que nao
// muda de uma edicao para outra do livro. Esquecer a litemia ou os neutrofilos
// da clozapina e erro de omissao, e nao de raciocinio.
//
// `exames` usa os nomes EXATOS das opcoes de "Exames solicitados"
// (optionGroups.examesPsiquiatria): e o que o botao marca na tela. O que nao
// tem opcao propria vai em `extras`, para o campo "Outro".
//
// A busca e pelo nome do farmaco no inicio da linha assinalada (antes do
// primeiro "|"): a justificativa da IA as vezes cita outro farmaco ("evitar
// associar ao litio"), e isso nao pode puxar o exame dele.
export const MONITORING = [
  {
    farmacos: ["litio"],
    rotulo: "Lítio",
    exames: ["Litemia", "Exames laboratoriais", "ECG"],
    extras: ["Cálcio sérico"],
    gestacao: true,
    nota: "Litemia 5 a 7 dias depois de iniciar ou mudar a dose, colhida cerca de 12 horas após a última tomada; depois a cada 3 a 6 meses. Função renal e TSH a cada 6 a 12 meses. ECG antes de iniciar se houver cardiopatia ou idade acima de 40 anos."
  },
  {
    farmacos: ["valpro"],
    rotulo: "Valproato",
    exames: ["Valproato serico", "Exames laboratoriais"],
    extras: [],
    gestacao: true,
    nota: "Hemograma com plaquetas e transaminases antes de iniciar e periodicamente, sobretudo nos primeiros 6 meses; nível sérico após ajuste de dose. Teratogênico: em quem pode engravidar, só com contracepção eficaz."
  },
  {
    farmacos: ["carbamazepin"],
    rotulo: "Carbamazepina",
    exames: ["Exames laboratoriais"],
    extras: ["Nível sérico de carbamazepina"],
    gestacao: true,
    nota: "Hemograma, sódio e transaminases antes de iniciar e periodicamente; nível sérico após ajuste. Indutor enzimático: reduz o efeito do contraceptivo hormonal."
  },
  {
    farmacos: ["oxcarbazepin"],
    rotulo: "Oxcarbazepina",
    exames: ["Exames laboratoriais"],
    extras: [],
    nota: "Sódio antes e durante o uso: hiponatremia, sobretudo em idosos e com diurético."
  },
  {
    farmacos: ["clozapin"],
    rotulo: "Clozapina",
    exames: ["Exames laboratoriais", "ECG"],
    extras: ["Contagem de neutrófilos", "Troponina", "Proteína C reativa"],
    nota: "Contagem de neutrófilos antes de iniciar, semanal nas primeiras 18 semanas e mensal depois, enquanto durar o uso. Troponina e PCR semanais no primeiro mês, pelo risco de miocardite. Glicemia e lipídios como nos demais antipsicóticos."
  },
  {
    farmacos: ["olanzapin", "quetiapin", "risperidon", "paliperidon", "aripiprazol", "ziprasidon", "lurasidon", "asenapin", "cariprazin", "brexpiprazol", "amissulprid"],
    rotulo: "Antipsicótico de segunda geração",
    exames: ["Exames laboratoriais"],
    extras: [],
    nota: "Glicemia (ou HbA1c) e perfil lipídico antes de iniciar, em 12 semanas e depois pelo menos uma vez por ano. Peso, IMC, circunferência abdominal e pressão arterial a cada consulta nos primeiros meses."
  },
  {
    farmacos: ["risperidon", "paliperidon", "amissulprid"],
    rotulo: "Antipsicótico que eleva a prolactina",
    exames: ["Prolactina"],
    extras: [],
    nota: "Prolactina se houver galactorreia, alteração menstrual ou disfunção sexual."
  },
  {
    farmacos: ["ziprasidon"],
    rotulo: "Ziprasidona",
    exames: ["ECG"],
    extras: [],
    nota: "ECG antes de iniciar: prolonga o intervalo QT."
  },
  {
    farmacos: ["citalopram"],
    rotulo: "Citalopram ou escitalopram",
    exames: ["ECG"],
    extras: [],
    nota: "ECG se houver fator de risco para QT longo: cardiopatia, outro fármaco que prolonga o QT, hipocalemia ou dose alta."
  },
  {
    farmacos: ["amitriptilin", "nortriptilin", "imipramin", "clomipramin"],
    rotulo: "Tricíclico",
    exames: ["ECG"],
    extras: [],
    nota: "ECG antes de iniciar, sobretudo acima de 40 anos ou com cardiopatia."
  },
  {
    farmacos: ["metilfenidat", "anfetamin"],
    rotulo: "Psicoestimulante",
    exames: [],
    extras: [],
    nota: "Pressão arterial, frequência cardíaca e peso a cada consulta; em criança e adolescente, também a altura."
  },
  {
    farmacos: ["naltrexon", "dissulfiram"],
    rotulo: "Naltrexona ou dissulfiram",
    exames: ["Exames laboratoriais"],
    extras: [],
    nota: "Transaminases antes de iniciar e periodicamente."
  }
];

function nomeDoFarmaco(linha = "") {
  return normalizeText(String(linha).split("|")[0]);
}

// Os blocos de monitorizacao dos farmacos assinalados. Beta-hCG so entra nos
// teratogenicos e so para quem pode engravidar (mayBePregnant, da faixa de vida).
export function monitoringFor(selecionados = [], { podeEngravidar = false } = {}) {
  const nomes = arrayValue(selecionados).map(nomeDoFarmaco);
  return MONITORING
    .filter(bloco => nomes.some(nome => bloco.farmacos.some(farmaco => nome.includes(farmaco))))
    .map(bloco => ({
      ...bloco,
      exames: [...bloco.exames, ...(bloco.gestacao && podeEngravidar ? ["Beta-HCG"] : [])]
    }));
}

export function monitoringExamSelection(blocos = []) {
  return {
    opcoes: [...new Set(blocos.flatMap(bloco => bloco.exames))],
    extras: [...new Set(blocos.flatMap(bloco => bloco.extras))]
  };
}
