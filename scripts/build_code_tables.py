#!/usr/bin/env python3
"""Monta as tabelas de codigo a partir das fontes oficiais.

Duas fontes, duas licencas diferentes:

CID-11 (capitulo 6)  OMS, via a ICD-API. Licenca CC BY-ND 3.0 IGO: o titulo
                     e copiado literalmente, nunca reescrito. Precisa de
                     credencial gratuita (veja README na secao Codigos).
ICD-10-CM (cap. F)   CDC/NCHS, dominio publico, download direto sem conta.
                     E o conjunto de codigos que o DSM-5-TR usa: o "F41.1"
                     impresso no DSM e o codigo da ICD-10-CM, nao um codigo
                     proprio da APA.

Nenhum dos dois livros e indexado aqui. Isto e tabela de codigo, nao texto
clinico: o criterio diagnostico continua vindo da RAG.

    python3 scripts/build_code_tables.py           # so a ICD-10-CM
    python3 scripts/build_code_tables.py --icd11   # tambem a CID-11
"""

import argparse
import io
import json
import os
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

DESTINO = Path(__file__).resolve().parent.parent / "src" / "data" / "codes"

ICD10CM_ZIP = "https://ftp.cdc.gov/pub/health_statistics/nchs/publications/ICD10CM/{ano}/icd10cm-Code%20Descriptions-{ano}.zip"
ICD11_TOKEN = "https://icdaccessmanagement.who.int/connect/token"
ICD11_RAIZ = "https://id.who.int/icd/release/11/{release}/mms"


def baixar(url, timeout=180):
    with urllib.request.urlopen(url, timeout=timeout) as resposta:
        return resposta.read()


def pontuar(codigo):
    """F411 -> F41.1. Os arquivos do CDC vem sem o ponto."""
    return codigo if len(codigo) <= 3 else f"{codigo[:3]}.{codigo[3:]}"


def montar_icd10cm(ano):
    bruto = baixar(ICD10CM_ZIP.format(ano=ano))
    with zipfile.ZipFile(io.BytesIO(bruto)) as pacote:
        nome = next(n for n in pacote.namelist() if n.endswith(f"icd10cm-codes-{ano}.txt"))
        linhas = pacote.read(nome).decode("utf-8", "replace").splitlines()
    entradas = []
    for linha in linhas:
        # O arquivo e de largura fixa: codigo, espacos, descricao longa.
        codigo, _, descricao = linha.partition(" ")
        if not codigo.startswith("F"):
            continue
        entradas.append({"code": pontuar(codigo.strip()), "name": descricao.strip()})
    if not entradas:
        raise SystemExit(f"nenhum codigo F encontrado em icd10cm-codes-{ano}.txt")
    return entradas


def token_icd11(client_id, client_secret):
    dados = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "icdapi_access",
        "grant_type": "client_credentials",
    }).encode()
    pedido = urllib.request.Request(ICD11_TOKEN, data=dados)
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        return json.load(resposta)["access_token"]


def entidade(uri, token, idioma):
    pedido = urllib.request.Request(uri, headers={
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "API-Version": "v2",
        "Accept-Language": idioma,
    })
    with urllib.request.urlopen(pedido, timeout=60) as resposta:
        return json.load(resposta)


def montar_icd11(release, idioma):
    client_id = os.environ.get("ICD_API_CLIENT_ID")
    client_secret = os.environ.get("ICD_API_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise SystemExit(
            "faltam ICD_API_CLIENT_ID e ICD_API_CLIENT_SECRET.\n"
            "Registre-se de graca em https://icd.who.int/icdapi (Register / API access)\n"
            "e ponha as duas no .env."
        )
    token = token_icd11(client_id, client_secret)
    raiz = entidade(ICD11_RAIZ.format(release=release), token, idioma)
    capitulo = None
    for uri in raiz.get("child", []):
        filho = entidade(uri, token, idioma)
        if filho.get("code") == "06" or uri.rstrip("/").endswith("/334423054"):
            capitulo = filho
            break
    if capitulo is None:
        raise SystemExit("capitulo 6 nao encontrado na raiz da MMS")

    entradas = []
    vistos = set()

    def descer(uri):
        if uri in vistos:
            return
        vistos.add(uri)
        item = entidade(uri, token, idioma)
        codigo = (item.get("code") or "").strip()
        titulo = (item.get("title") or {}).get("@value", "").strip()
        # Bloco nao tem code proprio (so codeRange); guardamos os dois para que
        # "6A40-6A4Z" seja tao consultavel quanto "6A40".
        faixa = (item.get("classKind") == "block") and item.get("blockId")
        if codigo and titulo:
            entradas.append({"code": codigo, "name": titulo, "kind": item.get("classKind", "")})
        elif faixa and titulo and item.get("codeRange"):
            entradas.append({"code": item["codeRange"], "name": titulo, "kind": "block"})
        for neto in item.get("child", []):
            descer(neto)
        sys.stderr.write(f"\r{len(entradas)} entradas")

    for uri in capitulo.get("child", []):
        descer(uri)
    sys.stderr.write("\n")
    return entradas


def gravar(nome, entradas, fonte, licenca, extra=None):
    DESTINO.mkdir(parents=True, exist_ok=True)
    caminho = DESTINO / nome
    corpo = {
        "fonte": fonte,
        "licenca": licenca,
        "gerado_em": date.today().isoformat(),
        "gerado_por": "scripts/build_code_tables.py",
        "total": len(entradas),
        "codigos": entradas,
    }
    if extra:
        corpo.update(extra)
    caminho.write_text(json.dumps(corpo, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{caminho.relative_to(DESTINO.parent.parent.parent)}: {len(entradas)} codigos")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ano", default="2026", help="edicao da ICD-10-CM (default 2026)")
    parser.add_argument("--icd11", action="store_true", help="tambem montar a CID-11 (precisa de credencial)")
    parser.add_argument("--release", default="2025-01", help="release da CID-11 MMS")
    parser.add_argument("--idioma", default="pt", help="idioma dos titulos da CID-11")
    args = parser.parse_args()

    gravar(
        "icd10cmF.json",
        montar_icd10cm(args.ano),
        f"CDC/NCHS ICD-10-CM FY{args.ano}, capitulo 5 (F01-F99)",
        "Dominio publico (obra do governo dos EUA)",
        {"observacao": "Conjunto de codigos usado pelo DSM-5-TR. Descricoes no original em ingles, como publicadas."},
    )

    if args.icd11:
        gravar(
            "icd11Cap6.json",
            montar_icd11(args.release, args.idioma),
            f"OMS CID-11 MMS release {args.release}, capitulo 6",
            "CC BY-ND 3.0 IGO - titulos reproduzidos literalmente, sem alteracao",
        )


if __name__ == "__main__":
    main()
