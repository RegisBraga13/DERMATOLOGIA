"""Robustez da chamada ao modelo: teto de contexto, corte de saida e repeticao.

Os tres defeitos que estes testes travam no lugar tinham a mesma cara na tela
-- um erro seco no meio da consulta -- e causas diferentes:

  * contexto recuperado sem teto nenhum, porque `MAX_PROMPT_CHARS` confere o
    que o CLIENTE manda e as fontes entram depois dessa conferencia;
  * resposta cortada no teto de saida chegando como "fora do formato clinico
    validado", que manda procurar defeito no modelo;
  * 429 subindo cru, sendo o erro mais provavel da aplicacao e o unico que se
    resolve esperando.

Rodar so este arquivo:
    python3 -m unittest testes.test_robustez -v
"""
import io
import json
import logging
import sys
import unittest
import urllib.error
import urllib.request
from http.client import HTTPConnection
from pathlib import Path
from threading import Thread
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402  (precisa do sys.path acima)


class _RespostaFalsa:
    """Resposta simulada da OpenAI, no formato que o servidor le."""

    def __init__(self, payload):
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return json.dumps(self._payload).encode("utf-8")


def _erro_http(codigo, retry_after=None):
    cabecalhos = {"Retry-After": str(retry_after)} if retry_after else {}
    return urllib.error.HTTPError("https://api.openai.com/v1/responses", codigo, "erro",
                                  cabecalhos, io.BytesIO(b"{}"))


def _sequencia(respostas):
    """Um falso urlopen que devolve (ou levanta) uma resposta por chamada, e
    repete a ultima quando a lista acaba."""
    chamadas = []

    def falso(request, timeout=None):
        chamadas.append(json.loads(request.data.decode("utf-8")) if request.data else {})
        item = respostas[min(len(chamadas) - 1, len(respostas) - 1)]
        if isinstance(item, Exception):
            raise item
        return _RespostaFalsa(item)

    return falso, chamadas


class FitSourcesTests(unittest.TestCase):
    """O teto do contexto recuperado.

    Sao 8 trechos do acervo mais ate 4 secoes inteiras de criterios do DSM, e
    nenhuma das duas tinha limite de caractere. O limite que se bate primeiro
    nao e o do modelo -- gpt-4.1 tem 1M de contexto --, e o da conta: 30 mil
    tokens por minuto.
    """

    @staticmethod
    def _fonte(tamanho, nome="Livro.pdf"):
        return {"file_id": "f", "filename": nome, "score": 0.9, "excerpt": "x" * tamanho, "attributes": {}}

    def test_tudo_que_cabe_passa_inteiro(self):
        cabem, cortadas, total = server.fit_sources([self._fonte(1000) for _ in range(8)], limite=50000)
        self.assertEqual(len(cabem), 8)
        self.assertEqual(cortadas, 0)
        self.assertLess(total, 50000)

    def test_o_corte_e_no_rabo_da_lista(self):
        """A ordem e a prioridade: quem monta a lista ja poe na frente o que nao
        pode faltar -- os criterios do DSM no Refinar, os trechos de maior
        relevancia no resto."""
        fontes = [self._fonte(1000, f"Livro{i}.pdf") for i in range(10)]
        cabem, cortadas, _ = server.fit_sources(fontes, limite=3000)
        self.assertEqual(cortadas, 10 - len(cabem))
        self.assertEqual([f["filename"] for f in cabem], [f"Livro{i}.pdf" for i in range(len(cabem))])

    def test_nenhum_trecho_e_cortado_ao_meio(self):
        """Excerto cortado ao meio pode perder uma dose ou a segunda metade de
        um criterio. Meia informacao clinica e pior do que nenhuma."""
        cabem, _, _ = server.fit_sources([self._fonte(2000), self._fonte(2000)], limite=2500)
        for fonte in cabem:
            self.assertEqual(len(fonte["excerpt"]), 2000)

    def test_a_primeira_entra_mesmo_estourando_sozinha(self):
        """Resposta com uma fonte grande demais ainda e resposta com fonte; a
        alternativa e mandar contexto vazio a uma etapa que pediu literatura."""
        cabem, cortadas, _ = server.fit_sources([self._fonte(90000)], limite=1000)
        self.assertEqual(len(cabem), 1)
        self.assertEqual(cortadas, 0)

    def test_o_teto_declarado_cobre_as_oito_fontes_medidas(self):
        """8 trechos de ~3.200 caracteres e o caso medido do RAG."""
        self.assertGreaterEqual(server.MAX_SOURCES_CHARS, 8 * 3200)


