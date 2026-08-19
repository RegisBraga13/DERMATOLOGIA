// Referencia bibliografica de cada fonte da biblioteca RAG.
//
// O que o vector store devolve e nome de arquivo — "1 Psicofármacos - consulta
// rápida - 6 ed-1.pdf". Isso nao e referencia: nao diz autor, nao diz edicao, e
// o medico nao consegue julgar se confia na fonte que sustentou a resposta.
//
// A chave e um trecho do nome do arquivo, sem acento e em minusculas. Fonte que
// nao casar aparece com o proprio nome do arquivo, sem inventar autor: melhor
// feio do que atribuido a quem nao escreveu.
//
// PENDENTE DE CONFERENCIA DO MEDICO: autores, titulos e edicoes abaixo foram
// lidos dos nomes de arquivo, nao das folhas de rosto.
export const referenceCatalog = [
  { chave: "dalgalarrondo", autor: "Dalgalarrondo, P.", titulo: "Psicopatologia e semiologia dos transtornos mentais", curto: "Dalgalarrondo" },
  { chave: "cheniaux", autor: "Cheniaux, E.", titulo: "Manual de psicopatologia", edicao: "6ª ed., 2021", curto: "Cheniaux" },
  { chave: "entrevista psiquiatrica", autor: "USP — Manole", titulo: "Psicopatologia clínica: entrevista psiquiátrica", curto: "USP — Manole" },
  { chave: "tratado psiquiatria", autor: "Associação Brasileira de Psiquiatria", titulo: "Tratado de psiquiatria", edicao: "2022", curto: "Tratado ABP" },
  { chave: "manual_do_residente", autor: "Sallet, P. C. e cols.", titulo: "Manual do residente de psiquiatria", edicao: "2023", curto: "Manual do Residente" },
  { chave: "sthal_psicofarmacologia", autor: "Stahl, S. M.", titulo: "Psicofarmacologia clínica: bases neurocientíficas e aplicações", curto: "Stahl — Psicofarmacologia" },
  { chave: "guia de prescri", autor: "Stahl, S. M.", titulo: "Guia de prescrição", edicao: "2019", curto: "Stahl — Guia" },
  { chave: "psicofarmacos", autor: "Cordioli, A. V. e cols.", titulo: "Psicofármacos: consulta rápida", edicao: "6ª ed.", curto: "Psicofármacos" }
];

function normalize(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Referencia da fonte, ou o proprio nome do arquivo quando nao houver. */
export function referenceFor(filename = "") {
  const nome = normalize(filename);
  const item = referenceCatalog.find(ref => nome.includes(ref.chave));
  if (!item) return { curto: filename || "Fonte", completo: filename || "Fonte", conhecida: false };
  return {
    curto: item.curto,
    // O autor ja termina em ponto ("Stahl, S. M."); juntar com ". " dava
    // "Stahl, S. M.. Psicofarmacologia".
    completo: [item.autor, item.titulo, item.edicao].filter(Boolean).join(". ").replace(/\.\s*\./g, "."),
    conhecida: true
  };
}
