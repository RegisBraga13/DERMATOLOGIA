# Validação antes de uso assistencial

O formato JSON válido e a presença de uma fonte não demonstram correção clínica.
O app ainda é protótipo. Não habilitar uso como sistema principal de prescrição
sem medir erros em casos avaliados por psiquiatras.

## Corpus de avaliação

Montar casos sintéticos ou anonimizados, com autorização apropriada, cobrindo:
adulto, idoso, criança/adolescente, gestação, doença renal/hepática,
polifarmácia, risco suicida, mania/psicose, uso de substâncias, ausência de
diagnóstico definido e condições fora do acervo. Para cada caso, registrar
resposta esperada e decisões inaceitáveis antes de chamar a IA.

Avaliar separadamente: recuperação do documento correto; resposta sustentada
por trechos específicos; dose, via, duração, interação, contraindicação e
monitorização; ausência de afirmações inventadas; comportamento na falta de
fonte; e clareza das lacunas para o médico. Testar os três modos de IA e a
transcrição, inclusive erros de identificação de falantes.

## Critérios de liberação

1. Definir com os revisores limites de erro para cada tipo de saída, antes de
   medir. Erros graves de medicação, risco ou faixa etária devem bloquear a
   liberação até análise e correção.
2. Guardar modelo, versão do prompt/schema, identificador da decisão, fontes
   efetivamente lidas e decisão final do médico junto ao atendimento.
3. Repetir o corpus a cada mudança de modelo, acervo, prompt, esquema ou
   processamento de áudio. Comparar com a versão anterior.
4. Testar restauração de cópia de segurança e dois aparelhos editando o mesmo
   paciente antes de depender da sincronização como arquivo principal.

Não transformar automaticamente texto de IA em prescrição. As verificações
determinísticas de dose e interação exigem dados estruturados e fontes
versionadas; texto livre de diretriz não é uma base confiável para essa checagem.
