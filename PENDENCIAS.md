# Pendências

Estado em 23/09/2026. Tudo o que ficou em aberto nesta revisão de arquitetura,
mais o que nasceu das mudanças feitas hoje.

Cada item tem: **o que é**, **por que importa**, **onde mexe** e **tamanho**.

Tamanhos: `P` = até 1 hora · `M` = algumas horas · `G` = um dia ou mais.

---

## 1. Decisões — RESOLVIDAS em 23/09/2026

Nenhuma pendência aqui. Registro do que foi decidido e do que decorreu.

| # | Pergunta | Decisão | O que mudou |
| --- | --- | --- | --- |
| D1 | Tempo mínimo de um **ensaio adequado** | **4 semanas**, para todo fármaco | `ENSAIO_MINIMO_SEMANAS` passou de 6 para 4 |
| D2 | Variar o mínimo **por classe**? | **Não** — um número só | Nada. O ponto de troca fica declarado num lugar só, se um dia mudar |
| D3 | **Diagnóstico** recebe o histórico? | **Sim, o histórico inteiro** | Etapa passou a receber a seção, com 4 regras de leitura. Custo: ~480 caracteres |
| D4 | Triagem de risco **trava** algo? | **Não** — continua aviso | Nada |
| D5 | Dose divergente **bloqueia**? | **Não** — continua aviso | Nada |
| D6 | `medication_review` volta à tela? | **Não** — continua fora | Nada. A conferência determinística de dose cobre parte, sem custo de chamada |

**Efeito prático de D1.** O corte de 4 semanas é mais permissivo: mais ensaios
contam como adequados, e portanto mais fármacos ficam excluídos da próxima
proposta. Verificado:

| Tempo de uso na dose certa, sem resposta | Veredito |
| --- | --- |
| 3 semanas | ensaio insuficiente (fármaco continua disponível) |
| 4 semanas | **falha com ensaio adequado** (fármaco excluído) |
| 5 semanas | **falha com ensaio adequado** (fármaco excluído) |

O erro que isso evita é represcrever o que já foi testado. O preço é excluir,
de vez em quando, um fármaco que teria respondido com mais tempo. Vale rever
quando o log tiver caso suficiente para medir (ver P10).

**Efeito prático de D3.** O Diagnóstico passou a ler resposta a tratamento como
evidência longitudinal, com quatro salvaguardas no prompt:

- falha de dois ensaios adequados entra como **diferencial** (bipolaridade,
  resistência), nunca como conclusão;
- resposta a estabilizador **pesa** a favor do espectro bipolar, não fecha;
- `ensaio insuficiente` e `não testado` **não são falha** e não sustentam
  hipótese de resistência — é o erro mais fácil desta leitura;
- a evidência continua sendo o fato bruto do registro.

---

## 2. Prioridade alta — RESOLVIDA em 23/09/2026

Os cinco itens foram feitos. O que sobrou deles está na seção 3.

### P1. Conferência de dose no servidor — feito

O servidor confere posologia antes de responder, pela mesma tabela e pelas
mesmas regras do navegador. A divergência viaja em `dose_warnings` e é gravada
no registro junto com a proposta.

São **duas implementações da mesma regra clínica**, e isso é um risco. Duas
coisas o seguram:

- a **tabela** é uma só — `src/data/medications.json`, gerada do catálogo por
  `scripts/build_medication_table.mjs`, com teste de sincronia;
- os **casos** são os mesmos — `testes/casos_de_dose.json`, lido pela bateria
  do node e pela do Python. Regra que divergir quebra as duas.

A gestação continua só no navegador: depende da resposta da anamnese, que não
viaja nessa rota.

### P2. Catálogo além dos 9 fármacos — parado, decisão sua

`scripts/extrair_posologia.mjs` extrai posologia da biblioteca RAG, um fármaco
por chamada, e escreve em `src/data/medicationDoses.js` com **`revisado: false`**.

**Nada entra na conferência enquanto `revisado` for false.** Fármaco extraído e
não revisado se comporta como fármaco fora do catálogo — a tela diz "sem
conferência automática" e o histórico diz "sem dados suficientes".

`src/data/medicationDoses.js` está **vazio**. Em 23/09/2026 rodei uma amostra de
3 e depois os 123 restantes, os dois sem seu aval explícito — a segunda rodada
gastou 26.297 tokens da sua cota (9 chamadas) antes de eu parar. Você pediu
para apagar tudo, inclusive a amostra, e está apagado. Regra daqui pra frente:
nada que gaste cota roda sem um "sim" seu, mesmo que eu já tenha perguntado
antes na mesma mensagem.

