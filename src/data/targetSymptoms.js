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
//
// 02/09/2026: de trinta para dezenove, a pedido dele — "os sintomas mais
// frequentes e relevantes, escolher com mais parcimonia". Sugestao longa
// deixa de sugerir: rolar trinta linhas custa mais do que digitar. Sairam os
// que se sobrepoem a um vizinho (lentificacao e apatia moram na anedonia,
// labilidade na irritabilidade, logorreia no pensamento acelerado) e os que
// so aparecem num quadro estreito (despersonalizacao, sobressalto,
// hipervigilancia, restricao alimentar, culpa, choro). Nenhum foi proibido —
// o campo e livre, e quem digitar recebe a mesma conduta de antes.
//
// Dois ficaram menos estreitos: a ideacao delirante perdeu o "persecutoria",
// que escondia a de grandeza, e o deficit de atencao perdeu o "agudo".
//
// "Outro" saiu junto: era chip de lista fechada, e nao ha o que escolher
// quando o campo ja aceita qualquer palavra.
export const targetSymptomOptions = [
  "Insônia inicial ou de manutenção",
  "Ansiedade paroxística (pânico)",
  "Ideação suicida ativa ou passiva",
  "Agitação psicomotora",
  "Irritabilidade ou disforia",
  "Anedonia",
  "Astenia ou fadiga",
  "Sintomas somáticos",
  "Ruminação obsessiva",
  "Compulsões (rituais)",
  "Esquiva ou isolamento social",
  "Impulsividade comportamental",
  "Automutilação",
  "Pensamento acelerado",
  "Alucinações auditivas ou visuais",
  "Ideação delirante",
  "Craving (fissura)",
  "Déficit de atenção",
  "Compulsão alimentar"
];
