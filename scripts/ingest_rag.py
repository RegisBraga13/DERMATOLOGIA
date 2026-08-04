#!/usr/bin/env python3
"""Cria/atualiza a biblioteca RAG sem copiar PDFs para o repositorio."""

import argparse
import json
import os
import sys
import time
from pathlib import Path

from openai import OpenAI


def load_env(path=Path(".env")):
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def save_vector_store_id(vector_store_id, path=Path(".env")):
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    key = "OPENAI_RAG_VECTOR_STORE_ID"
    replacement = f"{key}={vector_store_id}"
    updated = False
    for index, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[index] = replacement
            updated = True
            break
    if not updated:
        lines.append(replacement)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser(description="Indexa PDFs autorizados em um vector store da OpenAI.")
    parser.add_argument("files", nargs="+", type=Path, help="PDFs a indexar")
    parser.add_argument("--store-id", help="Vector store existente; se omitido, cria um novo")
    parser.add_argument("--store-name", default="Biblioteca Psiquiatria - Regis Braga")
    parser.add_argument("--catalog", type=Path, default=Path("rag_sources.local.json"))
    return parser.parse_args()


def wait_until_ready(client, vector_store_id, file_id):
    while True:
        item = client.vector_stores.files.retrieve(vector_store_id=vector_store_id, file_id=file_id)
        if item.status == "completed":
            return
        if item.status in {"failed", "cancelled"}:
            raise RuntimeError(f"Falha ao indexar {file_id}: {getattr(item, 'last_error', None)}")
        time.sleep(2)


def main():
    args = parse_args()
    load_env()
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("Defina OPENAI_API_KEY antes da ingestao.")
    missing = [str(path) for path in args.files if not path.is_file()]
    if missing:
        raise SystemExit("Arquivos nao encontrados: " + ", ".join(missing))

    client = OpenAI()
    store = client.vector_stores.retrieve(args.store_id) if args.store_id else client.vector_stores.create(name=args.store_name)
    catalog = {"vector_store_id": store.id, "sources": []}
    for path in args.files:
        print(f"Enviando {path.name}...", flush=True)
        with path.open("rb") as stream:
            uploaded = client.files.create(file=stream, purpose="assistants")
        attached = client.vector_stores.files.create(vector_store_id=store.id, file_id=uploaded.id)
        wait_until_ready(client, store.id, uploaded.id)
        catalog["sources"].append({"filename": path.name, "file_id": uploaded.id, "status": attached.status})
        print(f"Indexado: {path.name}", flush=True)

    args.catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    save_vector_store_id(store.id)
    print("\nIndexacao concluida.")
    print(f"OPENAI_RAG_VECTOR_STORE_ID={store.id}")
    print(f"Catalogo local: {args.catalog}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Interrompido.")
