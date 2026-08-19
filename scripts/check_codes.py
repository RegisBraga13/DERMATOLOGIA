#!/usr/bin/env python3
"""Confere os codigos do catalogo local contra as tabelas oficiais.

Existe por causa de um erro real: o catalogo trazia "6A70 - Episodio
depressivo" numa regra que nao pergunta episodios previos. 6A70 e episodio
UNICO; recorrente e 6A71. O nome ao lado estava certo, o que faz o erro
sobreviver a leitura. Codigo se confere contra tabela, nao contra leitura.

    python3 scripts/check_codes.py

Sai 1 se algum codigo citado nao existir na fonte oficial.
"""

import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "src" / "clinical" / "diagnosis.js"
TABELAS = RAIZ / "src" / "data" / "codes"

# 6A70, 6A70/6A71, 6A40-6A4Z, 6C40-6C4Z
CID11 = re.compile(r"\b[67][A-E][0-9A-Z]{2}(?:\.[0-9A-Z]+)?\b")
# F41.1, F05, F03.90
ICD10CM = re.compile(r"\bF[0-9]{2}(?:\.[0-9A-Z]+)?\b")


def carregar(nome):
    caminho = TABELAS / nome
    if not caminho.exists():
        return None
    dados = json.loads(caminho.read_text(encoding="utf-8"))
    return {entrada["code"]: entrada["name"] for entrada in dados["codigos"]}


def campos(texto):
    """Devolve (linha, chave, valor) para cada cid11:/dsm5tr: do catalogo."""
    for numero, linha in enumerate(texto.splitlines(), 1):
        achado = re.match(r"\s*(cid11|dsm5tr):\s*\"(.*)\",?\s*$", linha)
        if achado:
            yield numero, achado.group(1), achado.group(2)


def main():
    cid11 = carregar("icd11Psi.json")
    icd10cm = carregar("icd10cmF.json")
    if cid11 is None and icd10cm is None:
        print("nenhuma tabela em src/data/codes. Rode scripts/build_code_tables.py primeiro.")
        return 1

    texto = CATALOGO.read_text(encoding="utf-8")
    problemas = []
    conferidos = 0
    pulados = set()

    for numero, chave, valor in campos(texto):
        if not valor.strip():
            continue
        # A regra sindromica descritiva nao carrega codigo de proposito, e o
        # campo dsm5tr do catalogo ainda guarda nome por extenso, nao codigo.
        for codigo in CID11.findall(valor):
            if cid11 is None:
                pulados.add("CID-11")
                continue
            conferidos += 1
            if codigo not in cid11:
                problemas.append(f"{CATALOGO.name}:{numero}  {codigo} nao existe na CID-11 cap. 6/7")
        for codigo in ICD10CM.findall(valor):
            if icd10cm is None:
                pulados.add("ICD-10-CM")
                continue
            conferidos += 1
            if codigo not in icd10cm:
                problemas.append(f"{CATALOGO.name}:{numero}  {codigo} nao existe na ICD-10-CM cap. F")

    for pendente in sorted(pulados):
        print(f"aviso: tabela da {pendente} ausente, esses codigos nao foram conferidos")
    for problema in problemas:
        print(problema)
    print(f"{conferidos} codigos conferidos, {len(problemas)} fora da fonte oficial")
    return 1 if problemas else 0


if __name__ == "__main__":
    sys.exit(main())
