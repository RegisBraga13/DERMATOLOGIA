// Mede a recuperacao no acervo de DIRETRIZES contra testes/diretrizes_corpus.json.
//
//     node scripts/avaliar_diretrizes.mjs              # tabela por grupo
//     node scripts/avaliar_diretrizes.mjs --limiares   # varredura de limiar
//     node scripts/avaliar_diretrizes.mjs --detalhe    # cada caso, com os arquivos que voltaram
//
// Precisa de OPENAI_API_KEY e OPENAI_GUIDELINES_VECTOR_STORE_ID no .env, e do
// acervo ja indexado (scripts/ingest_guidelines.py). Nao precisa do servidor no
// ar: a busca vai direto ao vector store, que e o que se quer medir. Cada caso
// e uma chamada real.
//
// A CONSULTA VEM DO PROPRIO APP.
//
// buildRagQuery e importado de src/services/clinicalAiService.js, e nao
// reescrito aqui. Uma consulta remontada a mao mede uma consulta que nao
// existe: bastaria o app mudar a composicao -- como ja mudou, quando as listas
// leigas afogavam o termo clinico -- para a medicao continuar dando o numero
// antigo de um comportamento que acabou.
//
// O QUE SE MEDE, e por que cada grupo esta no corpus:
//
//   faixa        pares do mesmo diagnostico em idades diferentes. E a unica
//                coisa que a consulta das diretrizes faz de diferente. Se os
//                dois casos do par recuperarem o MESMO arquivo, levar a idade
//                nao esta servindo para nada -- e a crianca recebe conduta de
//                adulto, que e o erro ja registrado no RAG.md.
//   diferencial  casos cuja resposta exige mais de um arquivo. Sao a prova da
//                decisao de nao filtrar por transtorno.
//   cobertura    um caso por prateleira.
//   fora         quadros nao psiquiatricos. Aqui acertar e RECUSAR.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildRagQuery } from "../src/services/clinicalAiService.js";

const API = "https://api.openai.com/v1/vector_stores/{id}/search";
const detalhe = process.argv.includes("--detalhe");
const varrer = process.argv.includes("--limiares");
const LIMIARES = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65];

