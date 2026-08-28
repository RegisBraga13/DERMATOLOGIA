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
      <div class="medication-priority-grid">
        ${medicationPriorityFact("Princípio ativo", form.medicationActiveIngredient || form.medicationNameText)}
        ${medicationPriorityFact("Apresentação", form.medicationPresentationHighlight)}
        ${medicationPriorityFact("Dose recomendada", form.medicationRecommendedDose)}
        ${medicationPriorityFact("Principais efeitos colaterais", form.medicationMainEffects)}
      </div>
      <div class="medication-facts-grid">
        ${medicationFact("Indicações e uso clínico", form.medicationBestUse)}
        ${medicationFact("Posologia e progressão", form.medicationPresentation)}
        ${medicationFact("Segurança, contraindicações e interações", form.medicationSafety)}
        ${medicationFact("Mecanismo e receptores", form.medicationMechanism)}
        ${medicationFact("Monitorização", form.medicationMonitoring)}
        ${medicationFact("Populações especiais", form.medicationSpecialPopulations)}
      </div>
      ${bippTips(form.medicationTips)}
      ${medicationNameLinks(form.medicationGeneric || form.medicationNameText)}
    </article>
  `;
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
    return `<p class="medication-source-status">${escapeHtml(form.medicationChapterStatus)}</p>`;
  }
  const capitulo = form.medicationChapter;
  if (!Array.isArray(capitulo?.blocos) || !capitulo.blocos.length) return "";
  const corpo = capitulo.blocos.filter(bloco => bloco.t !== "titulo").map(chapterBlock).join("");
  return `<section class="book-chapter">
    <header>
      <h3>${escapeHtml(capitulo.nome)}</h3>
      <p class="medication-bipp-source">${escapeHtml(capitulo.livro)} — capítulo integral, sem as referências</p>
    </header>
    ${corpo}
  </section>`;
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

function medicationPriorityFact(title, value) {
  if (!value) return "";
  return `<section class="medication-priority-fact"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong></section>`;
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
