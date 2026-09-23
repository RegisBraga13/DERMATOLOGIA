import { normalizeText } from "./textFormat.js";

// A linha de medicamento, achatada com barras.
//
// A proposta de tratamento chega numa string so:
//
//   "Sertralina | Dose inicial: 50 mg/dia | Progressao: 50 mg a cada 2
//    semanas | Dose final: 150 mg/dia"
//
// e vai para a tela dentro de um <span>, inteira, em prosa corrida. Quem le
// tem de achar onde termina a posologia e comeca o alerta no meio de uma frase
// -- e o que ele esta lendo ali e o que vai assinalar e prescrever. Erro de
// leitura, aqui, sai na receita.
//
// A linha NAO muda. Ela e contrato: e o valor da caixa de marcar, e o formato
// que a narrativa, o Resumo e o Tratamento sabem ler quando remontam o
// prontuario. O que muda e so o desenho -- a mesma string, separada em titulo e
// campos na hora de exibir.
//
// Os rotulos sao uma lista fechada, e nao um palpite sobre o que vem antes dos
// dois pontos. Eles sao escritos por este programa (formatMedicationTreatmentOption,
// targetSymptomConductLines), entao sao conhecidos. Palpitar quebraria o que nao
// e rotulo: "Insonia · 1a opcao: Trazodona" tem dois pontos e e titulo, e um
// detalhe livre como "manha: 50mg" viraria campo "manha". Segmento que nao esta
// na lista sai como texto, que e o pior caso aceitavel -- igual ao de hoje.
const ROTULOS = Object.freeze([
  "Dose inicial", "Dose final", "Dose alvo", "Progressão", "Titulação",
  "Interação", "Apresentação", "Posologia", "Alerta", "Limite",
  "Evitar com", "Efeitos colaterais", "Monitorização", "Observação"
]);

const ROTULOS_NORMALIZADOS = new Map(ROTULOS.map(rotulo => [normalizeText(rotulo), rotulo]));

export function optionParts(linha = "") {
  const pedacos = String(linha || "").split("|").map(pedaco => pedaco.trim()).filter(Boolean);
  const titulo = pedacos.shift() || "";
  const partes = pedacos.map(pedaco => {
    const corte = pedaco.indexOf(":");
    if (corte <= 0) return { rotulo: "", valor: pedaco };
    const rotulo = ROTULOS_NORMALIZADOS.get(normalizeText(pedaco.slice(0, corte).trim()));
    if (!rotulo) return { rotulo: "", valor: pedaco };
    const valor = pedaco.slice(corte + 1).trim();
    // "Dose inicial:" sem valor nao vira campo vazio: rotulo sozinho afirma que
    // nao ha dose, e o que houve foi a IA nao ter dito.
    return valor ? { rotulo, valor } : { rotulo: "", valor: pedaco };
  });
  return { titulo, partes };
}

// A linha tem estrutura para mostrar? Uma opcao sem barras -- "Psicoterapia
// cognitivo-comportamental" -- continua sendo uma frase, e uma frase nao vira
// tabela de um campo so.
export function hasOptionParts(linha = "") {
  return optionParts(linha).partes.length > 0;
}
