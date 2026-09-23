import { extractedDoses } from "./medicationDoses.js";
import { medications } from "./medications.js";

// O CATALOGO QUE CONFERE DOSE -- que nao e o mesmo que o catalogo que a tela
// mostra.
//
// Sao duas origens: as 9 entradas que ele escreveu a mao (`medications.js`,
// com mecanismo, melhor uso e notas de pratica, tudo que a ficha exibe) e as
// extraidas da biblioteca RAG (`medicationDoses.js`, so posologia). A ficha e
// a busca continuam lendo a primeira direto; quem confere dose le daqui.
//
// A REGRA E UMA SO: entra quem tem `revisado: true`.
//
// Farmaco extraido e ainda nao revisado se comporta como farmaco fora do
// catalogo -- a tela diz "sem conferencia automatica", o historico diz "sem
// dados suficientes". E a verdade sobre ele: ninguem conferiu aquela faixa de
// dose, e uma faixa errada sai na receita.
export function catalogoConferido() {
  return [...medications, ...extractedDoses].filter(item => item && item.revisado === true);
}

/** Quantos farmacos a conferencia cobre hoje. A tela diz isto ao recusar conferir. */
export function tamanhoDoCatalogoConferido() {
  return catalogoConferido().length;
}

/** Os extraidos que ainda esperam revisao. Serve para o aviso de pendencia. */
export function aguardandoRevisao() {
  return extractedDoses.filter(item => item && item.revisado !== true);
}
