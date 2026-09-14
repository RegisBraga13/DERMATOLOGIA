#!/usr/bin/env python3
"""Recorta do PDF do DSM-5-TR a secao "Criterios Diagnosticos" de cada transtorno.

Nao e RAG. O Refinar do Diagnostico anexa os criterios das hipoteses que o
medico assinalou, pelo nome e pelo codigo, e para isso o texto precisa vir
inteiro e na ordem do livro. A busca vetorial nao consegue: medido em
14/09/2026 nos 10 casos ficticios, a secao de criterios do transtorno esperado
chegava a IA em 2 de 10, e em 4 de 10 buscando pelo nome das hipoteses.

So a Secao II. Os "Criterios Diagnosticos Propostos" da Secao III (modelo
alternativo dos transtornos da personalidade) nao sao os criterios oficiais e
ficam de fora.

A saida e .local.json, FORA do Git, pela mesma razao que os PDFs: e o livro.

    python3 scripts/build_dsm_criteria.py "/caminho/DSM 5 TR - português.pdf"
"""

import argparse
import json
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

from pypdf import PdfReader

# Subtitulos que encerram a secao de criterios. O que vem depois deles e texto
# descritivo do capitulo, e nao criterio.
SUBTITULOS = ("Especificadores", "Procedimentos para Registro", "Procedimentos de Registro", "Subtipos",
              "Características Diagnósticas", "Características Associadas", "Prevalência", "Desenvolvimento e Curso",
              "Fatores de Risco e Prognóstico", "Questões Diagnósticas Relativas à Cultura",
              "Questões Diagnósticas Relativas ao Sexo e ao Gênero", "Marcadores Diagnósticos",
              "Associação com Pensamentos ou Comportamentos Suicidas", "Consequências Funcionais",
              "Diagnóstico Diferencial", "Comorbidade", "Características de Apoio ao Diagnóstico")
CODIGO = re.compile(r"\b(F\d{2}(?:\.\w{1,4})?|G\d{2}\.\d{1,2}|Z\d{2}\.\d{1,3})\b")
# Titulo que quebrou em mais de uma linha: a de baixo continua a de cima.
TERMINA_EM_CONECTIVO = re.compile(r"\b(de|da|do|das|dos|e|com|por|ao|à|a|em|na|no|ou|Outra|Condição|Induzido)$|-$", re.I)


