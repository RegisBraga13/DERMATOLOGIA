// Uma etapa, uma chamada de IA por vez.
//
// O draftGuard ja existia e resolve UM caso: o rascunho foi trocado durante a
// espera, e a resposta nao pode cair no paciente seguinte. Ele nao resolve o
// caso de DOIS cliques no mesmo rascunho -- e esse era o caminho natural,
// porque a chamada leva dezenas de segundos, o botao continuava clicavel e nao
// havia indicador de que algo estivesse acontecendo.
//
// Duas chamadas em voo para a mesma etapa terminam em ordem imprevisivel. A que
// responder por ultimo grava por cima, e a proposta na tela pode nao ser a da
// ultima vez que ele clicou. Numa tela de prescricao isso nao e um incomodo de
// interface: e a lista de medicamentos errada com aparencia de certa.
//
// A regra e "a ultima disparada e a unica que grava". Nao "a primeira vence":
// clicar de novo e pedir outra resposta, e a resposta pedida por ultimo e a que
// ele quer ver.
//
// Enquanto ha chamada em voo a etapa fica `ocupada`, e quem desenha usa isso
// para desabilitar o botao. O FORMULARIO continua editavel -- isso e decisao
// antiga e boa, registrada em draftGuard.js: o medico marca e digita durante a
// espera, e a resposta e mesclada sobre o que ele deixou. So o botao que
// dispara a etapa e que fecha.
export function createAiOperations(aoMudar = () => {}) {
  const series = new Map();
  const ocupadas = new Set();

  return {
    // Abre uma chamada para `chave` e devolve o par de perguntas que ela faz na
    // volta. `chave` e a ETAPA, nao o botao: "Gerar" e "Refinar" do tratamento
    // escrevem nos mesmos campos, entao disputam a mesma vaga.
    begin(chave) {
      const serie = (series.get(chave) || 0) + 1;
      series.set(chave, serie);
      ocupadas.add(chave);
      aoMudar();
      return {
        // "Ainda sou a chamada mais recente desta etapa?" Falso quando ele
        // clicou de novo enquanto esta esperava.
        atual: () => series.get(chave) === serie,
        // Libera o botao. So a chamada mais recente libera: se uma resposta
        // velha chegasse primeiro e liberasse, o botao voltaria a abrir com
        // outra chamada ainda em voo.
        encerrar() {
          if (series.get(chave) !== serie) return;
          ocupadas.delete(chave);
          aoMudar();
        }
      };
    },

    ocupada: chave => ocupadas.has(chave),
    // Lista para quem redesenha: a cada render() as caixas sao recriadas, e o
    // `disabled` precisa ser reaplicado a partir do estado, e nao do DOM que
    // acabou de ser destruido.
    ocupadasAgora: () => [...ocupadas],

    // Rascunho trocado (outro paciente, outro atendimento, fim de sessao). As
    // respostas em voo serao descartadas pelo draftGuard, entao nada do que
    // esta esperando ainda vale: o botao do proximo paciente abre limpo.
    reset() {
      if (!ocupadas.size) return;
      ocupadas.clear();
      aoMudar();
    }
  };
}
