// Uma chamada de IA leva dezenas de segundos, e a tela continua editavel
// enquanto ela roda. Se o medico troca de paciente, abre outro atendimento ou
// sai nesse intervalo, o rascunho que pediu a resposta deixou de existir -- e
// a resposta, ao chegar, cairia no rascunho do paciente seguinte.
//
// A guarda conta as trocas de rascunho. Quem chama a IA fotografa a contagem
// antes de esperar e, na volta, pergunta se ainda e a mesma: se nao for, a
// resposta e descartada em vez de gravada no lugar errado.
//
// Editar o formulario NAO troca o rascunho: o medico pode marcar e digitar
// durante a espera, e a resposta e mesclada sobre o que ele deixou.
export function createDraftGuard() {
  let trocas = 0;
  return {
    // O rascunho foi substituido por outro: outro paciente, outro atendimento,
    // atendimento novo ou fim da sessao.
    replaced() {
      trocas += 1;
    },
    // Devolve a pergunta "o rascunho ainda e o de quando a chamada saiu?".
    capture() {
      const naSaida = trocas;
      return () => naSaida === trocas;
    }
  };
}
