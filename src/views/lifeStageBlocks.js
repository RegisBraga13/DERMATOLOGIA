// Os blocos da anamnese que so existem para alguns pacientes.
//
// Aparecem por condicao, e nao sempre. Um formulario que pergunta ciclo
// menstrual a um homem de 70 anos e um formulario que ninguem le inteiro: o
// campo vazio deixa de significar "nao investigado" e passa a significar "nao
// se aplica", e as duas coisas se confundem na tela e no prontuario.
//
// A condicao vem da identificacao do PACIENTE, e nao do atendimento: e o
// cadastro que sabe a data de nascimento e o sexo. Sem data de nascimento, os
// dois blocos ficam fora — nao ha o que deduzir de um campo em branco.
import { PREGNANCY_ANSWERS, gestationalAge, gestationalAgeText, lifeStageOf, mayBePregnant, needsCaregiverHistory, needsReproductiveHistory } from "../clinical/lifeStage.js";
import { arrayValue } from "../clinical/textFormat.js";
import { optionGroups } from "../data/examOptions.js";
import { chips, field, singleChoiceWithNotes, textarea } from "../ui/controls.js";
import { escapeHtml } from "../ui/html.js";

// Saude reprodutiva. O recorte e a fisiologia — ciclo, gestacao, lactacao,
// climaterio —, que e o que muda diagnostico e prescricao: TDPM exige ciclo,
// inicio no periparto e especificador, e gestacao muda a ESCOLHA do farmaco, e
// nao so a dose. Por isso le o campo sexo, e nao o campo genero.
export function reproductiveHistoryCard(form = {}, patient = {}) {
  if (!needsReproductiveHistory(patient)) return "";
  return `
    <div class="clinical-card">
      <h4>Saúde reprodutiva</h4>
      ${pregnancyBlock(form, patient)}
      ${chips("cicloReprodutivo", "Situação atual", optionGroups.cicloReprodutivo, form.cicloReprodutivo, form)}
      ${chips("sintomasCiclo", "Relação dos sintomas com o ciclo", optionGroups.sintomasCiclo, form.sintomasCiclo, form)}
      ${textarea("historiaReprodutiva", "Gestações, puerpério e uso de contraceptivo", form.historiaReprodutiva, "", 2)}
    </div>`;
}

// A GRAVIDEZ SE PERGUNTA EM TRES RESPOSTAS, e cada uma leva a um lugar --
// desenho dele, 02/09/2026. Duas sao conclusivas e uma nao e:
//
//   Sim, com certeza  -> calcular a idade gestacional (muda o que se pode dar,
//                        e o trimestre muda de novo)
//   Nao, com certeza  -> encerra o assunto
//   Nao sabe          -> pedir beta-hCG antes de prescrever
//
// "Nao sabe" nao e campo em branco, e o achado mais importante dos tres: e o
// estado em que a prescricao fica suspensa. Um checkbox "gestante" nao
// distingue as duas ausencias -- quem sabe que nao esta, e quem nao sabe.
function pregnancyBlock(form = {}, patient = {}) {
  if (!mayBePregnant(patient)) return "";
  const resposta = arrayValue(form.gravidez)[0] || "";
  const ig = gestationalAgeText(form.gravidezDum);
  const dpp = gestationalAge(form.gravidezDum)?.dpp || "";
  return `
    <div class="pregnancy-block">
      ${singleChoiceWithNotes("gravidez", "Gestação", PREGNANCY_ANSWERS, form.gravidez)}
      ${resposta === "Sim, com certeza" ? `
        <div class="pregnancy-followup">
          ${field("gravidezDum", "Primeiro dia da última menstruação", form.gravidezDum || "", "date")}
          ${ig
            ? `<p class="pregnancy-age"><strong>${escapeHtml(ig)}</strong> de idade gestacional${dpp ? ` · provável parto em ${escapeHtml(dpp)}` : ""}</p>`
            : `<p class="field-hint">${form.gravidezDum ? "Data fora do intervalo de uma gestação. Confira." : "A idade gestacional é calculada a partir desta data."}</p>`}
        </div>
      ` : ""}
      ${resposta === "Não sabe" ? `
        <div class="pregnancy-followup warning">
          Solicitar teste de gravidez (beta-hCG) antes de prescrever.
        </div>
      ` : ""}
    </div>`;
}

// Crianca e adolescente: quem relata, e como vai a escola.
//
// O primeiro nao e formalidade. Nesta faixa o relato e quase sempre de
// terceiro, e "a mae acha que ele e agressivo" nao e o mesmo dado que "ele diz
// que bate nos colegas". Sem registrar a fonte, a anamnese apaga a diferenca —
// e a divergencia entre casa e escola, que costuma ser o achado.
export function caregiverHistoryCard(form = {}, patient = {}) {
  if (!needsCaregiverHistory(patient)) return "";
  const faixa = lifeStageOf(patient);
  return `
    <div class="clinical-card">
      <h4>Contexto de ${faixa?.id === "crianca" ? "criança" : "adolescente"}</h4>
      <p class="field-hint">Quem relata muda o peso do relato. Divergência entre casa e escola é achado, e não ruído.</p>
      ${chips("informante", "Quem relata", optionGroups.informante, form.informante, form)}
      ${chips("escolaridadeContexto", "Escola", optionGroups.escolaridadeContexto, form.escolaridadeContexto, form)}
      ${textarea("desenvolvimento", "Desenvolvimento: gestação, parto, marcos, linguagem e convívio", form.desenvolvimento, "", 2)}
    </div>`;
}
