export const optionGroups = {
  sexo: ["Masculino", "Feminino", "Intersexo"],
  // Blocos que so aparecem para parte dos pacientes (ver views/lifeStageBlocks).
  cicloReprodutivo: ["Ciclos regulares", "Ciclos irregulares", "Puerperio", "Amamentando", "Contraceptivo hormonal", "Climaterio", "Menopausa", "Outro"],
  sintomasCiclo: ["Sem relacao com o ciclo", "Piora na semana pre-menstrual", "Piora na menstruacao", "Iniciou na gestacao", "Iniciou no puerperio", "Iniciou no climaterio", "Outro"],
  informante: ["A propria pessoa", "Mae", "Pai", "Outro responsavel", "Escola", "Outro"],
  acompanhanteVinculo: ["Conjuge/companheiro(a)", "Mae", "Pai", "Filho(a)", "Irmao(a)", "Outro familiar", "Cuidador(a) profissional", "Amigo(a)", "Outro"],
  escolaridadeContexto: ["Rendimento adequado", "Queda de rendimento", "Recusa escolar", "Repetencia", "Dificuldade de aprendizagem", "Conflito com colegas ou bullying", "Fora da escola", "Outro"],
  genero: ["Cis", "Trans", "Binário"],
  estadoCivil: ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viuvo(a)"],
  escolaridade: ["Analfabeto", "Fundamental", "Medio", "Superior"],
  religiao: ["Catolica", "Evangelica", "Espirita", "Judaica", "Islamica", "Matriz africana", "Agnostico(a)", "Ateu/ateia", "Sem religiao", "Outra"],
  inicio: ["Agudo", "Subagudo", "Insidioso", "Recorrente", "Desde a infancia/adolescencia", "Outro"],
  curso: ["Progressivo", "Flutuante", "Episodico", "Persistente", "Remitente-recorrente", "Outro"],
  fatores: ["Luto", "Conflito familiar", "Problemas profissionais", "Problemas financeiros", "Doenca clinica", "Uso de substancias", "Privacao de sono", "Stress e mudanca de rotina", "Sem fator claro", "Outro"],
  fatoresMelhora: ["Repouso", "Sono adequado", "Atividade fisica", "Rotina estruturada", "Psicoterapia", "Medicacao", "Afastamento de estressor", "Reducao de substancias", "Tecnicas de relaxamento", "Sem fator de melhora identificado", "Outro"],
  impacto: ["Sem impacto", "Leve", "Moderado", "Grave", "Incapacitante", "Prejuizo social", "Prejuizo familiar"],
  psiPrevios: ["Depressao", "Transtorno bipolar", "Transtorno de ansiedade generalizada", "Transtorno do panico", "TOC", "TEPT", "TDAH", "Transtorno psicotico", "Transtorno alimentar", "Epilepsia", "Nega diagnostico psiquiatrico previo", "Outro"],
  tratamentos: ["Psicoterapia", "Antidepressivos", "Estabilizador de humor", "Antipsicotico", "Benzodiazepinico", "Hipnotico", "Psicoestimulante", "ECT", "Internacao psiquiatrica", "Nega tratamento previo", "Outro"],
  familiares: ["Depressao", "Transtorno bipolar", "Esquizofrenia", "Ansiedade", "TOC", "Tentativa ou Suicidio", "Demencia", "Nega historico familiar psiquiatrico", "Outro"],
  substancias: ["Tabaco", "Alcool", "Cannabis", "Cocaina", "Crack", "Anfetaminas", "Benzodiazepinicos sem prescricao", "Opioides", "Alucinogenos", "Cafeina excessiva", "Jogos/apostas", "Pornografia", "Compras compulsivas", "Internet/redes sociais", "Outro"],
  examesPsiquiatria: ["Exames laboratoriais", "Beta-HCG", "ECG", "Litemia", "Valproato serico", "Prolactina", "Triagem toxicologica", "EEG", "TC", "RNM", "Outro"],
  // Sintomas marginais e residuais: o que persiste depois de controlado o
  // quadro agudo. Tratam-se por si, independentemente do transtorno de base —
  // sao menos intensos, nao menos importantes, e sao preditores de recaida.
  // Remissao do agudo nao e alta.
  // Lista antiga, dos sintomas marginais e residuais. A tela do Tratamento
  // agora usa os Sintomas-Alvo de data/targetSymptoms.js — sao coisas opostas:
  // aquilo era o que sobra depois de controlado o agudo, isto e o que nao pode
  // esperar. Fica aqui so para ler prontuario salvo antes de 21/08/2026.
  sintomasResiduais: [
    "Fadiga", "Falta de concentracao", "Nevoa cerebral", "Lentificacao do processamento",
    "Memoria operacional prejudicada", "Anedonia residual", "Hipersonia", "Insonia",
    "Sono nao reparador", "Cefaleia", "Dor cronica", "Sintomas gastrointestinais",
    "Ansiedade antecipatoria", "Hipervigilancia", "Esquiva", "Verificacoes automaticas",
    "Bruxismo", "Tensao muscular", "Disforia", "Impulsividade residual",
    "Instabilidade de ritmo circadiano", "Isolamento social", "Avolicao",
    "Embotamento afetivo", "Alucinacoes marginais com critica preservada",
    "Desconfianca residual", "Outro"
  ],
  aparencia: ["Adequada", "Bizarrice", "Excentricidade", "Hostilidade", "Puerilismo", "Seducao", "Arrogancia", "Simulacao", "Oposicao", "Contato visual esquivo ou fixo"],
  consciencia: ["Consciente", "Obnubilado", "Letargico", "Orientado", "Desrealizacao", "Dissociacao"],
  atencao: ["Vigil", "Hipovigil", "Hipervigil", "Distraibilidade", "Tenaz", "Hipertenaz"],
  memoria: ["Preservada", "Amnesia anterograda", "Amnesia retrograda", "Amnesia lacunar", "Confabulacao", "Paramnesia (falsas memorias)", "Deja vu", "Jamais vu"],
  sensopercepcao: ["Sem alteracao", "Ilusao", "Alucinacao auditiva", "Alucinacao visual", "Alucinacao tatil", "Alucinacao olfativa", "Alucinacao gustativa", "Alucinacao cenestesica", "Pseudoalucinacao", "Alucinose", "Despersonalizacao", "Desrealizacao"],
  pensamentoCursoForma: ["Adequado", "Taquipsiquismo", "Bradipsiquismo", "Bloqueio/interceptacao", "Fuga de ideias", "Desagregacao", "Afrouxamento de nexos", "Tangencialidade", "Circunstancialidade", "Perseveracao"],
  pensamentoConteudo: ["Adequado", "Delirio de perseguicao", "Delirio de grandeza", "Delirio mistico", "Delirio de ciumes", "Delirio erotomaniaco", "Delirio somatico", "Delirio de ruina", "Obsessoes", "Fobias", "Ideacao suicida", "Ideacao homicida", "Ideias de sobrevalia"],
  linguagem: ["Adequada", "Logorreia", "Mutismo", "Taquilalia", "Bradilalia", "Disartria", "Neologismo", "Ecolalia", "Coprolalia"],
  humor: ["Eutimia (normal)", "Depressao/hipotimia", "Euforia/hipertimia", "Disforia (irritabilidade extrema)", "Humor ansioso"],
  afeto: ["Preservado", "Embotamento", "Afeto restrito/aplanado", "Labilidade afetiva", "Incontinencia afetiva", "Afeto pueril"],
  psicomotricidade: ["Sem alteracao", "Agitacao", "Lentificacao", "Catatonia", "Flexibilidade ceracea", "Tiques", "Acatisia", "Ecopraxia"],
  vontade: ["Normal", "Abulia", "Hipobulia", "Impulsividade", "Compulsao"],
  juizoCritico: ["Preservado", "Negacao da doenca", "Critica parcial", "Delirio de normalidade", "Incapacidade de prever consequencias dos atos"],
  retorno: ["Melhorou muito", "Melhorou parcialmente", "Sem mudanca", "Piorou parcialmente", "Piorou muito", "Oscilante"]
};
