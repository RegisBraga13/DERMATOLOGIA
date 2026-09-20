"""Testes unitarios basicos do server.py.

Cobrem o comportamento que foi corrigido/adicionado nas revisoes recentes
(exposicao de .env, CSRF, multipart de audio, parsing de JSON do modelo,
validacao de schema) para garantir que ele nao regrida em mudancas futuras.

Usa so a biblioteca padrao (unittest) -- nao precisa instalar nada.

Rodar a partir da raiz do projeto:
    python3 -m unittest discover -s testes -v
ou so este arquivo:
    python3 -m unittest testes.test_server -v
"""
import json
import logging
import sys
import unittest
import urllib.error
import urllib.request
from http.client import HTTPConnection
from pathlib import Path
from threading import Thread
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402  (precisa do sys.path acima)


class FakeHandler:
    """Confere so o que is_same_origin le: self.headers."""

    def __init__(self, headers):
        self.headers = headers


class IsBlockedPathTests(unittest.TestCase):
    """GET /.env vazava a OPENAI_API_KEY antes da correcao -- estes testes
    travam esse comportamento no lugar."""

    def test_blocks_env_file(self):
        self.assertTrue(server.is_blocked_path((".env",)))

    def test_blocks_env_variants_by_prefix(self):
        self.assertTrue(server.is_blocked_path((".env.local",)))
        self.assertTrue(server.is_blocked_path((".env.production",)))

    def test_blocks_git_directory_contents(self):
        self.assertTrue(server.is_blocked_path((".git", "config")))

    def test_blocks_python_source_and_secrets(self):
        self.assertTrue(server.is_blocked_path(("server.py",)))
        self.assertTrue(server.is_blocked_path(("chave.pem",)))
        self.assertTrue(server.is_blocked_path(("chave.key",)))

    def test_blocks_rag_sources_local(self):
        self.assertTrue(server.is_blocked_path(("rag_sources.local.json",)))

    def test_blocks_patient_audio(self):
        self.assertTrue(server.is_blocked_path(("testes", "gravacao.m4a")))

    def test_allows_normal_static_assets(self):
        self.assertFalse(server.is_blocked_path(("index.html",)))
        self.assertFalse(server.is_blocked_path(("src", "App.js")))
        self.assertFalse(server.is_blocked_path(("src", "styles", "theme.css")))
        self.assertFalse(server.is_blocked_path(("fonts", "Outfit-Variable.woff2")))

    def test_case_insensitive(self):
        self.assertTrue(server.is_blocked_path((".ENV",)))
        self.assertTrue(server.is_blocked_path(("SERVER.PY",)))


class IsSameOriginTests(unittest.TestCase):
    """POST /api/clinical-ai sem esta checagem aceitava CSRF de qualquer site
    aberto no navegador do medico."""

    def test_same_origin_passes(self):
        handler = FakeHandler({"Origin": "http://127.0.0.1:8000", "Host": "127.0.0.1:8000"})
        self.assertTrue(server.is_same_origin(handler))

    def test_cross_origin_blocked(self):
        handler = FakeHandler({"Origin": "https://site-malicioso.example", "Host": "127.0.0.1:8000"})
        self.assertFalse(server.is_same_origin(handler))

    def test_missing_origin_allowed(self):
        # curl, healthcheck local, alguns navegadores antigos em same-origin.
        handler = FakeHandler({"Host": "127.0.0.1:8000"})
        self.assertTrue(server.is_same_origin(handler))

    def test_malformed_origin_blocked(self):
        handler = FakeHandler({"Origin": "://invalido", "Host": "127.0.0.1:8000"})
        self.assertFalse(server.is_same_origin(handler))


class OpenAIMultipartTests(unittest.TestCase):
    """Monta o corpo multipart enviado para a API de transcricao de audio."""

    def test_includes_fields_and_file_part(self):
        body, boundary = server.openai_multipart(
            {"model": "gpt-4o-transcribe-diarize", "language": "pt"},
            "file",
            "consulta.webm",
            "audio/webm",
            b"\x00\x01dados-de-audio",
        )
        text = body.decode("latin-1")
        self.assertIn(boundary, text)
        self.assertIn('name="model"', text)
        self.assertIn("gpt-4o-transcribe-diarize", text)
        self.assertIn('name="file"; filename="consulta.webm"', text)
        self.assertIn("Content-Type: audio/webm", text)
        self.assertTrue(body.endswith(f"--{boundary}--\r\n".encode()))

    def test_sanitizes_path_traversal_in_filename(self):
        _, _ = server.openai_multipart({}, "file", "x", "audio/webm", b"")  # smoke
        body, _ = server.openai_multipart(
            {}, "file", "../../etc/passwd", "audio/webm", b"a",
        )
        text = body.decode("latin-1")
        self.assertIn('filename="passwd"', text)
        self.assertNotIn("..", text)

    def test_falls_back_to_default_filename_when_empty(self):
        body, _ = server.openai_multipart({}, "file", "", "audio/webm", b"a")
        self.assertIn('filename="consulta.webm"', body.decode("latin-1"))

    def test_strips_quotes_from_filename(self):
        body, _ = server.openai_multipart({}, "file", 'mal"icioso.webm', "audio/webm", b"a")
        text = body.decode("latin-1")
        self.assertIn('filename="malicioso.webm"', text)


