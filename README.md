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

### Dados locais e contas

Em modo local (`APP_MODE=local`, apenas `127.0.0.1`), o aplicativo usa o
armazenamento do navegador. Com Supabase configurado, cada conta usa chaves
locais separadas. Ao sair, os dados da conta saem da memória da página; a
cópia local continua no navegador dessa conta para funcionar sem rede.

Dados escritos antes dessa separação ficam preservados nas chaves antigas,
sem serem enviados automaticamente a nenhuma conta. Depois do login, o
painel oferece **Importar para esta conta**. Confirme apenas depois de verificar
que todos os registros antigos pertencem ao usuário exibido. Faça cópia
do navegador e do banco antes de migrar dados clínicos reais.

Para servidor acessível na rede, configure `APP_MODE=remote`,
`SUPABASE_URL` HTTPS e `SUPABASE_PUBLISHABLE_KEY`. O servidor recusa
iniciar sem essas duas variáveis. `APP_MODE=local` recusa `HOST=0.0.0.0`.
O acesso via Tailscale alcança o app a partir de outros aparelhos, mesmo com
o processo escutando em `127.0.0.1`. O serviço do Mac mini usa
`APP_MODE=remote` e exige Supabase configurado antes de publicar.

## Testar

```bash
python3 -m unittest discover -s testes    # servidor: blindagem, CSRF, schema
node --test 'testes/js/*.test.js'         # camada clinica do front
```

Os modulos clinicos sao funcoes puras — sem DOM, sem rede, sem chave de API — e
o Node os roda como estao, sem `package.json` e sem dependencia nenhuma.

Os nove testes de busca de capítulos exigem `book_chapters.local.json` gerado
localmente; esse arquivo licenciado não está no Git. A CI executa os testes
JS e os testes Python independentes desse arquivo até a suíte completa poder
ser reproduzida de forma isolada.

## Onde esta o resto

| Documento | Assunto |
| --- | --- |
| [RAG.md](RAG.md) | biblioteca de psiquiatria, escopo por etapa, duas passadas, BIPP TIPS, tabelas de codigo, diretrizes de conduta |
| [SUPABASE.md](SUPABASE.md) | autenticacao e sincronizacao dos prontuarios |
| `scripts/` | indexacao do RAG, recorte de capitulo, montagem das tabelas de codigo |
| `carregar-caso.html` | carrega um caso ficticio no prontuario local, para experimentar sem paciente real |

## Diretrizes de conduta

No Tratamento e no Ajuste de conduta, o seletor "Fonte da resposta" tem um
terceiro modo: **Guidelines**. Ele le um acervo de diretrizes de conduta que
fica em store **separada** da biblioteca dos 18 livros — outra busca, outro
script de ingestao, e nenhuma linha em `RAG_SCOPE_BY_KIND`. As duas nunca
competem por vaga, porque nunca rodam juntas: escolhe-se um modo por vez.

```bash
python3 scripts/ingest_guidelines.py "C:/Users/Regis/diretrizes"
```

Para medir a recuperacao depois de indexar:

```bash
node scripts/avaliar_diretrizes.mjs --limiares
```

Como nos outros modos, a IA propoe e o medico assinala. Este nao tem **Refinar**
e nao cai para a web: diretriz que nao cobre o caso devolve recusa visivel, e
nao uma resposta remontada de outra fonte. O porque de cada uma dessas escolhas
esta no [RAG.md](RAG.md).

## O que nao entra no Git

PDF de livro, o `book_chapters.local.json` recortado deles, os `.md` das
diretrizes, os catalogos de fontes, o `.env` e os audios de consulta. Obra licenciada e dado de paciente
ficam fora do versionamento — e o `server.py` tambem os recusa como arquivo
estatico, um a um.

## Antes de usar com paciente

O RAG.md fecha com o que falta: validar recuperacao e respostas com um conjunto
de casos revisado por especialista. Ate la, o programa e prototipo, e nenhuma
resposta dele substitui julgamento clinico.

# Persistência

O formato de sincronização por registro está preparado como versão opcional,
mas permanece desligado (`SUPABASE_STORAGE_VERSION=1`). Consulte
[`SUPABASE.md`](SUPABASE.md) para ensaiar a migração com backup, validar RLS e
coordenar a atualização dos dispositivos antes de ativá-lo.
