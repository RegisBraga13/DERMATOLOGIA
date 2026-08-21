// Sintomas-Alvo, tabela escrita pelo Dr. Regis em 21/08/2026.
//
// Definicao dele: "a queixa mais urgente, incomoda ou incapacitante que orienta
// a conduta terapeutica imediata no inicio do acompanhamento em saude mental,
// independentemente de ja se ter estabelecido um diagnostico nosologico".
//
// Substituiu "sintomas marginais e residuais", que olhava para o outro extremo
// do quadro — o que sobra depois de controlado o agudo. Sao coisas opostas: um
// e o que ainda persiste, o outro e o que nao pode esperar.
//
// Ele mandou esta tabela como EXEMPLO, nao como versao final: os nomes, as
// nosologias e as condutas ainda passam pelo crivo dele, como passou o
// catalogo diagnostico. Ate la ela ja serve, porque nada aqui vira prescricao
// sozinho.
//
// A tabela e a fonte da lista de chips E a referencia que vai no prompt do
// tratamento. Ela nao decide sozinha: a IA cruza o manejo daqui com o caso —
// medicamento ja em uso, comorbidade, agravante, gravidez, funcao renal. Por
// isso a coluna de primeira linha entra como referencia, nao como prescricao.
//
// O campo continua salvo como "sintomasResiduais" no prontuario, para nao
// perder o que ja foi registrado antes desta mudanca.
export const targetSymptoms = [
  { nome: "Insônia inicial ou de manutenção", nosologias: "Depressão, TAG, bipolaridade, TEPT", primeiraLinha: "Zolpidem, eszopiclona, trazodona", manejo: "Higiene do sono estrita; restrição de telas à noite" },
  // "Delirium" saiu desta linha: decisao dele de 20/08/2026, o app nao propoe
  // delirium em contexto nenhum — e quadro de internacao, sobretudo UTI.
  { nome: "Agitação psicomotora", nosologias: "Mania, esquizofrenia", primeiraLinha: "Haloperidol, olanzapina, diazepam", manejo: "Ambiente calmo; contenção verbal; evitar confrontos" },
  { nome: "Ideação suicida ativa ou passiva", nosologias: "Depressão maior, borderline", primeiraLinha: "Lítio, cetamina, clozapina", manejo: "Retirar meios letais; vigilância 24h; apoio familiar" },
  { nome: "Ansiedade paroxística (pânico)", nosologias: "Transtorno de pânico, TEPT", primeiraLinha: "Clonazepam ou alprazolam SOS; ISRS", manejo: "Exercícios de respiração diafragmática; psicoeducação" },
  { nome: "Irritabilidade ou disforia", nosologias: "Bipolaridade, burnout, TDAH", primeiraLinha: "Estabilizadores de humor, risperidona", manejo: "Identificar gatilhos ambientais; técnicas de pausa" },
  { nome: "Ruminação obsessiva", nosologias: "TOC, TAG, depressão", primeiraLinha: "Fluoxetina, sertralina, clomipramina", manejo: "Técnicas de distração cognitiva; adiar o pensamento" },
  { nome: "Anedonia", nosologias: "Depressão maior, esquizofrenia", primeiraLinha: "Bupropiona, desvenlafaxina", manejo: "Ativação comportamental micro-passo a micro-passo" },
  { nome: "Compulsão alimentar", nosologias: "Transtorno da compulsão alimentar, bulimia", primeiraLinha: "Lisdexanfetamina, topiramato, ISRS", manejo: "Diário alimentar sem julgamento; comer regularizado" },
  { nome: "Lentificação psicomotora", nosologias: "Depressão melancólica, demências", primeiraLinha: "Venlafaxina, vortioxetina", manejo: "Estimulação sensorial leve; fracionar tarefas diárias" },
  { nome: "Alucinações auditivas ou visuais", nosologias: "Esquizofrenia, psicoses, mania", primeiraLinha: "Risperidona, aripiprazol, quetiapina", manejo: "Não confrontar o delírio ou a alucinação; dar segurança" },
  { nome: "Ideação delirante persecutória", nosologias: "Esquizofrenia, transtorno delirante", primeiraLinha: "Olanzapina, paliperidona", manejo: "Validar o sentimento de medo, mas não o conteúdo" },
  { nome: "Déficit de atenção agudo", nosologias: "TDAH, depressão, TAG", primeiraLinha: "Metilfenidato, venlafaxina", manejo: "Ambientes sem distração; uso de agendas e alarmes" },
  { nome: "Impulsividade comportamental", nosologias: "Borderline, antissocial, mania", primeiraLinha: "Topiramato, valproato, quetiapina", manejo: "Treino de tolerância ao mal-estar; criar barreiras" },
  { nome: "Apatia e avolição profundas", nosologias: "Esquizofrenia, depressão, Alzheimer", primeiraLinha: "Agonistas dopaminérgicos, bupropiona", manejo: "Estabelecer rotinas externas rígidas e supervisionadas" },
  { nome: "Esquiva ou isolamento social", nosologias: "Fobia social, transtorno esquivo, TEPT", primeiraLinha: "Paroxetina, escitalopram, propranolol", manejo: "Exposição social gradual e combinada com terapia" },
  { nome: "Labilidade afetiva", nosologias: "Borderline, ciclotimia, transtorno bipolar", primeiraLinha: "Lítio, lamotrigina, quetiapina", manejo: "Validar a emoção atual; mapear oscilações em diário" },
  { nome: "Hipervigilância", nosologias: "TEPT, TAG", primeiraLinha: "Prazosina para pesadelos, ISRS, ISRSN", manejo: "Técnicas de aterramento; foco no presente" },
  { nome: "Sintomas somáticos", nosologias: "Transtorno de sintomas somáticos, depressão", primeiraLinha: "Duloxetina, amitriptilina", manejo: "Investigar exclusão médica; focar na funcionalidade" },
  { nome: "Despersonalização", nosologias: "Pânico, transtornos dissociativos", primeiraLinha: "ISRS, lamotrigina adjuvante", manejo: "Estímulos físicos frios ou táteis para voltar ao corpo" },
  { nome: "Compulsões (rituais físicos)", nosologias: "TOC", primeiraLinha: "Clomipramina, fluvoxamina, sertralina", manejo: "Prevenção de resposta; retardar a execução do ritual" },
  { nome: "Restrição alimentar severa", nosologias: "Anorexia nervosa, TARE", primeiraLinha: "Olanzapina para ganho de peso e ansiedade", manejo: "Monitoramento pós-refeição; equipe multidisciplinar" },
  { nome: "Choro incontrolável", nosologias: "Depressão, transtorno de adaptação", primeiraLinha: "Citalopram, sertralina", manejo: "Permitir o choro; oferecer validação sem julgamento" },
  { nome: "Fuga de ideias ou pensamento acelerado", nosologias: "Mania ou hipomania", primeiraLinha: "Lítio, valproato de sódio, asenapina", manejo: "Diminuir estímulos visuais e sonoros ao redor" },
  { nome: "Craving (fissura)", nosologias: "Transtorno por uso de substâncias", primeiraLinha: "Naltrexona, acamprosato, topiramato", manejo: "Evitar locais e pessoas de consumo; técnica do surfe" },
  { nome: "Sentimento de culpa excessiva", nosologias: "Depressão maior", primeiraLinha: "Escitalopram, duloxetina", manejo: "Questionamento socrático em terapia; autocompaixão" },
  { nome: "Astenia ou fadiga crônica", nosologias: "Depressão, burnout", primeiraLinha: "Bupropiona, venlafaxina", manejo: "Atividade física leve diária; higiene do repouso" },
  { nome: "Automutilação", nosologias: "Borderline, depressão em jovens", primeiraLinha: "Naltrexona para fissura, quetiapina", manejo: "Substitutos sensoriais como gelo na pele; plano de crise" },
  { nome: "Logorreia", nosologias: "Episódio maníaco", primeiraLinha: "Haloperidol, olanzapina", manejo: "Conversas curtas, diretas e com poucas opções de escolha" },
  { nome: "Distorção da imagem corporal", nosologias: "Anorexia, transtorno dismórfico corporal", primeiraLinha: "ISRS em doses altas, como fluoxetina", manejo: "Evitar checagens constantes no espelho; focar na saúde" },
  { nome: "Sobressalto exagerado", nosologias: "TEPT", primeiraLinha: "Sertralina, paroxetina", manejo: "Treino de relaxamento muscular progressivo" }
];

// Os chips da tela. "Outro" no fim, com a anotacao livre ao lado.
export const targetSymptomOptions = [...targetSymptoms.map(item => item.nome), "Outro"];

// A referencia que vai no prompt, so dos que ele assinalou. Sem marcacao, sem
// referencia — e sem bloco de conduta na tela.
export function targetSymptomReference(names = []) {
  const marcados = new Set(names.map(name => String(name).trim().toLowerCase()));
  return targetSymptoms
    .filter(item => marcados.has(item.nome.toLowerCase()))
    .map(item => `${item.nome} | 1a linha de referencia: ${item.primeiraLinha} | Manejo: ${item.manejo}`);
}
