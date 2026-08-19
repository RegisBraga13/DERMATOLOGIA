#!/usr/bin/env python3
"""Marca o escopo das fontes ja indexadas.

A biblioteca foi criada sem atributo nenhum. Quando a busca passou a filtrar
por escopo, os arquivos antigos deixariam de ser recuperados — filtro exige o
atributo presente, e ausencia nao casa com nada. Este script vai uma vez em
cada arquivo do catalogo e grava o escopo.

Escopo por fonte, e o criterio e o assunto do livro:
  semiologia  — psicopatologia e exame psiquico: Anamnese, Refinamento
  farmacologia — psicofarmacos e tratamento: Tratamento, Medicamentos
  ambos        — recuperavel em qualquer etapa

Uso:
    python3 scripts/tag_rag_scope.py            # aplica o mapa abaixo
    python3 scripts/tag_rag_scope.py --listar   # so mostra o estado atual
"""

import argparse
import json
import os
import sys
import unicodedata
from pathlib import Path

from openai import OpenAI

CATALOGO = Path("rag_sources.local.json")

# Casado por trecho do nome do arquivo, minusculo e sem acento nao importa aqui
# porque os nomes sao estaveis. Fonte que nao casar fica como "ambos", que e o
# comportamento de hoje: aparece em tudo. Errar para o lado de recuperar demais
# e melhor do que sumir com um livro sem ninguem perceber.
MAPA = (
    ("dalgalarrondo", "semiologia"),
    ("cheniaux", "semiologia"),
    ("psicofarmacos", "farmacologia"),
    ("guia de prescri", "farmacologia"),
    ("psicofarmacologia", "farmacologia"),
    # Tratados gerais: cobrem semiologia E tratamento, entao servem as duas
    # pontas. Marcar um deles como so uma coisa perderia metade do livro.
    ("tratado psiquiatria", "ambos"),
    ("manual_do_residente", "ambos"),
    ("entrevista psiquiatrica", "ambos"),
)


def sem_acento(texto):
    # "Psicofarmacos" nao casava com "Psicofármacos" e o livro caia em "ambos".
    return "".join(c for c in unicodedata.normalize("NFD", texto.lower())
                   if unicodedata.category(c) != "Mn")


def escopo_de(filename):
    nome = sem_acento(filename)
    for chave, escopo in MAPA:
        if chave in nome:
            return escopo
    return "ambos"


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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listar", action="store_true", help="Mostra o escopo atual e sai")
    args = parser.parse_args()

    load_env()
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("Defina OPENAI_API_KEY.")
    if not CATALOGO.is_file():
        raise SystemExit(f"{CATALOGO} nao encontrado.")

    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    store_id = catalogo["vector_store_id"]
    client = OpenAI()

    # A VERDADE E A VECTOR STORE, nao o catalogo local.
    #
    # O catalogo so registra o que passou por ingest_rag.py nesta maquina. A
    # store tinha sete arquivos e o catalogo listava quatro: dois tratados
    # indexados por outro caminho ficaram sem escopo e sumiram calados de todas
    # as buscas filtradas. Percorrer o catalogo repetiria o mesmo furo a cada
    # livro adicionado por fora.
    arquivos = list(client.vector_stores.files.list(vector_store_id=store_id, limit=100))
    catalogadas = {item["file_id"]: item for item in catalogo.get("sources", [])}
    fontes = []
    for arquivo in arquivos:
        nome = catalogadas.get(arquivo.id, {}).get("filename") or client.files.retrieve(arquivo.id).filename
        agora = (getattr(arquivo, "attributes", None) or {}).get("escopo", "(sem)")
        fontes.append((arquivo.id, nome, agora))

    novas = []
    for file_id, nome, agora in fontes:
        alvo = escopo_de(nome)
        fora = " [fora do catalogo]" if file_id not in catalogadas else ""
        if args.listar:
            print(f"  {agora:12} {nome[:58]}{fora}")
        elif agora == alvo:
            print(f"  ja marcado  {alvo:12} {nome[:58]}{fora}")
        else:
            client.vector_stores.files.update(
                vector_store_id=store_id, file_id=file_id, attributes={"escopo": alvo})
            print(f"  {agora} -> {alvo:12} {nome[:58]}{fora}")
        novas.append({"filename": nome, "file_id": file_id, "status": "completed", "escopo": alvo})

    if not args.listar:
        catalogo["sources"] = novas
        CATALOGO.write_text(json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nCatalogo sincronizado com a store: {len(novas)} fontes em {CATALOGO}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Interrompido.")
