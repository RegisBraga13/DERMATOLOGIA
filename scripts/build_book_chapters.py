#!/usr/bin/env python3
"""Recorta os capitulos de farmaco de um livro em PDF, para leitura na tela.

O capitulo vai do nome do farmaco ate o fim dos BIPP TIPS, sem as referencias —
recorte definido pelo Dr. Regis, que e como ele le o livro na consulta.

Nao e RAG: aqui nao ha busca, embedding nem modelo. A pagina Medicamentos
mostra o texto do livro como ele esta escrito, e para isso o texto precisa vir
inteiro, em ordem, do proprio PDF. Recuperacao semantica devolve trecho solto e
fora de ordem, e emendar isso com um modelo produz parafrase — que e
exatamente o que "tal qual no livro" exclui.

A saida e um arquivo .local.json, FORA do Git, pela mesma razao que os PDFs
ficam fora: e o livro. Cada um gera o seu na propria maquina.

    python3 scripts/build_book_chapters.py "/caminho/livro.pdf"
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from pypdf import PdfReader

# O titulo do capitulo e uma linha que so tem a bolinha e o nome do farmaco.
TITULO = re.compile(r"^●\s+([A-ZÁÂÃÉÊÍÓÔÕÚÇ][^\n:•]{2,44})\s*$")
# Onde o capitulo acaba. Sao duas formas: 147 capitulos fecham em "Referencias"
# e 39 em "Leituras Recomendadas". Assumir so a primeira deixava a bibliografia
# inteira dentro do texto em 39 farmacos.
FIM = re.compile(r"^\s*●?\s*(Referências?|Leituras\s+Recomendadas)\s*$", re.I)
# "BIPP TIPS", "BIPPTIPS" e "BIPP TIP" — as tres grafias aparecem no livro. A
# ciamemazina traz o singular, e por causa dele parecia ser o unico capitulo
# sem a secao.
TIPS = re.compile(r"BIPP\s*TIPS?", re.I)
# Quebra de linha do rotulo "Interacoes Medicamentosas", que casa com TITULO e
# nao e capitulo nenhum.
NAO_E_FARMACO = {"Medicamentosas"}

# --- Remontagem dos paragrafos ------------------------------------------------
# O PDF quebra a linha onde a coluna acaba, e nao onde o paragrafo acaba: nao ha
# linha em branco entre paragrafos. Sem remontar, a tela mostra um texto picado
# no meio das frases; remontando tudo, vira um paragrafo unico de 20 mil
# caracteres. O que separa um bloco do outro sao as marcas que o livro usa:
#   ●          rotulo ("● INDICACOES DE BULA - ANVISA:")
#   espaco     titulo de secao (" Farmacologia") ou item dos BIPP TIPS
#   CAIXA:     campo nomeado ("ABSORCAO:", "MEIA-VIDA:")
# Linha que nao traz marca nenhuma continua o bloco anterior.
ROTULO = re.compile(r"^[A-ZÁÂÃÉÊÍÓÔÕÚÇ][A-ZÁÂÃÉÊÍÓÔÕÚÇ0-9 /\-]{2,}:")
# "Nomes no Brasil:", "SUS:" — rotulo curto em caixa mista, que o livro imprime
# na propria linha. Sem esta regra ele era absorvido pelo paragrafo de abertura,
# e a lista de nomes comerciais sumia dentro da prosa de apresentacao.
ROTULO_CURTO = re.compile(r"^[A-ZÁÂÃÉÊÍÓÔÕÚÇ][^:]{1,34}:$")
CAIXA_ALTA = re.compile(r"^[A-ZÁÂÃÉÊÍÓÔÕÚÇ0-9][^a-z]{4,}$")
SO_TIPS = re.compile(r"^BIPP\s*TIPS?$", re.I)


def paragraphs(texto=""):
    blocos = []
    for n, bruto in enumerate(texto.split("\n")):
        linha = bruto.strip()
        if not linha:
            continue
        if n == 0:
            blocos.append({"t": "titulo", "v": linha.lstrip("● ").strip()})
            continue
        if SO_TIPS.match(linha):
            tipo = "secao"
        elif bruto.startswith("●"):
            tipo, linha = "rotulo", linha.lstrip("● ").strip()
        elif bruto[:1] == " ":
            # Titulo de secao e curto e nao fecha com ponto; item dos BIPP TIPS e
            # frase inteira. A distincao existe para a tela: um vira cabecalho, o
            # outro vira item.
            tipo = "secao" if (len(linha) < 40 and not linha.endswith(".")) else "item"
        elif ROTULO.match(linha) or CAIXA_ALTA.match(linha) or ROTULO_CURTO.match(linha):
            tipo = "rotulo"
        else:
            tipo = ""
        # Continuacao nunca entra em titulo nem em cabecalho de secao: eles sao
        # uma linha so, e absorver a proxima transformava "Farmacogenetica" em
        # "Farmacogenetica Acesse https://...".
        if not tipo and blocos and blocos[-1]["t"] not in {"titulo", "secao"}:
            blocos[-1]["v"] += " " + linha
        else:
            blocos.append({"t": tipo or "texto", "v": linha})
    return blocos


def normalize(value=""):
    """Mesma regra do normalize_name() do server.py — nao divergir.

    Pontuacao vira espaco, e nao some: "D-Ciclosserina" tem que gerar a mesma
    chave dos dois lados, senao o capitulo existe e nao e encontrado.
    """
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFKD", str(value).lower())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", " ", sem_acento).strip()


def chapter_lines(reader):
    return "\n".join((page.extract_text() or "") for page in reader.pages).split("\n")


def find_headings(linhas):
    """Titulos de capitulo, descartando os do indice de letra.

    Cada letra do alfabeto abre com uma lista dos farmacos daquela letra, com a
    mesma bolinha do titulo. O que separa um do outro e o que vem depois: no
    indice vem outro titulo, no capitulo vem prosa.
    """
    titulos = []
    for i, linha in enumerate(linhas):
        casa = TITULO.match(linha.strip())
        if not casa:
            continue
        nome = casa.group(1).strip()
        # Rotulo interno em caixa alta ("● INDICACOES DE BULA - ANVISA:").
        if nome.isupper() or nome in NAO_E_FARMACO:
            continue
        proxima = next((x.strip() for x in linhas[i + 1:i + 3] if x.strip()), "")
        if TITULO.match(proxima):
            continue
        titulos.append((i, nome))
    return titulos


def build_chapters(linhas):
    titulos = find_headings(linhas)
    capitulos, sem_tips = {}, []
    for k, (inicio, nome) in enumerate(titulos):
        limite = titulos[k + 1][0] if k + 1 < len(titulos) else len(linhas)
        fim = next((j for j in range(inicio + 1, limite) if FIM.match(linhas[j])), limite)
        texto = "\n".join(linhas[inicio:fim]).strip()
        if not TIPS.search(texto):
            sem_tips.append(nome)
        capitulos[nome] = texto
    return capitulos, sem_tips


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pdf", type=Path, help="PDF do livro")
    parser.add_argument("--saida", type=Path, default=Path("book_chapters.local.json"))
    parser.add_argument("--titulo", default="Psicofarmacologia: Da Teoria à Clínica, 1ª ed., 2025",
                        help="Como o livro e creditado na tela")
    args = parser.parse_args()
    if not args.pdf.is_file():
        raise SystemExit(f"PDF nao encontrado: {args.pdf}")

    print(f"Lendo {args.pdf.name}...", flush=True)
    linhas = chapter_lines(PdfReader(str(args.pdf)))
    capitulos, sem_tips = build_chapters(linhas)
    if not capitulos:
        raise SystemExit("Nenhum capitulo reconhecido. O livro segue o formato esperado?")

    args.saida.write_text(json.dumps({
        "livro": args.titulo,
        "origem": args.pdf.name,
        # A chave de busca vai gravada: quem consulta digita "sertralina", e a
        # comparacao nao pode depender de acento nem de caixa.
        "capitulos": [{"nome": nome, "chave": normalize(nome), "blocos": paragraphs(texto)}
                      for nome, texto in capitulos.items()],
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(capitulos)} capitulos gravados em {args.saida}")
    if sem_tips:
        print(f"AVISO: {len(sem_tips)} sem BIPP TIPS: {', '.join(sem_tips[:8])}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Interrompido.")
