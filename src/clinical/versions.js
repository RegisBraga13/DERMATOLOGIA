// VERSOES DO REGISTRO, desde 11/09/2026 (leva 3).
//
// Reabrir uma consulta salva e salvar de novo reescrevia o registro no lugar,
// sem rastro: dias depois, a historia clinica, a hipotese e a conduta podiam
// mudar sem que o prontuario dissesse que mudaram. Agora o atendimento tem dois
// estados. Rascunho se edita a vontade. Finalizado tambem se edita -- mas o que
// muda na historia clinica, no diagnostico ou no tratamento guarda antes a
// versao que havia, e o registro passa a dizer que foi alterado depois.
//
// So estes tres grupos, por decisao dele: sao o que se afirma sobre o
// paciente, e o localStorage tem teto de uns 5 MB. O resto do atendimento --
// anamnese, exame, escalas -- nao ganha versao.

export const VERSIONED_GROUPS = Object.freeze({
  historia: {
    rotulo: "história clínica",
    campos: { evolution: "História clínica" }
  },
  diagnostico: {
    rotulo: "diagnóstico",
    campos: {
      diagnosticoSelecionado: "Hipóteses assinaladas",
      diagnosticoMedicoOutro: "Hipótese escrita pelo médico",
      especificadorSelecionado: "Especificadores",
      comorbidadeSelecionada: "Comorbidades",
      agravanteSelecionado: "Fatores agravantes",
      diagnosticoObservacaoMedica: "Observação do médico"
    }
  },
  tratamento: {
    rotulo: "tratamento",
    campos: {
      nivelCuidado: "Nível de cuidado",
      nivelCuidadoJustificativa: "Justificativa do nível de cuidado",
      tratamentoMedicamentosSelecionados: "Medicamentos",
      abordagensSelecionadas: "Outras abordagens",
      sintomasResiduais: "Sintomas-alvo",
      examesSolicitados: "Exames solicitados",
      condutaMedica: "Ajustes do médico",
      ajusteMedicacaoSelecionada: "Decisões de medicamento",
      ajusteCondutaSelecionada: "Ajustes de conduta",
      ajusteAcrescimo: "Acréscimo do médico"
    }
  }
});

// Quantas versoes cada registro guarda. A primeira -- a que foi finalizada --
// fica sempre; as outras sao as mais recentes.
export const VERSION_LIMIT = 10;

// Uma sessao de alteracao vira UMA versao. Sem isto, reabrir uma consulta
// finalizada e passar por tres paginas com "Salvar e avancar" deixava tres
// versoes intermediarias do mesmo ajuste.
export const VERSION_SESSION_MS = 30 * 60 * 1000;

function comparavel(valor) {
  const lista = Array.isArray(valor) ? valor : valor ? [valor] : [];
  return lista.map(item => String(item ?? "").trim()).filter(Boolean).join("\n");
}

function camposVersionados() {
  return Object.values(VERSIONED_GROUPS).flatMap(grupo => Object.keys(grupo.campos));
}

/** Os campos versionados do registro, sem os vazios. */
export function versionedSnapshot(entry = {}) {
  return Object.fromEntries(camposVersionados()
    .filter(campo => comparavel(entry[campo]))
    .map(campo => [campo, structuredClone(entry[campo])]));
}

/** Os grupos (historia, diagnostico, tratamento) que mudaram entre as duas. */
export function changedGroups(anterior = {}, atual = {}) {
  return Object.entries(VERSIONED_GROUPS)
    .filter(([, grupo]) => Object.keys(grupo.campos).some(campo => comparavel(anterior[campo]) !== comparavel(atual[campo])))
    .map(([nome]) => nome);
}

/**
 * O registro que vai ser gravado, com a versao anterior guardada quando ha o
 * que guardar: registro ja finalizado, e mudanca num dos tres grupos.
 */
export function withVersionHistory(anterior, atual, agora = new Date().toISOString(), { limite = VERSION_LIMIT, sessaoMs = VERSION_SESSION_MS } = {}) {
  if (!anterior?.finalizadoEm) return atual;
  const mudou = changedGroups(anterior, atual);
  if (!mudou.length) return atual;
  const versoes = Array.isArray(anterior.versoes) ? [...anterior.versoes] : [];
  const ultima = versoes[versoes.length - 1];
  const mesmaSessao = ultima && anterior.alteradoAposFinalizarEm
    && Date.parse(agora) - Date.parse(anterior.alteradoAposFinalizarEm) < sessaoMs;
  if (mesmaSessao) {
    // A versao de antes desta sessao ja esta guardada; so se soma o que mudou.
    versoes[versoes.length - 1] = { ...ultima, mudou: [...new Set([...(ultima.mudou || []), ...mudou])] };
  } else {
    versoes.push({ em: anterior.updatedAt || anterior.finalizadoEm, mudou, campos: versionedSnapshot(anterior) });
  }
  const guardadas = versoes.length > limite ? [versoes[0], ...versoes.slice(-(limite - 1))] : versoes;
  return { ...atual, versoes: guardadas, alteradoAposFinalizarEm: agora };
}
