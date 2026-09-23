import { statusLine } from "../ui/controls.js";
import { escapeHtml } from "../ui/html.js";

export function medicationReferenceCard(form) {
  return `
    <article class="medication-reference-card">
      <div class="medication-reference-title">
        <div>
          <span class="eyebrow">FICHA DO MEDICAMENTO</span>
          <h3>${escapeHtml(form.medicationNameText || form.medicationGeneric || "Medicamento")}</h3>
          ${form.medicationBrands ? `<p><strong>Nomes comerciais:</strong> ${escapeHtml(form.medicationBrands)}</p>` : ""}
        </div>
        ${form.medicationClass ? `<span class="medication-class">${escapeHtml(form.medicationClass)}</span>` : ""}
      </div>
      ${medicationBriefing(form)}
      ${legacyMedicationFacts(form)}
      ${bippTips(form.medicationTips)}
      ${medicationNameLinks(form.medicationGeneric || form.medicationNameText)}
    </article>
  `;
}

// A ficha telegrafica, desenhada por ele em 31/08/2026 diante da ficha da
// risperidona: "nao e essa enxurrada de informacao que interessa -- isso ai tem
// na bula". O formato saiu da boca dele, quase palavra por palavra --
// "antipsicotico atipico, antagonista do receptor ..., dose inicial x, aumento
// y por semana, ate dose n, evitar uso com h, efeitos colaterais ..., limite m".
//
// Classe e mecanismo abrem em linha inteira porque sao a frase que situa o
// farmaco; o resto vai em grade, que e como se consulta com a receita na mao.
// Campo vazio nao vira caixa: rotulo sem valor afirma que nao ha o que dizer, e
// nao e a mesma coisa que a IA nao ter dito.
function medicationBriefing(form) {
  const linha = [
    ["Dose inicial", form.medicationInitialDose],
    ["Titulação", form.medicationTitration],
    ["Dose alvo", form.medicationTargetDose],
    ["Limite", form.medicationCeiling],
    ["Evitar com", form.medicationAvoidWith],
    ["Efeitos colaterais", form.medicationSideEffects],
    ["Monitorização", form.medicationMonitoringShort]
  ].filter(([, valor]) => String(valor || "").trim());
  if (!String(form.medicationClassMechanism || "").trim() && !linha.length) return "";
  return `
    <div class="medication-briefing">
      ${form.medicationClassMechanism ? `<p class="medication-briefing-class">${escapeHtml(form.medicationClassMechanism)}</p>` : ""}
      <dl>${linha.map(([rotulo, valor]) => `
        <div><dt>${escapeHtml(rotulo)}</dt><dd>${escapeHtml(valor)}</dd></div>
      `).join("")}</dl>
    </div>`;
}

// Ficha gerada antes de 31/08/2026: tres campos de prosa longa. Prontuario
// salvo nao muda porque o programa mudou, entao ela continua sendo exibida --
// so que nunca mais e produzida.
function legacyMedicationFacts(form) {
  const antigos = [
    ["Indicações e uso clínico", form.medicationBestUse],
    ["Posologia e progressão", form.medicationPresentation],
    ["Segurança, contraindicações e interações", form.medicationSafety],
    ["Mecanismo e receptores", form.medicationMechanism],
    ["Monitorização", form.medicationMonitoring],
    ["Populações especiais", form.medicationSpecialPopulations]
  ].filter(([, valor]) => String(valor || "").trim());
  if (!antigos.length) return "";
  return `<div class="medication-facts-grid">${antigos.map(([rotulo, valor]) => medicationFact(rotulo, valor)).join("")}</div>`;
}

