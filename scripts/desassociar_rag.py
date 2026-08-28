#!/usr/bin/env python3
"""Tira fontes da biblioteca RAG sem apagar o arquivo da conta.

Desassociar e nao apagar e decisao do projeto, e ja e o precedente: o Guia de
Prescricao do Stahl saiu do Sintoma-Alvo assim. O arquivo continua na conta,
entao reassociar nao pede novo upload de um PDF de centenas de megabytes -- e
um livro tirado por engano volta em segundos.

Apagar da conta NAO esta automatizado aqui, e e de proposito: e a operacao que
nao tem volta, e nao deve ficar a um argumento de distancia da que tem.

    python3 scripts/desassociar_rag.py --escopo farmacologia          # so mostra
    python3 scripts/desassociar_rag.py --escopo farmacologia --aplicar
    python3 scripts/desassociar_rag.py --file-id file-abc --aplicar
"""

import argparse
import json
import os
import sys
from pathlib import Path

from openai import OpenAI

CATALOGO = Path("rag_sources.local.json")


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
    parser.add_argument("--escopo", help="Tira todas as fontes marcadas com este escopo")
    parser.add_argument("--file-id", action="append", default=[], help="Tira uma fonte pelo id (repetivel)")
    # Sem --aplicar nao acontece nada. Tirar livro da biblioteca e mudanca que o
    # medico so percebe quando uma etapa responde pior; ver antes e barato.
    parser.add_argument("--aplicar", action="store_true", help="Executa; sem isto, so lista o que sairia")
    args = parser.parse_args()

    if not args.escopo and not args.file_id:
        raise SystemExit("Diga o que sai: --escopo ou --file-id.")

    load_env()
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("Defina OPENAI_API_KEY.")
    if not CATALOGO.is_file():
        raise SystemExit(f"{CATALOGO} nao encontrado.")

    catalogo = json.loads(CATALOGO.read_text(encoding="utf-8"))
    store_id = catalogo["vector_store_id"]
    client = OpenAI()

    # A verdade e a store, e nao o catalogo local: o catalogo so registra o que
    # passou por ingest_rag.py NESTA maquina. Mesmo motivo do tag_rag_scope.py.
    catalogadas = {item["file_id"]: item for item in catalogo.get("sources", [])}
    alvos, ficam = [], []
    for arquivo in client.vector_stores.files.list(vector_store_id=store_id, limit=100):
        nome = catalogadas.get(arquivo.id, {}).get("filename") or client.files.retrieve(arquivo.id).filename
        escopo = (getattr(arquivo, "attributes", None) or {}).get("escopo", "(sem)")
        (alvos if escopo == args.escopo or arquivo.id in args.file_id else ficam).append(
            (arquivo.id, nome, escopo))

    if not alvos:
        raise SystemExit("Nenhuma fonte casou com o pedido; nada a fazer.")

    print(f"Sai da biblioteca ({len(alvos)}):")
    for _, nome, escopo in alvos:
        print(f"  {escopo:20} {nome[:60]}")
    print(f"\nFica ({len(ficam)}):")
    for _, nome, escopo in sorted(ficam, key=lambda item: item[2]):
        print(f"  {escopo:20} {nome[:60]}")

    if not args.aplicar:
        print("\nNada foi feito. Repita com --aplicar para executar.")
        return

    for file_id, nome, _ in alvos:
        client.vector_stores.files.delete(vector_store_id=store_id, file_id=file_id)
        print(f"  fora da biblioteca: {nome[:60]}")

    catalogo["sources"] = [item for item in catalogo.get("sources", [])
                           if item["file_id"] not in {file_id for file_id, _, _ in alvos}]
    CATALOGO.write_text(json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n{len(catalogo['sources'])} fontes na biblioteca. Os arquivos seguem na conta OpenAI.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Interrompido.")