class ReadJsonResponseTests(unittest.TestCase):
    """Repeticao do que e transitorio."""

    def setUp(self):
        # O aviso de repeticao e comportamento esperado aqui: sai do relatorio
        # do teste para nao parecer falha de quem le a saida.
        logging.disable(logging.CRITICAL)
        self.addCleanup(logging.disable, logging.NOTSET)
        self.dormiu = []
        patcher = patch.object(server.time, "sleep", self.dormiu.append)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.pedido = urllib.request.Request("https://api.openai.com/v1/responses", data=b"{}", method="POST")

    def _rodar(self, respostas):
        falso, chamadas = _sequencia(respostas)
        with patch("server.urllib.request.urlopen", falso):
            return server.read_json_response(self.pedido), chamadas

    def test_429_e_repetido_e_a_segunda_tentativa_vale(self):
        resultado, chamadas = self._rodar([_erro_http(429), {"ok": True}])
        self.assertEqual(resultado, {"ok": True})
        self.assertEqual(len(chamadas), 2)
        self.assertEqual(len(self.dormiu), 1)

    def test_retry_after_do_servidor_manda_na_espera(self):
        self._rodar([_erro_http(429, retry_after=9), {"ok": True}])
        self.assertEqual(self.dormiu, [9])

    def test_retry_after_absurdo_nao_prende_a_consulta(self):
        """Dez minutos de espera dentro de uma consulta nao e espera, e travar."""
        self._rodar([_erro_http(429, retry_after=600), {"ok": True}])
        self.assertEqual(self.dormiu, [2])

    def test_400_nao_e_repetido_porque_nao_muda_por_insistencia(self):
        falso, chamadas = _sequencia([_erro_http(400)])
        with patch("server.urllib.request.urlopen", falso):
            with self.assertRaises(urllib.error.HTTPError):
                server.read_json_response(self.pedido)
        self.assertEqual(len(chamadas), 1)
        self.assertEqual(self.dormiu, [])

    def test_429_teimoso_acaba_subindo_o_erro(self):
        falso, chamadas = _sequencia([_erro_http(429)])
        with patch("server.urllib.request.urlopen", falso):
            with self.assertRaises(urllib.error.HTTPError):
                server.read_json_response(self.pedido)
        self.assertEqual(len(chamadas), server.TENTATIVAS_DE_REDE)

    def test_falha_de_rede_tambem_e_repetida(self):
        resultado, _ = self._rodar([urllib.error.URLError("sem rede"), {"ok": True}])
        self.assertEqual(resultado, {"ok": True})

    def test_o_corpo_do_erro_chega_intacto_a_quem_trata(self):
        """O corpo NAO e lido na repeticao: quem trata a excecao la em cima o le
        para o log, e um corpo ja consumido chegaria vazio."""
        falso, _ = _sequencia([_erro_http(400)])
        with patch("server.urllib.request.urlopen", falso):
            try:
                server.read_json_response(self.pedido)
                self.fail("deveria ter levantado")
            except urllib.error.HTTPError as error:
                self.assertEqual(error.read(), b"{}")


