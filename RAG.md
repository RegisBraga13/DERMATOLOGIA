# Biblioteca RAG de psiquiatria

Cada etapa de IA responde por um de dois modos, escolhido na tela: `IA Nuvem`, que pesquisa na web, e
`RAG com literatura`, que le a biblioteca de psiquiatria: **18 arquivos, 18 titulos, um genero para cada**. Os
PDFs nao devem ser adicionados ao Git. Somente materiais licenciados ou autorizados devem ser indexados.

## Preparacao

```bash
python3 -m pip install -r requirements.txt
export OPENAI_API_KEY="..."
python3 scripts/ingest_rag.py --escopo psicopatologia "/caminho/fonte.pdf"
```

Copie o `OPENAI_RAG_VECTOR_STORE_ID` exibido para `.env` e reinicie `server.py`.

## A etiqueta diz o que o livro E, e nunca quem o le

Esta e a regra que organiza tudo o que vem abaixo, e ela foi aprendida errando.

Ate 28/08/2026 a etiqueta nomeava o leitor: `diagnostico_base`, `tratamento_base`,
`medicamento_refino`, `refino`. Parecia pratico e custou caro, de tres maneiras:

1. **Trocar quem le um livro exigia mexer no arquivo remoto**, quando deveria ser
   uma linha de codigo.
2. **O mesmo livro precisou ser subido duas vezes** para carregar dois rotulos. A
   Psicofarmacologia 2025 e o Tratado da ABP estavam duplicados na store.
3. **O `tag_rag_scope.py` envelheceu ate ficar destrutivo.** O mapa dele ainda
   mandava `("psicofarmacologia", "farmacologia")` e `("guia de prescri",
   "farmacologia")`; roda-lo apagaria os escopos do Medicamento e do
   Sintoma-Alvo, e o fallback jogaria os dois volumes da FMUSP em `ambos`. Cinco
   etapas parariam de achar o livro delas **sem uma linha de erro**: a busca
   simplesmente nao casa, e a tela diz que nao encontrou fonte.

Genero e propriedade do livro e nao muda. Leitura e decisao clinica e muda quando
ele quiser — e agora muda em um lugar so, sem tocar em nada na nuvem.

| Genero | Livros |
| --- | --- |
| `psicopatologia` | Dalgalarrondo; Cheniaux 6a ed.; FMUSP vol. 1 (Secao 2: Psicopatologia) |
| `entrevista` | Psicopatologia clinica: entrevista psiquiatrica (USP/Manole); A entrevista psiquiatrica na pratica clinica |
| `sindromes` | Clinica Psiquiatrica FMUSP, vol. 2 |
| `terapeutica` | FMUSP vol. 3; FMUSP vol. 4 (Guia Pratico); Clinica de bolso IPq, 3a ed.; Condutas em Psiquiatria (Baldacara e Teng) |
| `tratado` | Tratado de Psiquiatria da ABP; Kaplan e Sadock, Compendio, 11a ed. |
| `prescricao` | Stahl, Guia de Prescricao |
| `psicofarmacologia` | Psicofarmacologia: Da Teoria a Clinica (2025) |
| `criterios` | DSM-5-TR (portugues); CID-11 |
| `infantojuvenil` | Psiquiatria da Infancia e Adolescencia (HCFMUSP, 2a ed. 2026). A de 2023 saiu da biblioteca em 14/09/2026, a pedido dele; o arquivo segue na conta |
| `saude-mulher` | Transtornos Psiquiatricos na Mulher (Artmed, 2023) |

Dentro de um genero, mais livro e estritamente melhor. A busca devolve os **8
melhores trechos no total**, e nao 8 por livro: somar um livro nao tira vaga de
ninguem, so acrescenta candidatos a disputa. Livro irrelevante perde e nao custa
nada; livro que cobre uma entidade rara — Cotard esta em alguns e nao em outros —
e a diferenca entre chegar nela e nao chegar.

O que dilui e **misturar genero**, e nao somar titulo. Numa pergunta diagnostica,
trechos de psicofarmacologia pontuam alto o bastante para ocupar vagas, porque
sao topicamente vizinhos, mas respondem outra pergunta. Foi isso que borrou a
resposta quando cinco livros competiam sem filtro.

## Quem le o que

Decidido em `RAG_SCOPE_BY_KIND`, no `server.py`, e em nenhum outro lugar.
Etapa fora do mapa busca sem filtro.

