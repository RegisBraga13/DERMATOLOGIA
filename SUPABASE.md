# Supabase

Os prontuarios sao gravados **no aparelho** e sincronizados com o Supabase. Por
padrao (versao 1), a copia remota usa uma linha por conta. O formato opcional
v2 usa uma linha por paciente, consulta e retorno. No aparelho a via principal e IndexedDB; localStorage e a
reserva quando IndexedDB falha. As chaves locais sao separadas por id de conta.

## Como os dois convivem

`persist()`, no `App.js`, grava local primeiro e so depois sobe. A ordem e
proposital. Falha local e falha grave — o registro nao existe em lugar nenhum, e
o aviso e outro; falha de sincronizacao e o registro salvo aqui que ainda nao
subiu, e a barra de status diz exatamente isso: "Não sincronizado: ... O
registro está salvo neste aparelho."

No login, o que vem do Supabase e **unido** apenas ao espaco local dessa mesma
conta, e nao posto
no lugar (`mergeStates`, casado por `id`). Substituir apagaria o que foi escrito
enquanto a sincronizacao estava fora.

Registros anteriores a separacao por contas ficam sem titular atribuido.
O painel pede confirmacao explicita antes de importa-los para a conta
autenticada. A copia antiga nao e apagada automaticamente.

O `access_token` do Supabase dura cerca de uma hora, e o `supabaseService.js`
renova sozinho: sem isso, consulta comecada de manha e salva depois do almoco
levava 401 e nunca subia.
Ao abrir uma nova sessão do aplicativo, a identidade guardada no navegador é
confirmada com Supabase antes de ler o espaço local daquela conta. Uma falha
de rede nessa verificação mostra erro de abertura, não ativa o modo local.

## Configurar

1. Preencha `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no `.env` — nunca a
   `service_role`, que ignora RLS e no navegador entrega o banco inteiro.
2. Rode `supabase/migrations/20260810000000_prontuarios.sql` no SQL Editor.
   Ele cria `prontuarios` com RLS e as quatro politicas por `owner_id`: cada
   usuario autenticado so alcanca as proprias linhas.
3. Crie o usuario do medico no painel de Authentication do Supabase. Nao ha
   cadastro pela tela: o app so tem login.

Sem `.env` preenchido o app nao quebra — a tela de login recusa com "Supabase
não configurado no servidor.", e quem ja entrou continua gravando no aparelho.

A chave publica vai ao navegador pelo endpoint `/api/supabase-config`; ela nao
substitui as politicas RLS. Nunca coloque a chave `service_role` nessa variavel.

## Migracao opcional para linhas por registro (v2)

O valor padrao de `SUPABASE_STORAGE_VERSION` e `1`. O codigo da v2 existe para
permitir ensaiar e revisar a migracao, sem mudar a persistencia de producao
automaticamente. A tabela e as politicas estao em
`supabase/migrations/20261103000000_prontuario_registros_v2.sql`.

1. Faca backup e ensaie a restauracao do banco e dos navegadores usados. A
   copia v1 nao sera removida pela migracao.
2. Aplique a migracao SQL no projeto correto e verifique as quatro politicas
   RLS com duas contas de teste: cada uma deve ler/escrever apenas as proprias
   linhas. Nao confie apenas no teste automatizado do navegador.
3. Em ambiente de homologacao, configure `SUPABASE_STORAGE_VERSION=2`, abra
   uma conta com dados v1 e confira contagem e conteudo de pacientes, consultas
   e retornos no app, na tabela e apos recarregar outro dispositivo. A copia v1
   e combinada com os dados locais da mesma conta; `_migration_v1` so aparece
   apos a escrita de todos os registros. Repita para contas e volumes reais
   com dados sinteticos/anonimizados.
4. Planeje janela em que **todos** os aparelhos parem de gravar com clientes
   v1. Atualize os servidores/dispositivos antes de ativar v2. Um cliente v1
   gravando depois do marcador v2 nao e importado novamente.
5. Monitore falhas de sincronizacao e conte os registros por conta. Se precisar
   voltar a v1, pare as escritas e reconcilie os dados v2 de volta a v1 antes
   de trocar a flag: so mudar a flag deixa edicoes v2 fora da copia antiga.

Cada linha usa `owner_id` e chave composta por tipo/id. Atualizacoes usam
`version` como comparacao atomica e repetem a leitura em disputa. Isto reduz
colisoes entre pacientes distintos; edicoes concorrentes do **mesmo** registro
ainda seguem o criterio de `updatedAt` do `mergeStates`, sem revisao humana.
O app continua trazendo o conjunto da conta para o navegador; v2 ainda nao
fornece paginacao na interface nem prontuario multiusuario.

## O que ainda nao existe

- A v1 guarda o estado inteiro numa linha por medico. A v2 permite consulta
  por paciente no banco, mas ainda nao divide o paciente entre medicos nem
  restringe a leitura do conjunto da conta por tela ou funcao.
- **Sem resolucao de conflito por horario.** `mergeStates` casa por `id` e a
  versao local vence. Dois aparelhos editando o mesmo registro: o ultimo a
  gravar fica com a palavra final.
- A sessao vive no `sessionStorage`; o botao Sair encerra a sessao e limpa
  o prontuario da memoria da pagina. Os dados offline dessa conta continuam
  no armazenamento do navegador, sem criptografia propria do aplicativo.
