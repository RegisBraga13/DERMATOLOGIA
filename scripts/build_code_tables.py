#!/usr/bin/env python3
"""Monta as tabelas de codigo a partir das fontes oficiais.

Tres fontes, todas de download direto e sem credencial:

CID-11 cap. 6    OMS, arquivo de release SimpleTabulation-ICD-11-MMS-pt.
                 Licenca CC BY-ND 3.0 IGO: o titulo e copiado literalmente,
                 nunca reescrito nem traduzido por nos — a traducao para o
                 portugues e a da propria OMS.
Mapa 11->10      OMS, mapping.zip. E o mapa da propria OMS, com a grossura
                 que ele tem: as vezes devolve categoria, nao codigo folha.
ICD-10-CM cap. F CDC/NCHS, dominio publico. E o conjunto de codigos que o
                 DSM-5-TR imprime: o "F41.1" do DSM e codigo da ICD-10-CM,
                 nao um codigo proprio da APA.

Nenhum dos dois livros e indexado aqui. Isto e tabela de codigo, nao texto
clinico: o criterio diagnostico continua vindo da RAG.

    python3 scripts/build_code_tables.py
"""

import argparse
import csv
import io
import json
import re
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

DESTINO = Path(__file__).resolve().parent.parent / "src" / "data" / "codes"

ICD10CM_ZIP = "https://ftp.cdc.gov/pub/health_statistics/nchs/publications/ICD10CM/{ano}/icd10cm-Code%20Descriptions-{ano}.zip"
MMS_ZIP = "https://icdcdn.who.int/static/releasefiles/{release}/SimpleTabulation-ICD-11-MMS-{idioma}.zip"
MAPA_ZIP = "https://icdcdn.who.int/static/releasefiles/{release}/mapping.zip"

# Capitulo 6 (mental e comportamental) e 7 (sono-vigilia). O 7 entra porque
# psiquiatra codifica insonia: numa chamada real a IA propos "Transtorno de
# Insonia - 7A00", que e codigo legitimo e caia fora da tabela so por estar no
# capitulo vizinho.
CAPITULOS = {"06", "07"}


def baixar_zip(url, timeout=300):
    with urllib.request.urlopen(url, timeout=timeout) as resposta:
        return zipfile.ZipFile(io.BytesIO(resposta.read()))


def ler_tsv(pacote, sufixo):
    nome = next(n for n in pacote.namelist() if n.endswith(sufixo))
    texto = pacote.read(nome).decode("utf-8-sig", "replace")
    return list(csv.DictReader(io.StringIO(texto), delimiter="\t"))


def pontuar(codigo):
    """F411 -> F41.1. Os arquivos do CDC vem sem o ponto."""
    return codigo if len(codigo) <= 3 else f"{codigo[:3]}.{codigo[3:]}"


def limpar_titulo(valor):
    """A tabulacao marca profundidade com hifens: '- - - Transtorno...'."""
    return re.sub(r"^(?:-\s*)+", "", (valor or "").strip()).strip()


def montar_icd10cm(ano):
    pacote = baixar_zip(ICD10CM_ZIP.format(ano=ano))
    entradas = []
    nome = next(n for n in pacote.namelist() if n.endswith(f"icd10cm-codes-{ano}.txt"))
    for linha in pacote.read(nome).decode("utf-8", "replace").splitlines():
        # Largura fixa: codigo, espacos, descricao longa.
        codigo, _, descricao = linha.partition(" ")
        if codigo.startswith("F"):
            entradas.append({"code": pontuar(codigo.strip()), "name": descricao.strip()})
    if not entradas:
        raise SystemExit(f"nenhum codigo F em icd10cm-codes-{ano}.txt")
    return entradas


