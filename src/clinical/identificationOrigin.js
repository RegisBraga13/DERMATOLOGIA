// De quem e cada campo de identificacao preenchido a partir da transcricao.
//
// Mais simples que anamnesisOrigin.js: la a mesma caixa podia estar marcada
// por decisao do medico ou por proposta da IA, e era preciso reconciliar as
// duas. Aqui nao -- a extracao SO escreve em campo que estava vazio (ver
// applyIdentificationAiResult, em App.js), entao todo campo marcado veio
// mesmo da IA, sem reconciliacao nenhuma. So falta marcar e desmarcar.
//
// A marca e transitoria, como na anamnese: some no instante em que o medico
// edita o campo, porque dali em diante o campo e dele.

export function withoutIdentificationAiMark(marcas = {}, campo) {
  if (!campo || !Object.hasOwn(marcas, campo)) return { ...marcas };
  const restante = { ...marcas };
  delete restante[campo];
  return restante;
}

export function hasIdentificationAiMarks(marcas = {}) {
  return Object.keys(marcas || {}).length > 0;
}
