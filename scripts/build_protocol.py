"""Embarca o protocolo de entrevista do "Novo projeto" dentro deste app.

A fabrica fica onde esta: quem extrai dos livros e mantem os 31 blocos e o
projeto vizinho. Aqui entra so o produto — a lista fechada de perguntas,
obrigatorios e sinais de alerta — para que o Refinamento escolha dela em vez
de inventar pergunta na hora.

Cada item carrega o trecho_id, que devolve a pagina do livro de onde saiu.
Sem ele a pergunta vira afirmacao sem procedencia, que e exatamente o que o
motor antigo produzia.

Os PDFs e a extracao bruta NAO vem junto: ficam no projeto de origem, como
manda o RAG.md. Este arquivo e conteudo derivado de obra licenciada e so
existe em repositorio privado.

Uso:
    python3 scripts/build_protocol.py
"""

import json
import pathlib
import sys
from datetime import date

ORIGEM = pathlib.Path.home() / "Desktop" / "Novo projeto" / "rag" / "entrevista-psiquiatrica"
PROTOCOLO = ORIGEM / "protocolo"
DESTINO = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "protocol" / "entrevista.json"

# Cada bloco do protocolo guarda estas listas. Deixo explicito para que um
# bloco novo com chave diferente apareca como aviso, e nao suma calado.
CONTRATO = ("achados", "perguntas", "obrigatorio", "sinais_de_alerta", "detalhar", "manejo", "nao_coberto")

# O app usa so estas quatro. `detalhar`, `manejo` e `nao_coberto` orientam a
# CONDUCAO da entrevista — sao do projeto de origem, nao da tela de
# Refinamento — e custavam 200 KB que o navegador baixaria sem ler.
# Ficam fora daqui, nao do contrato: um bloco novo que perca qualquer uma das
# sete ainda aparece como aviso.
EXPORTA = ("achados", "perguntas", "obrigatorio", "sinais_de_alerta")


def carrega_blocos():
    if not PROTOCOLO.is_dir():
        sys.exit(f"Protocolo nao encontrado em {PROTOCOLO}.\n"
                 "Este script depende do projeto vizinho; rode-o na maquina onde ele esta.")
    blocos = []
    for arquivo in sorted(PROTOCOLO.glob("*.json")):
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
        campo = dados.get("_campo") or arquivo.stem
        desconhecidas = [k for k in dados if not k.startswith("_") and k not in CONTRATO]
        if desconhecidas:
            print(f"  aviso: {arquivo.name} traz chaves fora do contrato: {desconhecidas}")
        bloco = {"campo": campo}
        bloco.update({lista: dados.get(lista) or [] for lista in EXPORTA})
        blocos.append(bloco)
    return blocos


# Prefixo do id por lista. Sem ele, "risco#3" seria ambiguo entre a terceira
# pergunta e o terceiro obrigatorio do bloco de risco.
PREFIXO = {"perguntas": "p", "obrigatorio": "o", "sinais_de_alerta": "s"}


def numera(blocos):
    """Da a cada item um id estavel — lista, bloco e posicao dentro dele.

    A IA devolve o id, nunca o texto: e assim que a lista fica fechada. Se ela
    devolver um id que nao existe, o item e descartado em vez de virar
    pergunta inventada com aparencia de citada.
    """
    for bloco in blocos:
        for lista, prefixo in PREFIXO.items():
            for indice, item in enumerate(bloco.get(lista) or []):
                item["id"] = f"{prefixo}:{bloco['campo']}#{indice}"


def main():
    blocos = carrega_blocos()
    numera(blocos)
    saida = {
        "fonte": "Novo projeto — rag/entrevista-psiquiatrica/protocolo (MacKinnon, Castellana, Dalgalarrondo)",
        "aviso": "Conteudo derivado de obra licenciada. Repositorio privado. Nao redistribuir.",
        "gerado_em": date.today().isoformat(),
        "gerado_por": "scripts/build_protocol.py",
        "total": {
            "blocos": len(blocos),
            "perguntas": sum(len(b["perguntas"]) for b in blocos),
            "achados": sum(len(b["achados"]) for b in blocos),
            "obrigatorio": sum(len(b["obrigatorio"]) for b in blocos),
            "sinais_de_alerta": sum(len(b["sinais_de_alerta"]) for b in blocos)
        },
        "blocos": blocos
    }
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    # Sem indentacao: o navegador baixa este arquivo, e a indentacao custava
    # 150 KB de espaco em branco.
    DESTINO.write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tamanho = DESTINO.stat().st_size / 1024
    print(f"{DESTINO.relative_to(DESTINO.parent.parent.parent.parent)} — {tamanho:.0f} KB")
    for chave, valor in saida["total"].items():
        print(f"  {chave}: {valor}")


if __name__ == "__main__":
    main()
