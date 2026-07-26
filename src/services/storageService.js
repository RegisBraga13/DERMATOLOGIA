const KEY = "regis_psiquiatr_ia_v1";

export function loadState() {
  try {
    const state = JSON.parse(localStorage.getItem(KEY)) || { patients: [], consultations: [], returns: [] };
    state.patients ||= [];
    state.consultations ||= [];
    state.returns ||= [];
    const demoPatientId = "patient_demo_ana_teste";
    if (!state.patients.some(patient => patient.id === demoPatientId)) {
      state.patients.push({
        id: demoPatientId,
        nome: "Ana Teste — PACIENTE FICTÍCIA",
        nascimento: "1992-04-15",
        sexo: "Feminino",
        estadoCivil: "Solteiro(a)",
        telefone: "(00) 00000-0000",
        email: "ana.teste@example.invalid",
        profissao: "Professora (dado fictício)",
        cidade: "Fortaleza",
        estado: "CE",
        createdAt: "2026-07-26T20:30:00.000Z",
        isDemo: true
      });
      state.consultations.push({
        id: "consultation_demo_ana_teste",
        patientId: demoPatientId,
        label: "Consulta demonstrativa",
        type: "consultation",
        createdAt: "2026-07-26T20:35:00.000Z",
        qphda: "QP: Desânimo, preocupação excessiva e sono não reparador há cerca de seis semanas.\n\nHDA: Relata redução do interesse por atividades habituais, cansaço, dificuldade de concentração e preocupação com demandas profissionais. Mantém atividades básicas, porém com prejuízo moderado no trabalho. Nega períodos de euforia, redução da necessidade de sono, sintomas psicóticos, ideação ou intenção suicida.",
        queixa: "Desânimo, preocupação excessiva e sono não reparador há cerca de seis semanas.",
        historia: "Redução do interesse, cansaço, dificuldade de concentração e preocupação relacionada ao trabalho, com prejuízo funcional moderado.",
        depressaoSintomas: ["Desinteresse ou falta de prazer", "Desanimo ou desesperanca", "Cansaco ou falta de energia", "Dificuldade de concentracao"],
        maniaHipomaniaSintomas: ["Nega sintomas relacionados"],
        ansiedadeSintomas: ["Preocupacao excessiva", "Tensao corporal", "Dificuldade de focar"],
        sonoCaracteristicas: ["Sono nao reparador", "Dificuldade para adormecer", "Despertares noturnos"],
        apetiteCaracteristicas: ["Reducao do apetite"],
        impactoSintomas: ["Moderado"],
        usoSubstanciasComportamentos: ["Cafeina"],
        psicoseSintomas: ["Nega sintomas relacionados"],
        riscoSuicidioIndicadores: ["Nega ideacao, plano ou intencao suicida"],
        riscoSuicidioRazoesViver: "Vínculo com a família e projetos profissionais.",
        riscoSuicidioRazoesParaViver: "Família, amizades, trabalho e planos futuros.",
        fatores: ["Problemas profissionais", "Stress e mudanca de rotina"],
        fatoresMelhora: ["Atividade fisica", "Sono adequado", "Rotina estruturada"],
        impacto: ["Moderado", "Prejuizo profissional"],
        aparencia: ["NDN"],
        consciencia: ["NDN"],
        atencao: ["Hipoprosexia"],
        orientacao: ["NDN"],
        memoria: ["NDN"],
        sensopercepcao: ["NDN"],
        pensamentoCursoForma: ["NDN"],
        pensamentoConteudo: ["Ideias de sobrevalia"],
        linguagem: ["NDN"],
        humor: ["Humor ansioso", "Depressao/hipotimia"],
        afeto: ["Afeto restrito/aplanado"],
        psicomotricidadeVontade: ["Hipobulia"],
        juizoCritico: ["Critica parcial"],
        diagnosticoSelecionado: ["Sintomas reativos/adaptativos - sofrimento como reacao a um problema especifico, como luto, termino ou estresse profissional."],
        diagnosticoManual: "Sintomas reativos/adaptativos - hipótese demonstrativa para revisão médica.",
        evolution: "**Identidade**\nPaciente fictícia, 34 anos, professora.\n\n**Queixa principal**\nDesânimo, preocupação excessiva e sono não reparador.\n\n**HDA**\nSintomas há aproximadamente seis semanas, relacionados a estresse profissional, com prejuízo funcional moderado.\n\n**Exame Psíquico**\nConsciente e orientada, humor ansioso e hipotímico, afeto restrito, atenção reduzida, sem alterações sensoperceptivas. Nega ideação suicida.\n\n**HD**\nSintomas reativos/adaptativos — hipótese fictícia para teste do sistema.",
        isDemo: true
      });
      localStorage.setItem(KEY, JSON.stringify(state));
    }
    return state;
  } catch {
    return { patients: [], consultations: [], returns: [] };
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
