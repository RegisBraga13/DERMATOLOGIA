import { medications } from "../data/medications.js";
import { selectedAggravatingValues, selectedComorbidityValues, selectedDiagnosisText, selectedSpecifierValues, treatmentOptionLines } from "./diagnosis.js";
import { arrayValue, calculateAge, capitalizeFirst, cleanClinicalLine, clinicalPhrase, formatClinicalList, formatPlainList, joinValues, lowerFirst, mentalExamKeys, normalizedSingleChoiceValue, normalizeText, professionalClinicalTerms, professionalList, professionalListWithOther, stripFinalPeriod } from "./textFormat.js";
import { EVOLUTION_REFRESH_PATTERNS, laboratoryExamRequestItems, RETURN_BOILERPLATE_PHRASES } from "./vocabulary.js";

// Especificador assinalado viaja colado a hipotese, porque e ele que muda a
// conduta: depressao com sintomas psicoticos e depressao leve tem o mesmo
// codigo nosologico e tratamentos diferentes. Sem isto o Tratamento leria so o
// nome do transtorno e a gravidade se perderia entre a tela e o prompt.
export function selectedSpecifiersText(form = {}) {
  return selectedSpecifierValues(form).map(cleanClinicalLine).filter(Boolean).join("\n");
}

// Comorbidade e agravante seguem pelo mesmo caminho, e pela mesma razao: os
// dois mudam a conduta. Comorbidade muda a escolha do farmaco — depressao com
// transtorno por uso de alcool nao se trata como depressao isolada — e
// agravante decide o que precisa ser manejado junto para o tratamento pegar.
export function selectedComorbiditiesText(form = {}) {
  return selectedComorbidityValues(form).map(cleanClinicalLine).filter(Boolean).join("\n");
}

export function selectedAggravatingText(form = {}) {
  return selectedAggravatingValues(form).map(cleanClinicalLine).filter(Boolean).join("\n");
}

export function treatmentDiagnosisText(form = {}) {
  const especificadores = selectedSpecifiersText(form);
  const comorbidades = selectedComorbiditiesText(form);
  const agravantes = selectedAggravatingText(form);
  return [
    selectedDiagnosisText(form),
    especificadores ? `Especificadores: ${especificadores.split("\n").join("; ")}` : "",
    comorbidades ? `Comorbidades: ${comorbidades.split("\n").join("; ")}` : "",
    agravantes ? `Fatores agravantes: ${agravantes.split("\n").join("; ")}` : "",
    stripFinalPeriod(form.diagnosticoObservacaoMedica || "")
  ].filter(Boolean).join("\n");
}

