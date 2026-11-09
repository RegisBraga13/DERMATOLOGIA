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

As fontes dermatológicas não são copiadas do acervo psiquiátrico. O catálogo inicial está em `src/specialties/dermatologia/index.js` e só pode sair de `draft` depois de uma ingestão revisada, com versão, licença, escopo e data de atualização. Em Hipóteses, o médico escolhe IA generativa, RAG Dermatologia ou consulta manual no OpenEvidence/Medscape; a IA não envia o prontuário a esses sites, e o médico informa a URL e a síntese da fonte consultada. O modo RAG exige store próprio e validado (`DERMATOLOGY_RAG_ENABLED=true` e `OPENAI_DERMATOLOGY_RAG_VECTOR_STORE_ID`). A geração de conduta/tratamento continua bloqueada até habilitar fontes revisadas com `DERMATOLOGY_RECOMMENDATIONS_ENABLED=true` e escopo correspondente ativo. Toda hipótese fica para revisão e escolha do médico.

## Supabase sem custo adicional

O aplicativo funciona em modo local sem Supabase configurado. A migração é apenas um artefato versionado; ela não altera nenhum projeto hospedado automaticamente. Se for conectada a um projeto gratuito, aplique a migração nesse projeto e mantenha RLS habilitado.

## Verificação

```powershell
node --test 'testes/js/*.test.js'
```

O servidor mantém módulos psiquiátricos herdados para compatibilidade de testes, mas a superfície ativa não oferece geração clínica por essas rotas. RAG e guidelines dermatológicos dependem de acervo próprio validado.
