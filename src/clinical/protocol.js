// Motor do Refinamento.
//
// Antes, a IA inventava de 3 a 8 perguntas na hora. Elas costumavam ser boas,
// mas nao vinham de lugar nenhum: nao havia como conferir de onde saiu a
// pergunta, nem saber o que ela deixou de perguntar.
//
// Aqui a lista e fechada — 436 perguntas extraidas de tres livros, com o
// trecho de origem em cada uma. A IA passa a ESCOLHER, nao a inventar. Id que
// nao existe no protocolo e descartado: pergunta inventada nao entra fingindo
// ser citada.
//
// O arquivo e gerado por scripts/build_protocol.py a partir do projeto
// vizinho, que continua sendo a fabrica.

let protocolo = null;

export async function loadProtocol() {
  if (protocolo) return protocolo;
  const resposta = await fetch("src/data/protocol/entrevista.json");
  if (!resposta.ok) throw new Error(`Protocolo de entrevista indisponivel (HTTP ${resposta.status}).`);
  protocolo = await resposta.json();
  return protocolo;
}

export function protocolLoaded() {
  return Boolean(protocolo);
}

function flatten(lista) {
  return (protocolo?.blocos || []).flatMap(bloco =>
    (bloco[lista] || []).map(item => ({ ...item, campo: bloco.campo })));
}

/** Toda pergunta do protocolo, achatada, com o bloco de origem em cada uma. */
export function protocolQuestions() {
  return flatten("perguntas");
}

/** Sinais de alerta do protocolo — substituem as red flags que a IA inventava. */
export function protocolAlerts() {
  return flatten("sinais_de_alerta");
}

/** Os itens que os proprios livros marcam como imprescindiveis. */
export function protocolMandatory() {
  return flatten("obrigatorio");
}

/** Devolve o item do protocolo pelo id, seja pergunta, obrigatorio ou sinal. */
export function protocolItemById(id = "") {
  if (!id) return null;
  return [...protocolQuestions(), ...protocolMandatory(), ...protocolAlerts()]
    .find(item => item.id === id) || null;
}

// O catalogo que vai ao prompt, uma linha por item. Mandar os objetos
// inteiros custava 40 mil tokens por refinamento; assim custa 27 mil.
//
// So o `quando` sobrevive ao corte, porque so ele guia a escolha: e o campo
// que diz em que situacao a pergunta cabe. O `por_que` do obrigatorio e a
// `conduta` do sinal nao ajudam a escolher — o app os busca pelo id depois de
// a IA responder, e eles chegam inteiros a tela.
//
// O catalogo e identico em toda consulta. Por isso vai na frente do prompt,
// antes dos dados do paciente: assim o trecho estavel pode ser reaproveitado
// pelo cache do modelo, e so a parte que muda e cobrada de novo.
/**
 * Os 31 blocos, um por linha, com o que cada um cobre.
 *
 * Etapa 1 do refinamento. O catalogo inteiro pede 33 mil tokens e a conta tem
 * teto de 30 mil por minuto: a requisicao nao passava. Entao a IA escolhe
 * primeiro os blocos — isto aqui custa uns 2 mil tokens — e so depois recebe
 * as perguntas dos blocos escolhidos.
 *
 * A escolha continua sendo dela, de lista fechada. O que mudou foi a ordem,
 * nao quem decide.
 */
export function protocolBlocksText(limiteAchados = 6) {
  return (protocolo?.blocos || []).map(bloco => {
    const cobre = (bloco.achados || [])
      .slice(0, limiteAchados)
      .map(achado => achado.achado)
      .filter(Boolean)
      .join(", ");
    return `${bloco.campo} | ${bloco.perguntas?.length || 0} perguntas | cobre: ${cobre}`;
  }).join("\n");
}

/** Etapa 2: so os blocos escolhidos. Bloco desconhecido e ignorado. */
export function protocolCatalogText(campos = null, limiteQuando = 140) {
  const querido = campos?.length ? new Set(campos) : null;
  const doEscopo = itens => (querido ? itens.filter(item => querido.has(item.campo)) : itens);
  const perguntas = doEscopo(protocolQuestions())
    .map(item => `${item.id} | ${item.pergunta} | quando: ${String(item.quando || "").slice(0, limiteQuando)}`);
  const obrigatorios = doEscopo(protocolMandatory()).map(item => `${item.id} | ${item.item}`);
  const sinais = doEscopo(protocolAlerts()).map(item => `${item.id} | ${item.sinal}`);
  return [
    "PERGUNTAS DO PROTOCOLO (escolha por id; nao invente pergunta):",
    perguntas.join("\n"),
    "",
    "ITENS QUE OS LIVROS MARCAM COMO IMPRESCINDIVEIS:",
    obrigatorios.join("\n"),
    "",
    "SINAIS DE ALERTA DO PROTOCOLO:",
    sinais.join("\n")
  ].join("\n");
}