function lerEnv() {
  const env = {};
  try {
    for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
      const corte = linha.indexOf("=");
      if (corte < 0 || linha.trim().startsWith("#")) continue;
      env[linha.slice(0, corte).trim()] = linha.slice(corte + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  } catch { /* sem .env: cai nas variaveis de ambiente */ }
  return env;
}

const raizDoProjeto = fileURLToPath(new URL("..", import.meta.url));
const env = lerEnv();
const chave = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
const store = process.env.OPENAI_GUIDELINES_VECTOR_STORE_ID || env.OPENAI_GUIDELINES_VECTOR_STORE_ID;
if (!chave || !store) {
  console.error("Falta OPENAI_API_KEY e/ou OPENAI_GUIDELINES_VECTOR_STORE_ID.");
  console.error("Indexe primeiro:  python scripts/ingest_guidelines.py \"C:/Users/Regis/diretrizes\"");
  process.exit(1);
}

const { casos } = JSON.parse(readFileSync(new URL("../testes/diretrizes_corpus.json", import.meta.url), "utf8"));

// O caso do corpus e a hipotese ja fechada: e assim que o Tratamento chega ao
// modo Guidelines, com o diagnostico assinalado pelo medico. "Outro" e a caixa
// de escrita livre da tela de Diagnostico -- o mesmo caminho de quem escreve o
// diagnostico a mao e vai direto para o Tratamento.
//
// `queixa` carrega os achados porque a consulta real os carrega: buildRagQuery
// monta o trecho "Dados clinicos relevantes" a partir deles. Medir so com o
// nome do diagnostico calibraria o limiar numa consulta curta que o app nunca
// manda, e o numero nao valeria para a consulta de verdade.
function formDoCaso(caso) {
  return {
    diagnosticoSelecionado: ["Outro"],
    diagnosticoMedicoOutro: caso.diagnostico,
    queixa: caso.sintomas || ""
  };
}

// Erro 5xx aqui e a borda da CDN, e nao a resposta do acervo. Na primeira
// medicao dois casos morreram com 520 e 522 e sairam da conta -- "8/8" quando o
// denominador real era 10. Numero que some por falha de rede mente para o lado
// otimista, entao a tentativa se repete e so desiste depois de insistir.
async function buscar(query, tentativas = 4, titulos = null) {
  let ultimo;
  for (let n = 1; n <= tentativas; n += 1) {
    const resposta = await fetch(API.replace("{id}", encodeURIComponent(store)), {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      // Mesmos parametros do server.py. rewrite_query desligado: medido em
      // 28/08/2026, a reescrita e nao-deterministica e a MESMA consulta trazia 8
      // trechos numa rodada e 0 na seguinte.
      body: JSON.stringify({
        query,
        // A busca garantida traz poucos trechos, como no server.py: ela
        // COMPLEMENTA a geral, e nao a substitui.
        max_num_results: titulos ? 4 : 8,
        rewrite_query: false,
        ...(titulos ? { filters: { type: "or", filters: titulos.map(t => ({ type: "eq", key: "titulo", value: t })) } } : {})
      })
    });
    if (resposta.ok) return processar(await resposta.json());
    ultimo = `${resposta.status} ${(await resposta.text()).slice(0, 120)}`;
    // 4xx nao melhora com espera: chave errada, store errada, consulta invalida.
    if (resposta.status < 500 && resposta.status !== 429) break;
    await new Promise(r => setTimeout(r, 1000 * 2 ** (n - 1)));
  }
  throw new Error(ultimo);
}

function processar({ data = [] }) {
  // Um arquivo pode voltar em mais de um trecho; o que interessa e a melhor
  // pontuacao dele, como o server.py ja faz ao montar a coluna de fontes.
  const porArquivo = new Map();
  for (const item of data) {
    const nome = item.filename || "sem-nome";
    const score = Number(item.score || 0);
    if (!porArquivo.has(nome) || score > porArquivo.get(nome)) porArquivo.set(nome, score);
  }
  return [...porArquivo].sort((a, b) => b[1] - a[1]).map(([arquivo, score]) => ({ arquivo, score }));
}

// OS TITULOS GARANTIDOS VEM DO SERVIDOR, e nao de uma copia da regra aqui.
//
// A escolha do documento da entidade e feita por guideline_entity_matches, no
// server.py. Reimplementa-la em JavaScript para medir criaria duas regras que
// divergem em silencio -- e a medicao passaria a descrever a copia, e nao o que
// o app faz. Mesma razao pela qual a consulta vem do buildRagQuery do app.
function titulosGarantidos(casos) {
  const entrada = JSON.stringify(casos.map(c => ({
    id: c.id,
    diagnostico: c.diagnostico,
    // A faixa e derivada da data de nascimento, como ragPatientScopes faz.
    infantojuvenil: c.paciente?.nascimento
      ? (new Date("2026-09-23") - new Date(c.paciente.nascimento)) / 31557600000 < 18
      : false
  })));
  const python = spawnSync("python", ["-c", `
import json, sys
sys.path.insert(0, ".")
import server
casos = json.loads(sys.stdin.read())
print(json.dumps({c["id"]: server.guideline_entity_matches(c["diagnostico"], c["infantojuvenil"])
                  for c in casos}, ensure_ascii=False))
`], {
    input: entrada,
    encoding: "utf8",
    cwd: raizDoProjeto,
    // Sem isto o Python escreve o stdout na codificacao do console do Windows e
    // os acentos dos titulos voltam corrompidos. O titulo e usado como filtro
    // EXATO na busca, entao um acento perdido nao da erro: da zero resultado, e
    // a medicao passa a dizer que a busca garantida nao encontrou nada.
    env: { ...process.env, PYTHONIOENCODING: "utf-8" }
  });
  if (python.status !== 0) {
    console.error("Nao consegui perguntar ao server.py quais documentos sao garantidos:");
    console.error((python.stderr || "").slice(-600));
    process.exit(1);
  }
  return JSON.parse(python.stdout);
}

const catalogo = JSON.parse(readFileSync(new URL("../guidelines_sources.local.json", import.meta.url), "utf8")).sources;
const garantidosPorCaso = titulosGarantidos(casos);

const resultados = [];
for (const caso of casos) {
  const query = buildRagQuery("treatment", formDoCaso(caso), { paciente: caso.paciente });
  const titulos = garantidosPorCaso[caso.id] || [];
  try {
    const geral = await buscar(query);
    // A busca garantida entra NA FRENTE, como o server.py a monta: o que se
    // garante e a vaga e a posicao.
    // O documento garantido e PROMOVIDO, e nao acrescentado: o que a busca
    // geral trouxe dele sai de onde estava. Filtrar o garantido por ja estar na
    // geral -- como esta medicao fazia -- media o contrario do que o server.py
    // faz, e dava 13/21 num acervo em que o casamento por entidade ja acertava.
    // Ordem do CASAMENTO POR ENTIDADE, e nao do escore -- como no server.py.
    // Ordenar por escore aqui desfaz a decisao que a busca garantida acabou de
    // tomar: o trecho da distimia pontuava mais alto que o da depressao maior.
    const porTitulo = new Map(catalogo.map(x => [x.filename, x.titulo]));
    const garantidas = (titulos.length ? await buscar(query, 4, titulos) : [])
      .sort((a, b) => titulos.indexOf(porTitulo.get(a.arquivo)) - titulos.indexOf(porTitulo.get(b.arquivo)));
    const promovidos = new Set(garantidas.map(f => f.arquivo));
    const fontes = [...garantidas, ...geral.filter(g => !promovidos.has(g.arquivo))];
    resultados.push({ caso, query, titulos, fontes });
  } catch (erro) {
    resultados.push({ caso, query, titulos, fontes: [], erro: erro.message });
  }
}

const acimaDe = (fontes, limiar) => fontes.filter(f => f.score >= limiar);
const posicaoDe = (fontes, esperado) => fontes.findIndex(f => f.arquivo === esperado) + 1;

if (varrer) {
  // O limiar 0.55 veio da biblioteca dos LIVROS, e diretriz tem outra prosa.
  // Esta tabela e o que decide se ele serve: onde a cobertura ainda esta alta e
  // os casos "fora" ja recusam.
  console.log("\n== Varredura de limiar (herdado dos livros: 0.55)\n");
  console.log("limiar  esperado recuperado  fontes/caso  casos 'fora' que passam");
  for (const limiar of LIMIARES) {
    let acertos = 0, alvos = 0, soma = 0, ruido = 0;
    for (const { caso, fontes } of resultados) {
      const passou = acimaDe(fontes, limiar);
      soma += passou.length;
      if (caso.grupo === "fora") { if (passou.length) ruido += 1; continue; }
      for (const esperado of caso.esperado) {
        alvos += 1;
        if (passou.some(f => f.arquivo === esperado)) acertos += 1;
      }
    }
    const fora = resultados.filter(r => r.caso.grupo === "fora").length;
    console.log(`${limiar.toFixed(2)}    ${String(acertos).padStart(3)}/${String(alvos).padEnd(3)}        `
      + `${(soma / resultados.length).toFixed(1).padStart(4)}         ${ruido}/${fora}`);
  }
  console.log("\nLinha sempre igual = o limiar por trecho NAO separa nada neste acervo.");
  console.log("Foi o que a primeira medicao mostrou, e e por isso que existe o piso abaixo.\n");
}

// SE ALGUM CORTE POR ESCORE SEPARARIA ruido de acerto.
//
// A tentativa esta aqui porque a resposta muda com o acervo, e quem indexar
// mais diretrizes vai querer refaze-la. Em 23/09/2026 a resposta foi NAO: o
// melhor escore de um caso de hipertensao (0.839) ficou dois milesimos abaixo
// do melhor escore de um caso legitimo de borderline (0.841), que ate acertou o
// arquivo. Corte nessa faixa recusa caso legitimo ou aceita hipertensao.
const melhorDe = fontes => fontes[0]?.score || 0;
const legitimos = resultados.filter(r => r.caso.grupo !== "fora" && !r.erro);
const foraDoAcervo = resultados.filter(r => r.caso.grupo === "fora" && !r.erro);
const faixa = lista => lista.map(r => melhorDe(r.fontes)).sort((a, b) => a - b);
const legit = faixa(legitimos), ruido = faixa(foraDoAcervo);
// A PORTA DE RECUSA, que e o comportamento entregue. Ela nao olha escore: o
// server.py recusa quando o casamento por entidade nao encontra documento
// nenhum. Sem esta secao a medicao reportava a busca crua e dizia "13/13
// recuperaram alguma coisa", como se o app fosse responder a todos eles.
{
  const foraR = resultados.filter(r => r.caso.grupo === "fora");
  const legitR = resultados.filter(r => r.caso.grupo !== "fora");
  console.log("== Porta de recusa (casamento por entidade, nao escore)\n");
  console.log(`recusa correta  ${foraR.filter(r => !r.titulos.length).length}/${foraR.length} casos fora do acervo`);
  console.log(`aceite correto  ${legitR.filter(r => r.titulos.length).length}/${legitR.length} casos legitimos`);
  const passam = foraR.filter(r => r.titulos.length).map(r => r.caso.id);
  if (passam.length) console.log(`\nfora do acervo que ainda passam: ${passam.join(", ")}`);
  const barrados = legitR.filter(r => !r.titulos.length).map(r => r.caso.id);
  console.log(barrados.length ? `RECUSA FALSA: ${barrados.join(", ")}` : "nenhuma recusa falsa");
  console.log("");
}

console.log("== Algum corte por escore separaria?\n");
console.log(`melhor escore, legitimos: ${legit[0]?.toFixed(3)} a ${legit.at(-1)?.toFixed(3)}  (n=${legit.length})`);
console.log(`melhor escore, fora:      ${ruido[0]?.toFixed(3)} a ${ruido.at(-1)?.toFixed(3)}  (n=${ruido.length})`);
const folga = (legit[0] || 0) - (ruido.at(-1) || 0);
console.log(folga > 0.05
  ? `\nfolga de ${folga.toFixed(3)}: da para cortar. Um piso no meio da folga separaria os dois grupos.`
  : `\nfolga de ${folga.toFixed(3)}: NAO da para cortar. Os grupos se tocam, e qualquer numero`
    + `\nescolhe entre recusar caso legitimo e aceitar caso de fora. O escore nao e o instrumento.`);
console.log(`AMOSTRA DE NEGATIVOS: ${ruido.length}. Poucos para fixar um corte de seguranca.\n`);

// TOP-1: o arquivo que ficou em PRIMEIRO e o que mais pesa no contexto do
// modelo. "O esperado apareceu entre os oito" e criterio fraco demais -- foi
// ele que deu 10/10 em cobertura enquanto o caso de Alzheimer era encabecado
// por um documento de transtorno de personalidade.
console.log("== O arquivo certo ficou em primeiro?\n");
let top1 = 0, comGabarito = 0;
for (const { caso, fontes, erro } of resultados) {
  if (erro || !caso.esperado.length) continue;
  comGabarito += 1;
  const primeiro = fontes[0]?.arquivo || "(nenhuma)";
  if (caso.esperado.includes(primeiro)) { top1 += 1; continue; }
  console.log(`  ${caso.id.padEnd(34)} veio ${primeiro}`);
  console.log(`  ${"".padEnd(34)} esperado ${caso.esperado.join(" ou ")}`);
}
console.log(`\n${top1}/${comGabarito} casos com o arquivo esperado em primeiro lugar.\n`);

const limiarAtual = Number(process.env.OPENAI_RAG_SCORE_THRESHOLD || env.OPENAI_RAG_SCORE_THRESHOLD || 0.55);
const grupos = {};
for (const { caso, fontes, erro } of resultados) {
  const g = (grupos[caso.grupo] ||= { casos: 0, alvos: 0, achados: 0, erros: 0, vazios: 0, falhas: [] });
  g.casos += 1;
  if (erro) { g.erros += 1; g.falhas.push(`${caso.id}: ${erro}`); continue; }
  const passou = acimaDe(fontes, limiarAtual);
  if (!passou.length) g.vazios += 1;
  for (const esperado of caso.esperado) {
    g.alvos += 1;
    const posicao = posicaoDe(passou, esperado);
    if (posicao) g.achados += 1;
    else g.falhas.push(`${caso.id}: nao recuperou ${esperado}`);
  }
}

console.log(`\n== Recuperacao no limiar ${limiarAtual}\n`);
for (const [nome, g] of Object.entries(grupos)) {
  if (nome === "fora") {
    // A busca crua responde a todos, porque busca vetorial sempre devolve o
    // menos ruim. Quem os barra e a porta de recusa, medida na secao de cima.
    console.log(`${nome.padEnd(12)} ${g.casos - g.vazios}/${g.casos} recuperariam algo na busca crua `
      + `(a porta de recusa e quem barra -- ver secao acima)`);
    continue;
  }
  console.log(`${nome.padEnd(12)} ${g.achados}/${g.alvos} arquivos esperados recuperados`
    + `${g.vazios ? `, ${g.vazios} caso(s) sem fonte nenhuma` : ""}`
    + `${g.erros ? `, ${g.erros} chamada(s) falharam` : ""}`);
  g.falhas.forEach(linha => console.log(`             ${linha}`));
}

// O par so passa se os dois lados recuperarem arquivos DIFERENTES. Recuperar o
// arquivo certo da crianca nao basta: se o de adulto vier junto e na frente, a
// conduta sai do arquivo errado do mesmo jeito.
const pares = {};
for (const { caso, fontes } of resultados) {
  if (caso.grupo !== "faixa") continue;
  (pares[caso.par] ||= []).push({ caso, topo: acimaDe(fontes, limiarAtual)[0]?.arquivo || "(nenhuma)" });
}
console.log("\n== A idade separa o par?\n");
for (const [par, lados] of Object.entries(pares)) {
  const separou = lados.length === 2 && lados[0].topo !== lados[1].topo;
  console.log(`${separou ? "sim " : "NAO "} ${par.padEnd(10)} ${lados.map(l => `${l.caso.id} -> ${l.topo}`).join("   |   ")}`);
}

if (detalhe) {
  console.log("\n== Caso a caso\n");
  for (const { caso, query, fontes, erro } of resultados) {
    console.log(`-- ${caso.id}${erro ? `  ERRO: ${erro}` : ""}`);
    console.log(`   consulta: ${query.slice(0, 160)}`);
    acimaDe(fontes, limiarAtual).forEach(f => console.log(`   ${f.score.toFixed(3)}  ${f.arquivo}`));
    const abaixo = fontes.filter(f => f.score < limiarAtual);
    abaixo.forEach(f => console.log(`   ${f.score.toFixed(3)}  ${f.arquivo}   (abaixo do limiar)`));
    if (!fontes.length) console.log("   (nenhuma fonte)");
  }
}
console.log("");
