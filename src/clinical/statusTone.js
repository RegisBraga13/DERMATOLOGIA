import { normalizeText } from "./textFormat.js";

// Falha e sucesso saiam no mesmo cinza.
//
// As caixas de status da IA -- Diagnostico, Tratamento, Ajuste de conduta,
// Medicamentos, Apendice -- usam todas a mesma classe. "3 opcoes propostas para
// voce assinalar" e "IA indisponivel: timeout" chegavam com a mesma cor, o
// mesmo peso e o mesmo lugar na tela. Uma falha que se parece com sucesso e uma
// falha que passa despercebida: ele espera a proposta, ve uma linha cinza onde
// ela costuma aparecer, e segue.
//
// Mesmo defeito que o aviso de bula tinha antes de 22/09/2026 -- aviso que nao
// se distingue do normal nao e aviso.
//
// O tom NAO e adivinhado do texto por acaso: as falhas sao cunhadas aqui, por
// `statusFailure`, na unica forma que o classificador reconhece. Quem escreve o
// status passa o assunto e o motivo; a forma "<assunto>: <motivo>." sai igual
// nos seis lugares, e o teste prende as duas pontas. As marcas soltas abaixo
// cobrem o que ficou gravado em prontuario ANTES de esta funcao existir, e nada
// mais -- status novo que nao passe por aqui e erro de quem escreveu, e o teste
// acusa.
export const TOM = Object.freeze({ falha: "falha", espera: "espera", feito: "feito" });

// "indisponivel" e "sem resposta" sao as formas que `statusFailure` produz. O
// resto e prontuario antigo.
const MARCAS_DE_FALHA = Object.freeze([
  "indisponivel", "sem resposta", "nao foi possivel", "nao carregou",
  "falhou", "sem conexao", "nao respondeu"
]);

// Verbo no gerundio, que e como este programa escreve espera: "Consultando a
// literatura...", "Abrindo o capitulo...". Reticencias sozinhas nao bastam --
// uma frase pode terminar em "..." sem estar esperando nada.
const MARCAS_DE_ESPERA = Object.freeze([
  "consultando", "carregando", "pesquisando", "abrindo", "analisando",
  "gerando", "verificando", "aguarde"
]);

// A unica forma de escrever falha de status no programa. Recebe o assunto ("IA
// indisponivel"), o motivo tecnico (`error.message`) e, quando houver, a saida
// que sobra para ele.
export function statusFailure(assunto, motivo = "", saida = "") {
  const causa = String(motivo || "").trim().replace(/[.\s]+$/, "");
  const cabeca = `${String(assunto || "Falha").trim()}: ${causa || "sem detalhe da causa"}.`;
  const escape = String(saida || "").trim();
  return escape ? `${cabeca} ${escape}` : cabeca;
}

export function statusTone(texto = "") {
  const limpo = normalizeText(texto).trim();
  if (!limpo) return "";
  // Falha antes de espera: "Consultando..." nunca convive com "indisponivel",
  // mas se um dia conviver, o que importa e a falha.
  if (MARCAS_DE_FALHA.some(marca => limpo.includes(marca))) return TOM.falha;
  if (MARCAS_DE_ESPERA.some(marca => limpo.includes(marca))) return TOM.espera;
  return TOM.feito;
}

// A classe que a tela acrescenta. Sucesso nao ganha classe: ele e o normal, e o
// normal ja e o cinza que a caixa tem.
export function statusToneClass(texto = "") {
  const tom = statusTone(texto);
  return tom === TOM.falha ? "status-falha" : tom === TOM.espera ? "status-espera" : "";
}

// Falha e anunciada na hora ao leitor de tela; espera e sucesso entram na fila
// educada, para nao interromper o que ele esta lendo.
export function statusToneRole(texto = "") {
  return statusTone(texto) === TOM.falha ? "alert" : "status";
}
