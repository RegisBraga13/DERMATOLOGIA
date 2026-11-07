// Núcleo clínico específico de Dermatologia.
// O armazenamento, autenticação e sincronização continuam compartilhados;
// este módulo concentra somente o vocabulário e o contrato do atendimento.

export const DERMATOLOGIA_SPECIALTY = Object.freeze({
  id: "dermatologia",
  label: "Dermatologia",
  productName: "Prontuário Dermatológico",
  description: "Anamnese dermatológica, exame físico de lesões e acompanhamento clínico.",
  consultationPages: Object.freeze([
    ["queixa", "Queixa e história"],
    ["antecedentes", "Antecedentes dermatológicos"],
    ["exame-fisico", "Exame físico"],
    ["avaliacao", "Avaliação"],
    ["conduta", "Conduta e seguimento"]
  ]),
  returnPages: Object.freeze([
    ["evolucao", "Evolução"],
    ["exame-fisico", "Exame físico"],
    ["avaliacao", "Avaliação"],
    ["conduta", "Conduta e seguimento"]
  ])
});

export const LESION_MORPHOLOGY = Object.freeze([
  "Mácula", "Pápula", "Placa", "Nódulo", "Tumor", "Vesícula", "Bolha",
  "Pústula", "Ulceração", "Erosão", "Crosta", "Descamação", "Fissura",
  "Comedão", "Cisto", "Cicatriz", "Petéquia", "Púrpura"
]);

export const LESION_DISTRIBUTIONS = Object.freeze([
  "Face", "Couro cabeludo", "Pescoço", "Tronco", "Membros superiores",
  "Membros inferiores", "Palmas", "Plantas", "Dobras", "Genitais",
  "Mucosas", "Generalizada"
]);

export const DERMATOLOGY_SYMPTOM_OPTIONS = Object.freeze([
  "Prurido", "Dor", "Ardor", "Queimação", "Disestesia", "Sangramento",
  "Secreção", "Febre", "Mal-estar", "Sem sintomas"
]);

export const DERMATOLOGY_ONSET_OPTIONS = Object.freeze([
  "Súbito", "Agudo (até 6 semanas)", "Subagudo", "Crônico (mais de 6 semanas)",
  "Recorrente", "Progressivo", "Estável", "Flutuante"
]);

export const DERMATOLOGY_EXPOSURE_OPTIONS = Object.freeze([
  "Sol", "Calor ou suor", "Frio", "Água ou umidade", "Produto cosmético",
  "Produto ocupacional", "Planta ou animal", "Medicamento novo", "Contato desconhecido",
  "Sem exposição relevante"
]);

export const LESION_ARRANGEMENTS = Object.freeze([
  "Solitária", "Agrupada", "Disseminada", "Confluente", "Linear", "Anular",
  "Numular", "Serpiginosa", "Herpetiforme", "Zosteriforme", "Simétrica", "Assimétrica"
]);

export const LESION_COLORS = Object.freeze([
  "Da cor da pele", "Eritematoso", "Violáceo", "Acastanhado", "Enegrecido",
  "Hipocrômico", "Acrômico", "Amarelado", "Azulado", "Misto"
]);

export const LESION_SURFACE = Object.freeze([
  "Lisa", "Descamativa", "Hiperqueratótica", "Verrucosa", "Crostosa",
  "Exulcerada", "Ulcerada", "Erosada", "Macerada", "Fissurada", "Normal"
]);

export const LESION_PALPATION = Object.freeze([
  "Macia", "Firme", "Endurecida", "Flutuante", "Infiltrada", "Móvel",
  "Aderida", "Quente", "Dolorosa à palpação", "Sem alteração à palpação"
]);

export const DERMATOLOGY_ALARM_OPTIONS = Object.freeze([
  "Crescimento rápido", "Mudança de cor ou forma", "Sangramento espontâneo",
  "Ulceração sem trauma", "Dor intensa ou desproporcional", "Necrose",
  "Sinais sistêmicos", "Imunossupressão relevante", "Sem sinal de alarme observado"
]);

export const DERMATOLOGY_ANAMNESIS_FIELDS = Object.freeze([
  ["queixaPrincipal", "Queixa principal"],
  ["historiaDoencaAtual", "História da doença atual"],
  ["localizacaoInicial", "Localização inicial e disseminação"],
  ["inicioEvolucao", "Início e evolução"],
  ["caracteristicasEvolucao", "Mudanças de aparência, textura e quantidade"],
  ["sintomasAssociados", "Sintomas associados"],
  ["intensidade", "Intensidade da dor ou prurido (0 a 10)"],
  ["gatilhosExposicoes", "Gatilhos e exposições"],
  ["fatoresMelhora", "Fatores de melhora"],
  ["tratamentosPrevios", "Tratamentos prévios, procedimentos e resposta"],
  ["contatos", "Contato com pessoas ou animais com quadro semelhante"],
  ["ideias", "O que o paciente pensa sobre o problema"],
  ["preocupacoes", "Principais preocupações"],
  ["expectativas", "Expectativas para a consulta"]
]);

export const DERMATOLOGY_HISTORY_FIELDS = Object.freeze([
  ["alergias", "Alergias e reações medicamentosas"],
  ["dermatosesPrevias", "Dermatoses prévias"],
  ["neoplasiasCutaneas", "Neoplasias cutâneas pessoais"],
  ["historiaFamiliar", "História familiar relevante"],
  ["medicamentos", "Medicamentos em uso"],
  ["imunossupressao", "Imunossupressão e comorbidades"],
  ["exposicaoSolar", "Exposição solar e fotoproteção"],
  ["queimadurasBronzeamento", "Queimaduras solares e bronzeamento artificial"],
  ["produtosTopicos", "Produtos tópicos, cosméticos e tipo de pele percebido"],
  ["ocupacaoExposicoes", "Ocupação, lazer e exposições"],
  ["ambienteHabitos", "Ambiente doméstico e hábitos"],
  ["revisaoSistemas", "Revisão de sistemas e sintomas gerais"],
  ["cosmiatria", "Cosmiatria (se pertinente): queixa, procedimentos prévios e riscos"]
]);

