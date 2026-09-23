// Extrai posologia da biblioteca RAG para os farmacos que ainda nao tem
// entrada no catalogo, e deixa tudo AGUARDANDO REVISAO.
//
// Decisao dele, 23/09/2026: ampliar o catalogo de 9 farmacos extraindo da
// literatura indexada, com o visto dele antes de qualquer valor valer.
//
// COMO FUNCIONA. Reaproveita a etapa `medication` do proprio programa, que ja
// existe e ja responde exatamente estes campos -- dose inicial, titulacao,
// dose-alvo, teto -- lendo o Guia de Prescricao pelo RAG, com `ragMustMention`
// garantindo que os trechos recuperados falem DAQUELE farmaco. Nao ha prompt
// novo nem schema novo aqui: se a etapa responde bem na tela, responde bem
// aqui.
//
// O QUE ELE ESCREVE. `src/data/medicationDoses.js`, com `revisado: false` em
// toda entrada e as obras citadas em `fontes`. Enquanto `revisado` for false, o
// farmaco se comporta como se nao estivesse no catalogo (medicationCatalog.js).
// Rodar isto NAO muda nada do que a tela confere hoje.
//
// USO. Com o servidor no ar (`python server.py`):
//
//   node scripts/extrair_posologia.mjs --limite 5
//   node scripts/extrair_posologia.mjs --farmaco Lamotrigina
//   node scripts/extrair_posologia.mjs            # todos os que faltam
//
// Ele retoma de onde parou: farmaco ja escrito no arquivo nao e pedido de
// novo, e cada chamada gasta cota. Ctrl-C a qualquer momento nao perde o que
// ja foi extraido -- o arquivo e regravado a cada farmaco.
import { readFileSync, writeFileSync } from "node:fs";
import { catalogoConferido } from "../src/data/medicationCatalog.js";
import { extractedDoses } from "../src/data/medicationDoses.js";
import { DRUG_NAMES } from "../src/data/drugNames.js";

const SERVIDOR = process.env.PRONTUARIO_URL || "http://127.0.0.1:8000";
const DESTINO = new URL("../src/data/medicationDoses.js", import.meta.url);
// A pausa entre chamadas existe por causa do teto de tokens por minuto da
// conta. Sem ela, uma rodada de 120 farmacos vira uma fila de 429.
const PAUSA_MS = Number(process.env.PAUSA_MS || 4000);

const argumentos = process.argv.slice(2);
const valorDe = nome => {
  const indice = argumentos.indexOf(nome);
  return indice >= 0 ? argumentos[indice + 1] : null;
};
const limite = Number(valorDe("--limite") || 0);
const soUm = valorDe("--farmaco");

