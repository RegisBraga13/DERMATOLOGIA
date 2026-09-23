// Posologia extraida da biblioteca RAG, para revisao dele.
//
// Gerado por `node scripts/extrair_posologia.mjs`, um farmaco por chamada, no
// modo RAG -- entao cada entrada vem com as obras que a sustentam, e nao do
// que o modelo lembra. As 9 entradas escritas a mao continuam em
// `medications.js`; estas sao as outras.
//
// NADA AQUI ENTRA NA CONFERENCIA ENQUANTO `revisado` FOR false.
//
// Essa e a condicao dele, 23/09/2026, e ela e o ponto do arquivo: extrair
// dose da literatura e barato e rapido, e errar uma faixa de dose sai na
// receita. Enquanto `revisado` e false, o farmaco se comporta como se nao
// estivesse no catalogo -- a tela diz "sem conferencia automatica" e o
// historico diz "sem dados suficientes", que e a verdade.
//
// PARA REVISAR: confira `initialDose`, `usualDose` e `progression` contra as
// fontes citadas em `fontes`, corrija o que precisar, e troque `revisado` para
// true. A partir dali o farmaco passa a valer nas duas conferencias.
//
// Vazio por decisao dele, 23/09/2026: nenhuma extracao roda sem o aval dele
// antes de cada lote, mesmo que o custo em cota seja pequeno.
export const extractedDoses = [];
