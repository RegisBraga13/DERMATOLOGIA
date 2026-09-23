// De quem e cada caixa marcada na anamnese.
//
// Depois de uma transcricao por voz, a extracao por IA marca sozinha os 13
// grupos de caixas da anamnese -- e ate aqui nao deixava rastro NENHUM na tela.
// O aplicativo ja sabia a diferenca: `anamnesisDoctorOverrides` guarda o que o
// medico tocou, e e o que impede a extracao seguinte de desfazer a mao dele.
// Mas esse objeto e invisivel, e na tela uma caixa marcada pela IA e uma caixa
// marcada pelo medico sao o mesmo desenho.
//
// Isso importa porque o prontuario e assinado por ele. Uma transcricao que
// ouviu "nao bebe" como "bebe" vira um antecedente marcado, indistinguivel do
// que ele proprio registrou -- e, tres meses depois, nao ha como saber.
//
// O mesmo padrao ja esta no Nivel de cuidado (`.care-suggested` mais o rotulo
// "sugerido"), que foi resolvido certo. Aqui e generalizar o que ja existe.
//
// A marca e transitoria por definicao: some no instante em que ele toca a
// caixa, porque dali em diante a caixa e dele. Nao e um registro de auditoria
// -- e a resposta a pergunta "isto aqui fui eu?".

// Quais caixas a extracao marcou por conta propria nesta passada. Recebe o que
// ficou marcado, o que a IA propos e o que o medico ja tinha decidido; a marca
// so vale onde ele ainda nao decidiu nada.
export function anamnesisAiMarks(aplicado = {}, propostoPorCampo = {}, overrides = {}) {
  const marcas = {};
  Object.entries(propostoPorCampo).forEach(([formKey, propostas]) => {
    const marcado = new Set(Array.isArray(aplicado[formKey]) ? aplicado[formKey] : []);
    [...propostas].forEach(option => {
      const chave = `${formKey}:${option}`;
      // Fora quando ele ja tocou a caixa: a decisao e dele, mesmo que coincida
      // com a da IA. E fora quando a proposta nao sobreviveu as regras de
      // negacao -- marca em caixa desmarcada seria marca em nada.
      if (Object.hasOwn(overrides, chave) || !marcado.has(option)) return;
      marcas[chave] = true;
    });
  });
  return marcas;
}

// O medico tocou estas caixas: a marca de IA sai. Devolve objeto novo, como o
// resto do modelo de dados do projeto.
export function withoutAiMarks(marcas = {}, chaves = []) {
  if (!chaves.length) return { ...marcas };
  const restante = { ...marcas };
  chaves.forEach(chave => { delete restante[chave]; });
  return restante;
}

export function hasAiMarks(marcas = {}) {
  return Object.keys(marcas || {}).length > 0;
}