export function buildEvolutionNarrative(form, patient = {}, previous = null, isReturn = false) {
  const complaint = stripFinalPeriod(conciseComplaintText(form, isReturn));
  const history = stripFinalPeriod(conciseHdaText(form, previous, isReturn));
  const structuredAnamnesis = isReturn ? "" : professionalStructuredAnamnesisText(form);
  const antecedents = evolutionAntecedentsText(form);
  const mentalFindings = mentalStateFindings(form);
  const diagnosis = selectedDiagnosisText(form) || form.diagnosticoSelecionadoResumo || form.diagnosticoManual || "";
  const treatment = professionalTreatmentText(form, isReturn);

  // Abertura no modelo que ele escreveu: "Regis Braga, 42 anos, solteiro,
  // agricultor, relata que ha 03 meses...". A identificacao e a historia sao
  // uma frase so. Antes eram tres — identificacao, "Apresenta queixa de X" e
  // "Paciente relata que..." —, e a do meio repetia em outras palavras o que a
  // terceira ia contar em detalhe.
  const { identification, workStatus } = evolutionPatientIdentification(patient);
  // conciseHdaText devolve "Historia da doenca atual nao informada" quando nao
  // ha o que contar. Emendado na identificacao isso viraria "Regis Braga, 42
  // anos, relata que historia da doenca atual nao informada".
  const semHistoria = /^hist[oó]ria (da doen[cç]a atual|do retorno) n[aã]o informada$/i.test(history || "");
  const historicoProprio = history && !semHistoria && normalizeText(history) !== normalizeText(complaint) ? history : "";
  // Mesmo caso da historia, do outro lado: conciseComplaintText devolve
  // "Queixa principal nao informada" quando nao ha queixa, e emendado depois
  // de "com queixa de" isso virava "Maria Silva, 42 anos, com queixa de queixa
  // principal nao informada" no prontuario. Sem queixa registrada a abertura e
  // so a identificacao.
  const semQueixa = /^queixa (principal|de retorno) n[aã]o informada$/i.test(complaint || "");
  const queixaPropria = complaint && !semQueixa ? complaint : "";
  const opening = isReturn
    ? (history ? `${history}.` : "")
    : [
      historicoProprio
        ? `${identification}, ${lowerFirst(historyClause(historicoProprio))}.`
        // Sem historia registrada a queixa e o unico conteudo, entao ela ainda
        // abre o texto — nao ha o que repetir.
        : queixaPropria
          ? `${identification}, com queixa de ${lowerFirst(professionalClinicalTerms(queixaPropria))}.`
          : `${identification}.`,
      workStatus ? `${workStatus}.` : ""
    ].filter(Boolean).join(" ");

  return normalizeEvolutionNarrative([
    opening,
    structuredAnamnesis,
    antecedents,
    mentalFindings.length ? `No exame psíquico, apresenta ${formatPlainList(mentalFindings.map(professionalMentalFinding))}.` : "",
    diagnosis ? `Consideram-se as hipóteses diagnósticas assinaladas de ${stripFinalPeriod(diagnosis)}.` : "",
    treatment
  ].filter(Boolean).join("\n\n"));
}

export function professionalTreatmentText(form = {}, isReturn = false) {
  const medications = professionalSelectedTreatmentItems(form.tratamentoMedicamentosSelecionados, form.tratamentoMedicamentoso);
  const approaches = professionalSelectedTreatmentItems(form.abordagensSelecionadas, form.abordagensTerapeuticas);
  const returnMedicationActions = professionalListWithOther(
    form.condutaMedicamentoRetorno,
    form.condutaMedicamentoRetornoOutro
  );
  const targetSymptomConducts = professionalSelectedTreatmentItems(form.sintomasAlvoSelecionados, "");
  const physicianPlan = professionalClinicalTerms(stripFinalPeriod(form.condutaMedica || ""));
  const selectedExams = professionalClinicalTerms(requestedExamsText(form) || form.examesLaboratoriais || "");
  // PRIMEIRA frase da conduta, e nao a ultima: quem le o prontuario depois
  // precisa saber onde o paciente foi tratado antes de saber com o que. Vale
  // sobretudo quando quem le e o proprio medico, meses adiante, tentando
  // entender por que aquela consulta terminou como terminou.
  const nivelCuidado = stripFinalPeriod(String(form.nivelCuidado || "").trim());
  const justificativaNivel = stripFinalPeriod(String(form.nivelCuidadoJustificativa || "").trim());
  const sentences = [
    nivelCuidado
      ? `O nível de cuidado definido é ${lowerFirst(nivelCuidado)}${justificativaNivel ? `, ${lowerFirst(justificativaNivel)}` : ""}.`
      : "",
    medications ? `O tratamento medicamentoso selecionado inclui ${lowerFirst(medications)}.` : "",
    approaches ? `Como medidas não farmacológicas, foram selecionadas ${lowerFirst(approaches)}.` : "",
    isReturn && returnMedicationActions ? `A conduta medicamentosa definida no retorno inclui ${lowerFirst(returnMedicationActions)}.` : "",
    // O sintoma-alvo entra antes da conduta livre do medico: e a conduta que
    // nao espera o diagnostico fechar.
    targetSymptomConducts ? `Para os sintomas-alvo, foi definida a conduta de ${lowerFirst(targetSymptomConducts)}.` : "",
    physicianPlan ? `A conduta médica registrada consiste em ${lowerFirst(physicianPlan)}.` : "",
    selectedExams ? `Foram solicitados ${lowerFirst(selectedExams)}.` : ""
  ].filter(Boolean);
  return sentences.join(" ");
}

