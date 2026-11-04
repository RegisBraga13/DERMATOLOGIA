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
   Aplique também `supabase/migrations/20261104015410_prontuarios_owner_unico.sql`
   antes de publicar o novo cliente. Ela exige uma linha por conta. Se já
   houver duplicatas, a migração para e pede reconciliação manual, sem escolher
   uma cópia automaticamente. No projeto `PrototipoMac` ela já foi aplicada
   e verificada em 04/11/2026; não é necessário executá-la outra vez.
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
`supabase/drafts/prontuario_registros_v2.sql`. O arquivo permanece fora de
`migrations` para que um futuro `supabase db push` não aplique a v2 antes
do ensaio. Após a validação, crie uma migração com versão posterior à v1
e copie o SQL revisado para ela.
O job `postgres-rls` da CI ensaia o SQL em PostgreSQL descartável com duas
contas sintéticas, incluindo bloqueios de RLS e disputa de versões. Ainda é
necessário verificar o fluxo completo do aplicativo nos aparelhos. O job
`supabase-rest` sobe Auth e API REST locais, aplica a v2 e testa duas contas
fictícias, as leituras e escritas autorizadas, disputa de versão e histórico
de conflitos; ele não usa o projeto remoto. A migração v2 revoga privilégios
padrão antes de conceder apenas os necessários às duas tabelas.

1. Faca backup e ensaie a restauracao do banco e dos navegadores usados. A
   copia v1 nao sera removida pela migracao.
2. Aplique a migracao SQL no projeto correto e verifique RLS em ambas as tabelas
   com duas contas de teste: cada uma deve acessar apenas as proprias linhas e
   nao pode alterar/apagar o historico de conflitos. Nao confie apenas no teste
   automatizado do navegador.
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
`version` como comparacao atomica e repetem a leitura em disputa. A ultima
versao sincronizada tem apenas resumos SHA-256 por registro no armazenamento
local: quando dois aparelhos alteram independentemente o mesmo registro, a
sincronizacao para e mostra as duas copias ao medico. A escolha explicita so
e aplicada apos arquivar ambas em `prontuario_conflitos`, onde o navegador
tem permissao para inserir e consultar, mas nao alterar ou apagar. Em uma
primeira sincronizacao sem historico local de versoes, o codigo ainda usa
`updatedAt` para juntar dados antigos; por isso o ensaio com backup e uma
janela sem clientes v1 continuam obrigatorios. A copia arquivada nao substitui
backup externo nem uma politica de retencao.
O app continua trazendo o conjunto da conta para o navegador; v2 ainda nao
fornece paginacao na interface nem prontuario multiusuario.

## O que ainda nao existe

- A v1 guarda o estado inteiro numa linha por medico. A v2 permite consulta
  por paciente no banco, mas ainda nao divide o paciente entre medicos nem
  restringe a leitura do conjunto da conta por tela ou funcao.
- A v1 ainda usa `mergeStates` por horario e nao detecta duas edicoes do mesmo
  registro. A v2 detecta apos o primeiro sync concluido, mas nao faz fusao
  automatica campo a campo: o medico deve comparar as duas versoes.
- A sessao vive no `sessionStorage`; o botao Sair encerra a sessao e limpa
  o prontuario da memoria da pagina. Os dados offline dessa conta continuam
  no armazenamento do navegador, sem criptografia propria do aplicativo.
