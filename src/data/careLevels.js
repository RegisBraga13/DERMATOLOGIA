// Nivel de cuidado: onde o paciente vai ser tratado.
//
// Lista definida com o Dr. Regis em 28/08/2026, depois de um caso de depressao
// psicotica com sindrome de Cotard, recusa alimentar, perda de 11 kg e ideacao
// suicida em que o app **nao tinha onde escrever "interna"**. A conduta caia num
// campo de texto livre, que nada confere e que nao volta para o raciocinio.
//
// E a primeira decisao da Conduta, e nao a ultima: escolher farmaco antes de
// escolher onde tratar inverte a ordem clinica. Num quadro de urgencia, errar
// aqui e o erro que mata -- os outros se corrigem no retorno.
//
// Em 02/09/2026 sairam "Ambulatorial intensivo" e "Hospital-dia": nenhuma das
// duas e via disponivel nesta pratica, e oferecer conduta que nao se executa e
// pior do que nao oferecer nenhuma.
//
// LISTA FECHADA, e uma escolha so: nao se esta ao mesmo tempo em ambulatorio e
// internado. Por isso a tela usa radio, e nao caixa de selecao como o resto do
// programa.
//
// As modalidades de internacao seguem a Lei 10.216/2001, que e quem as define no
// Brasil -- e a diferenca entre elas nao e clinica, e juridica: muda quem
// consente, quem comunica e a quem se responde.
export const careLevelOptions = [
  "Ambulatorial",
  "Internação voluntária",
  "Internação involuntária",
  "Internação compulsória",
  "Encaminhamento imediato a emergência"
];

// So as internacoes trazem nota, e a nota e a lei: o que muda entre as tres nao
// e clinico, e juridico -- quem consente, quem comunica, a quem se responde --, e
// isso nao se deduz do nome da modalidade. "Ambulatorial" e "Encaminhamento
// imediato a emergencia" se explicam sozinhas, e glosar o obvio so afasta da
// tela a linha que precisa ser lida.
export const careLevelNotes = {
  "Internação voluntária": "Com consentimento escrito do paciente (Lei 10.216/2001, art. 6º, I).",
  "Internação involuntária": "Sem consentimento do paciente, a pedido de terceiro. Comunicação ao Ministério Público em 72 horas (Lei 10.216/2001, art. 8º, §1º).",
  "Internação compulsória": "Determinada judicialmente (Lei 10.216/2001, art. 6º, III)."
};

// Nivel que implica leito. Usado para exigir justificativa: privar alguem de
// liberdade sem escrever por que e o que nao pode acontecer no prontuario.
export const CARE_LEVELS_REQUIRING_JUSTIFICATION = new Set([
  "Internação voluntária",
  "Internação involuntária",
  "Internação compulsória",
  "Encaminhamento imediato a emergência"
]);