class DiarizedTranscriptionTests(unittest.TestCase):
    """Parsing da resposta da API de transcricao -- sem chamada de rede real."""

    def _mock_response(self, payload):
        response = MagicMock()
        response.read.return_value = json.dumps(payload).encode("utf-8")
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        return response

    def test_parses_segments_with_speakers(self):
        payload = {
            "text": "ola doutor. como vai.",
            "duration": 5.4321,
            "segments": [
                {"speaker": "medico", "start": 0, "end": 1.999, "text": " ola doutor "},
                {"speaker": "paciente", "start": 2, "end": 4, "text": "como vai"},
                {"speaker": "medico", "start": 4, "end": 4, "text": "   "},  # vazio -> descartado
            ],
        }
        with patch.object(server.urllib.request, "urlopen", return_value=self._mock_response(payload)):
            result = server.diarized_transcription(b"audio", "c.webm", "audio/webm", "fake-key")

        self.assertEqual(result["text"], "ola doutor. como vai.")
        self.assertEqual(result["duration"], 5.43)
        self.assertEqual(len(result["segments"]), 2)
        self.assertEqual(result["segments"][0]["speaker"], "medico")
        self.assertEqual(result["segments"][0]["text"], "ola doutor")
        self.assertEqual(result["segments"][1]["speaker"], "paciente")

    def test_falls_back_to_full_text_when_no_segments(self):
        payload = {"text": "transcricao unica sem diarizacao", "duration": 3, "segments": []}
        with patch.object(server.urllib.request, "urlopen", return_value=self._mock_response(payload)):
            result = server.diarized_transcription(b"audio", "c.webm", "audio/webm", "fake-key")

        self.assertEqual(len(result["segments"]), 1)
        self.assertEqual(result["segments"][0]["speaker"], "?")
        self.assertEqual(result["segments"][0]["text"], "transcricao unica sem diarizacao")


class ParseModelJsonTests(unittest.TestCase):

    def test_parses_plain_json(self):
        self.assertEqual(server.parse_model_json('{"a": 1}'), {"a": 1})

    def test_parses_json_with_surrounding_prose_or_fences(self):
        text = 'Aqui esta:\n```json\n{"a": 1, "b": [2, 3]}\n```\nFim.'
        self.assertEqual(server.parse_model_json(text), {"a": 1, "b": [2, 3]})

    def test_raises_on_no_json_present(self):
        with self.assertRaises(json.JSONDecodeError):
            server.parse_model_json("nao ha json nenhum aqui")


