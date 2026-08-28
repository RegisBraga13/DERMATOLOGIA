# Supabase

Os prontuarios sao gravados **no aparelho** e sincronizados com o Supabase, uma
linha por medico. Nao e um ou outro: o `localStorage` e a gravacao que sempre
acontece, e a copia remota e o que sobrevive a troca de computador.

## Como os dois convivem

`persist()`, no `App.js`, grava local primeiro e so depois sobe. A ordem e
proposital. Falha local e falha grave — o registro nao existe em lugar nenhum, e
o aviso e outro; falha de sincronizacao e o registro salvo aqui que ainda nao
subiu, e a barra de status diz exatamente isso: "Não sincronizado: ... O
registro está salvo neste aparelho."

No login, o que vem do Supabase e **unido** ao que esta no aparelho, e nao posto
no lugar (`mergeStates`, casado por `id`). Substituir apagaria o que foi escrito
enquanto a sincronizacao estava fora.

O `access_token` do Supabase dura cerca de uma hora, e o `supabaseService.js`
renova sozinho: sem isso, consulta comecada de manha e salva depois do almoco
levava 401 e nunca subia.

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

A chave nao vai no HTML: o front pede `/api/supabase-config` ao `server.py`.

## O que ainda nao existe

- **Um prontuario por medico, nao por paciente.** A tabela guarda o estado
  inteiro num `payload` jsonb, numa linha so. Serve para um consultorio; nao
  serve para dois medicos dividindo pacientes, nem para consulta por paciente
  no banco.
- **Sem resolucao de conflito por horario.** `mergeStates` casa por `id` e a
  versao local vence. Dois aparelhos editando o mesmo registro: o ultimo a
  gravar fica com a palavra final.
- **Sem `signOut`.** A sessao vive no `sessionStorage` e vai embora quando a
  aba fecha.
