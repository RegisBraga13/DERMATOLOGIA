# Biblioteca RAG de psiquiatria

O aplicativo preserva o modo `IA atual` e oferece uma biblioteca RAG de semiologia psiquiátrica compartilhada pela Anamnese e pelo Refinamento, além de diagnóstico e tratamento.
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
