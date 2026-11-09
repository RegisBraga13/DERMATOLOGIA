# Prontuário Dermatológico

Aplicativo independente para documentação clínica em Dermatologia. Ele reutiliza a infraestrutura amadurecida do PSIQUIATRIA (armazenamento local, autenticação opcional, sincronização, segurança e testes), mas não compartilha o domínio clínico nem as chaves locais.

## O que já está separado

- entrada ativa `src/App.js`, com o dashboard, navegação, sequência de páginas, salvamento e prontuário longitudinal herdados da arquitetura original;
- conteúdo das páginas clínicas em `src/views/dermatologyFlow.js`;
- namespace clínico `src/specialties/dermatologia/`;
- anamnese dermatológica, antecedentes, exame físico de lesões, avaliação e conduta;
- armazenamento local isolado (`regis_dermatologia_v1` / `prontuario_dermatologico`);
- tabela Supabase independente em `supabase/migrations/20261105000000_dermatologia_prontuarios.sql`;
- catálogo de fontes RAG/guidelines dermatológicas em estado `draft`, sem inventar literatura;
- testes de contrato do módulo e regressão da infraestrutura herdada.

## Fontes clínicas

As fontes dermatológicas não são copiadas do acervo psiquiátrico. O catálogo de RAG/guidelines em `src/specialties/dermatologia/index.js` permanece em `draft`. Em Hipóteses, o médico escolhe IA generativa, RAG Dermatologia ou consulta manual no OpenEvidence/Medscape; a IA não envia o prontuário a esses sites, e o médico informa a URL e a síntese da fonte consultada. O modo RAG exige store próprio e validado (`DERMATOLOGY_RAG_ENABLED=true` e `OPENAI_DERMATOLOGY_RAG_VECTOR_STORE_ID`).

Para conduta, o servidor lê notas Markdown **locais** em `DERMATOLOGY_NOTES_DIR` (por padrão, `~/Downloads/Obsidian_Medicina/Obsidian_Medicina/Dermatologia`). O médico usuário declarou em 09/11/2026 que revisou e atualizou as 197 notas. O manifesto `dermatology_notes_validation.json` fixa as versões por SHA-256: uma nota alterada não será usada até nova atestação explícita com `python -m scripts.record_dermatology_notes_attestation --confirm-reviewed`. Até três notas com título correspondente à HD salva apoiam a proposta, com nome, hash e data da declaração exibidos ao médico. Hipóteses sem nota aparecem como lacuna. O conteúdo das notas não é copiado ao Git nem ao Supabase. A declaração de revisão clínica não é auditoria independente ou licença editorial para upload externo; a proposta continua sujeita à decisão médica. Em servidor remoto, configure uma pasta autorizada com os mesmos arquivos atestados.

## Supabase sem custo adicional

O aplicativo funciona em modo local sem Supabase configurado. A migração é apenas um artefato versionado; ela não altera nenhum projeto hospedado automaticamente. Se for conectada a um projeto gratuito, aplique a migração nesse projeto e mantenha RLS habilitado.

## Verificação

```powershell
node --test 'testes/js/*.test.js'
```

O servidor mantém módulos psiquiátricos herdados para compatibilidade de testes, mas a superfície ativa não oferece geração clínica por essas rotas. RAG e guidelines dermatológicos dependem de acervo próprio validado.