function normalizar(texto) {
  return String(texto || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function jaTem(nome) {
  const alvo = normalizar(nome);
  return [...catalogoConferido(), ...extractedDoses]
    .some(item => normalizar(item.generic) === alvo || alvo.includes(normalizar(item.generic)));
}

// O prompt da etapa e montado pelo front (buildClinicalAiPrompt) com o caso
// inteiro. Aqui nao ha caso: a pergunta e sobre o farmaco, e so. O servidor
// exige `prompt` nao vazio e valida o schema do jeito de sempre.
function promptDaFicha(nome) {
  return [
    "Voce e um assistente de psicofarmacologia. Responda em portugues do Brasil.",
    "TAREFA:",
    `- Preencha a ficha posologica de ${nome} para paciente ADULTO, usando exclusivamente as FONTES recuperadas.`,
    "- 'initial_dose', 'target_dose' e 'ceiling' em mg/dia, com o numero. Havendo faixa, escreva 'X a Y mg/dia'.",
    "- 'titration' diz de quanto em quanto tempo se aumenta, com o intervalo em dias ou semanas.",
    "- Nao invente: campo que as fontes nao sustentarem volta vazio.",
    "",
    `Medicamento pesquisado: ${nome}.`,
    "FORMATO DA RESPOSTA:",
    "Objeto estruturado conforme o schema, sem texto adicional."
  ].join("\n");
}

async function ficha(nome) {
  const resposta = await fetch(`${SERVIDOR}/api/clinical-ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SERVIDOR },
    body: JSON.stringify({
      kind: "medication",
      prompt: promptDaFicha(nome),
      mode: "rag",
      ragQuery: `${nome}: dose inicial, titulacao, dose alvo, dose maxima em adultos`,
      // A guarda que o proprio programa usa nesta etapa: trecho que nao cita o
      // farmaco nao vale como fonte sobre ele.
      ragMustMention: nome
    })
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.error || `HTTP ${resposta.status}`);
  return dados;
}

function entradaDoResultado(nome, dados) {
  const r = dados.result || {};
  return {
    generic: nome,
    // FALSE ATE ELE CONFERIR. Enquanto for false, este farmaco nao entra em
    // conferencia de dose nem em julgamento de ensaio adequado.
    revisado: false,
    brands: "",
    className: String(r.class_and_mechanism || "").split(".")[0] || "",
    initialDose: r.initial_dose || "",
    usualDose: r.target_dose || "",
    ceiling: r.ceiling || "",
    progression: r.titration || "",
    // `avoid_with` e UM campo da ficha, e vira contraindicacao. Interacao
    // fica vazia de proposito: copiar o mesmo texto nos dois faria a ficha
    // afirmar duas coisas diferentes com a mesma frase.
    contraindications: r.avoid_with || "",
    interactions: "",
    fontes: (dados.sources || []).map(f => f.filename),
    extraido_em: new Date().toISOString().slice(0, 10)
  };
}

function gravar(entradas) {
  const cabecalho = readFileSync(DESTINO, "utf8").split("export const extractedDoses")[0];
  const corpo = entradas.length
    ? `export const extractedDoses = [\n${entradas.map(e => `  ${JSON.stringify(e, null, 2).replace(/\n/g, "\n  ")}`).join(",\n")}\n];\n`
    : "export const extractedDoses = [];\n";
  writeFileSync(DESTINO, cabecalho + corpo, "utf8");
}

const pendentes = (soUm ? [soUm] : DRUG_NAMES).filter(nome => !jaTem(nome));
const alvos = limite > 0 ? pendentes.slice(0, limite) : pendentes;

if (!alvos.length) {
  console.log("Nada a extrair: todos os farmacos pedidos ja tem entrada.");
  process.exit(0);
}

console.log(`${alvos.length} farmaco(s) a extrair de ${pendentes.length} pendente(s). Servidor: ${SERVIDOR}`);
const acumulado = [...extractedDoses];
let falhas = 0;
for (const [indice, nome] of alvos.entries()) {
  try {
    const dados = await ficha(nome);
    const entrada = entradaDoResultado(nome, dados);
    acumulado.push(entrada);
    gravar(acumulado);
    console.log(`[${indice + 1}/${alvos.length}] ${nome}: ${entrada.initialDose || "sem dose inicial"} -> `
      + `${entrada.usualDose || "sem dose alvo"} (${entrada.fontes.length} fonte(s))`);
  } catch (erro) {
    falhas += 1;
    // Farmaco que a biblioteca nao cobre devolve 422, e isso e resposta, nao
    // defeito: o acervo e de psiquiatria e nem todo nome da lista esta nele.
    console.log(`[${indice + 1}/${alvos.length}] ${nome}: NAO extraido -- ${erro.message}`);
  }
  if (indice < alvos.length - 1) await new Promise(r => setTimeout(r, PAUSA_MS));
}

console.log(`\n${acumulado.length - extractedDoses.length} entrada(s) nova(s), ${falhas} sem resposta.`);
console.log("Todas com revisado: false -- nenhuma vale antes do seu visto.");
console.log("Revise src/data/medicationDoses.js e, no que aprovar, troque para revisado: true.");
console.log("Depois: node scripts/build_medication_table.mjs && node --test 'testes/js/*.test.js'");