def normalize(value=""):
    """Mesma regra do normalize_name() do server.py — nao divergir."""
    texto = unicodedata.normalize("NFD", str(value).lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", texto).strip()


def subtitulo(linha):
    return any(linha.startswith(s) and len(linha) < len(s) + 25 for s in SUBTITULOS)


def parece_titulo(linha):
    return (len(linha) < 80 and not re.search(r"[.;,:]$", linha) and linha[:1].isupper()
            and sum(w[:1].isupper() for w in linha.split()) >= max(1, len(linha.split()) // 2))


def linhas_do_livro(reader):
    """Linhas da Secao II, e so dela.

    O sumario tambem lista "Secao II" e "Secao III", uma pagina depois da outra,
    e tambem traz "Criterios Diagnosticos" no nome das partes. A Secao II de
    verdade e o maior trecho entre uma linha "Secao II" e a "Secao III" seguinte:
    no sumario elas estao a uma pagina de distancia, no livro a quase mil. Um
    marcador de inicio por palavra ("Prefacio") casava primeiro com o sumario, e
    o recorte saia vazio.
    """
    linhas = []
    for numero, pagina in enumerate(reader.pages, 1):
        # NFKC desfaz as ligaduras do PDF ("especiﬁcado"), que a comparacao por
        # nome nao reconheceria.
        texto = re.sub(r"(\w)-\n(\w)", r"\1\2", unicodedata.normalize("NFKC", pagina.extract_text() or ""))
        for bruta in texto.split("\n"):
            linha = bruta.strip()
            if linha and not re.fullmatch(r"\d{1,4}", linha):
                linhas.append((numero, linha))
    marcas = [(i, l) for i, (_, l) in enumerate(linhas) if l in ("Seção II", "Seção III")]
    trechos = [(inicio, fim) for (inicio, a), (fim, b) in zip(marcas, marcas[1:]) if a == "Seção II" and b == "Seção III"]
    if not trechos:
        return []
    inicio, fim = max(trechos, key=lambda t: t[1] - t[0])
    return linhas[inicio + 1:fim]


def titulo_antes(texto, i):
    ultima = texto[i - 1] if i >= 1 else ""
    anterior = texto[i - 2] if i >= 2 else ""
    continua = (ultima[:1] in "(/" or ultima[:1].islower() or ultima.startswith("por ")
                or (ultima.endswith(")") and "(" not in ultima)
                or (len(ultima.split()) <= 2 and not ultima.startswith("Transtorno")
                    and parece_titulo(anterior) and not re.search(r"[.;:]$", anterior)))
    quebrou = bool(anterior) and not subtitulo(anterior) and anterior != ultima and (
        TERMINA_EM_CONECTIVO.search(anterior) or continua)
    if quebrou:
        return anterior + ultima if anterior.endswith("-") else f"{anterior} {ultima}"
    return ultima if (parece_titulo(ultima) or ultima.startswith("(")) else ""


def build_sections(linhas):
    texto = [linha for _, linha in linhas]
    inicios = [i for i, l in enumerate(texto)
               if l.startswith("Critérios Diagnósticos") and not l.startswith("Critérios Diagnósticos e Códigos")
               and "Propostos" not in l]
    secoes, sem_titulo = [], []
    for n, i in enumerate(inicios):
        titulo = titulo_antes(texto, i)
        proximo = inicios[n + 1] - 2 if n + 1 < len(inicios) else len(texto)
        fim = next((j for j in range(i + 1, proximo) if subtitulo(texto[j])), proximo)
        corpo = "\n".join(texto[i:fim]).strip()
        if not titulo:
            sem_titulo.append(linhas[i][0])
            continue
        secoes.append({
            "titulo": titulo,
            "chave": normalize(titulo),
            "pagina": linhas[i][0],
            # O codigo impresso na linha do titulo e unico por secao. Os do corpo
            # nao: o texto de um transtorno cita o codigo de outro (catatonia
            # aparece na esquizofrenia e nos dois bipolares).
            "codigo_titulo": (CODIGO.findall(texto[i]) or [""])[0],
            "codigos": sorted(set(CODIGO.findall(corpo))),
            "texto": corpo,
        })
    return secoes, sem_titulo


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdf", type=Path, help="PDF do DSM-5-TR em portugues")
    parser.add_argument("--saida", type=Path, default=Path("dsm_criteria.local.json"))
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise SystemExit(f"PDF nao encontrado: {args.pdf}")

    print(f"Lendo {args.pdf.name}...", flush=True)
    secoes, sem_titulo = build_sections(linhas_do_livro(PdfReader(str(args.pdf))))
    if not secoes:
        raise SystemExit("Nenhuma secao de criterios reconhecida. O PDF e o DSM-5-TR em portugues?")
    repetidos = sorted({s["titulo"] for s in secoes if sum(x["titulo"] == s["titulo"] for x in secoes) > 1})

    args.saida.write_text(json.dumps({
        "livro": "Manual diagnóstico e estatístico de transtornos mentais: DSM-5-TR",
        "origem": args.pdf.name,
        "gerado_em": date.today().isoformat(),
        "secoes": secoes,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(secoes)} secoes de criterios gravadas em {args.saida}")
    if sem_titulo:
        print(f"AVISO: {len(sem_titulo)} secao(oes) sem titulo reconhecido, nas paginas {sem_titulo}")
    if repetidos:
        print(f"AVISO: titulos repetidos: {', '.join(repetidos)}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Interrompido.")
