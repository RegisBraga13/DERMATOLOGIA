# Supabase

O protótipo ainda usa `localStorage`. A migração SQL em `supabase/migrations/` cria a tabela `prontuarios` com RLS: cada usuário autenticado só acessa os próprios dados.

Antes de conectar o app:

1. Preencha `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` no `.env`.
2. Execute a migração no SQL Editor do Supabase.
3. Configure autenticação de usuários.
4. Troque o armazenamento local pela integração autenticada.

Não use `service_role` no navegador e não salve prontuários em uma tabela pública sem RLS.
