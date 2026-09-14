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
// Autores, titulos e edicoes conferidos pelo medico em 19/08/2026.
export const referenceCatalog = [
  { chave: "dalgalarrondo", autor: "Dalgalarrondo, P.", titulo: "Psicopatologia e semiologia dos transtornos mentais", curto: "Dalgalarrondo" },
  { chave: "cheniaux", autor: "Cheniaux, E.", titulo: "Manual de psicopatologia", edicao: "6ª ed., 2021", curto: "Cheniaux" },
  // ANTES da chave curta: o titulo do outro livro de entrevista CONTEM
  // "entrevista psiquiatrica", e find() para no primeiro que casa -- a chave
  // curta citaria a obra errada. Especifico primeiro, sempre.
  { chave: "entrevista psiquiatrica na pratica", titulo: "A entrevista psiquiátrica na prática clínica", curto: "Entrevista na Prática Clínica" },
  { chave: "entrevista psiquiatrica", autor: "USP — Manole", titulo: "Psicopatologia clínica: entrevista psiquiátrica", curto: "USP — Manole" },
  { chave: "tratado psiquiatria", autor: "Associação Brasileira de Psiquiatria", titulo: "Tratado de psiquiatria", edicao: "2022", curto: "Tratado ABP" },
  { chave: "manual_do_residente", autor: "Sallet, P. C. e cols.", titulo: "Manual do residente de psiquiatria", edicao: "2023", curto: "Manual do Residente" },
  { chave: "sthal_psicofarmacologia", autor: "Stahl, S. M.", titulo: "Psicofarmacologia clínica: bases neurocientíficas e aplicações", curto: "Stahl — Psicofarmacologia" },
  { chave: "guia de prescri", autor: "Stahl, S. M.", titulo: "Guia de prescrição", edicao: "2019", curto: "Stahl — Guia" },
  { chave: "psicofarmacos", autor: "Cordioli, A. V. e cols.", titulo: "Psicofármacos: consulta rápida", edicao: "6ª ed.", curto: "Psicofármacos" },
  // Os volumes 2 e 3 sao livros diferentes e respondem a etapas diferentes -- o
  // 2 no Diagnostico, o 3 no Tratamento. A chave carrega o numero porque os dois
  // nomes de arquivo so diferem nele; sem o numero, o primeiro do catalogo
  // responderia pelos dois, e a tela citaria o volume errado.
  { chave: "1_clinica_psiquiatrica", autor: "Miguel, E. C. e cols.", titulo: "Clínica Psiquiátrica, vol. 1", curto: "Clínica Psiquiátrica — vol. 1" },
  { chave: "2_clinica_psiquiatrica", autor: "Miguel, E. C. e cols.", titulo: "Clínica Psiquiátrica, vol. 2", curto: "Clínica Psiquiátrica — vol. 2" },
  { chave: "3_clinica_psiquiatrica", autor: "Miguel, E. C. e cols.", titulo: "Clínica Psiquiátrica, vol. 3", curto: "Clínica Psiquiátrica — vol. 3" },
  // Sem autor: o nome do arquivo traz titulo, edicao e ano, e mais nada. Melhor
  // a referencia incompleta do que atribuida a quem nao escreveu -- e a mesma
  // razao pela qual fonte sem correspondencia aparece com o nome do arquivo.
  { chave: "psicofarmacologia_da_teoria", titulo: "Psicofarmacologia: da teoria à clínica", edicao: "1ª ed., 2025", curto: "Psicofarmacologia 2025" },
  { chave: "volume_4_guia_pratico", autor: "Guimarães-Fernandes, F. e cols.", titulo: "Clínica Psiquiátrica: guia prático, vol. 4", edicao: "2021", curto: "Clínica Psiquiátrica — Guia Prático" },
  { chave: "de bolso", autor: "Miguel, E. C. e cols.", titulo: "Clínica psiquiátrica de bolso", edicao: "3ª ed., 2023", curto: "Clínica de Bolso" },
  { chave: "condutas_em_psiquiatria", autor: "Baldaçara, L.; Teng, C. T. (orgs.)", titulo: "Condutas em psiquiatria", edicao: "2021", curto: "Condutas em Psiquiatria" },
  { chave: "compendio de psiquiatria", autor: "Sadock, B. J.; Sadock, V. A.; Ruiz, P.", titulo: "Compêndio de psiquiatria", edicao: "11ª ed.", curto: "Kaplan & Sadock" },
  // 2a ed., 2026: trocou a de 2023 na biblioteca em 14/09/2026, a pedido dele.
  // Sem autor pela mesma razao da Psicofarmacologia 2025: o arquivo so traz
  // titulo, instituicao, edicao e ano.
  { chave: "psiquiatria_da_infancia_e_adolescencia_hcfmusp", titulo: "Psiquiatria da infância e adolescência (HCFMUSP)", edicao: "2ª ed., 2026", curto: "Psiquiatria da Infância 2026" },
  { chave: "dsm 5 tr", autor: "American Psychiatric Association", titulo: "Manual diagnóstico e estatístico de transtornos mentais: DSM-5-TR", edicao: "Artmed, 2023", curto: "DSM-5-TR" },
  { chave: "cid-11", autor: "Organização Mundial da Saúde", titulo: "CID-11 MMS, capítulo 06: transtornos mentais, comportamentais ou do desenvolvimento neurológico", curto: "CID-11 — cap. 6" }
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
