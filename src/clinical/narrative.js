import { medications } from "../data/medications.js";
import { selectedAggravatingValues, selectedComorbidityValues, selectedDiagnosisText, selectedSpecifierValues, treatmentOptionLines } from "./diagnosis.js";
import { arrayValue, calculateAge, capitalizeFirst, cleanClinicalLine, clinicalPhrase, formatClinicalList, formatPlainList, joinValues, lowerFirst, mentalExamKeys, normalizedSingleChoiceValue, normalizeText, professionalClinicalTerms, professionalList, professionalListWithOther, stripFinalPeriod } from "./textFormat.js";
import { EVOLUTION_REFRESH_PATTERNS, laboratoryExamRequestItems, MENTAL_EXAM_DOMAIN_NAMES, MENTAL_EXAM_NORMAL_OPTIONS, RETURN_BOILERPLATE_PHRASES } from "./vocabulary.js";
import { scalesNarrativeText } from "./scoring.js";
import { stemsOf, termAlreadyWritten } from "./termMatch.js";
import { documentsNarrativeText } from "./documents.js";

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

// `preliminar`: a primeira historia clinica, montada so com o que vem ANTES das
// decisoes -- anamnese, exame psiquico e exame fisico. Escala nao entra: e
// ferramenta a parte, e nao compoe o fluxo (dele, 20/09/2026). E a que volta ao
// raciocinio do Diagnostico e do Tratamento como sintese do caso; sem hipotese,
// tratamento nem documento, para a IA nao ler de volta a propria proposta.
export function buildEvolutionNarrative(form, patient = {}, previous = null, isReturn = false, { preliminar = false } = {}) {
  const complaint = stripFinalPeriod(conciseComplaintText(form, isReturn));
  const history = stripFinalPeriod(conciseHdaText(form, previous, isReturn));
  const structuredAnamnesis = isReturn ? "" : professionalStructuredAnamnesisText(form);
  const antecedents = evolutionAntecedentsText(form);
  const diagnosis = preliminar ? "" : (selectedDiagnosisText(form) || form.diagnosticoSelecionadoResumo || form.diagnosticoManual || "");
  const treatment = preliminar ? "" : professionalTreatmentText(form, isReturn);

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

  const escritoAntes = [opening, teleconsultationText(form), structuredAnamnesis, antecedents, isReturn ? "" : refinementNarrativeText(form), mentalExamParagraph(form)];
  return normalizeEvolutionNarrative([
    ...escritoAntes,
    isReturn ? "" : psychopathologicalFindingsParagraph(form, escritoAntes.join(" "), diagnosis),
    // Depois do exame e antes da hipotese: e onde a escala entra no raciocinio.
    // No retorno, com o valor do atendimento anterior ao lado.
    preliminar ? "" : scalesNarrativeText(form, isReturn ? previous : null),
    diagnosis ? `Consideram-se as hipóteses diagnósticas assinaladas de ${stripFinalPeriod(diagnosis)}.` : "",
    treatment,
    // O que saiu do consultorio com o paciente: atestado, relatorio,
    // encaminhamento. O texto de cada um fica em documentosEmitidos.
    preliminar ? "" : documentsNarrativeText(form)
  ].filter(Boolean).join("\n\n"));
}

// QUANDO A NARRATIVA GUARDADA PODE SER REFEITA PELO MODELO LOCAL: so quando foi
// ele que a escreveu.
//
// Ate 11/09/2026 os padroes de EVOLUTION_REFRESH_PATTERNS valiam para qualquer
// texto. "Paciente retorna..." ou um "Quanto ao sono" escrito pelo medico
// casava com eles, e ao salvar o texto dele era trocado pelo modelo local, sem
// aviso -- e escondido da tela ao reabrir. A marca decide: false e texto do
// medico, ou da IA que ele revisa; true e texto do modelo. Os padroes ficam so
// para o registro salvo antes de a marca existir.
export function evolutionNeedsRebuild(entry = {}, patient = {}) {
  const texto = normalizeEvolutionNarrative(entry.evolution);
  if (!texto) return true;
  if (entry.evolutionAutoGenerated === false) return false;
  // Rascunho novo sem marca: o texto e o que o proprio modelo montou na tela.
  if (entry.evolutionAutoGenerated === true || !entry.id) return true;
  return outdatedEvolutionText(texto)
    || shouldRefreshEvolutionNarrative(texto)
    || (entry.type === "return" && returnEvolutionContainsIdentity(texto, patient));
}