| Etapa | Genero(s) |
| --- | --- |
| Anamnese, Refinamento | `psicopatologia` + `entrevista` |
| Diagnostico, **gera** | `psicopatologia` + `sindromes` + `criterios`, e ate 4 trechos de `criterios` em busca garantida |
| Diagnostico, **revisa** | `tratado` |
| Tratamento, **gera** | `terapeutica` |
| Tratamento, **revisa** | `tratado` |
| Ajuste de conduta (retorno) | `terapeutica` |
| Historia clinica e evolucao do retorno | `terapeutica` + `tratado` |
| Medicamento | `prescricao` |
| Sintoma-Alvo | `psicofarmacologia` |
| BIPP TIPS | `psicofarmacologia` |

A primeira etapa do Refinamento (`refinement_scope`) esta no mapa, mas roda na
IA Nuvem sem busca: escolhe blocos de uma lista que vai no proprio prompt. A
revisao da ficha (`medication_review`, `psicofarmacologia`) tambem esta, e nao
tem botao na tela — ver abaixo.

Os dois ultimos generos nao estao nesta tabela, e e de proposito: **quem os pede
e o paciente, e nao a etapa.**

## Escopos que o paciente abre

Um tratado de psiquiatria da infancia nao tem o que dizer sobre um paciente de
50 anos, e teria tudo a dizer sobre um de 9. Por isso `infantojuvenil` e
`saude-mulher` sao enviados pelo cliente em `ragPatientScopes`, derivados da
data de nascimento e do sexo, e conferidos no servidor contra `RAG_PATIENT_SCOPES`
— escopo e filtro de busca, e valor vindo de fora nao entra em filtro sem
conferencia. Valem nas etapas de `KINDS_ACCEPTING_PATIENT_SCOPE`; na ficha de um
farmaco, por exemplo, o que se quer e a bula, e nao o capitulo de infancia.

Entram **por cima** da busca geral, com vaga propria e poucos trechos, como ja
fazia a busca garantida do criterio. Um adolescente com depressao continua
recebendo o que os livros de sempre dizem sobre depressao; o que se acrescenta e
o que so o livro da faixa diz, e que perderia a disputa por trecho contra cinco
tratados de adulto.

Medido em 02/09/2026 com o mesmo caso de humor deprimido em tres pacientes:

| Paciente | Escopo aberto | Tratamento proposto |
| --- | --- | --- |
| Crianca, 9 anos | `infantojuvenil` | Fluoxetina **5 mg/dia**, titulacao pediatrica |
| Mulher, 28 anos | `saude-mulher` | Sertralina 50 mg/dia |
| Homem, 45 anos | nenhum | Sertralina 50 mg/dia |

Sem o escopo, a crianca recebia a dose de adulto.

### Por que o Diagnostico le mais de um genero

Nomear a sindrome exige os dois lados: o **fenomeno** e a **entidade**.
Dalgalarrondo e Cheniaux descrevem o quadro pelo fenomeno — Cotard, catatonia,
delirio niilista, tracos melancolicos. A FMUSP vol. 2 organiza por entidade
nosologica.

Ate 28/08/2026 esta etapa lia **so** a FMUSP: os dois livros de psicopatologia do
acervo entravam na Anamnese e saiam antes da hora de nomear a sindrome. Num caso
de depressao psicotica com sindrome de Cotard, o app nao chegou nela — e um
modelo sem livro nenhum chegou.

Isto nao contradiz a decisao de cortar de cinco livros para um. O que diluia,
quando cinco competiam no mesmo embedding, era **psicofarmacologia disputando com
psicopatologia**: perguntas diferentes, resposta borrada. Livros do MESMO genero
se reforcam. O numero nunca foi o problema; a mistura de genero era.

O terceiro lado entrou em 28/08/2026: `criterios`, com o DSM-5-TR e a CID-11.
Fenomeno e entidade nao trazem o criterio operacional — "cinco dos nove sintomas
por duas semanas" — nem a lista de especificadores. Na primeira medicao os dois
livros perderam todas as vagas para os de psicopatologia, que usam o mesmo
vocabulario da consulta; por isso o criterio tem busca propria, com ate 4
trechos garantidos (`RAG_ALWAYS_SCOPE_BY_KIND`), somada a busca geral.

## Duas passadas no Diagnostico e no Tratamento

A primeira passada e o botao **Gerar**: propoe, o medico assinala. A segunda e o
botao **Refinar**, e e opcional — sem clique, o registro fica como a primeira
passada o deixou. O revisor recebe o caso inteiro, a resposta da primeira
passada e a marca `[assinalado pelo medico]` no que ele aceitou, e responde com
a MESMA estrutura, camada por camada. Nao e um comentario sobre a primeira
passada: e a primeira passada refeita, e **substitui a tela inteira** — o que a
revisao nao repetir sai do prontuario.