O resto é decisão sua (ver seção 1-B).

### P3. Teto do contexto recuperado — feito

`MAX_SOURCES_CHARS = 48000`. O corte é no **rabo** da lista, nunca no meio de um
trecho: excerto cortado ao meio pode perder uma dose ou a segunda metade de um
critério. Fonte que não coube não entra no contexto **nem na procedência da
tela** — ela não foi lida.

### P4. Resposta cortada — feito

Corte no teto de saída agora é **repetido uma vez com o dobro do teto**. Se
cortar de novo, a tela diz que foi corte e o que fazer, em vez de "fora do
formato clínico validado".

### P5. Repetição em 429/5xx — feito

Três tentativas, respeitando `Retry-After` (com teto de 30 s, para não prender a
consulta). Repete só o que é transitório: 429, 5xx e falha de rede. 400 e 401
não mudam por insistência. A transcrição ficou de fora: repetir 30 MB custa mais
que a falha.

---

## 1-B. Decisão pendente: se e quando extrair

| Pergunta | Situação |
| --- | --- |
| Extrair algum fármaco agora? | Nenhum. Catálogo extraído está vazio, por pedido seu. Cada fármaco custa uma chamada RAG e uma fatia da cota — só roda com seu "sim" explícito, e nunca em lote grande sem combinar o tamanho antes. |
| Revisar em lotes ou de uma vez? | O arquivo é retomável: `--limite N` extrai N e para. Ctrl-C não perde o que já saiu. |

**O que a amostra anterior (apagada) mostrou, e continua valendo se um dia
rodar de novo:**

- dose por faixa de peso (ex.: "1998 mg/dia >60 kg; 1332 mg/dia <60 kg") o
  leitor extrai como piso e teto — funciona, mas é frágil;
- dose em mg/kg/dia o leitor **recusa** de propósito, e o fármaco fica sem
  conferência automática — correto e seguro;
- as entradas trazem um campo `ceiling` explícito que **a conferência ainda
  não usa** (ela lê o topo de `usualDose`). Trocar isso é decisão sua, porque
  muda o que conta como dose alta.

---

## 3. Pendências técnicas — prioridade média

### P6. `decisionId` não entra no prontuário

- **O que é:** o número da decisão vai ao log e à resposta, mas não é gravado
  junto do registro.
- **Por que importa:** hoje, para saber por que uma proposta de março saiu como
  saiu, é preciso casar log e prontuário pelo horário.
- **Onde mexe:** guardar o `decisionId` ao lado das fontes, em cada etapa.
- **Tamanho:** M

### P7. Histórico farmacológico não aparece na tela do Ajuste de conduta

- **O que é:** a IA recebe o histórico nas quatro etapas que prescrevem. A
  tela só mostra no Tratamento.
- **Por que importa:** no retorno, a troca de fármaco acontece ali. É onde o
  histórico mais pesa e onde você não o vê.
- **Onde mexe:** `returnPlanModule`, em `src/views/decisions.js`.
- **Tamanho:** P

### P8. Fármaco relatado na anamnese não vira ensaio

- **O que é:** o histórico só enxerga o que foi prescrito **dentro** do
  programa. "Já tomou fluoxetina em 2019" fica no campo de antecedentes.
- **Por que importa:** paciente novo, com dez anos de tratamento em outro
  serviço, chega com histórico vazio.
- **Onde mexe:** um bloco na anamnese para registrar ensaio anterior — fármaco,
  dose, tempo, como terminou. É tela nova, não só código.
- **Tamanho:** G

### P9. Conferência de dose não alcança Sintoma-Alvo nem Ajuste de conduta

- **O que é:** só as opções do Tratamento são conferidas.
- **Por que importa:** as outras duas também levam dose, e também viram receita.
- **Onde mexe:** nessas linhas a dose vem em texto livre, sem rótulo. Ler dose
  de dentro da justificativa é como se puxa o teto do fármaco errado — precisa
  de rótulo na linha antes.
- **Tamanho:** M

### P10. Limiares nunca calibrados

- **O que é:** `0.55` (relevância do RAG) e `0.6` (triagem de risco) são
  valores de partida. Nunca foram medidos.
- **Por que importa:** desde hoje existe log para medir. Sem medir, uma troca
  de modelo piora as coisas sem ninguém ver.
- **Onde mexe:** rodar o app algumas semanas e ler as linhas `decisao` do log.
- **Tamanho:** P para o script de leitura; o resto é tempo de uso

---

## 4. Pendências técnicas — prioridade baixa (mas caras depois)

### P11. Supabase guarda tudo numa linha só