// O QUE FICA NA TELA QUANDO A IA NAO RESPONDE, na Evolucao.
//
// Texto do medico fica: e a mesma regra do salvar, e vale mais aqui, porque a
// IA fora do ar e justamente o momento em que ele mais depende do que ja
// escreveu. Antes, o modelo local entrava por cima do texto dele. So o que o
// proprio modelo escreveu (ou o campo vazio) e refeito localmente -- ai sim ha
// algo util a entregar no lugar da IA.
export function evolutionSuggestionOnAiFailure({ target = {}, patient = {}, previous = null, isReturn = false, error = {} }) {
  const motivo = `IA indisponível: ${error.message}.`;
  if (!evolutionNeedsRebuild(target, patient)) {
    return { aiStatus: `${motivo} O texto da história clínica foi mantido.` };
  }
  return {
    evolution: buildEvolutionNarrative(target, patient, previous, isReturn),
    evolutionAutoGenerated: true,
    evolucaoOrigem: "local",
    // A narrativa local nao consultou fonte nenhuma. Deixar na tela o painel
    // da geracao anterior faria o texto local herdar a procedencia dela.
    ragSourcesEvolucao: [],
    aiStatus: `${motivo} Evolução local aplicada.`
  };
}

// Teleconsulta, desde 11/09/2026: a Res. CFM 2.314/2022 pede o atendimento a
// distancia registrado no prontuario, com o consentimento do paciente. Sem o
// consentimento marcado a frase diz isso, em vez de calar.
export function teleconsultationText(form = {}) {
  const modo = form.consultationMode;
  if (modo !== "TELECONSULTATION" && modo !== "HYBRID") return "";
  const tipo = modo === "HYBRID" ? "Atendimento híbrido, em parte por telemedicina" : "Atendimento por telemedicina";
  const local = stripFinalPeriod(String(form.teleconsultaLocalPaciente || "").trim());
  const consentiu = arrayValue(form.teleconsultaConsentimento).filter(Boolean).length > 0;
  return `${tipo}${local ? `, com o paciente em ${local}` : ""}. Consentimento do paciente ${consentiu ? "registrado" : "não registrado"}.`;
}

// O exame psiquico na narrativa. Dominio marcado so com a opcao normal vai
// para a frase dos sem alteracao, pelo nome do dominio: "apresenta adequada,
// preservada e normal" nao dizia o que estava adequado. Dominio em branco nao
// entra em frase nenhuma -- nao foi examinado, e o texto nao pode dizer que foi.
function mentalExamParagraph(form = {}) {
  const alterados = [];
  const semAlteracao = [];
  mentalExamKeys().forEach(key => {
    const valores = clinicalMentalValues(form, key);
    if (!valores.length) return;
    const normais = new Set((MENTAL_EXAM_NORMAL_OPTIONS[key] || []).map(normalizeText));
    const marcados = arrayValue(form[key]).filter(Boolean);
    const soNormal = !String(form[`${key}Outro`] || "").trim()
      && marcados.every(valor => normais.has(normalizeText(valor)));
    if (soNormal) semAlteracao.push(MENTAL_EXAM_DOMAIN_NAMES[key] || key);
    else alterados.push(...valores);
  });
  const partes = [];
  if (alterados.length) partes.push(`No exame psíquico, apresenta ${formatPlainList(alterados.map(professionalMentalFinding))}.`);
  if (semAlteracao.length === mentalExamKeys().length) partes.push("Exame psíquico sem alterações em todos os domínios.");
  else if (semAlteracao.length) {
    partes.push(`${alterados.length ? "Sem alterações" : "Exame psíquico sem alterações"} em ${formatPlainList(semAlteracao)}.`);
  }
  return partes.join(" ");
}

