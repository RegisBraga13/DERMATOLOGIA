# Pendências

Estado em 23/09/2026. Tudo o que ficou em aberto nesta revisão de arquitetura,
mais o que nasceu das mudanças feitas hoje.

**Atualização, mesmo dia.** A conferência determinística de dose (P1) foi
**removida por decisão sua** — tabela de 9 fármacos, catálogo, verificação no
servidor e no navegador, tudo. Consequência aceita: o histórico farmacológico
não confirma mais "ensaio adequado em dose" — o veredito que antes fechava
como falha confirmada agora sai como `INDETERMINADO`. Os itens P1, P2, P9 e a
seção 1-B, abaixo, ficam como registro histórico de algo que não existe mais
no código.

Também saíram, por decisão sua: a chamada ao **RxNav** (nome/RxCUI do
medicamento) e a chamada ao **openFDA** (ficha em inglês de bula americana).
A segunda, na verdade, já estava morta — o botão que a disparava ("Pesquisar
online") tinha sido tirado da tela em 02/09/2026 e ninguém tinha apagado a
função. A consulta de medicamento continua funcionando pela IA (RAG/Nuvem),
que é o caminho que a tela de fato usa.

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

### P1. Conferência de dose no servidor — REMOVIDO em 23/09/2026

Existiu por algumas horas: o servidor conferia posologia contra uma tabela de
9 fármacos, e a tela mostrava divergência antes de assinalar. Você pediu para
tirar tudo — a tabela, o catálogo, a verificação nos dois lados —, considerando
que dose padronizada é fato de referência, não decisão que precisa de
confiança/revisão como o resto do programa.

**O que saiu:** `src/clinical/doseCheck.js`, `src/data/medicationCatalog.js`,
`src/data/medicationDoses.js`, `src/data/medications.json`,
`scripts/build_medication_table.mjs`, `scripts/extrair_posologia.mjs`, os
avisos `dose_warnings` do servidor, e as flags `revisado` em `medications.js`.

**Efeito colateral aceito:** o histórico farmacológico (`medicationTrial.js`)
usava essa mesma tabela para confirmar se uma dose antiga foi "adequada". Sem
ela, esse veredito nunca mais fecha como falha confirmada — vira sempre
`INDETERMINADO`. A leitura de tempo de uso continua funcionando normalmente.

### P2. Catálogo além dos 9 fármacos — SEM OBJETO

Existia para alimentar a P1. Removida a P1, não há mais catálogo para
estender. Nada a fazer aqui.

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

### P9. SEM OBJETO — a conferência de dose que isto estenderia foi removida (ver P1)

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
| O4 | Testes JS | 515 passam, 0 falham |

---

## 6. O que já foi resolvido hoje

Para contexto, não para ação.

| Item | O que mudou |
| --- | --- |
| Transcrição bruta | Saiu das etapas seguintes. Quatro etapas caíram de ~46.600 para ~10.100 tokens |
| Observabilidade | Uma linha de log por decisão: tokens, latência, modelo, desfecho, sem dado de paciente |
| Histórico farmacológico | Cada exposição vira ensaio tipado, com dose, tempo e desfecho, e chega às quatro etapas que prescrevem |
| `parseMedicationDecision` | Passou a ler o motivo da decisão, que era descartado |
| `pisoEmMg` | Lia "50 a 200 mg/dia" com piso 200 e reprovava dose correta. Corrigido |

---

## 7. Ordem sugerida — o que sobrou

P1, P2 e P9 saíram (dose check removido). Restam 6 itens técnicos.

1. **P7** — pequeno, e cobre o lugar onde a troca de fármaco acontece.
2. **P6** — o `decisionId` no prontuário fecha a trilha de auditoria que o log
   já abriu.
3. **P10** — ler o log depois de algumas semanas de uso. Sem isso, D1 e os
   limiares continuam sendo palpite com número.
4. **P11** — começar antes que o arquivo fique grande demais para migrar sem dor.

O resto espera.