export function professionalSelectedTreatmentItems(selected, fallback = "") {
  const values = arrayValue(selected);
  const items = values.length ? values : treatmentOptionLines(fallback);
  return formatPlainList(items.map(item => professionalClinicalTerms(stripFinalPeriod(item))
    .replace(/\s*\|\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()));
}

function evolutionPatientIdentification(patient = {}) {
  const age = calculateAge(patient.nascimento);
  const rawOccupation = String(patient.ocupacao || "").replace(/\s*[—-]\s*dado fictício\s*$/i, "").trim();
  const isAwayFromWork = /\bafastad[oa]\b/i.test(rawOccupation);
  // A virgula do "Policial militar, afastado" ficava para tras quando a
  // palavra saia, e a identificacao virava "policial militar,, relata que...".
  const occupation = rawOccupation.replace(/\bafastad[oa]\b/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*$/, "")
    .replace(/^\s*,\s*/, "")
    .trim();
  const details = [
    age ? `${age} anos` : "",
    patient.estadoCivil ? genderedCivilStatus(patient.estadoCivil, patient.sexo) : "",
    patient.religiao ? lowerFirst(professionalReligion(patient.religiao)) : "",
    patient.escolaridade ? lowerFirst(professionalEducation(patient.escolaridade)) : "",
    occupation ? lowerFirst(occupation) : ""
  ].filter(Boolean);
  const name = patient.nome?.trim() || "Nome não informado";
  const identification = `${name}${details.length ? `, ${details.join(", ")}` : ""}`;
  // Concordancia com o sexo registrado, pela mesma razao que o estado civil ja
  // concordava: quem le o prontuario e outro medico, e "afastado" numa
  // paciente e erro de redacao no documento clinico. Sem sexo registrado fica
  // no masculino, que e a forma nao marcada.
  const afastado = normalizeText(patient.sexo) === "feminino" ? "afastada" : "afastado";
  // "Em atividade" era afirmado para qualquer ocupacao preenchida, entao o
  // prontuario de um aposentado ou de um desempregado dizia, com todas as
  // letras, que ele estava trabalhando. Quando a propria ocupacao registra que
  // nao esta, a frase nao e dita: a identificacao ja informou, e o programa nao
  // tem campo para saber mais do que isso. Silencio, e nao afirmacao contraria.
  // normalizeText ja tira acento e caixa, entao a lista vai sem acento.
  const naoTrabalha = /\b(aposentad[oa]|desempregad[oa]|pensionista|do lar|licenca|sem (?:ocupacao|vinculo|emprego))\b/.test(normalizeText(rawOccupation));
  const workStatus = occupation && !naoTrabalha
    ? (isAwayFromWork ? `No momento, ${afastado} do trabalho` : "Em atividade")
    : "";
  // Devolve as duas partes separadas: a identificacao emenda com a historia na
  // mesma frase, e a situacao de trabalho vem depois, como frase propria.
  return { identification, workStatus };
}

function professionalEducation(value = "") {
  return professionalClinicalTerms(value)
    .replace(/^fundamental\b/i, "ensino fundamental")
    .replace(/^medio\b/i, "ensino médio")
    .replace(/^superior\b/i, "ensino superior")
    .replace(/\bpos-graduacao\b/gi, "pós-graduação");
}

function professionalReligion(value = "") {
  return professionalClinicalTerms(value)
    .replace(/\bsem religiao\b/gi, "sem religião")
    .replace(/\bcatolica\b/gi, "católica")
    .replace(/\bagnostico\b/gi, "agnóstico");
}

function evolutionAntecedentsText(form = {}) {
  const psychiatric = professionalClinicalTerms(joinWithOutro(form.psiPrevios, form.psiPreviosOutro));
  const treatments = professionalClinicalTerms(joinWithOutro(form.tratamentos, form.tratamentosOutro));
  const medical = professionalClinicalTerms(joinWithOutro(form.medicos, form.medicosOutro));
  const family = professionalClinicalTerms(joinWithOutro(form.familiares, form.familiaresOutro));
  const substances = professionalClinicalTerms(joinWithOutro(form.substancias, form.substanciasOutro));
  const addictive = professionalClinicalTerms(joinWithOutro(form.usoSubstanciasComportamentos, form.usoSubstanciasComportamentosOutro));
  const parts = [
    psychiatric ? `Apresenta antecedentes psiquiátricos de ${lowerFirst(psychiatric)}.` : "",
    treatments ? `Realizou tratamentos prévios com ${lowerFirst(treatments)}.` : "",
    medical ? (/^nega\b/i.test(medical) ? `${capitalizeFirst(stripFinalPeriod(medical))}.` : `Apresenta antecedentes médicos de ${lowerFirst(medical)}.`) : "",
    family ? `Há antecedentes familiares de ${lowerFirst(family)}.` : "",
    substances ? `Relata hábitos ou uso de substâncias relacionados a ${lowerFirst(substances)}.` : "",
    addictive ? `Foram registrados hábitos, substâncias ou comportamentos aditivos: ${lowerFirst(addictive)}.` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function professionalStructuredAnamnesisText(form = {}) {
  const mania = professionalListWithOther(form.maniaHipomaniaSintomas, form.maniaHipomaniaSintomasOutro);
  const sleep = professionalList(form.sonoCaracteristicas);
  const appetite = professionalList(form.apetiteCaracteristicas);
  const depression = professionalList(form.depressaoSintomas);
  const psychosis = professionalListWithOther(form.psicoseSintomas, form.psicoseSintomasOutro);
  const risks = professionalList(form.riscoSuicidioIndicadores);
  const factors = professionalClinicalTerms(joinWithOutro(form.fatores, form.fatoresOutro));
  const improvements = professionalClinicalTerms(joinWithOutro(form.fatoresMelhora, form.fatoresMelhoraOutro));
  const impact = professionalList(form.impacto);
  const parts = [
    mania ? (/nega sintomas relacionados/i.test(mania)
      ? "Nega sintomas relacionados à ativação do humor."
      : `Relata sintomas de ativação do humor: ${lowerFirst(mania)}.`) : "",
    sleep ? `Relata ${lowerFirst(sleep)}.` : "",
    appetite ? `Apresenta ${lowerFirst(appetite)}.` : "",
    depression ? `Apresenta ${lowerFirst(depression)}.` : "",
    psychosis ? `Apresenta ${lowerFirst(psychosis)}.` : "",
    risks ? (/nega ideação, plano ou intenção suicida/i.test(risks)
      ? "Nega ideação, plano ou intenção suicida."
      : `Apresenta ${lowerFirst(risks)}.`) : "",
    form.riscoSuicidioRazoesViver ? protectiveFactorSentence(form.riscoSuicidioRazoesViver) : "",
    form.riscoSuicidioRazoesParaViver ? `As razões para viver incluem ${lowerFirst(professionalClinicalTerms(stripFinalPeriod(form.riscoSuicidioRazoesParaViver)))}.` : "",
    factors ? (normalizeText(factors).includes("sem fator claro")
      ? "O quadro não apresenta associação com fator desencadeante claro."
      : `O quadro apresenta associação com ${lowerFirst(factors)}.`) : "",
    improvements ? improvementSentence(improvements) : "",
    impact ? `Há impacto funcional, com ${lowerFirst(impact).replace(/prejuízo social e prejuízo familiar/i, "prejuízo social e familiar")}.` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

// A historia entra colada na identificacao, entao ela precisa comecar por um
// verbo e nao por um sujeito novo: "Paciente relata que ha 03 meses..." vira
// "relata que ha 03 meses...", que emenda depois da virgula. O sujeito ja foi
// dito — e o nome do paciente.
function historyClause(value = "") {
  let history = professionalClinicalTerms(stripFinalPeriod(value));
  history = history.replace(/^Evolução insidiosa\b/i, "apresenta evolução insidiosa dos sintomas");
  history = history.replace(/^Evolução gradual\b/i, "apresenta evolução gradual dos sintomas");
  history = history.replace(/^(?:o |a )?paciente\s+/i, "");
  // Sem verbo de relato a frase fica "Fulano, 42 anos, ha tres meses vem
  // apresentando..." — falta o elo. "Relata que" e o elo.
  if (!/^(relata|refere|nega|queixa|apresenta|procura|busca|comparece)/i.test(history)) {
    history = `relata que ${lowerFirst(history)}`;
  }
  return history;
}

function professionalMentalFinding(value = "") {
  return professionalClinicalTerms(value)
    .replace(/^consciente$/i, "consciência preservada")
    .replace(/^orientado no tempo e no espaço$/i, "orientação no tempo e no espaço")
    .replace(/^com funções mnésicas preservadas$/i, "funções mnésicas preservadas")
    .replace(/^restrito\/aplanado$/i, "restrição/aplanamento afetivo")
    .replace(/^crítica parcial$/i, "crítica parcialmente preservada");
}

function protectiveFactorSentence(value = "") {
  const text = professionalClinicalTerms(stripFinalPeriod(value));
  if (/^nega ideação ou intenção suicida;\s*mantém vínculo e supervisão familiar$/i.test(text)) {
    return "Como fatores protetivos, registram-se a ausência de ideação ou intenção suicida e a manutenção de vínculo e supervisão familiar.";
  }
  return `Como fator protetivo, registra-se ${lowerFirst(text)}.`;
}

function genderedCivilStatus(value = "", sex = "") {
  const normalizedSex = normalizeText(sex);
  if (!/\(a\)/i.test(value)) return value.toLowerCase();
  // O "o" antes de "(a)" faz parte da forma masculina e precisa sair junto:
  // "Solteiro(a)" no feminino e "solteira", nao "solteiroa".
  if (normalizedSex === "feminino") return value.replace(/o?\(a\)/i, "a").toLowerCase();
  if (normalizedSex === "masculino") return value.replace(/\(a\)/i, "").toLowerCase();
  return value.toLowerCase();
}

export function conciseIdentityText(patient = {}) {
  return stripFinalPeriod(patientIdentificationText(patient, true)) || "Paciente com dados de identificação não preenchidos";
}

export function conciseComplaintText(form = {}, isReturn = false) {
  if (isReturn) return stripFinalPeriod(
    joinWithOutro(form.evolucaoClinicaRetorno, form.evolucaoClinicaRetornoOutro)
    || form.sintomasPrincipais
    || form.observacoesRetorno
    || "Queixa de retorno não informada"
  );
  const qphda = anamnesisText(form);
  return cleanClinicalLine(form.queixa || firstLineFromQphda(qphda) || "Queixa principal não informada");
}

export function conciseHdaText(form = {}, previous = null, isReturn = false) {
  if (isReturn) return cleanClinicalLine(returnStoryText(form, previous) || "História do retorno não informada");
  const qphda = anamnesisText(form);
  // A HDA vem do campo que a extracao realmente preenche. form.historia nao e
  // escrito em lugar nenhum do projeto: com ele na frente, toda consulta por
  // voz caia no remainingQphdaText e despejava a transcricao inteira — com
  // "Falante A:" e tudo — dentro da evolucao, que e texto de prontuario.
  // Fica no fim da lista para nao quebrar registro antigo que o tenha.
  const story = form.hdaManual || form.historia || remainingQphdaText(qphda, form.queixa);
  return cleanClinicalLine(story || "História da doença atual não informada");
}

export function conciseAntecedentsText(form = {}) {
  const parts = [
    joinWithOutro(form.psiPrevios, form.psiPreviosOutro) ? `antecedentes psiquiátricos de ${lowerFirst(joinWithOutro(form.psiPrevios, form.psiPreviosOutro))}` : "",
    joinWithOutro(form.tratamentos, form.tratamentosOutro) ? `tratamentos prévios com ${lowerFirst(joinWithOutro(form.tratamentos, form.tratamentosOutro))}` : "",
    joinWithOutro(form.medicos, form.medicosOutro) ? `antecedentes médicos de ${lowerFirst(joinWithOutro(form.medicos, form.medicosOutro))}` : "",
    joinWithOutro(form.familiares, form.familiaresOutro) ? `histórico familiar de ${lowerFirst(joinWithOutro(form.familiares, form.familiaresOutro))}` : "",
    joinWithOutro(form.substancias, form.substanciasOutro) ? `uso/hábitos: ${lowerFirst(joinWithOutro(form.substancias, form.substanciasOutro))}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "não há antecedentes relevantes registrados";
}

export function conciseMentalExamText(form = {}) {
  const findings = mentalExamKeys()
    .flatMap(key => clinicalMentalValues(form, key))
    .map(cleanClinicalLine)
    .filter(Boolean);
  return findings.length ? formatClinicalList(findings) : "não há achados do exame psíquico registrados";
}

export function conciseDiagnosticText(form = {}) {
  const selected = selectedDiagnosisText(form) || form.diagnosticoSelecionadoResumo || form.diagnosticoManual || "";
  const especificadores = selectedSpecifiersText(form);
  const base = cleanClinicalLine(selected || "Hipóteses diagnósticas não selecionadas");
  const comorbidades = selectedComorbiditiesText(form);
  // Comorbidade entra na evolucao porque e diagnostico; agravante nao entra
  // aqui — ele pesa na conduta, e a conduta tem o seu proprio paragrafo.
  const linha = especificadores ? `${base} (${especificadores.split("\n").join("; ")})` : base;
  return comorbidades ? `${linha}; em comorbidade com ${comorbidades.split("\n").join("; ")}` : linha;
}

export function patientIdentificationText(patient = {}, withPrefix = true) {
  const age = calculateAge(patient.nascimento);
  const sexo = patient.sexo ? lowerFirst(patient.sexo) : "";
  const fragments = [
    sexo ? `${withPrefix ? "Paciente " : ""}${sexo}` : withPrefix ? "Paciente" : "",
    age ? `${age} anos` : "",
    // Mesma concordancia que a evolucao ja fazia: "solteira", nao "solteiro(a)".
    patient.estadoCivil ? genderedCivilStatus(patient.estadoCivil, patient.sexo) : "",
    patient.ocupacao ? lowerFirst(patient.ocupacao) : ""
  ].filter(Boolean);
  return `${fragments.join(", ")}.`;
}

export function returnStoryText(form, previous) {
  const clinicalEvolution = normalizedSingleChoiceValue("evolucaoClinicaRetorno", form.evolucaoClinicaRetorno);
  const sleep = normalizedSingleChoiceValue("sonoRetorno", form.sonoRetorno);
  const moodAndAnxiety = normalizedSingleChoiceValue("humorAnsiedadeRetorno", form.humorAnsiedadeRetorno);
  const adherence = normalizedSingleChoiceValue("adesao", form.adesao);
  const adverseEffects = joinWithOutro(form.efeitos, form.efeitosOutro);
  const functionalityAndEvents = joinWithOutro(form.funcionalidadeEventosRetorno, form.funcionalidadeEventosRetornoOutro);
  const legacyEvolution = [form.estadoGeral, form.sintomasPrincipais].filter(Boolean).join(", ");
  const legacyMood = [form.humorRetorno, form.ansiedadeRetorno].filter(Boolean).join(", ");
  const parts = [
    clinicalEvolution || legacyEvolution
      ? `Paciente retornou com ${lowerFirst(clinicalEvolution || legacyEvolution)}.`
      : "Paciente retornou para acompanhamento clínico.",
    form.evolucaoClinicaRetornoOutro ? `Como nota adicional sobre a evolução, registra-se ${lowerFirst(stripFinalPeriod(form.evolucaoClinicaRetornoOutro))}.` : "",
    sleep ? `Refere sono ${lowerFirst(sleep)}.` : "",
    form.sonoRetornoOutro ? `Acrescenta sobre o sono: ${lowerFirst(stripFinalPeriod(form.sonoRetornoOutro))}.` : "",
    moodAndAnxiety ? returnMoodAndAnxietySentence(moodAndAnxiety) : (legacyMood ? `Apresenta ${lowerFirst(legacyMood)}.` : ""),
    form.humorAnsiedadeRetornoOutro ? `Como nota adicional sobre humor e ansiedade, registra-se ${lowerFirst(stripFinalPeriod(form.humorAnsiedadeRetornoOutro))}.` : "",
    adherence ? `A adesão ao tratamento encontra-se ${lowerFirst(adherence)}.` : "",
    form.adesaoOutro ? `Como nota adicional sobre a adesão, registra-se ${lowerFirst(stripFinalPeriod(form.adesaoOutro))}.` : "",
    adverseEffects ? `Em relação aos efeitos colaterais, refere ${lowerFirst(adverseEffects)}.` : "",
    functionalityAndEvents ? `Na funcionalidade e nos eventos relevantes, registra-se ${lowerFirst(functionalityAndEvents)}.` : (form.funcionalidade || joinValues(form.eventos) ? `Na funcionalidade e nos eventos relevantes, registra-se ${lowerFirst([form.funcionalidade, joinValues(form.eventos)].filter(Boolean).join(", "))}.` : ""),
    form.observacoesRetorno ? `Como informação complementar previamente registrada, consta ${lowerFirst(stripFinalPeriod(form.observacoesRetorno))}.` : "",
    // O bloco do caso, desde 31/08/2026. As linhas acima que leem sonoRetorno e
    // humorAnsiedadeRetorno ficam onde estao: os controles sairam da tela, mas
    // retorno ja gravado continua com os campos, e apaga-los aqui mudaria o
    // texto de um prontuario fechado.
    ...previousCaseSentences(form)
  ].filter(Boolean);
  return professionalClinicalTerms(parts.join(" "));
}

// As respostas sobre o atendimento anterior, cada uma com o rotulo que viajou
// no campo oculto ao lado. Sem o rotulo a frase sairia "quanto a hipotese 1,
// remissao parcial" -- e a lista muda de um retorno para o outro, entao o
// indice nao ancora nada.
function previousCaseAnswers(form, prefix) {
  const respostas = [];
  for (let index = 0; index < 12; index += 1) {
    const rotulo = String(form[`${prefix}_${index}Rotulo`] || "").trim();
    const valor = arrayValue(form[`${prefix}_${index}`])[0] || "";
    if (rotulo && valor) respostas.push({ rotulo, valor });
  }
  return respostas;
}

function previousCaseSentences(form) {
  const frase = (respostas, molde) => respostas.length
    ? molde(respostas.map(item => `${stripFinalPeriod(item.rotulo)}, ${lowerFirst(item.valor)}`).join("; "))
    : "";
  return [
    frase(previousCaseAnswers(form, "retornoHipotese"),
      texto => `Quanto às hipóteses do atendimento anterior: ${texto}.`),
    frase(previousCaseAnswers(form, "retornoCriterio"),
      texto => `Dos critérios que haviam ficado sem avaliação: ${texto}.`),
    frase(previousCaseAnswers(form, "retornoFarmaco"),
      texto => `Sobre os medicamentos prescritos: ${texto}.`),
    frase(previousCaseAnswers(form, "retornoAlvo"),
      texto => `Quanto aos sintomas-alvo: ${texto}.`)
  ];
}

function returnMoodAndAnxietySentence(value = "") {
  if (normalizeText(value) === "crise de panico") return "Apresenta crise de pânico.";
  return `Apresenta humor ${lowerFirst(value)}.`;
}

export function mentalStateFindings(form) {
  return mentalExamKeys()
    .flatMap(key => clinicalMentalValues(form, key))
    .filter(Boolean);
}

export function outdatedEvolutionText(value = "") {
  return normalizeText(value).startsWith("evolucao medica auxiliada por ia");
}

function firstLineFromQphda(value = "") {
  return stripFinalPeriod(String(value || "").split(/\n+/).find(Boolean) || "");
}

function remainingQphdaText(value = "", complaint = "") {
  const lines = String(value || "").split(/\n+/).map(line => stripFinalPeriod(line)).filter(Boolean);
  if (!lines.length) return "";
  if (complaint && normalizeText(lines[0]).includes(normalizeText(complaint))) return lines.slice(1).join(". ");
  return lines.slice(1).join(". ") || lines[0];
}

export function joinWithOutro(value, otherValue = "") {
  const base = arrayValue(value).filter(item => normalizeText(item) !== "outro").join(", ");
  return [base, otherValue].filter(Boolean).join(base && otherValue ? ", " : "");
}

function clinicalMentalValues(form = {}, key = "") {
  return [
    ...arrayValue(form[key]).filter(item => normalizeText(item) !== "outro"),
    form[`${key}Outro`]
  ].map(clinicalPhrase).filter(Boolean);
}

function improvementSentence(value = "") {
  const text = lowerFirst(stripFinalPeriod(value)).replace(/^melhora\s+/i, "");
  const connector = normalizeText(text).startsWith("apos ") ? "" : "com ";
  return `Diz que a melhora geralmente ocorre ${connector}${text}.`;
}

export function requestedExamsText(form = {}) {
  const selected = Array.isArray(form.examesSolicitados)
    ? form.examesSolicitados.filter(Boolean)
    : form.examesSolicitados
      ? [form.examesSolicitados]
      : [];
  const expanded = selected.flatMap(exam =>
    exam === "Exames laboratoriais" ? laboratoryExamRequestItems : [exam]
  );
  if (form.examesSolicitadosOutro?.trim()) expanded.push(form.examesSolicitadosOutro.trim());
  return [...new Set(expanded)].join(", ");
}

export function anamnesisText(form = {}) {
  return form.qphda || [form.queixa && `QP: ${form.queixa}`, form.hdaManual && `HDA: ${form.hdaManual}`].filter(Boolean).join("\n");
}

// O refinamento fechava em si mesmo: o medico respondia as perguntas,
// classificava as red flags e escrevia sua observacao, e nada disso saia da
// tela e do resumo. O prompt do diagnostico ficava byte a byte identico ao de
// antes de ele responder — a IA seguia raciocinando so com a anamnese
// original. Aqui a resposta volta ao prontuario que o diagnostico e o
// tratamento leem. Pergunta sem resposta nao entra: campo vazio e dado nao
// informado, nunca negacao.
export function refinementAnswersText(form = {}) {
  const plan = form.refinementPlan || {};
  const lines = [];
  (plan.questions || []).forEach((item, index) => {
    const answer = joinValues(form[`refinementQuestion_${index}`]);
    if (answer) lines.push(`${item.topic || "Pergunta"} - ${cleanClinicalLine(item.prompt || "")}: ${answer}`);
  });
  [["Red flag", "red_flags", "refinementRedFlag"],
   ["Observacao", "observations", "refinementObservation"],
   ["Ponto importante", "important_points", "refinementImportant"]].forEach(([label, key, prefix]) => {
    (plan[key] || []).forEach((item, index) => {
      const decision = form[`${prefix}_${index}`];
      if (decision) lines.push(`${label} - ${cleanClinicalLine(item.topic || "")}: ${decision}`);
    });
  });
  if (form.refinementDoctorNotes) lines.push(`Observacao do medico: ${cleanClinicalLine(form.refinementDoctorNotes)}`);
  return lines.join("\n");
}

export function shouldRefreshEvolutionNarrative(value = "") {
  const text = String(value || "");
  return EVOLUTION_REFRESH_PATTERNS.some(pattern => pattern.test(text));
}

export function returnEvolutionContainsIdentity(value = "", patient = {}) {
  const evolution = normalizeText(value).trim();
  const patientName = normalizeText(patient.nome).trim();
  return Boolean(evolution && patientName && evolution.startsWith(patientName));
}

export function removeReturnBoilerplate(value = "") {
  return RETURN_BOILERPLATE_PHRASES.reduce((text, phrase) => text.replaceAll(phrase, " "), value)
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEvolutionNarrative(value = "") {
  return String(value || "")
    .replace(/\*\*[^*]*\*\*/g, " ")
    .replace(/^\s*#{1,6}\s+.*$/gm, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ +([,.;:!?])/g, "$1")
    .trim();
}