class ValidateResultTests(unittest.TestCase):

    def test_anamnesis_valid(self):
        result = {"chief_complaint": "texto", "hda": "texto", "medical_history": "texto", "symptoms": ["a"]}
        self.assertEqual(server.validate_result("anamnesis", result), result)

    def test_anamnesis_rejects_wrong_type_on_narrative_field(self):
        with self.assertRaises(ValueError):
            server.validate_result("anamnesis", {"chief_complaint": ["nao deveria ser lista"]})

    # As seis camadas do diagnostico, e nao as tres de agosto de 2026: quando
    # comorbidade e agravante ganharam bloco proprio, o validador passou a
    # conferir os seis e este caso parou de montar uma resposta completa.
    # Faltando comorbidity_options, a falha era "aceita no maximo 3 opcoes" —
    # queixa de quantidade sobre um campo que nao veio.
    @staticmethod
    def diagnosis_result(**alteracoes):
        opcao = {"name": "x", "cid11": "y", "dsm5tr": "z"}
        base = {
            "psychopathological_analysis": [
                {"domain": "Humor", "finding": "deprimido", "evidence": "parou de sair e de cozinhar"}
            ],
            "syndromic_options": [dict(opcao) for _ in range(3)],
            "nosological_options": [dict(opcao) for _ in range(3)],
            "etiological_options": [dict(opcao) for _ in range(2)],
            "comorbidity_options": [dict(opcao) for _ in range(3)],
            "specifier_options": [{"name": "grave", "applies_to": "x"}],
            "aggravating_options": [{"name": "insonia cronica", "effect": "piora o curso"}],
        }
        base.update(alteracoes)
        return base

    def test_diagnosis_accepts_all_groups_at_the_limit(self):
        result = self.diagnosis_result()
        validado = server.validate_result("diagnosis", result)
        self.assertEqual(len(validado["nosological_options"]), 3)
        self.assertEqual(len(validado["comorbidity_options"]), 3)
        # Sindrome nao e entidade catalogada: o codigo cai fora por construcao.
        for option in validado["syndromic_options"]:
            self.assertEqual(option["cid11"], "")
            self.assertEqual(option["dsm5tr"], "")

    def test_diagnosis_accepts_every_group_empty(self):
        """Teto, nao piso: registro que nao sustenta hipotese nao e erro."""
        vazios = {chave: [] for chave in self.diagnosis_result()}
        self.assertEqual(server.validate_result("diagnosis", vazios), vazios)

    def test_analysis_drops_the_item_it_could_not_anchor(self):
        """Achado sem evidencia no registro e afirmacao, e cai fora.

        Descartar o item e melhor do que mostra-lo na tela com cara de
        ancorado, e melhor do que derrubar a resposta inteira por causa dele —
        os achados bem ancorados iriam junto.
        """
        validado = server.validate_result("diagnosis", self.diagnosis_result(
            psychopathological_analysis=[
                {"domain": "Humor", "finding": "deprimido", "evidence": "parou de sair"},
                {"domain": "Cognicao", "finding": "declinio provavel", "evidence": "   "},
                {"domain": "", "finding": "achado sem dominio", "evidence": "algo"},
                {"domain": "Risco", "finding": "", "evidence": "sem achado"},
            ]))
        self.assertEqual(len(validado["psychopathological_analysis"]), 1)
        self.assertEqual(validado["psychopathological_analysis"][0]["domain"], "Humor")

    def test_analysis_missing_group_says_it_is_missing(self):
        result = self.diagnosis_result()
        del result["psychopathological_analysis"]
        with self.assertRaisesRegex(ValueError, "nao veio na resposta"):
            server.validate_result("diagnosis", result)

    def test_analysis_rejects_more_than_eight_domains(self):
        item = {"domain": "Humor", "finding": "deprimido", "evidence": "parou de sair"}
        with self.assertRaisesRegex(ValueError, "aceita no maximo 8 opcoes"):
            server.validate_result("diagnosis", self.diagnosis_result(
                psychopathological_analysis=[dict(item) for _ in range(9)]))

    def test_diagnosis_rejects_wrong_option_count(self):
        with self.assertRaisesRegex(ValueError, "aceita no maximo 3 opcoes"):
            server.validate_result("diagnosis", self.diagnosis_result(
                nosological_options=[{"name": "x", "cid11": "y", "dsm5tr": "z"}] * 4))

    # Campo ausente e campo com opcoes demais sao problemas diferentes e agora
    # dizem coisas diferentes. Enquanto davam a mesma mensagem, a falha deste
    # proprio arquivo mandava procurar opcao demais onde nao veio opcao nenhuma.
    def test_diagnosis_missing_group_says_it_is_missing(self):
        incompleto = self.diagnosis_result()
        del incompleto["comorbidity_options"]
        with self.assertRaisesRegex(ValueError, "nao veio na resposta"):
            server.validate_result("diagnosis", incompleto)

    def test_diagnosis_group_of_wrong_type_says_it_is_not_a_list(self):
        with self.assertRaisesRegex(ValueError, "deveria ser uma lista"):
            server.validate_result("diagnosis", self.diagnosis_result(aggravating_options="insonia"))

    # A segunda passada devolve a MESMA estrutura da primeira, e por isso
    # reaproveita schema e validacao do kind que revisa. Se o alias se perder, a
    # revisao passa a nao ser validada — cai no ramo final, que nao confere
    # nada — e uma resposta torta chega a tela sem ninguem reclamar.
    def test_review_kinds_validate_as_the_kind_they_review(self):
        for revisao, base in server.REVIEW_OF_KIND.items():
            self.assertIs(server.SCHEMAS[revisao], server.SCHEMAS[base])
            self.assertIn(revisao, server.ALLOWED_KINDS)
        with self.assertRaisesRegex(ValueError, "aceita no maximo 3 opcoes"):
            server.validate_result("diagnosis_review", self.diagnosis_result(
                nosological_options=[{"name": "x", "cid11": "y", "dsm5tr": "z"}] * 4))

    def test_each_kind_reads_its_own_books(self):
        """Uma etapa por escopo, e o escopo aponta para onde se espera.

        Trocar duas linhas do mapa nao quebra nada visivelmente: a etapa
        responde, so que lendo o livro da outra. O Tratamento passaria a
        diagnosticar pela psicofarmacologia sem nenhum erro na tela.
        """
        esperado = {
            "anamnesis": ("psicopatologia", "entrevista"),
            "refinement": ("psicopatologia", "entrevista"),
            "refinement_scope": ("psicopatologia", "entrevista"),
            # Os dois lados: o fenomeno (Dalgalarrondo, Cheniaux) e a entidade
            # (FMUSP vol. 2). Lendo so a FMUSP, o app nao chegou a sindrome de
            # Cotard num caso que a tinha.
            "diagnosis": ("psicopatologia", "sindromes", "criterios"),
            "diagnosis_review": ("tratado",),
            "treatment": ("terapeutica",),
            "treatment_review": ("tratado",),
            "medication": ("prescricao",),
            "medication_review": ("psicofarmacologia",),
            "medication_tips": ("psicofarmacologia",),
            "symptomatic": ("psicofarmacologia",),
            # Duas prateleiras porque sao duas perguntas: a conduta (quando
            # ajustar, quando trocar) e o curso (o que e remissao, o que e
            # recaida). Ate 31/08/2026 nao havia linha nenhuma, e a Evolucao era
            # a unica etapa clinica que escrevia sem livro.
            "evolution": ("terapeutica", "tratado"),
        }
        # Nenhuma etapa clinica pode ficar de fora do mapa: sem linha aqui, a
        # etapa nao falha -- ela responde de cabeca, e a falta so aparece na
        # ausencia do painel de fontes, que e onde ninguem olha.
        for kind in ("anamnesis", "diagnosis", "treatment", "evolution"):
            self.assertIn(kind, server.RAG_SCOPE_BY_KIND, kind)
        for kind, escopos in esperado.items():
            self.assertEqual(server.RAG_SCOPE_BY_KIND[kind], escopos, kind)
        # O escopo nomeia o GENERO do livro, e nunca o leitor. Nome de leitor
        # aqui significa que a etiqueta voltou a carregar decisao: mudar quem le
        # passaria a exigir re-etiquetar arquivo na nuvem, e o mesmo livro
        # precisaria ser subido duas vezes para servir duas etapas.
        todos = {escopo for escopos in server.RAG_SCOPE_BY_KIND.values() for escopo in escopos}
        for escopo in todos:
            self.assertNotRegex(escopo, r"_base$|^refino$|_refino$",
                                f"{escopo} nomeia quem le, e nao o que o livro e")

    def test_refinement_requires_three_to_eight_questions(self):
        with self.assertRaises(ValueError):
            server.validate_result("refinement", {
                "questions": [{"prompt": "p", "options": ["a", "b"]}],  # so 1, precisa 3-8
                "red_flags": [], "observations": [], "important_points": [],
            })


