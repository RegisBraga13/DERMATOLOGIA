// O que esta na tela e ainda nao esta no prontuario.
//
// O programa so grava no clique: uma consulta de quarenta minutos vive inteira
// na memoria do navegador ate ele apertar Salvar. Fechar a aba, recarregar por
// engano ou clicar num link externo descarta tudo em silencio -- sem pergunta,
// sem rastro, e sem nada a recuperar depois.
//
// Aqui so se guarda QUAIS escopos foram tocados desde a ultima gravacao. Nao se
// compara conteudo: o rascunho passa por normalizacao ao salvar (narrativa
// remontada, campos de tela removidos), entao uma comparacao profunda acusaria
// diferenca onde nao houve trabalho perdido. Marcar o toque e grosseiro na
// direcao segura -- avisar a toa custa um clique, e nao avisar custa a consulta.
//
// O escopo e o ramo do rascunho ("consultation", "return", "patient"), e nao o
// formulario: e o ramo que saveClinicalRecord grava, entao e o ramo que a
// gravacao limpa.
export function createUnsavedWork() {
  const sujos = new Set();

  return {
    // Ele digitou, marcou ou desmarcou alguma coisa neste escopo.
    tocou(escopo) {
      if (escopo) sujos.add(escopo);
    },

    // Gravado: o que estava pendente neste escopo deixou de estar. Nao mexe nos
    // outros -- salvar a consulta nao salva o cadastro do paciente.
    salvo(escopo) {
      sujos.delete(escopo);
    },

    // Rascunho trocado (outro paciente, outro atendimento, fim de sessao). O que
    // estava pendente foi descartado por decisao dele, e nao ha o que avisar.
    limpar() {
      sujos.clear();
    },

    ha: () => sujos.size > 0,
    escopos: () => [...sujos]
  };
}
