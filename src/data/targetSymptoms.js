// Sintomas-Alvo, lista definida pelo Dr. Regis em 21/08/2026.
//
// Definicao dele: "a queixa mais urgente, incomoda ou incapacitante que orienta
// a conduta terapeutica imediata no inicio do acompanhamento em saude mental,
// independentemente de ja se ter estabelecido um diagnostico nosologico".
//
// Substituiu "sintomas marginais e residuais", que olhava para o outro extremo
// do quadro — o que sobra depois de controlado o agudo. Sao coisas opostas: um
// e o que ainda persiste, o outro e o que nao pode esperar.
//
// AQUI SO MORAM OS NOMES, de proposito. A tabela que ele mandou trazia tambem
// primeira linha e manejo de cada alvo, mas era modelo, nao conteudo: quem
// orienta medicamento e conduta e o RAG, com a literatura indexada. Uma tabela
// fixa no codigo envelheceria sozinha, e passaria a competir com a fonte que o
// programa inteiro usa para decidir tratamento.
//
// O campo continua salvo como "sintomasResiduais" no prontuario, para nao
// perder o que ja foi registrado antes desta mudanca.
//
// 31/08/2026: deixou de ser lista de escolha. Era uma grade fixa de trinta chips,
// a mesma para todo paciente -- num caso de mania o medico via anedonia, craving
// e restricao alimentar, e nao via ideacao delirante de GRANDEZA, que so existia
// na versao persecutoria. O sintoma fora da lista nao existia. Agora se digita o
// sintoma na busca do apendice, e esta lista sobrevive como SUGESTAO: o datalist
// do campo. Curadoria dele, e continua util para lembrar; so nao fecha mais a
// porta para o que ela nao previu.
export const targetSymptomOptions = [
  "Insônia inicial ou de manutenção",
  "Agitação psicomotora",
  "Ideação suicida ativa ou passiva",
  "Ansiedade paroxística (pânico)",
  "Irritabilidade ou disforia",
  "Ruminação obsessiva",
  "Anedonia",
  "Compulsão alimentar",
  "Lentificação psicomotora",
  "Alucinações auditivas ou visuais",
  "Ideação delirante persecutória",
  "Déficit de atenção agudo",
  "Impulsividade comportamental",
  "Apatia e avolição profundas",
  "Esquiva ou isolamento social",
  "Labilidade afetiva",
  "Hipervigilância",
  "Sintomas somáticos",
  "Despersonalização",
  "Compulsões (rituais físicos)",
  "Restrição alimentar severa",
  "Choro incontrolável",
  "Fuga de ideias ou pensamento acelerado",
  "Craving (fissura)",
  "Sentimento de culpa excessiva",
  "Astenia ou fadiga crônica",
  "Automutilação",
  "Logorreia",
  "Distorção da imagem corporal",
  "Sobressalto exagerado",
  "Outro"
];