class CodeMatchesNameTests(unittest.TestCase):
    """O codigo precisa COMBINAR com o nome, e nao apenas existir.

    Numa chamada real de 28/08/2026 a IA nomeou "Transtorno depressivo maior,
    episodio atual grave COM sintomas psicoticos" e devolveu 6A70.3, que na
    tabela da OMS e "grave, SEM sintomas psicoticos". O codigo existe, entao a
    conferencia antiga aprovava — e a hipotese chegava ao prontuario com um
    codigo que afirma o contrario do nome ao lado dele.
    """

    def nosologica(self, nome, cid11):
        r = {"nosological_options": [{"name": nome, "cid11": cid11, "dsm5tr": ""}]}
        avisos = server.verify_diagnostic_codes(r)
        return r["nosological_options"][0], avisos

    def test_reanchors_on_the_sibling_that_matches_the_name(self):
        """6A70.3 e 6A70.4 diferem em um digito e na presenca de psicose. Havendo
        UM irmao que afirma tudo o que o nome afirma, e ele -- busca em tabela,
        e nao chute."""
        opcao, avisos = self.nosologica(
            "Transtorno depressivo maior, episódio atual grave com sintomas psicóticos", "6A70.3")
        self.assertEqual(opcao["cid11"], "6A70.4")
        self.assertIn("com sintomas psicóticos", opcao["cid11Title"])
        self.assertTrue(any(a["kind"] == "mismatch" and "reancorado em 6A70.4" in a["text"] for a in avisos))

    def test_the_derived_dsm_code_follows_the_corrected_one(self):
        """Reancorar sem refazer o DSM derivado trocaria uma incoerencia por
        outra."""
        opcao, _ = self.nosologica(
            "Transtorno depressivo maior, episódio atual grave com sintomas psicóticos", "6A70.3")
        self.assertEqual(opcao["dsm5tr"], "F32.3")

    def test_recurrent_episode_uses_its_own_family(self):
        opcao, _ = self.nosologica(
            "Transtorno depressivo recorrente, episódio atual grave com sintomas psicóticos", "6A71.3")
        self.assertEqual((opcao["cid11"], opcao["dsm5tr"]), ("6A71.4", "F33.3"))

    def test_a_code_that_matches_is_left_alone(self):
        opcao, avisos = self.nosologica("Transtorno de ansiedade generalizada", "6B00")
        self.assertEqual(opcao["cid11"], "6B00")
        self.assertFalse([a for a in avisos if a["kind"] == "mismatch"])

    def test_a_name_that_asserts_nothing_does_not_contradict(self):
        """"Depressao maior" nao diz gravidade, curso nem psicose. Traco ausente
        de um dos lados nao e contradicao -- exigir isso reprovaria quase toda
        hipotese por diferenca de redacao."""
        opcao, avisos = self.nosologica("Depressão maior", "6A70.3")
        self.assertEqual(opcao["cid11"], "6A70.3")
        self.assertFalse([a for a in avisos if a["kind"] == "mismatch"])

    def test_without_a_single_matching_sibling_the_code_is_dropped(self):
        """Codigo que o medico tomaria por conferido e pior do que nenhum."""
        r = {"nosological_options": [{"name": "Transtorno de ansiedade generalizada grave com sintomas psicóticos",
                                      "cid11": "6B00", "dsm5tr": ""}]}
        avisos = server.verify_diagnostic_codes(r)
        opcao = r["nosological_options"][0]
        if [a for a in avisos if a["kind"] == "mismatch"]:
            self.assertEqual(opcao["cid11"], "")
            self.assertEqual(opcao["cid11Title"], "")

    def test_syndromic_layer_stays_without_codes(self):
        """Sindrome nao e entidade catalogada, e o validate_result esvazia os
        codigos dela. Se a IA a chama pelo titulo oficial da OMS, o verificador
        nao pode reancorar pelo nome e devolver o codigo."""
        r = {"syndromic_options": [{"name": "Transtorno de ansiedade generalizada", "cid11": "", "dsm5tr": ""}],
             "nosological_options": [{"name": "Transtorno de ansiedade generalizada", "cid11": "", "dsm5tr": ""}]}
        avisos = server.verify_diagnostic_codes(r)
        sindrome = r["syndromic_options"][0]
        self.assertEqual((sindrome["cid11"], sindrome["dsm5tr"]), ("", ""))
        self.assertNotIn("cid11Title", sindrome)
        self.assertFalse([a for a in avisos if "sindrom" in a["text"].lower()])
        # a nosologica, com o mesmo nome, continua sendo ancorada
        self.assertEqual(r["nosological_options"][0]["cid11"], "6B00")

    def test_traits_read_both_languages(self):
        """A tabela da OMS traz titulo em portugues e nameEN em ingles."""
        self.assertEqual(server.diagnostic_traits("severe, with psychotic symptoms")["psicotico"], True)
        self.assertEqual(server.diagnostic_traits("severe, without psychotic symptoms")["psicotico"], False)
        self.assertEqual(server.diagnostic_traits("Recurrent depressive disorder")["curso"], "recorrente")


