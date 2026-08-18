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
      ${medicationNameLinks(form.medicationGeneric || form.medicationNameText)}
    </article>
  `;
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
