// O QUE O PROTOCOLO NAO PERGUNTA.
//
// O catalogo de `entrevista.json` tem 436 perguntas extraidas de tres livros, e
// e adulto do comeco ao fim. Uma varredura dos temas desta pagina em 02/09/2026
// achou 20 perguntas -- e quase todas sao HISTORIA: "houve problemas com a
// gravidez da sua mae", "como foram suas primeiras experiencias escolares".
// Sao perguntas sobre a infancia de um adulto, e nao perguntas para uma
// crianca. Do ciclo menstrual, da gestacao em curso, da amamentacao, do
// rastreio de delirium, nao ha uma linha.
//
// Regra do Refinamento e que a IA ESCOLHE, nao inventa. A regra e boa e nao vai
// mudar: pergunta sem procedencia nao entra fingindo ser citada. Mas ela tem um
// preco -- o que nao esta no catalogo nao existe, e nenhuma instrucao de prompt
// conserta isso. Dai este suplemento.
//
// A procedencia aqui e outra, e esta declarada: `origem: "faixa-etaria"`, sem
// trecho_id de livro. Sao perguntas de cobertura obrigatoria por grupo, e nao
// citacao. Cada uma existe porque a resposta muda o diagnostico ou a
// prescricao, e nao para engrossar a lista.
export const LIFE_STAGE_BLOCKS = [
  {
    campo: "crianca_adolescente",
    achados: [
      { achado: "Quem relata" }, { achado: "Escola e rendimento" },
      { achado: "Desenvolvimento" }, { achado: "Maus-tratos e bullying" },
      { achado: "Sono e alimentacao na rotina" }
    ],
    perguntas: [
      { pergunta: "Quem percebeu primeiro que algo estava diferente, e o que exatamente essa pessoa viu?",
        quando: "SEMPRE em crianca e adolescente — o relato e de terceiro, e a fonte muda o peso do dado" },
      { pergunta: "O que a escola diz? O comportamento em casa e o mesmo que os professores descrevem?",
        quando: "SEMPRE em crianca e adolescente — divergencia entre casa e escola e achado, e nao ruido" },
      { pergunta: "Como foi a gestacao, o parto e os primeiros anos: andar, falar, controlar esfincteres, brincar com outras criancas?",
        quando: "SEMPRE em crianca; em adolescente, quando houver suspeita de transtorno do neurodesenvolvimento" },
      { pergunta: "Houve queda de rendimento, recusa de ir a escola, ou mudanca de quem sao os amigos?",
        quando: "SEMPRE em crianca e adolescente — e o equivalente do prejuizo funcional nesta faixa" },
      { pergunta: "Alguem maltrata, humilha ou machuca essa crianca — em casa, na escola ou pela internet?",
        quando: "SEMPRE em crianca e adolescente — maus-tratos e bullying sao causa, e nao comorbidade" },
      { pergunta: "Como esta o sono e a alimentacao na rotina de hoje: hora de dormir, tela, apetite, peso?",
        quando: "SEMPRE em crianca e adolescente" },
      { pergunta: "O adolescente ja se machucou de proposito, mesmo sem querer morrer?",
        quando: "SEMPRE em adolescente — autolesao sem intencao suicida e frequente e raramente e relatada espontaneamente" }
    ]
  },
  {
    campo: "idoso",
    achados: [
      { achado: "Delirium" }, { achado: "Declinio cognitivo" }, { achado: "Polifarmacia" },
      { achado: "Quedas e autonomia" }, { achado: "Deficit sensorial" }, { achado: "Luto e isolamento" }
    ],
    perguntas: [
      { pergunta: "Isso comecou de repente, em horas ou dias, e varia ao longo do dia — pior no fim da tarde e a noite?",
        quando: "SEMPRE em idoso com quadro agudo — inicio subito e flutuacao sao delirium ate prova em contrario" },
      { pergunta: "A memoria mudou? Esquece o que acabou de acontecer, repete perguntas, se perde em lugar conhecido?",
        quando: "SEMPRE em idoso — separa depressao com prejuizo cognitivo de transtorno neurocognitivo" },
      { pergunta: "Que remedios o senhor toma hoje, todos, inclusive os que nao sao para a cabeca — e quem prescreveu cada um?",
        quando: "SEMPRE em idoso — polifarmacia e medicamento anticolinergico sao causa frequente do quadro" },
      { pergunta: "O senhor caiu no ultimo ano? Sente tontura ao levantar?",
        quando: "SEMPRE em idoso — define o que nao se pode prescrever" },
      { pergunta: "O senhor consegue se cuidar sozinho: banho, roupa, comida, dinheiro, remedio na hora certa?",
        quando: "SEMPRE em idoso — a funcionalidade nesta faixa e medida assim, e nao por trabalho" },
      { pergunta: "O senhor escuta e enxerga bem? Usa aparelho ou oculos?",
        quando: "SEMPRE em idoso — deficit sensorial imita e agrava sintoma psiquiatrico" },
      { pergunta: "Perdeu alguem proximo nos ultimos dois anos? Com quem o senhor conta hoje?",
        quando: "SEMPRE em idoso — luto e isolamento sao os desencadeantes mais frequentes desta faixa" }
    ]
  },
  {
    campo: "saude_reprodutiva",
    achados: [
      { achado: "Relacao com o ciclo" }, { achado: "Gestacao e puerperio" },
      { achado: "Amamentacao" }, { achado: "Contracepcao hormonal" }, { achado: "Climaterio" }
    ],
    perguntas: [
      { pergunta: "Os sintomas pioram na semana antes da menstruacao e melhoram quando ela vem?",
        quando: "SEMPRE em mulher que menstrua — e o que sustenta ou descarta transtorno disforico pre-menstrual" },
      { pergunta: "Ha chance de estar gravida hoje? Quando foi a ultima menstruacao?",
        quando: "SEMPRE em mulher em idade fertil, ANTES de prescrever" },
      { pergunta: "O quadro comecou na gestacao, no parto ou nos meses seguintes a ele?",
        quando: "SEMPRE que houver gestacao ou parto no ultimo ano — muda o especificador e o diferencial" },
      { pergunta: "Esta amamentando? Ate quando pretende amamentar?",
        quando: "SEMPRE em puerpera — muda a escolha do farmaco, e nao a dose" },
      { pergunta: "Usa anticoncepcional hormonal? Comecou ou trocou perto do inicio dos sintomas?",
        quando: "SEMPRE em mulher em idade fertil — e causa medicamentosa possivel, e interage com anticonvulsivante" },
      { pergunta: "Esta na transicao da menopausa: ciclos irregulares, calores, sono picado?",
        quando: "SEMPRE em mulher acima de 40 anos — o climaterio tem quadro proprio e e confundido com depressao" }
    ]
  }
];

// Ids no mesmo formato do protocolo (`p:campo#indice`), para que o resolvedor
// por id, a tela e o descarte de pergunta inventada continuem funcionando sem
// saber que existem duas origens.
export function lifeStageBlocksWithIds() {
  return LIFE_STAGE_BLOCKS.map(bloco => ({
    ...bloco,
    obrigatorio: [],
    sinais_de_alerta: [],
    perguntas: bloco.perguntas.map((pergunta, indice) => ({
      ...pergunta,
      origem: "faixa-etaria",
      trecho_id: "",
      id: `p:${bloco.campo}#${indice}`
    }))
  }));
}