export const DERMATOLOGY_PHYSICAL_EXAM_FIELDS = Object.freeze([
  ["localizacao", "Localização e distribuição"],
  ["morfologia", "Morfologia primária"],
  ["cor", "Cor"],
  ["superficie", "Superfície"],
  ["bordas", "Bordas"],
  ["dimensoes", "Dimensões"],
  ["consistencia", "Consistência"],
  ["sintomasAoExame", "Dor, prurido e outros sintomas"],
  ["unhasCabelosMucosas", "Unhas, cabelos e mucosas"],
  ["linfonodos", "Linfonodos e sinais sistêmicos"],
  ["peleGeral", "Coloração geral, hidratação e turgor"],
  ["simetriaFormato", "Simetria, formato e delimitação"],
  ["sensibilidadeTemperatura", "Temperatura e sensibilidade cutânea"],
  ["abcde", "ABCDE de lesões pigmentadas, quando aplicável"],
  ["dermatoscopia", "Achados dermatoscópicos, se examinados"],
  ["registroFotografico", "Comparação com registros anteriores"]
]);

export const DERMATOLOGY_SYSTEMS_FIELDS = Object.freeze([
  ["geral", "Estado geral, sinais vitais e febre"],
  ["linfonodos", "Linfonodos"],
  ["cardiorrespiratorio", "Cardiovascular e respiratório"],
  ["gastrointestinal", "Gastrointestinal"],
  ["musculoesqueletico", "Musculoesquelético e articulações"],
  ["neurologico", "Neurológico e sensibilidade"],
  ["mucosas", "Mucosas e genitais, quando examinados"]
]);

export const DERMATOLOGY_ASSESSMENT_FIELDS = Object.freeze([
  ["hipoteses", "Hipóteses diagnósticas"],
  ["diagnosticoPrincipal", "Diagnóstico principal"],
  ["diagnosticosDiferenciais", "Diagnósticos diferenciais"],
  ["gravidadeRisco", "Gravidade e sinais de alarme"],
  ["necessidadeBiopsia", "Necessidade de biópsia ou exame complementar"]
]);

export const DERMATOLOGY_PLAN_FIELDS = Object.freeze([
  ["tratamento", "Tratamento e orientações"],
  ["fotoprotecao", "Fotoproteção e cuidados gerais"],
  ["retorno", "Plano de retorno"],
  ["orientacoesAlarme", "Orientações de alarme"],
  ["consentimentos", "Consentimentos e documentação"]
]);

export const DERMATOLOGY_SOURCE_CATALOG = Object.freeze([
  { id: "derm-guideline-local", type: "guideline", label: "Diretrizes dermatológicas locais", status: "draft", scope: ["diagnostico", "conduta"] },
  { id: "derm-rag-local", type: "rag", label: "Biblioteca RAG de Dermatologia", status: "draft", scope: ["anamnese", "exame-fisico", "diagnostico", "conduta"] }
]);

export function newDermatologyLesion({ id = "", label = "" } = {}) {
  return {
    id: id || `lesion-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    localizacao: "",
    morfologia: [],
    distribuicao: [],
    cor: "",
    superficie: "",
    bordas: "",
    dimensoes: "",
    sintomas: "",
    evolucao: "",
    fotoReferencia: ""
  };
}

export function normalizeDermatologyLesion(lesion = {}) {
  const base = newDermatologyLesion({ id: lesion.id, label: lesion.label });
  return {
    ...base,
    ...lesion,
    morfologia: Array.isArray(lesion.morfologia) ? [...lesion.morfologia] : [],
    distribuicao: Array.isArray(lesion.distribuicao) ? [...lesion.distribuicao] : []
  };
}

export function defaultDermatologyConsultation({ patientId = "", sequence = 1 } = {}) {
  return {
    patientId,
    type: "consultation",
    specialty: DERMATOLOGIA_SPECIALTY.id,
    label: `Consulta dermatológica ${sequence}`,
    consultationMode: "IN_PERSON",
    anamnesisInputMode: "manual",
    dermatology: {
      anamnese: {},
      antecedentes: {},
      exameFisico: {},
      lesions: [],
      avaliacao: {},
      conduta: {}
    }
  };
}

export function defaultDermatologyReturn({ patientId = "", previousEntryId = "" } = {}) {
  return {
    patientId,
    previousEntryId,
    type: "return",
    specialty: DERMATOLOGIA_SPECIALTY.id,
    label: "Retorno dermatológico",
    dermatology: { exameFisico: {}, avaliacao: {}, conduta: {} }
  };
}

export function sanitizeDermatologyRecord(record = {}) {
  const dermatology = record.dermatology || {};
  return {
    ...record,
    specialty: DERMATOLOGIA_SPECIALTY.id,
    dermatology: {
      anamnese: { ...(dermatology.anamnese || {}) },
      antecedentes: { ...(dermatology.antecedentes || {}) },
      exameFisico: { ...(dermatology.exameFisico || {}) },
      lesions: Array.isArray(dermatology.lesions) ? dermatology.lesions.map(normalizeDermatologyLesion) : [],
      avaliacao: { ...(dermatology.avaliacao || {}) },
      conduta: { ...(dermatology.conduta || {}) }
    }
  };
}