O geral propoe, o medico assinala, e o especializado entra depois para revisar,
em vez de competir com o geral na hora de propor.

O Medicamento teve segunda passada ate 02/09/2026. O botao **Refinar** da ficha
saiu por decisao dele — tres botoes numa consulta que e uma pergunta so —, e
desde 10/09/2026 o `App.js` nao tem mais o ramo de revisao. A etapa
`medication_review` continua no servidor, com schema, escopo e testes, sem porta
na tela. Se voltar, e onde a revisao mais pesa: o que se confere e dose,
titulacao, teto, contraindicacao e interacao, onde errar chega na receita. Num
teste com ficha errada de proposito — 400 mg/dia de sertralina, incremento a
cada 3 dias, "sem interacoes relevantes" —, a revisao devolveu teto de 200
mg/dia, incremento semanal, e IMAO e pimozida como contraindicacoes.

A ficha do Medicamento nao tem caixa de selecao, entao ali nao existe a marca
`[assinalado pelo medico]`, e a instrucao que fala dela nao entra no prompt
dessa etapa. Os campos que nao vem da IA — mecanismo, monitorizacao, populacoes
especiais, preenchidos pela busca local e online — nao sao tocados pela revisao.

Por isso os `kind` de revisao (`diagnosis_review`, `treatment_review`,
`medication_review`) reaproveitam schema, validacao e texto plano do `kind` que
revisam. So mudam tres coisas: a busca, que pergunta pelas hipoteses propostas em
vez de pelo quadro; o genero lido, que aponta para o outro livro; e a tarefa no
prompt, que poe o modelo no papel de revisor.

As duas revisoes leem o mesmo `tratado` porque o livro revisor e o mesmo. O que
separa revisar diagnostico de revisar tratamento e a pergunta e o contexto do
prompt, nao o corpus.

## Criterios do DSM-5-TR no Refinar (nao e RAG)

O Refinar do Diagnostico anexa, para cada hipotese assinalada pelo medico, a
secao **"Criterios Diagnosticos" do DSM-5-TR inteira**, recortada do livro, na
frente dos trechos do `tratado`. A revisao confere `criteria` item por item
contra esse texto.

```bash
python3 scripts/build_dsm_criteria.py "/caminho/DSM 5 TR - português.pdf"   # gera dsm_criteria.local.json
```

O arquivo fica fora do Git e o servidor nao o entrega por HTTP, como o
`book_chapters.local.json`. Sem ele, o Refinar funciona como antes, so com a
busca.

**Por que nao pela busca.** Medido em 14/09/2026 nos 10 casos ficticios, contando
se a secao de criterios do transtorno esperado chegava entre os 4 trechos
garantidos de `criterios`:

| Consulta | Criterio certo |
| --- | --- |
| A de producao (exame psiquico + queixa) | 2/10 |
| Nome das hipoteses, uma busca por hipotese | 4/10 |
| PDF convertido pelo MarkItDown, ou limpo com etiqueta de contexto | 2/10 a 3/10 |

A IA acertou o transtorno nos 10 casos mesmo assim: o que faltava nao era o nome,
era o texto dos criterios contra o qual conferir. A metrica antiga, "240 de 240
trechos", contava quantos trechos voltavam, e nao se eram os certos.

**Como a hipotese chega a secao.** Pelas duas rotas, somadas:

- o codigo DSM-5-TR do rotulo, contra o codigo impresso na linha do titulo da
  secao (88 das 159 secoes o trazem, sem repeticao);
- o nome: vale a secao cujo titulo inteiro esta no nome da hipotese. Entre
  titulos contidos um no outro fica o mais completo; entidades diferentes ficam
  as duas ("Transtorno de panico com agorafobia" traz Panico e Agorafobia).