// Secao propria da Psicofarmacologia: Da Teoria a Clinica (2025), no fim do
// capitulo de cada farmaco. Vai em caixa separada, e nao dissolvida entre os
// outros fatos da ficha, porque nao e do mesmo tipo: os demais campos sao
// redigidos pela IA a partir da literatura, e este e reproduzido de uma secao
// que ja existe escrita no livro. A caixa diz de onde veio.
//
// Sem tips, nao ha caixa. Ha farmaco sem a secao no livro, e uma caixa vazia
// com o titulo do livro afirmaria que o livro nao tem nada a dizer sobre o
// farmaco — que e diferente de a secao nao existir.
function bippTips(value = "") {
  const itens = String(value || "").split(/\n{2,}/).map(item => item.trim()).filter(Boolean);
  if (!itens.length) return "";
  return `<section class="medication-bipp-tips">
    <h4>BIPP TIPS</h4>
    <p class="medication-bipp-source">Psicofarmacologia: Da Teoria à Clínica, 1ª ed., 2025</p>
    <ul>${itens.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
  </section>`;
}

// O capitulo sai do livro com quebras de linha de diagramacao: a frase quebra
// no meio porque a coluna acabou, e nao porque o paragrafo acabou. Remontar e o
// que faz o texto voltar a ser legivel na tela — respeitando o paragrafo, que e
// a linha em branco, e as linhas de item dos BIPP TIPS, que comecam com o
// marcador.
export function bookChapterView(form) {
  if (form.medicationChapterStatus) {
    return statusLine(form.medicationChapterStatus, "medication-source-status");
  }
  const capitulo = form.medicationChapter;
  if (!Array.isArray(capitulo?.blocos) || !capitulo.blocos.length) return "";
  const blocos = capitulo.blocos.filter(bloco => bloco.t !== "titulo");
  const corpo = blocos.map(chapterBlock).join("");
  const letras = blocos.reduce((total, bloco) => total + String(bloco.v || "").length, 0);
  // O cabecalho e o proprio botao de fechar: <details> guarda o aberto/fechado
  // no elemento, sem estado no rascunho e sem um terceiro botao na barra de
  // acoes.
  //
  // FECHADO por padrao desde 23/09/2026. Sao 13 a 30 mil caracteres de capitulo
  // por farmaco, e eles abriam entre a ficha e a conduta: escolher o
  // medicamento empurrava para fora da tela justamente o que ele foi ali
  // decidir. O capitulo continua carregando sozinho -- o que mudou foi so quem
  // pede para le-lo. O cabecalho diz o tamanho, para a decisao de abrir ser
  // tomada antes e nao depois da rolagem.
  return `<details class="book-chapter">
    <summary>
      <h3>${escapeHtml(capitulo.nome)}</h3>
      <p class="medication-bipp-source">${escapeHtml(capitulo.livro)} — capítulo integral, sem as referências${letras ? ` · ${Math.round(letras / 1000)} mil caracteres` : ""}</p>
    </summary>
    ${corpo}
  </details>`;
}

// O tipo do bloco vem do script que recortou o livro, e nao e adivinhado aqui:
// o que distingue um cabecalho de secao de um item dos BIPP TIPS e a marca de
// diagramacao do PDF, que a tela nao ve.
function chapterBlock(bloco = {}) {
  const texto = escapeHtml(String(bloco.v || ""));
  if (bloco.t === "secao") return `<h4>${texto}</h4>`;
  if (bloco.t === "item") return `<p class="book-chapter-item">${texto}</p>`;
  if (bloco.t === "rotulo") {
    // "ABSORCAO: Apos administracao oral..." — o rotulo em negrito, o valor
    // seguido, como no livro. Sem dois pontos, e cabecalho de campo sozinho.
    const corte = texto.indexOf(":");
    if (corte > 0) return `<p><strong>${texto.slice(0, corte + 1)}</strong>${texto.slice(corte + 1)}</p>`;
    return `<p><strong>${texto}</strong></p>`;
  }
  return `<p>${texto}</p>`;
}

function medicationFact(title, value) {
  if (!value) return "";
  return `<section class="medication-fact"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(value).replace(/\n/g, "<br>")}</p></section>`;
}

function medicationNameLinks(name = "") {
  if (!name) return "";
  return `<div class="medication-reference-links">
    <a href="https://consultas.anvisa.gov.br/#/medicamentos/" target="_blank" rel="noopener noreferrer">Consultar na Anvisa</a>
    <a href="https://www.google.com/search?q=${encodeURIComponent(`${name} bula profissional`)}" target="_blank" rel="noopener noreferrer">Bula profissional</a>
  </div>`;
}