class CareLevelTests(unittest.TestCase):
    """Nivel de cuidado: onde o paciente vai ser tratado.

    Existe porque nao existia. Num caso de depressao psicotica com sindrome de
    Cotard, recusa alimentar, perda de 11 kg e ideacao suicida, o programa
    propunha antidepressivo e psicoeducacao sem em nenhum momento dizer que
    aquilo era indicacao de leito -- nao havia onde escrever.
    """

    def tratamento(self, **extra):
        base = {
            "care_level": {"level": "Ambulatorial", "justification": "risco baixo, com suporte familiar"},
            "medication_options": [],
            "non_pharmacological_options": [],
        }
        base.update(extra)
        return base

    def test_valid_care_level_survives(self):
        resultado = self.tratamento()
        server.validate_result("treatment", resultado)
        self.assertEqual(resultado["care_level"]["level"], "Ambulatorial")

    def test_level_outside_the_closed_list_is_discarded(self):
        """"Internacao domiciliar" e "observacao" nao existem como modalidade no
        Brasil. Ninguem saberia executar, e a tela nao teria caixa para marcar."""
        resultado = self.tratamento(care_level={"level": "Internação domiciliar", "justification": "familia cuida"})
        server.validate_result("treatment", resultado)
        self.assertIsNone(resultado["care_level"])

    def test_level_without_justification_is_discarded(self):
        """Indicar leito sem escrever por que e o que nao pode chegar ao
        prontuario: a justificativa e o que sustenta a indicacao perante quem a
        le depois."""
        resultado = self.tratamento(care_level={"level": "Internação involuntária", "justification": "   "})
        server.validate_result("treatment", resultado)
        self.assertIsNone(resultado["care_level"])

    def test_missing_care_level_does_not_kill_the_answer(self):
        """Mesmo criterio das opcoes medicamentosas: descartar o pedaco e melhor
        do que derrubar a resposta inteira e perder as orientacoes junto."""
        resultado = self.tratamento()
        del resultado["care_level"]
        server.validate_result("treatment", resultado)
        self.assertIsNone(resultado["care_level"])
        self.assertEqual(resultado["medication_options"], [])

    def test_the_three_admissions_are_the_ones_the_law_defines(self):
        self.assertEqual(len(server.CARE_LEVELS), 5)
        internacoes = [n for n in server.CARE_LEVELS if n.startswith("Internação")]
        self.assertEqual(internacoes, ["Internação voluntária", "Internação involuntária", "Internação compulsória"])

    def test_schema_closes_the_list_and_requires_the_field(self):
        """O enum e o que impede o modelo de inventar modalidade. Instrucao de
        prompt nao resolveu no caso dos codigos do DSM, e nao resolveria aqui."""
        treatment = server.SCHEMAS["treatment"]
        self.assertIn("care_level", treatment["required"])
        self.assertEqual(treatment["properties"]["care_level"]["properties"]["level"]["enum"], server.CARE_LEVELS)

    def test_care_level_opens_the_plain_text(self):
        """Quem le o prontuario precisa saber onde o paciente foi tratado antes
        de saber com o que."""
        texto = server.plain_text_from_result("treatment", self.tratamento(
            care_level={"level": "Internação involuntária", "justification": "recusa alimentar com perda de 11 kg"}))
        self.assertTrue(texto.startswith("NIVEL DE CUIDADO:\nInternação involuntária | recusa alimentar"))
        self.assertLess(texto.index("NIVEL DE CUIDADO"), texto.index("TRATAMENTO MEDICAMENTOSO"))

    def test_without_care_level_the_text_has_no_empty_heading(self):
        resultado = self.tratamento(care_level=None)
        texto = server.plain_text_from_result("treatment", resultado)
        self.assertNotIn("NIVEL DE CUIDADO", texto)
        self.assertTrue(texto.startswith("TRATAMENTO MEDICAMENTOSO:"))

    def test_the_review_revises_the_care_level_too(self):
        """treatment_review reaproveita schema e validacao do treatment, entao o
        nivel entra na revisao sem codigo proprio -- e a revisao substitui a tela
        inteira, incluindo ele."""
        self.assertIs(server.SCHEMAS["treatment_review"], server.SCHEMAS["treatment"])
        resultado = self.tratamento(care_level={"level": "Ambulatorial", "justification": "seguimento quinzenal"})
        server.validate_result("treatment_review", resultado)
        self.assertEqual(resultado["care_level"]["level"], "Ambulatorial")


class PlainTextFromResultTests(unittest.TestCase):

    def test_anamnesis_format(self):
        text = server.plain_text_from_result("anamnesis", {"chief_complaint": "tristeza", "hda": "dois meses"})
        self.assertEqual(text, "QP: tristeza\nHDA: dois meses")

    def test_medication_format_includes_all_sections(self):
        """A ficha virou telegrafica em 31/08/2026: campos curtos no lugar de
        tres blocos de prosa que reescreviam a bula. Dose alvo e limite sao
        campos separados de proposito -- confundir os dois e o que faz errar
        receita."""
        result = {
            "medication": "Sertralina",
            "class_and_mechanism": "ISRS, inibidor da recaptacao de serotonina",
            "initial_dose": "50 mg/dia VO",
            "titration": "aumentar 50 mg a cada 7 dias",
            "target_dose": "100 a 150 mg/dia",
            "ceiling": "200 mg/dia",
            "avoid_with": "IMAO (sindrome serotoninergica)",
            "side_effects": "nausea, insonia, disfuncao sexual",
            "monitoring": "resposta em 4 semanas",
        }
        text = server.plain_text_from_result("medication", result)
        for expected in ("Sertralina", "ISRS", "50 mg/dia VO", "a cada 7 dias",
                         "100 a 150 mg/dia", "200 mg/dia", "IMAO", "nausea", "4 semanas"):
            self.assertIn(expected, text)

    def test_diagnosis_text_opens_with_the_analysis(self):
        """A analise e o raciocinio; a hipotese e a conclusao.

        Lida na ordem inversa, a conclusao chega sem o caminho — e o caminho e
        justamente o que o medico precisa conferir.
        """
        result = {
            "psychopathological_analysis": [
                {"domain": "Humor", "finding": "deprimido, com anedonia severa",
                 "evidence": "parou de sair, de cozinhar e de atender o telefone"}
            ],
            "nosological_options": [{"name": "Transtorno depressivo", "cid11": "6A70.4", "dsm5tr": "F32.3"}],
            "syndromic_options": [{"name": "Sindrome depressiva", "cid11": "", "dsm5tr": ""}],
            "etiological_options": [],
        }
        text = server.plain_text_from_result("diagnosis", result)
        self.assertTrue(text.startswith("ANALISE PSICOPATOLOGICA:"))
        self.assertIn("Humor: deprimido, com anedonia severa (parou de sair, de cozinhar e de atender o telefone)", text)
        self.assertLess(text.index("ANALISE PSICOPATOLOGICA"), text.index("DIAGNOSTICO NOSOLOGICO"))


