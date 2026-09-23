// Exporta o catalogo de medicamentos para JSON, para o servidor ler.
//
// POR QUE GERAR, E NAO MUDAR DE FORMATO. O `medications.js` e escrito e
// revisado por ele: sao doses, contraindicacoes e interacoes, editadas a mao
// como texto clinico. Trocar o modulo por um JSON obrigaria o front a carregar
// o catalogo por fetch -- assincrono, no meio do caminho de quem desenha a tela
// -- para resolver um problema que nao e do front.
//
// Entao o modulo continua sendo a fonte, e este script espelha dele o que o
// servidor precisa. O espelho e conferido por teste (testes/js/medicationTable.test.js):
// editar o modulo sem rodar isto aqui quebra a bateria, em vez de deixar o
// servidor conferindo dose por uma tabela velha.
//
//   node scripts/build_medication_table.mjs
import { writeFileSync } from "node:fs";
import { catalogoConferido } from "../src/data/medicationCatalog.js";

// So o que o servidor usa para conferir. Mecanismo, receptores, melhor uso e
// preco ficam no modulo: sao texto de tela, e nao entram em decisao nenhuma.
export const CAMPOS_DO_SERVIDOR = [
  "generic", "brands", "className",
  "initialDose", "usualDose", "progression",
  "contraindications", "interactions"
];

export function medicationTable(lista = catalogoConferido()) {
  return lista.map(item => Object.fromEntries(CAMPOS_DO_SERVIDOR.map(campo => [campo, item[campo] || ""])));
}

const destino = new URL("../src/data/medications.json", import.meta.url);
const conteudo = JSON.stringify({
  gerado_por: "scripts/build_medication_table.mjs",
  fonte: "src/data/medications.js + src/data/medicationDoses.js (so os revisados)",
  medicamentos: medicationTable()
}, null, 2);

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`
    || process.argv[1]?.endsWith("build_medication_table.mjs")) {
  writeFileSync(destino, `${conteudo}\n`, "utf8");
  console.log(`${catalogoConferido().length} medicamentos revisados escritos em src/data/medications.json`);
}
