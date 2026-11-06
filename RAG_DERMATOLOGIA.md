# Plano de RAG e Guidelines — Dermatologia

Este arquivo define o contrato para o acervo dermatológico. Ele é deliberadamente conservador: nenhum documento é tratado como fonte clínica até passar por revisão e rastreabilidade.

## Escopos

| Escopo | Conteúdo esperado | Uso |
|---|---|---|
| `anamnese` | semiologia, fatores desencadeantes, exposições e sinais de alarme | apoio à coleta, nunca preenchimento automático sem confirmação |
| `exame-fisico` | morfologia, distribuição, anexos, mucosas e registro fotográfico | checklist de documentação |
| `diagnostico` | diferenciais e critérios de encaminhamento/biópsia | apoio à discussão, não diagnóstico autônomo |
| `conduta` | diretrizes e seguimento | proposta sujeita à decisão do médico |

## Metadados obrigatórios

Cada documento deverá registrar: título, entidade publicadora, versão, data de publicação, URL ou identificador persistente, licença, idioma, escopos, população e data de ingestão.

## Regras de segurança

1. Não enviar nome, CPF, datas identificáveis, fotografia ou texto livre do paciente para o buscador.
2. Resposta sem fonte, com fonte fora do escopo ou sem citação verificável não entra no prontuário.
3. O médico confirma hipóteses e condutas; a IA não fecha diagnóstico nem prescreve de forma autônoma.
4. Conteúdo licenciado fica no índice/servidor autorizado, nunca duplicado no registro clínico.

## Estado atual

O catálogo está em `draft`. A próxima etapa é selecionar fontes dermatológicas licenciadas e criar o pipeline de ingestão, avaliação por especialistas e testes de ancoragem antes de habilitar RAG ou guidelines na interface.

## Referências de semiologia para o catálogo de campos

O vocabulário inicial de lesões, configuração, cor, superfície, distribuição e palpação foi conferido contra a terminologia clínica do [DermNet](https://dermnetnz.org/topics/terminology), a descrição de lesões do [MSD Manual Professional](https://www.msdmanuals.com/professional/dermatologic-disorders/approach-to-the-dermatologic-patient/description-of-skin-lesions) e o roteiro de exame cutâneo da [American Academy of Dermatology](https://www.aad.org/member/education/residents/bdc/skin-exam). Essas referências orientam a interface; não são usadas como recomendação automática nem substituem revisão local.
