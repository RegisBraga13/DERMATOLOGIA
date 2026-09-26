import { optionGroups } from "../data/examOptions.js";
import { field, singleChoiceWithNotes } from "../ui/controls.js";

// Quem estava na sala, alem do paciente -- por consulta, nao por cadastro: o
// acompanhante muda de um atendimento para o outro (a mae que traz a crianca
// hoje pode nao ser quem traz da proxima vez), e por isso o registro vive em
// draft.consultation, nunca no paciente.
//
// Importa em quadros graves, em sofrimento agudo, em crianca/adolescente e em
// idoso: nesses casos a historia pode vir por um informante, e nao so pelo
// proprio paciente, e o prontuario precisa dizer QUEM contou o que.
export function companionCard(form = {}) {
  const presente = form.acompanhantePresente || "";
  const sugerirConfirmar = Boolean(form.multipleSpeakersDetected) && !presente;
  return `<div class="clinical-card companion-card">
    <h4>Acompanhante</h4>
    ${sugerirConfirmar ? `<p class="field-hint">Mais de dois participantes foram identificados na conversa. Confirme se havia acompanhante.</p>` : ""}
    ${singleChoiceWithNotes("acompanhantePresente", "Havia acompanhante presente?", ["Sim", "Não"], presente)}
    ${presente === "Sim" ? `
      ${singleChoiceWithNotes("acompanhanteVinculo", "Vinculo com o paciente", optionGroups.acompanhanteVinculo, form.acompanhanteVinculo, form)}
      ${field("acompanhanteNome", "Nome do acompanhante", form.acompanhanteNome)}
      ${singleChoiceWithNotes("historiaInformantePrincipal", "Quem relatou a maior parte da historia", ["O(a) próprio(a) paciente", "Acompanhante", "Paciente e acompanhante"], form.historiaInformantePrincipal)}
    ` : ""}
  </div>`;
}