// Os achados da analise psicopatologica, em prosa, logo depois do exame
// psiquico e antes das hipoteses: e a ordem em que a historia clinica se conta.
// Sem o dominio ("Pensamento (conteudo):") -- decisao dele, 20/09/2026: entram
// como o achado descritivo, "delirio de perseguicao, afrouxamento de nexos".
//
// So depois de ele assinalar hipotese: a analise e proposta da IA, e o que ele
// nao confirmou nao entra no prontuario. E so o que o texto ainda NAO disse:
// medido no caso Ismael, quase toda a analise repetia o exame psiquico e a
// anamnese, e a frase saia como uma lista longa do que ja estava escrito acima.
// O que ficou de fora continua na tela do Diagnostico, com a evidencia.
export function psychopathologicalFindingsParagraph(form = {}, writtenText = "", confirmedDiagnosis = "") {
  if (!String(confirmedDiagnosis || "").trim()) return "";
  const writtenStems = new Set(stemsOf(writtenText));
  const seen = new Set();
  const novos = String(form.analisePsicopatologicaAchados || "").split("\n")
    .flatMap(linha => linha.split(","))
    .map(termo => stripFinalPeriod(termo.trim()))
    .filter(Boolean)
    .filter(termo => !termAlreadyWritten(termo, writtenStems))
    .filter(termo => { const chave = normalizeText(termo); if (seen.has(chave)) return false; seen.add(chave); return true; });
  if (!novos.length) return "";
  return `À análise psicopatológica, destacam-se ${formatPlainList(novos.map(termo => lowerFirst(professionalClinicalTerms(termo))))}.`;
}

export function professionalTreatmentText(form = {}, isReturn = false) {
  const medications = professionalSelectedTreatmentItems(form.tratamentoMedicamentosSelecionados, form.tratamentoMedicamentoso);
  const approaches = professionalSelectedTreatmentItems(form.abordagensSelecionadas, form.abordagensTerapeuticas);
  // O Ajuste de conduta do retorno, a partir de 02/09/2026. So o assinalado
  // entra: proposta que a IA fez e o medico nao marcou nao existe para o
  // prontuario. `condutaMedicamentoRetorno` continua sendo lido porque retorno
  // gravado antes desta data guardou a conduta naquele campo, que saiu da tela.
  const returnMedicationActions = professionalSelectedTreatmentItems(
    form.ajusteMedicacaoSelecionada,
    ""
  ) || professionalListWithOther(form.condutaMedicamentoRetorno, form.condutaMedicamentoRetornoOutro);
  const returnConductAdjustments = professionalSelectedTreatmentItems(form.ajusteCondutaSelecionada, "");
  // Uma linha por conduta no campo, uma frase no prontuario. As linhas chegam
  // assim quando ele traz manejo do apendice Medicamentos, que separa dose e
  // progressao com " | ", como no Tratamento.
  const returnAddition = professionalClinicalTerms(String(form.ajusteAcrescimo || "")
    .replace(/\s*\|\s*/g, ", ")
    .split(/\s*\n+\s*/)
    .map(linha => stripFinalPeriod(linha.trim()))
    .filter(Boolean)
    .join("; "));
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
    isReturn && returnConductAdjustments ? `Como ajustes de conduta, foram definidos ${lowerFirst(returnConductAdjustments)}.` : "",
    isReturn && returnAddition ? `${returnAddition}.` : "",
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
      texto => `Quanto aos sintomas-alvo: ${texto}.`),
    frase(previousCaseAnswers(form, "retornoAchado"),
      texto => `Quanto aos achados psicopatológicos da consulta anterior: ${texto}.`),
    frase(previousCaseAnswers(form, "retornoPendencia"),
      texto => `Dos pontos que haviam ficado sem esclarecimento no refinamento: ${texto}.`)
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

