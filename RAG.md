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
python3 scripts/build_code_tables.py           # ICD-10-CM, sem credencial
python3 scripts/build_code_tables.py --icd11   # tambem a CID-11
python3 scripts/check_codes.py                 # confere o catalogo local
```

| Tabela | Fonte | Licenca | Credencial |
| --- | --- | --- | --- |
| `src/data/codes/icd10cmF.json` | CDC/NCHS, ICD-10-CM cap. F | Dominio publico | nao |
| `src/data/codes/icd11Cap6.json` | OMS, CID-11 MMS cap. 6 | CC BY-ND 3.0 IGO | sim |

A ICD-10-CM e o conjunto de codigos que o DSM-5-TR imprime: o `F41.1` do DSM e
codigo da ICD-10-CM, nao da APA. Nenhum dos dois livros e indexado — isto e
tabela de codigo, o criterio diagnostico continua vindo da biblioteca RAG.

Para a CID-11, registre-se de graca em <https://icd.who.int/icdapi> e ponha
`ICD_API_CLIENT_ID` e `ICD_API_CLIENT_SECRET` no `.env`.

O `server.py` confere contra essas tabelas todo codigo que a IA devolve. O que
nao existir, ou nao tiver o formato da classificacao, e removido e a hipotese
sai sem codigo — com aviso na tela, porque codigo ausente e normal em sindrome
descritiva e sem o aviso um codigo inventado se disfarcaria de codigo que nunca
existiu. Enquanto a tabela da CID-11 nao existir, os codigos `6xxx` passam sem
conferencia.

## Seguranca e qualidade

- A busca recusa respostas quando nenhum trecho supera `OPENAI_RAG_SCORE_THRESHOLD`.
- O backend devolve os nomes das fontes e escores usados.
- O modo RAG nao aplica o rascunho local como contingencia; uma falha fica visivel ao medico.
- A Anamnese consulta a biblioteca para organizar a cobertura semiológica sem transformar dados ausentes em negações.
- O Refinamento consulta a mesma biblioteca para explorar lacunas, discriminação diagnóstica e red flags a partir do que já foi salvo.
- Antes de uso assistencial, valide recuperacao e respostas com um conjunto de casos revisado por especialistas.
- Remova ou pseudonimize identificadores do paciente antes de qualquer uso real.
