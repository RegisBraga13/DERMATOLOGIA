# Biblioteca RAG de psiquiatria

O aplicativo preserva o modo `IA atual` e oferece uma biblioteca RAG de psiquiatria. A de semiologia e compartilhada
pela Anamnese e pelo Refinamento; o Diagnostico e o Tratamento tem livro proprio em cada uma das suas duas passadas.
Os PDFs nao devem ser adicionados ao Git. Somente materiais licenciados ou autorizados devem ser indexados.

## Preparacao

```bash
python3 -m pip install -r requirements.txt
export OPENAI_API_KEY="..."
python3 scripts/ingest_rag.py \
  "/caminho/fonte-1.pdf" \
  "/caminho/fonte-2.pdf"
```

Copie o `OPENAI_RAG_VECTOR_STORE_ID` exibido para `.env` e reinicie `server.py`.

## Escopo da fonte

A biblioteca e uma so, mas as etapas nao pedem a mesma coisa: o tratado de
psicofarmacologia nao ajuda a conduzir uma anamnese, e a psicopatologia nao
dita dose. Cada fonte entra marcada com `--escopo`, e a busca filtra por etapa.

| Escopo | Quem recupera |
| --- | --- |
| `semiologia` | Anamnese, Refinamento |
| `farmacologia` | Medicamento |
| `sintomatico` | Sintoma-Alvo |
| `farmacologia` | tambem responde no Sintoma-Alvo |
| `ambos` | Anamnese, Refinamento, Medicamento |
| `diagnostico_base` | Diagnostico, primeira passada |
| `tratamento_base` | Tratamento, primeira passada |
| `refino` | as duas revisoes |

```bash
python3 scripts/ingest_rag.py --escopo sintomatico "/caminho/manejo-sintomatico.pdf"
```

Hoje a fonte do Sintoma-Alvo e o Guia de Prescricao do Stahl, que ja estava
indexado como `farmacologia` — por isso a etapa le tambem esse escopo, em vez
de reindexar 24 MB do mesmo arquivo so para trocar a etiqueta. Na pratica a
biblioteca e a mesma do Tratamento; o que muda e a pergunta, que busca manejo
do sintoma e nao diretriz da doenca.

`sintomatico` fica declarado e vazio. No dia que existir material que nao esteja
nesses livros — protocolo de urgencia, manual de manejo —, indexe com
`--escopo sintomatico` e ele entra sem mexer em codigo.

## Duas passadas no Diagnostico e no Tratamento

Estas duas etapas nao leem a lista inteira do escopo: leem **um livro cada**.
Decisao dele, depois de cinco livros competirem no mesmo embedding — a resposta
nao era rastreavel a uma fonte, e o livro especializado disputava com o geral na
hora de propor, quando ele deveria entrar depois, para revisar.

| Passada | Livro | Escopo |
| --- | --- | --- |
| Diagnostico, gera | Clinica Psiquiatrica FMUSP, vol. 2 | `diagnostico_base` |
| Diagnostico, revisa | Tratado de Psiquiatria da ABP | `refino` |
| Tratamento, gera | Clinica Psiquiatrica FMUSP, vol. 3 | `tratamento_base` |
| Tratamento, revisa | Tratado de Psiquiatria da ABP | `refino` |

A primeira passada e o botao **Gerar**: propoe, o medico assinala. A segunda e o
botao **Refinar**, e e opcional — sem clique, o registro fica como a primeira
passada o deixou. O revisor recebe o caso inteiro, a resposta da primeira
passada e a marca `[assinalado pelo medico]` no que ele aceitou, e responde com
a MESMA estrutura, camada por camada. Nao e um comentario sobre a primeira
passada: e a primeira passada refeita, e **substitui a tela inteira** — o que a
revisao nao repetir sai do prontuario.

Por isso os `kind` de revisao (`diagnosis_review`, `treatment_review`)
reaproveitam schema, validacao e texto plano do `kind` que revisam. So mudam
tres coisas: a busca, que pergunta pelas hipoteses propostas em vez de pelo
quadro; o escopo, que aponta para o outro livro; e a tarefa no prompt, que poe o
modelo no papel de revisor.

`refino` e um escopo so para as duas etapas porque o livro revisor e o mesmo. O
que separa revisar diagnostico de revisar tratamento e a pergunta e o contexto
do prompt, nao o corpus — subir o mesmo arquivo duas vezes para trocar o rotulo
nao mudaria o que a busca encontra.

As demais etapas nao foram tocadas: Anamnese, Refinamento, Sintoma-Alvo e
Medicamento seguem com os escopos e os livros de antes.

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
