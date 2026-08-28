# Prontuário Psiquiátrico

Prontuário eletrônico de consultório psiquiátrico, escrito para a pratica do
Dr. Regis Braga. Roda inteiro na propria maquina: um servidor Python em
`127.0.0.1` e um front em JavaScript sem framework nem build.

O programa acompanha a consulta na ordem em que ela acontece — historia
clinica, exame psiquico, exame fisico e neurologico, refinamento, resumo,
diagnostico, tratamento, sintoma-alvo e medicamentos — e em cada etapa a IA
**propoe** e o medico **assinala**. Nada vem assinalado, e nenhuma etapa fecha
sozinha.

## Abrir

Duplo clique em **Abrir Aplicativo.command**. Ele sobe o `server.py` se ainda
nao estiver no ar e abre `http://127.0.0.1:8000/`.

Na mao:

```bash
python3 -m pip install -r requirements.txt
python3 server.py
```

O `.env` guarda a chave da OpenAI e o Supabase; `.env.example` lista tudo o que
o servidor le. Sem chave, o app abre e as etapas de IA avisam que estao fora.

## Testar

```bash
python3 -m unittest discover -s testes    # servidor: blindagem, CSRF, schema
node --test 'testes/js/*.test.js'         # camada clinica do front
```

Os modulos clinicos sao funcoes puras — sem DOM, sem rede, sem chave de API — e
o Node os roda como estao, sem `package.json` e sem dependencia nenhuma.

## Onde esta o resto

| Documento | Assunto |
| --- | --- |
| [RAG.md](RAG.md) | biblioteca de psiquiatria, escopo por etapa, duas passadas, BIPP TIPS, tabelas de codigo |
| [SUPABASE.md](SUPABASE.md) | autenticacao e sincronizacao dos prontuarios |
| `scripts/` | indexacao do RAG, recorte de capitulo, montagem das tabelas de codigo |
| `carregar-caso.html` | carrega um caso ficticio no prontuario local, para experimentar sem paciente real |

## O que nao entra no Git

PDF de livro, o `book_chapters.local.json` recortado deles, o catalogo de
fontes, o `.env` e os audios de consulta. Obra licenciada e dado de paciente
ficam fora do versionamento — e o `server.py` tambem os recusa como arquivo
estatico, um a um.

## Antes de usar com paciente

O RAG.md fecha com o que falta: validar recuperacao e respostas com um conjunto
de casos revisado por especialista. Ate la, o programa e prototipo, e nenhuma
resposta dele substitui julgamento clinico.