class ServerIntegrationTests(unittest.TestCase):
    """Sobe o servidor real numa porta livre e bate nos endpoints -- confere
    de ponta a ponta que a blindagem de arquivos e o CSRF continuam no ar."""

    @classmethod
    def setUpClass(cls):
        logging.disable(logging.CRITICAL)
        cls._original_cwd = Path.cwd()
        import os
        os.chdir(server.ROOT)
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.PrototypeHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)
        import os
        os.chdir(cls._original_cwd)
        logging.disable(logging.NOTSET)

    def _get(self, path):
        return urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}", timeout=5)

    def test_env_file_is_blocked(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._get("/.env")
        self.addCleanup(ctx.exception.close)
        self.assertEqual(ctx.exception.code, 404)

    def test_git_config_is_blocked(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._get("/.git/config")
        self.addCleanup(ctx.exception.close)
        self.assertEqual(ctx.exception.code, 404)

    def test_server_py_is_blocked(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._get("/server.py")
        self.addCleanup(ctx.exception.close)
        self.assertEqual(ctx.exception.code, 404)

    def test_index_html_is_served(self):
        response = self._get("/index.html")
        self.assertEqual(response.status, 200)

    def test_health_endpoint(self):
        response = self._get("/api/health")
        payload = json.loads(response.read().decode("utf-8"))
        self.assertTrue(payload["ok"])
        self.assertIn("hasApiKey", payload)

    def test_cross_origin_post_is_rejected_with_403(self):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request(
                "POST",
                "/api/clinical-ai",
                body=json.dumps({"kind": "anamnesis"}),
                headers={
                    "Content-Type": "application/json",
                    "Origin": "https://site-malicioso.example",
                },
            )
            response = conn.getresponse()
            self.assertEqual(response.status, 403)
        finally:
            conn.close()

    def test_module_is_not_cached_by_the_browser(self):
        """Codigo tem de revalidar: e o que impede uma correcao de ficar presa."""
        for caminho in ("/src/App.js", "/src/styles/theme.css", "/src/data/examOptions.js"):
            with self.subTest(caminho=caminho):
                response = self._get(caminho)
                self.assertIn("no-store", response.headers["Cache-Control"])

    def test_query_string_does_not_buy_immutable_cache_for_code(self):
        """O ?v= sumiu, mas um link velho no historico do navegador ainda o traz."""
        response = self._get("/src/App.js?v=pagina-alvo-3")
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_index_html_is_never_cached(self):
        response = self._get("/index.html")
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_font_is_cached_forever(self):
        response = self._get("/fonts/Outfit-Variable-latin.woff2")
        self.assertIn("immutable", response.headers["Cache-Control"])

    def test_unknown_api_path_is_404(self):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request("POST", "/api/rota-inexistente", body="{}", headers={"Content-Type": "application/json"})
            response = conn.getresponse()
            self.assertEqual(response.status, 404)
        finally:
            conn.close()


class CacheBusterTests(unittest.TestCase):
    """O ?v= manual saiu de circulacao. Tres vezes a etiqueta ficou para tras do
    arquivo e o navegador do medico segurou a versao velha por um ano; e, com
    seis modulos importando examOptions.js, bastava esquecer um para o mesmo
    arquivo carregar duas vezes, em duas instancias. O servidor e local: nao
    cachear codigo nao custa nada."""

    def _fontes(self):
        arquivos = [ROOT / "index.html", ROOT / "carregar-caso.html"]
        arquivos += sorted((ROOT / "src").rglob("*.js"))
        return [a for a in arquivos if a.exists()]

    def test_no_source_file_versions_an_import_by_query_string(self):
        for arquivo in self._fontes():
            with self.subTest(arquivo=str(arquivo.relative_to(ROOT))):
                self.assertNotIn("?v=", arquivo.read_text(encoding="utf-8"))


class BookChapterLookupTests(unittest.TestCase):
    """O capitulo do farmaco, por nome. A regra geral e casar por prefixo e por
    contido-em, e ela cobre quase tudo -- o que falha e quando a palavra e outra:
    o capitulo se chama "Acido valproico" e a receita brasileira diz "valproato
    de sodio". O app chegou a dizer que o livro nao tinha o farmaco, tendo."""

    def test_sal_da_receita_chega_ao_capitulo_do_acido(self):
        for nome in ("Valproato de sódio", "valproato", "divalproex", "divalproato de sodio"):
            with self.subTest(nome=nome):
                capitulo = server.find_book_chapter(nome)
                self.assertIsNotNone(capitulo, f"{nome} nao chegou a capitulo nenhum")
                self.assertEqual(capitulo["nome"], "Ácido valproico")

    def test_a_regra_geral_continua_valendo(self):
        casos = {
            "cloridrato de fluoxetina": "Fluoxetina",
            "carbonato de lítio": "Lítio",
            "hemifumarato de quetiapina": "Quetiapina",
            "Risperidona": "Risperidona",
        }
        for nome, esperado in casos.items():
            with self.subTest(nome=nome):
                self.assertEqual(server.find_book_chapter(nome)["nome"], esperado)

    def test_canabidiol_nao_vira_o_capitulo_do_thc(self):
        """Moleculas diferentes. Mandar uma para o capitulo da outra seria erro
        clinico disfarcado de conveniencia."""
        self.assertIsNone(server.find_book_chapter("cbd"))
        self.assertIsNone(server.find_book_chapter("canabidiol"))

    def test_prefixo_curto_nao_casa(self):
        self.assertIsNone(server.find_book_chapter("li"))


if __name__ == "__main__":
    unittest.main(verbosity=2)


class SourcesMentioningTests(unittest.TestCase):
    """A busca vetorial sempre responde; nem sempre responde sobre o que se pediu.

    Medido em 31/08/2026 contra o acervo real: 'Losartana' recuperou 8 trechos
    com relevancia ate 0,906, e ZERO citavam losartana -- o primeiro falava de
    estimulantes. A tela mostrava 'Consultado: Stahl -- Guia' debaixo da ficha.
    """

    def trecho(self, texto):
        return {"file_id": "f", "filename": "livro.pdf", "score": 0.9,
                "excerpt": texto, "attributes": {}}

    def test_descarta_trecho_que_nao_cita_o_farmaco(self):
        fontes = [self.trecho("tremor, taquicardia, hipertensao e arritmias"),
                  self.trecho("Losartana 50 mg/dia, antagonista do receptor AT1")]
        restantes = server.sources_mentioning(fontes, "Losartana")
        self.assertEqual(len(restantes), 1)
        self.assertIn("AT1", restantes[0]["excerpt"])

    def test_acervo_sem_o_farmaco_devolve_nada(self):
        fontes = [self.trecho("efeitos colaterais de antipsicoticos atipicos")]
        self.assertEqual(server.sources_mentioning(fontes, "Metformina"), [])

    def test_casa_sem_acento_e_sem_caixa(self):
        fontes = [self.trecho("O ACIDO VALPROICO exige hemograma e transaminases")]
        self.assertEqual(len(server.sources_mentioning(fontes, "Ácido valproico")), 1)

    def test_casa_pelo_radical_quando_o_nome_vem_composto(self):
        fontes = [self.trecho("A losartana reduz a pressao arterial")]
        self.assertEqual(len(server.sources_mentioning(fontes, "Losartana potassica")), 1)

    def test_sem_termo_nao_filtra_nada(self):
        fontes = [self.trecho("qualquer coisa"), self.trecho("outra coisa")]
        self.assertEqual(len(server.sources_mentioning(fontes, "")), 2)

    def test_so_a_ficha_do_medicamento_exige_citacao(self):
        """Diagnostico e tratamento perguntam por um QUADRO, e o livro pode
        sustentar a resposta sem repetir uma palavra da consulta."""
        self.assertEqual(server.KINDS_REQUIRING_MENTION,
                         {"medication", "medication_review", "medication_tips"})


# Indice pequeno, em memoria: o teste nao depende do livro, que fica fora do Git.
INDICE_DSM = [
    {"titulo": "Esquizofrenia", "codigo_titulo": "F20.9", "texto": "Critérios Diagnósticos F20.9\nA. Dois ou mais dos seguintes"},
    {"titulo": "Transtorno Esquizofreniforme", "codigo_titulo": "F20.81", "texto": "Critérios Diagnósticos F20.81\nA. Dois ou mais"},
    {"titulo": "Transtorno Bipolar Tipo I", "codigo_titulo": "", "texto": "Critérios Diagnósticos\nPara diagnosticar transtorno bipolar tipo I"},
    {"titulo": "Transtorno Bipolar Tipo II", "codigo_titulo": "F31.81", "texto": "Critérios Diagnósticos F31.81\nPara diagnosticar tipo II"},
    {"titulo": "Transtorno de Pânico", "codigo_titulo": "F41.0", "texto": "Critérios Diagnósticos F41.0\nA. Ataques de pânico recorrentes"},
    {"titulo": "Agorafobia", "codigo_titulo": "F40.00", "texto": "Critérios Diagnósticos F40.00\nA. Medo ou ansiedade marcantes"},
    {"titulo": "Transtorno Depressivo Maior", "codigo_titulo": "", "texto": "Critérios Diagnósticos\nA. Cinco (ou mais) dos seguintes"},
    {"titulo": "Transtorno por Uso de Álcool", "codigo_titulo": "", "texto": "Critérios Diagnósticos\nA. Um padrão problemático de uso de álcool"},
    {"titulo": "Abstinência de Álcool", "codigo_titulo": "", "texto": "Critérios Diagnósticos\nA. Cessação (ou redução) do uso pesado"},
]


def titulos(selecao):
    return [s["titulo"] for s in server.dsm_criteria_sections(selecao, INDICE_DSM)]


class DsmCriteriaLookupTests(unittest.TestCase):
    """O Refinar anexa a secao de criterios do DSM-5-TR de cada hipotese
    assinalada. A busca vetorial trazia essa secao em 2 de 10 casos."""

    def test_rotulo_da_hipotese_chega_a_secao(self):
        self.assertEqual(titulos(["Esquizofrenia - CID-11: 6A20 - DSM-5-TR: F20.9"]), ["Esquizofrenia"])

    def test_esquizofrenia_nao_vira_esquizofreniforme(self):
        """Prefixo comum nao basta: o titulo inteiro tem de estar no nome."""
        self.assertEqual(titulos(["Esquizofrenia"]), ["Esquizofrenia"])

    def test_tipo_i_nao_vira_tipo_ii(self):
        self.assertEqual(titulos(["Transtorno bipolar tipo I, episódio maníaco atual - DSM-5-TR: F31.2"]),
                         ["Transtorno Bipolar Tipo I"])

    def test_secao_sem_codigo_no_titulo_chega_pelo_nome(self):
        self.assertEqual(titulos(["Transtorno depressivo maior, episódio atual grave com sintomas psicóticos - DSM-5-TR: F32.3"]),
                         ["Transtorno Depressivo Maior"])

    def test_duas_entidades_no_mesmo_nome_trazem_as_duas_secoes(self):
        self.assertEqual(titulos(["Transtorno de pânico com agorafobia - CID-11: 6B01 - DSM-5-TR: F41.0"]),
                         ["Transtorno de Pânico", "Agorafobia"])
        self.assertEqual(titulos(["Transtorno por uso de álcool, grave, com abstinência complicada - DSM-5-TR: F10.20"]),
                         ["Transtorno por Uso de Álcool", "Abstinência de Álcool"])

    def test_codigo_do_titulo_vale_mesmo_com_nome_diferente(self):
        self.assertEqual(titulos(["Transtorno de ansiedade paroxística episódica - DSM-5-TR: F41.0"]), ["Transtorno de Pânico"])

    def test_hipotese_sem_secao_nao_anexa_nada(self):
        self.assertEqual(titulos(["Ausência de psicopatologia que justifique diagnóstico psiquiátrico no momento"]), [])

    def test_teto_de_secoes_e_sem_repeticao(self):
        selecao = ["Esquizofrenia", "Esquizofrenia - DSM-5-TR: F20.9", "Transtorno de pânico com agorafobia",
                   "Transtorno depressivo maior", "Transtorno por uso de álcool com abstinência"]
        achados = titulos(selecao)
        self.assertEqual(len(achados), server.DSM_CRITERIA_MAX_SECTIONS)
        self.assertEqual(len(achados), len(set(achados)))

    def test_entrada_invalida_nao_quebra(self):
        with patch.object(server, "load_dsm_criteria", return_value={"secoes": INDICE_DSM}):
            self.assertEqual(server.dsm_criteria_sources("Esquizofrenia"), [])
            self.assertEqual(server.dsm_criteria_sources([None, 42]), [])
            fontes = server.dsm_criteria_sources(["Esquizofrenia"])
        self.assertEqual(fontes[0]["attributes"]["secao"], "Esquizofrenia")
        self.assertIn("dsm 5 tr", fontes[0]["filename"].lower(), "sem isso a tela nao cita a obra")

    def test_sem_o_arquivo_do_indice_nao_ha_criterios(self):
        with patch.object(server, "load_dsm_criteria", return_value=None):
            self.assertEqual(server.dsm_criteria_sources(["Esquizofrenia"]), [])


class DsmCriteriaInReviewTests(unittest.TestCase):
    """De ponta a ponta: o Refinar leva os criterios ate a chamada do modelo; a
    geracao do Diagnostico nao leva."""

    @classmethod
    def setUpClass(cls):
        logging.disable(logging.CRITICAL)
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.PrototypeHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)
        logging.disable(logging.NOTSET)

    def _corpo_enviado_ao_modelo(self, kind):
        import os
        capturado = {}

        def falso_urlopen(request, timeout=None):
            capturado["corpo"] = json.loads(request.data.decode("utf-8"))
            raise RuntimeError("parar aqui: so interessa o que foi enviado")

        trecho = {"file_id": "file-x", "filename": "Tratado.pdf", "score": 0.9, "excerpt": "trecho do tratado", "attributes": {}}
        with patch.dict(os.environ, {"OPENAI_API_KEY": "chave-de-teste"}), \
             patch.object(server, "load_dsm_criteria", return_value={"secoes": INDICE_DSM}), \
             patch.object(server, "search_rag_sources", return_value=[trecho]), \
             patch.object(server.urllib.request, "urlopen", side_effect=falso_urlopen):
            conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
            try:
                conn.request("POST", "/api/clinical-ai", body=json.dumps({
                    "kind": kind, "prompt": "caso", "mode": "rag", "ragQuery": "consulta",
                    "diagnosisSelection": ["Esquizofrenia - CID-11: 6A20 - DSM-5-TR: F20.9"],
                }), headers={"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.port}"})
                conn.getresponse().read()
            finally:
                conn.close()
        return capturado["corpo"]["input"][1]["content"]

    def test_refinar_leva_os_criterios_na_frente(self):
        conteudo = self._corpo_enviado_ao_modelo("diagnosis_review")
        self.assertIn("A. Dois ou mais dos seguintes", conteudo)
        self.assertLess(conteudo.index("Critérios Diagnósticos F20.9"), conteudo.index("trecho do tratado"))

    def test_geracao_do_diagnostico_nao_leva(self):
        self.assertNotIn("Critérios Diagnósticos F20.9", self._corpo_enviado_ao_modelo("diagnosis"))


class OutputCeilingTests(unittest.TestCase):
    def test_teto_de_saida_cabe_o_diagnostico_mais_longo_medido(self):
        """1.790 tokens foi o maior Diagnostico medido em 14/09/2026; 2200 cortou um."""
        self.assertGreaterEqual(server.MAX_OUTPUT_TOKENS, 3000)


class NormalizeNameTests(unittest.TestCase):
    """Ligadura de PDF: com NFD o "ﬂ" caia no filtro de pontuacao e o nome saia
    "uoxetina". NFKD desfaz a ligadura sem mudar nenhuma chave dos indices."""

    def test_ligadura_vira_letras(self):
        self.assertEqual(server.normalize_name("ﬂuoxetina"), "fluoxetina")
        self.assertEqual(server.normalize_name("especiﬁcado"), "especificado")

    def test_acento_caixa_e_pontuacao_como_antes(self):
        self.assertEqual(server.normalize_name("D-Ciclosserina"), "d ciclosserina")
        self.assertEqual(server.normalize_name("Episódio Depressivo"), "episodio depressivo")
