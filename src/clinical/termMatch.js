import { normalizeText } from "./textFormat.js";

// Dizer se um termo ja esta escrito num texto, sem IA e sem lista de sinonimos:
// compara as raizes (cinco letras) das palavras de conteudo. "Alucinacoes
// auditivas" e "alucinacao auditiva" caem na mesma raiz. E propositalmente
// grosseiro: errar para o lado de dizer "ja esta escrito" so deixa de repetir
// uma frase, e o achado continua inteiro na tela do Diagnostico.
const STOPWORDS = new Set(["para", "com", "que", "sua", "seu", "suas", "seus", "uma", "dos", "das", "por", "sem", "entre"]);

export function stemsOf(text = "") {
  return normalizeText(text).split(/[^a-z0-9]+/)
    .filter(word => word.length > 3 && !STOPWORDS.has(word))
    .map(word => word.slice(0, 5));
}

export function termAlreadyWritten(term, writtenStems) {
  const stems = stemsOf(term);
  if (!stems.length) return true;
  const found = stems.filter(stem => writtenStems.has(stem)).length;
  return stems.length <= 2 ? found === stems.length : found / stems.length >= 0.75;
}