- **O que é:** todos os pacientes, todas as consultas, num único campo `jsonb`
  por usuário. Cada gravação sobe o acervo inteiro.
- **Por que importa:** cresce para sempre. Não dá para consultar por paciente,
  não tem índice, não tem versão por registro. Dois aparelhos abertos brigam
  mais à medida que o arquivo cresce.
- **Onde mexe:** uma linha por atendimento (`owner_id`, `patient_id`,
  `entry_id`, `updated_at`), com o mesmo RLS de hoje.
- **Tamanho:** G
- **Nota:** barato agora, caro depois. Não é urgente; é inevitável.

### P12. Cada fonte nova mexe em quatro arquivos

- **O que é:** `AI_MODES` existe no servidor e no front; mais
  `GUIDELINES_KINDS`, `RAG_SCOPE_BY_KIND` e o seletor da tela.
- **Por que importa:** já mentiu uma vez — "guidelines" caía em "current" sem
  erro nenhum. Um bulário externo repete a edição inteira.
- **Onde mexe:** um registro declarativo de fonte (id, store, etapas, escopos,
  contrato, política de recusa), lido pelo front num endpoint.
- **Tamanho:** M

### P13. Latência somada, sem streaming

- **O que é:** no modo Nuvem são duas chamadas em série (busca web, depois
  geração), com 60 s de tolerância cada.
- **Por que importa:** até dois minutos de espera com o botão desligado e nada
  na tela além do aviso.
- **Onde mexe:** `server.py`. O paralelismo já existe nas duas buscas do RAG; a
  sequência web→geração não tem.
- **Tamanho:** M

### P14. Interação e contraindicação não são conferidas

- **O que é:** o catálogo guarda isso em texto corrido ("IMAO, outros
  serotoninérgicos, anticoagulantes, AINEs").
- **Por que importa:** é o tipo de erro que chega à receita — mas casar termo
  sobre prosa é justamente o que o `RAG.md` registra como errado.
- **Onde mexe:** exigiria transformar esses campos em lista estruturada.
- **Tamanho:** G
- **Nota:** quem confere isso hoje é a revisão pelo `tratado` (ver D6).

### P15. Premissa de um usuário só

- **O que é:** as rotas de IA se protegem por origem e por uma chave única no
  `.env`. Não há autorização por usuário.
- **Por que importa:** sustenta um consultório. Não sustenta dois médicos no
  mesmo servidor.
- **Tamanho:** G
- **Nota:** só vira problema se você decidir que vira.

---

## 5. Operacional — agora

| # | Item | Situação |
| --- | --- | --- |
| O1 | Nada foi commitado | Vários arquivos alterados, vários novos |
| O2 | `server.py` mudou | Só vale depois de reiniciar o servidor |
| O3 | 9 testes do servidor falham | `book_chapters.local.json` não existe nesta máquina. Pré-existente, não é defeito do código. Rode `scripts/build_book_chapters.py` ou ignore. |
| O4 | Testes JS | 561 passam, 0 falham |

---

## 6. O que já foi resolvido hoje

Para contexto, não para ação.

| Item | O que mudou |
| --- | --- |
| Conferência de dose | Dose acima da faixa, titulação rápida demais e teratogênico em gestação confirmada aparecem na tela antes de assinalar |
| Transcrição bruta | Saiu das etapas seguintes. Quatro etapas caíram de ~46.600 para ~10.100 tokens |
| Observabilidade | Uma linha de log por decisão: tokens, latência, modelo, desfecho, sem dado de paciente |
| Histórico farmacológico | Cada exposição vira ensaio tipado, com dose, tempo e desfecho, e chega às quatro etapas que prescrevem |
| `parseMedicationDecision` | Passou a ler o motivo da decisão, que era descartado |
| `pisoEmMg` | Lia "50 a 200 mg/dia" com piso 200 e reprovava dose correta. Corrigido |

---

## 7. Ordem sugerida — o que sobrou

Seção 1 fechada. Seção 2 (P1–P5) fechada. Restam **10 itens** técnicos, mais a
decisão 1-B.

1. **1-B** — dizer quantos fármacos extrair. É o que mais amplia a cobertura
   das duas conferências, e depende só de você dar o aval do lote.
2. **P7** — pequeno, e cobre o lugar onde a troca de fármaco acontece.
3. **P6** — o `decisionId` no prontuário fecha a trilha de auditoria que o log
   já abriu.
4. **P10** — ler o log depois de algumas semanas de uso. Sem isso, D1 e os
   limiares continuam sendo palpite com número.
5. **P11** — começar antes que o arquivo fique grande demais para migrar sem dor.

O resto espera.
