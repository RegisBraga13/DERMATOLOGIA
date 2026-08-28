#!/usr/bin/env python3
"""Etiqueta cada livro da biblioteca com o GENERO dele.

A etiqueta diz o que o livro E, e nunca quem o le.

Ate 28/08/2026 ela dizia o contrario -- "diagnostico_base", "medicamento_refino",
"refino" nomeiam leitores, nao livros. Tres consequencias, todas medidas:

  1. Trocar quem le um livro exigia re-etiquetar o arquivo na nuvem, quando
     deveria ser uma linha de codigo.
  2. O mesmo livro precisou ser subido DUAS vezes para carregar dois rotulos --
     a Psicofarmacologia 2025 e o Tratado da ABP estavam em duas copias.
  3. Este script envelheceu e virou destrutivo: o mapa antigo mandava
     ("psicofarmacologia", "farmacologia") e ("guia de prescri", "farmacologia"),
     entao roda-lo apagaria os escopos do Medicamento e do Sintoma-Alvo, e o
     fallback jogaria os dois volumes da FMUSP em "ambos". Cinco etapas parariam
     de achar o livro delas sem uma linha de erro: a busca simplesmente nao casa.

Genero e propriedade do livro e nao muda, entao rodar de novo e inofensivo.
Quem le o que fica em RAG_SCOPE_BY_KIND, no server.py, em um lugar so.

Uso:
    python3 scripts/tag_rag_scope.py --listar   # so mostra o estado atual
    python3 scripts/tag_rag_scope.py            # aplica o mapa abaixo
"""

import argparse
import json
import os
import sys
import unicodedata
from pathlib import Path

from openai import OpenAI

CATALOGO = Path("rag_sources.local.json")

# Casado por trecho do nome do arquivo. O criterio e o genero do livro, e a
# ordem importa: o primeiro que casar responde.
MAPA = (
    ("dalgalarrondo", "psicopatologia"),
    ("cheniaux", "psicopatologia"),
    # ANTES da chave curta: "A entrevista psiquiatrica na pratica clinica" CONTEM
    # "entrevista psiquiatrica", entao a chave curta responderia pelos dois
    # livros. Especifico primeiro, sempre.
    ("entrevista psiquiatrica na pratica", "entrevista"),
    ("entrevista psiquiatrica", "entrevista"),
    ("compendio de psiquiatria", "tratado"),
    ("condutas_em_psiquiatria", "terapeutica"),
    ("de bolso", "terapeutica"),
    ("volume_4_guia_pratico", "terapeutica"),
    # Os dois volumes da FMUSP sao livros diferentes e generos diferentes: o 2
    # e das grandes sindromes, o 3 e da terapeutica. A chave carrega o numero
    # porque os nomes de arquivo so diferem nele.
    ("1_clinica_psiquiatrica", "psicopatologia"),
    # Criterios operacionais -- "cinco dos nove sintomas por duas semanas" -- e
    # especificadores. Nenhum outro genero do acervo tem isso: psicopatologia
    # descreve fenomeno, sindromes descreve entidade.
    ("dsm 5 tr", "criterios"),
    ("cid-11", "criterios"),
    ("2_clinica_psiquiatrica", "sindromes"),
    ("3_clinica_psiquiatrica", "terapeutica"),
    ("tratado psiquiatria", "tratado"),
    ("guia de prescri", "prescricao"),
    ("psicofarmacologia_da_teoria", "psicofarmacologia"),
)


def sem_acento(texto):
    # "Psicofarmacos" nao casava com "Psicofármacos" e o livro caia no fallback.
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower())
                   if unicodedata.category(c) != "Mn")


def genero_de(filename):
    nome = sem_acento(filename)
    for chave, genero in MAPA:
        if chave in nome:
            return genero
    # SEM FALLBACK, de proposito. O mapa antigo mandava o desconhecido para
    # "ambos" -- "errar para o lado de recuperar demais" --, e foi assim que
    # livro trocou de estante sem ninguem perceber. Livro que este script nao
    # reconhece fica intocado, e o nome dele aparece no fim para voce decidir.
    return None


def load_env(path=Path(".env")):
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--listar", action="store_true", help="Mostra o genero atual e sai")
    args = parser.parse_args()

    load_env()
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("Defina OPENAI_API_KEY.")
    if not CATALOGO.is_file():
        raise SystemExit(f"{CATALOGO} nao encontrado.")

    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    store_id = catalogo["vector_store_id"]
    client = OpenAI()

    # A VERDADE E A VECTOR STORE, nao o catalogo local: o catalogo so registra o
    # que passou por ingest_rag.py NESTA maquina. A store ja teve sete arquivos
    # com o catalogo listando quatro, e os tres de fora sumiram calados das
    # buscas filtradas.
    catalogadas = {item["file_id"]: item for item in catalogo.get("sources", [])}
    novas, desconhecidos = [], []
    for arquivo in client.vector_stores.files.list(vector_store_id=store_id, limit=100):
        nome = catalogadas.get(arquivo.id, {}).get("filename") or client.files.retrieve(arquivo.id).filename
        agora = (getattr(arquivo, "attributes", None) or {}).get("escopo", "(sem)")
        alvo = genero_de(nome)
        if alvo is None:
            desconhecidos.append(nome)
            print(f"  INTOCADO   {agora:20} {nome[:52]}")
            novas.append({"filename": nome, "file_id": arquivo.id, "status": "completed", "escopo": agora})
            continue
        if args.listar:
            print(f"  {agora:20} {nome[:52]}")
        elif agora == alvo:
            print(f"  ja marcado {alvo:20} {nome[:52]}")
        else:
            client.vector_stores.files.update(
                vector_store_id=store_id, file_id=arquivo.id, attributes={"escopo": alvo})
            print(f"  {agora} -> {alvo:16} {nome[:52]}")
        novas.append({"filename": nome, "file_id": arquivo.id, "status": "completed", "escopo": alvo})

    if not args.listar:
        catalogo["sources"] = novas
        CATALOGO.write_text(json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nCatalogo sincronizado com a store: {len(novas)} fontes.")
    if desconhecidos:
        print(f"\n{len(desconhecidos)} livro(s) fora do MAPA, sem genero e intocado(s):")
        for nome in desconhecidos:
            print(f"  {nome}")
        print("Acrescente a chave no MAPA para que respondam em alguma etapa.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Interrompido.")