// O QP/HDA que vai ao PROMPT das etapas seguintes -- que nao e o mesmo texto
// que vai a etapa da anamnese.
//
// Depois de uma entrevista por voz, `qphda` guarda a transcricao inteira, com
// "Falante A:" e tudo (App.js, applyAnamnesisAiResult). Ali ela e a ENTRADA da
// extracao e precisa chegar crua, porque a tarefa daquela etapa e ler o
// dialogo. Da extracao em diante ela deixa de ser entrada e vira lastro: mil e
// quinhentas linhas de fala coloquial repetidas no Diagnostico, no Tratamento,
// no Sintoma-Alvo, no Medicamento, no Ajuste de conduta e no BIPP TIPS, em
// toda chamada, competindo por atencao com o que o medico revisou.
//
// E a mesma licao que o buildRagQuery aprendeu do outro lado: os campos
// estruturados dizem em vocabulario clinico o que a conversa diz em prosa, e
// sao o que a propria extracao produziu a partir dela. O que muda aqui e so
// quem le -- a busca vetorial la, o modelo aqui.
//
// A troca so acontece quando ha certeza de que `qphda` E a transcricao: o
// marcador `anamnesisProcessedTranscript` guarda o texto que a extracao
// consumiu, e so vale enquanto for identico ao campo. No modo manual `qphda` e
// a "Anotacao clinica livre", escrita pelo medico, e nao ha marcador -- entao
// ela segue inteira, como sempre seguiu. Transcricao gravada e ainda nao
// extraida tambem segue: ali ela e o unico registro do caso.
export function promptAnamnesisText(form = {}) {
  const marcador = form.anamnesisProcessedTranscript;
  const transcricaoJaExtraida = Boolean(marcador) && String(marcador) === String(form.qphda || "");
  if (!transcricaoJaExtraida) return anamnesisText(form);
  // Extracao que nao devolveu nem queixa nem HDA deixaria o prompt sem
  // historia nenhuma. Ai a transcricao volta: texto demais e pior que texto
  // certo, mas prompt sem caso nao responde nada.
  return [form.queixa && `QP: ${form.queixa}`, form.hdaManual && `HDA: ${form.hdaManual}`].filter(Boolean).join("\n")
    || anamnesisText(form);
}

// O refinamento fechava em si mesmo: o medico respondia as perguntas,
// classificava as red flags e escrevia sua observacao, e nada disso saia da
// tela e do resumo. O prompt do diagnostico ficava byte a byte identico ao de
// antes de ele responder — a IA seguia raciocinando so com a anamnese
// original. Aqui a resposta volta ao prontuario que o diagnostico e o
// tratamento leem. Pergunta sem resposta nao entra: campo vazio e dado nao
// informado, nunca negacao.
// O refinamento na historia clinica, desde 20/09/2026. Antes as respostas iam so
// ao Resumo e ao prompt do Diagnostico: a historia nao as via, e a sintese que
// volta ao Diagnostico tambem nao. Entram como o registro do que foi
// esclarecido -- pergunta e resposta, sem reescrever a pergunta em terceira
// pessoa, que mudaria o sentido --, e SO o que foi respondido: "nao esclarecido",
// "nao avaliada" e observacao "pertinente" nao sao achado, sao pendencia, e
// seguem para o retorno.
const REFINEMENT_PENDING = new Set(["nao esclarecido", "nao avaliada", "nao avaliado"]);

export function refinementNarrativeText(form = {}) {
  const plan = form.refinementPlan || {};
  const partes = [];
  (plan.questions || []).forEach((item, index) => {
    const respostas = arrayValue(form[`refinementQuestion_${index}`]).filter(Boolean)
      .filter(resposta => !REFINEMENT_PENDING.has(normalizeText(resposta)));
    if (!respostas.length) return;
    const pergunta = stripFinalPeriod(cleanClinicalLine(item.prompt || "")).replace(/\?$/, "");
    partes.push(`${item.topic ? `${item.topic} (${lowerFirst(pergunta)}?)` : `${pergunta}?`}: ${lowerFirst(formatPlainList(respostas))}`);
  });
  [["red_flags", "refinementRedFlag", "Red flag"], ["important_points", "refinementImportant", "Ponto importante"]].forEach(([key, prefix, rotulo]) => {
    (plan[key] || []).forEach((item, index) => {
      const decisao = arrayValue(form[`${prefix}_${index}`])[0] || (typeof form[`${prefix}_${index}`] === "string" ? form[`${prefix}_${index}`] : "");
      if (!decisao || REFINEMENT_PENDING.has(normalizeText(decisao))) return;
      partes.push(`${rotulo} ${lowerFirst(cleanClinicalLine(item.topic || ""))}: ${lowerFirst(decisao)}`);
    });
  });
  const nota = stripFinalPeriod(cleanClinicalLine(form.refinementDoctorNotes || ""));
  if (nota) partes.push(`observação do médico: ${lowerFirst(nota)}`);
  return partes.length ? `Ao refinamento clínico, esclareceu-se: ${partes.join("; ")}.` : "";
}

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