No maximo 4 secoes. So a Secao II: os criterios propostos da Secao III ficam de
fora. O nome da hipotese principal chegou a secao certa em 10 de 10 nos casos
ficticios; onde a IA escreve com a redacao da CID-11 ("Transtorno depressivo,
episodio unico"), quem resolve e o codigo.

## Tirar um livro da biblioteca

```bash
python3 scripts/desassociar_rag.py --escopo psicofarmacologia          # so mostra
python3 scripts/desassociar_rag.py --file-id file-abc --aplicar
```

Desassociar **nao apaga da conta**: o arquivo continua la, e reassociar nao pede
novo upload de um PDF de centenas de megabytes. Livro tirado por engano volta em
segundos. Apagar da conta nao esta automatizado, e e de proposito — e a operacao
que nao tem volta, e nao deve ficar a um argumento de distancia da que tem.

Sairam da biblioteca em 28/08/2026, com os arquivos preservados na conta: o Stahl
Psicofarmacologia Clinica, o Stahl Guia de Prescricao 2019, o Cordioli
Psicofarmacos consulta rapida (os tres orfaos do antigo `farmacologia`, que nao
respondiam em etapa nenhuma), o Manual do Residente e uma segunda copia do
Tratado da ABP (psiquiatria geral, e nao tecnica de entrevista), e a copia
duplicada da Psicofarmacologia 2025, que a etiqueta por genero tornou
desnecessaria.

## BIPP TIPS

A ficha do Medicamento traz sempre a secao **BIPP TIPS** daquele farmaco, da
Psicofarmacologia: Da Teoria a Clinica (2025) — a mesma obra da revisao
do Medicamento, e por isso o mesmo genero. E chamada separada da ficha
porque e outra coisa: a ficha e redigida a partir da literatura, os tips sao
reproduzidos de uma secao que ja existe escrita, no fim do capitulo de cada
farmaco, antes das referencias.

A consulta e literalmente `BIPPTIPS <farmaco>`, duas palavras. `BIPPTIPS` e um
token raro, que so aparece no titulo da secao, e e ele que localiza o trecho.
Descrever o que a secao contem — "cuidados de uso, limite de dose, evidencia de
eficacia" — dilui o token em prosa farmacologica generica e a busca passa a
devolver o capitulo comum. Medido nos dois formatos: a consulta curta achou a
secao em seis de seis farmacos, a descritiva falhou em quatro.

Vai sem espaco porque e assim que sai da extracao do PDF: `BIPPTIPS`.

Medido em dez farmacos, tres rodadas, com e sem `rewrite_query`: 9/10, estavel
nas seis rodadas. So a venlafaxina nao volta.

Lista vazia e resposta legitima e significa que **este** farmaco nao tem a secao
— nunca a de um farmaco parecido. Num teste o litio veio vazio com a busca
trazendo o BIPP TIPS de outros oito farmacos, e a recusa foi o comportamento
certo. Sem tips, a caixa nao aparece: caixa vazia com o nome do livro afirmaria
que o livro nao tem nada a dizer sobre o farmaco, que e outra coisa.

Nao ha contingencia local para os BIPP TIPS. A caixa afirma reproduzir uma secao
de um livro nomeado; texto remontado de resposta solta nao e mais essa secao, e
a tela nao teria como dizer isso ao medico.

## Capitulo do livro na tela (nao e RAG)

Ao escolher o farmaco, a pagina Medicamentos abre sozinha o capitulo dele como
esta no livro: do nome com a bolinha ate o fim dos BIPP TIPS, sem
as referencias. Recorte definido pelo Dr. Regis — e como ele le o livro na
consulta.

Isso nao passa por RAG, e nao poderia passar. Busca semantica devolve trecho
solto e fora de ordem; emendar trecho solto com um modelo produz parafrase, que
e o oposto de "tal qual no livro". O texto vem recortado do PDF:

```bash
python3 -m pip install -r requirements.txt
python3 scripts/build_book_chapters.py "/caminho/Psicofarmacologia 2025.pdf"
```

A saida, `book_chapters.local.json`, fica **fora do Git** pela mesma razao que
os PDFs: e o livro. E fica fora da superficie estatica do servidor tambem —
servido como arquivo, um GET entregaria a obra inteira a quem pedisse. Sai por
`/api/book-chapter?medicamento=`, um capitulo por vez.

O recorte se apoia nas marcas de diagramacao do proprio livro:

| Marca | O que e |
| --- | --- |
| `● Nome` em linha propria | comeco do capitulo |
| `Referencias` ou `Leituras Recomendadas` | fim do recorte |
| linha com espaco a esquerda | titulo de secao ou item dos BIPP TIPS |
| `ROTULO:` em caixa alta, `Rotulo curto:` | campo nomeado |

Medido nos 186 capitulos: 186 com marcador de fim, 186 com BIPP TIPS, e **zero**
com bibliografia sobrando depois dos tips. As tres grafias da secao aparecem no
livro — `BIPP TIPS`, `BIPPTIPS` e `BIPP TIP` no singular, este ultimo so na
ciamemazina, que por causa dele parecia ser o unico capitulo sem a secao.

O PDF quebra a linha onde a coluna acaba, e nao onde o paragrafo acaba: nao ha
linha em branco entre paragrafos. Por isso o script remonta os blocos antes de
gravar, e a tela recebe o texto ja em paragrafos. A remontagem fica no script, e
nao na tela, porque o que distingue um cabecalho de um item e a marca de
diagramacao — que o navegador nao ve.

O texto do capitulo nao entra no prontuario salvo: sao 13 a 30 mil caracteres de
obra licenciada por farmaco, e o registro do paciente nao e lugar de guardar
copia de livro. Fica so enquanto a tela esta aberta. Ate 10/09/2026 isso era so
intencao: o capitulo ia junto com o rascunho ao salvar. Hoje o `App.js` o tira
do registro ao salvar e ao carregar.

## Codigos diagnosticos (nao e RAG)

Codigo nao se recupera por busca semantica. A recuperacao acerta o tema e erra o
digito: o trecho que descreve episodio depressivo cita `6A70`, e o modelo copia
`6A70` mesmo quando o caso e recorrente (`6A71`). Por isso codigo vem de tabela.

```bash
python3 scripts/build_code_tables.py   # monta as tres tabelas
python3 scripts/check_codes.py         # confere o catalogo local
```

| Tabela | Fonte | Licenca |
| --- | --- | --- |
| `src/data/codes/icd11Psi.json` | OMS, CID-11 MMS cap. 6 e 7, tabulacao simples (pt) | CC BY-ND 3.0 IGO |
| `src/data/codes/icd10cmF.json` | CDC/NCHS, ICD-10-CM cap. F | Dominio publico |
| `src/data/codes/crosswalk.json` | OMS, mapa 11->10, cruzado com a ICD-10-CM | CC BY-ND + dominio publico |

Nenhuma exige credencial: os tres sao arquivos de release publicos. A ICD-10-CM
e o conjunto de codigos que o DSM-5-TR imprime — o `F41.1` do DSM e codigo da
ICD-10-CM, nao da APA —, entao nenhum dos dois livros precisa ser indexado.
Isto e tabela de codigo; o criterio diagnostico continua vindo da RAG.

## Como o codigo entra no prontuario

O codigo nao e gerado, e resolvido:

1. A IA responde **nome e codigo da CID-11**. So isso.
2. O `server.py` confere o codigo contra a tabela da OMS. Nao existindo,
   reancora a hipotese pelo nome da entidade; falhando as duas, a hipotese
   sai sem codigo.
3. Ancorada, o **nome passa a ser o titulo oficial da OMS**. "Depressao Maior"
   e "Transtorno depressivo recorrente" nao sao a mesma afirmacao, e so a
   segunda corresponde ao codigo ao lado.
4. O codigo do **DSM-5-TR e derivado** do da CID-11 pelo mapa oficial. Codigo
   de DSM que venha na resposta da IA e descartado.

Isso existe porque instrucao de prompt nao resolveu. Mesmo mandado nao usar os
codigos numericos do DSM-IV, o modelo devolve `300.02` para TAG em chamada real
— e continua devolvendo. Derivar tira a decisao dele.

O capitulo 7 (sono-vigilia) entra junto com o 6 porque psiquiatra codifica
insonia. Numa chamada real a IA propos "Transtorno de Insonia - 7A00", codigo
legitimo que era descartado so por estar no capitulo vizinho.

O mapa da OMS as vezes para na categoria: `6A71 -> F33`, e a ICD-10-CM
subdivide em `F33.0..F33.9` conforme gravidade e sintoma psicotico. Nesse caso
sai `F33.-` (notacao padrao de codigo incompleto) e a lista de candidatos vai
no aviso, para o medico especificar. Codigo nao se completa por chute.

## Seguranca e qualidade

- A busca recusa respostas quando nenhum trecho supera `OPENAI_RAG_SCORE_THRESHOLD`.
- O backend devolve os nomes das fontes e escores usados.
- O modo RAG nao aplica o rascunho local como contingencia; uma falha fica visivel ao medico.
- A Anamnese consulta a biblioteca para organizar a cobertura semiológica sem transformar dados ausentes em negações.
- O Refinamento consulta a mesma biblioteca para explorar lacunas, discriminação diagnóstica e red flags a partir do que já foi salvo.
- Antes de uso assistencial, valide recuperacao e respostas com um conjunto de casos revisado por especialistas.
- Remova ou pseudonimize identificadores do paciente antes de qualquer uso real.