class ClinicalAiRobustezTests(unittest.TestCase):
    """A rota /api/clinical-ai de ponta a ponta, com a OpenAI simulada."""

    CORTADA = {"output_text": '{"markdown": "Texto que nao fech',
               "status": "incomplete",
               "incomplete_details": {"reason": "max_output_tokens"}}
    INTEIRA = {"output_text": '{"markdown": "Texto completo."}', "status": "completed"}

    @classmethod
    def setUpClass(cls):
        import os
        logging.disable(logging.CRITICAL)
        cls._cwd = Path.cwd()
        os.chdir(server.ROOT)
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.PrototypeHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        import os
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)
        os.chdir(cls._cwd)
        logging.disable(logging.NOTSET)

    def _pedir(self, respostas, corpo=None, **patches):
        import os
        falso, chamadas = _sequencia(respostas)
        with patch.dict(os.environ, {"OPENAI_API_KEY": "chave-de-teste"}), \
                patch("server.urllib.request.urlopen", falso), \
                patch.object(server.time, "sleep", lambda _: None):
            contexto = [patch.object(server, nome, **conf) for nome, conf in patches.items()]
            for c in contexto:
                c.start()
            try:
                conn = HTTPConnection("127.0.0.1", self.port, timeout=10)
                try:
                    conn.request("POST", "/api/clinical-ai",
                                 body=json.dumps(corpo or {"kind": "evolution", "prompt": "Paciente estavel.", "mode": "current"}),
                                 headers={"Content-Type": "application/json",
                                          "Origin": f"http://127.0.0.1:{self.port}"})
                    resposta = conn.getresponse()
                    return resposta.status, json.loads(resposta.read().decode("utf-8") or "{}"), chamadas
                finally:
                    conn.close()
            finally:
                for c in contexto:
                    c.stop()

    # ---------------------------------------------------------- corte de saida

    def test_cortada_e_repetida_com_o_dobro_do_teto(self):
        status, corpo, chamadas = self._pedir([self.CORTADA, self.INTEIRA])
        self.assertEqual(status, 200)
        self.assertEqual(len(chamadas), 2)
        self.assertGreaterEqual(chamadas[1]["max_output_tokens"], 2 * chamadas[0]["max_output_tokens"])
        self.assertEqual(corpo["result"]["markdown"], "Texto completo.")

    def test_cortada_duas_vezes_diz_que_foi_corte_e_nao_formato(self):
        """Clicar de novo repetiria o corte igual, porque o teto e o mesmo. A
        mensagem precisa dizer o que aconteceu e o que fazer."""
        status, corpo, chamadas = self._pedir([self.CORTADA])
        self.assertEqual(status, 502)
        self.assertEqual(len(chamadas), 2)
        self.assertEqual(corpo["code"], "resposta_truncada")
        self.assertIn("OPENAI_MAX_OUTPUT_TOKENS", corpo["detail"])
        self.assertNotIn("fora do formato", corpo["error"])

    def test_resposta_inteira_nao_gasta_segunda_chamada(self):
        status, _, chamadas = self._pedir([self.INTEIRA])
        self.assertEqual(status, 200)
        self.assertEqual(len(chamadas), 1)

    def test_formato_errado_sem_corte_continua_sendo_erro_de_formato(self):
        status, corpo, chamadas = self._pedir([{"output_text": "isto nao e json", "status": "completed"}])
        self.assertEqual(status, 502)
        self.assertEqual(len(chamadas), 1)
        self.assertIn("fora do formato", corpo["error"])
        self.assertNotIn("code", corpo)

    # ------------------------------------------------------------- repeticao

    def test_429_na_consulta_nao_chega_ao_medico(self):
        status, corpo, chamadas = self._pedir([_erro_http(429), self.INTEIRA])
        self.assertEqual(status, 200)
        self.assertEqual(len(chamadas), 2)
        self.assertEqual(corpo["result"]["markdown"], "Texto completo.")

    # --------------------------------------------------------- teto de fontes

    def test_fonte_que_nao_coube_nao_entra_no_contexto_nem_na_procedencia(self):
        """Fonte fora do teto nao foi lida -- entao nao aparece como lida."""
        fontes = [{"file_id": f"f{i}", "filename": f"Livro{i}.pdf", "score": 0.9 - i / 100,
                   "excerpt": "x" * 20000, "attributes": {}} for i in range(8)]
        status, corpo, chamadas = self._pedir(
            [self.INTEIRA],
            corpo={"kind": "evolution", "prompt": "Paciente estavel.", "mode": "rag", "ragQuery": "consulta"},
            search_rag_sources={"return_value": fontes})
        self.assertEqual(status, 200)
        enviado = chamadas[0]["input"][1]["content"]
        self.assertLessEqual(len(enviado), server.MAX_SOURCES_CHARS + len("Paciente estavel.") + 2000)
        citadas = [f["filename"] for f in corpo["sources"]]
        self.assertLess(len(citadas), 8)
        for nome in citadas:
            self.assertIn(nome, enviado)