def montar_icd11(release, idioma):
    linhas = ler_tsv(baixar_zip(MMS_ZIP.format(release=release, idioma=idioma)),
                     f"SimpleTabulation-ICD-11-MMS-{idioma}.txt")
    entradas = []
    for linha in linhas:
        if (linha.get("ChapterNo") or "").strip() not in CAPITULOS:
            continue
        classe = (linha.get("ClassKind") or "").strip()
        # Bloco fica de fora: o identificador dele e "BlockL2-6A7", que nao e
        # codigo atribuivel a diagnostico nenhum. Faixa do tipo "6A40-6A4Z"
        # continua conferivel, porque as duas pontas sao codigos de verdade.
        codigo = (linha.get("Code") or "").strip()
        titulo = limpar_titulo(linha.get("Title"))
        if classe == "block":
            continue
        if not codigo or not titulo:
            continue
        entradas.append({
            "code": codigo,
            "name": titulo,
            "nameEN": limpar_titulo(linha.get("TitleEN")),
            "kind": classe,
        })
    if not entradas:
        raise SystemExit("nenhuma entrada dos capitulos 6 e 7 na tabulacao da MMS")
    return entradas


def montar_crosswalk(release, icd11, icd10cm):
    """CID-11 -> ICD-10 (mapa da OMS) -> codigos ICD-10-CM que caem embaixo.

    O mapa da OMS devolve categoria em muitos casos (6A71 -> F33). A ICD-10-CM
    subdivide (F33.0, F33.1, ...) conforme gravidade e sintoma psicotico, que
    e detalhe clinico que so o registro do medico sustenta. Guardamos o codigo
    do mapa e todos os filhos possiveis, sem escolher por ele.
    """
    linhas = ler_tsv(baixar_zip(MAPA_ZIP.format(release=release)), "11To10MapToOneCategory.txt")
    conhecidos = {entrada["code"] for entrada in icd11}
    folhas = sorted(entrada["code"] for entrada in icd10cm)
    nomes10cm = {entrada["code"]: entrada["name"] for entrada in icd10cm}

    entradas = []
    vistos = set()
    for linha in linhas:
        codigo11 = (linha.get("icd11Code") or "").strip()
        codigo10 = (linha.get("icd10Code") or "").strip()
        if not codigo11 or not codigo10 or codigo11 in vistos or codigo11 not in conhecidos:
            continue
        vistos.add(codigo11)
        # Faixa ("F80-F89") nao expande: e mapa grosso demais para virar codigo.
        candidatos = [] if "-" in codigo10 else [
            folha for folha in folhas
            if folha == codigo10 or folha.startswith(codigo10 + ".") or folha.startswith(codigo10)
            and len(folha) > len(codigo10) and folha[len(codigo10)] in ".0123456789"
        ]
        entradas.append({
            "cid11": codigo11,
            "icd10": codigo10,
            "icd10Title": (linha.get("icd10Title") or "").strip(),
            "icd10cm": [{"code": c, "name": nomes10cm[c]} for c in sorted(set(candidatos))],
        })
    return entradas


def gravar(nome, entradas, fonte, licenca, extra=None):
    DESTINO.mkdir(parents=True, exist_ok=True)
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
    (DESTINO / nome).write_text(json.dumps(corpo, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"src/data/codes/{nome}: {len(entradas)} entradas")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ano", default="2026", help="edicao da ICD-10-CM")
    parser.add_argument("--release", default="2025-01", help="release da CID-11 MMS")
    parser.add_argument("--idioma", default="pt", help="idioma dos titulos da CID-11")
    args = parser.parse_args()

    icd10cm = montar_icd10cm(args.ano)
    gravar("icd10cmF.json", icd10cm,
           f"CDC/NCHS ICD-10-CM FY{args.ano}, capitulo 5 (F01-F99)",
           "Dominio publico (obra do governo dos EUA)",
           {"observacao": "Conjunto de codigos usado pelo DSM-5-TR. Descricoes no original em ingles."})

    icd11 = montar_icd11(args.release, args.idioma)
    gravar("icd11Psi.json", icd11,
           f"OMS CID-11 MMS release {args.release}, capitulos 6 e 7, tabulacao simples ({args.idioma})",
           "CC BY-ND 3.0 IGO - titulos reproduzidos literalmente, traducao da propria OMS")

    gravar("crosswalk.json", montar_crosswalk(args.release, icd11, icd10cm),
           f"OMS, mapa 11To10MapToOneCategory do release {args.release}, cruzado com a ICD-10-CM",
           "CC BY-ND 3.0 IGO (mapa da OMS) + dominio publico (ICD-10-CM)",
           {"observacao": "O mapa da OMS e de uma categoria so e as vezes devolve categoria, nao codigo folha."})


if __name__ == "__main__":
    main()
