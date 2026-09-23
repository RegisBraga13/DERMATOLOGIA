#!/usr/bin/env python3
"""Indexa as diretrizes de conduta em um vector store SEPARADO do dos livros.

Store propria, e nao um genero novo na biblioteca. As duas razoes:

1. A busca da biblioteca devolve 8 trechos NO TOTAL. Uma diretriz de conduta e
   topicamente vizinha da terapeutica: no Tratamento ela pontuaria alto o
   bastante para ocupar vagas dos livros sem responder a mesma pergunta. E o
   erro que o RAG.md ja documenta -- psicofarmacologia disputando com
   psicopatologia -- repetido com outro par.
2. `tag_rag_scope.py` e `desassociar_rag.py` varrem a store dos livros por
   escopo. Script que envelhece vira destrutivo sem uma linha de erro; este
   acervo fica onde eles nao alcancam.

Uso:

    python3 scripts/ingest_guidelines.py "C:/Users/Regis/diretrizes"

Copie o OPENAI_GUIDELINES_VECTOR_STORE_ID exibido para o .env e reinicie o
server.py.
"""

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


ENV_KEY = "OPENAI_GUIDELINES_VECTOR_STORE_ID"


def save_vector_store_id(vector_store_id, path=Path(".env")):
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    replacement = f"{ENV_KEY}={vector_store_id}"
    for index, line in enumerate(lines):
        if line.strip().startswith(f"{ENV_KEY}="):
            lines[index] = replacement
            break
    else:
        lines.append(replacement)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# O CLAUDE.md que acompanha a pasta descreve a PASTA -- "procure e leia os
# arquivos markdown pertinentes" --, e nao uma conduta. Indexado, ele viraria
# um trecho recuperavel de prosa sobre como consultar o acervo, disputando vaga
# com o texto clinico. Fica fora, e a exclusao e por nome porque e um arquivo
# so e conhecido.
NAO_INDEXAR = {"CLAUDE.md", "README.md"}

# Limite de um valor de atributo no vector store da OpenAI.
MAX_ATTR_CHARS = 500


def parse_frontmatter(texto):
    """Le o frontmatter YAML das diretrizes -- so as formas que elas usam.

    Nao e um parser de YAML e nao pretende ser: o acervo e escrito por um
    gerador, num formato fixo de `chave: "valor"` e listas de `- item`. Uma
    dependencia nova para ler quarenta cabecalhos previsiveis nao se paga, e o
    projeto inteiro roda sem dependencia fora do cliente da OpenAI.
    """
    if not texto.startswith("---"):
        return {}
    fim = texto.find("\n---", 3)
    if fim < 0:
        return {}
    dados = {}
    chave_lista = None
    for linha in texto[3:fim].splitlines():
        if not linha.strip() or linha.lstrip().startswith("#"):
            continue
        if linha.startswith(("  - ", "- ")) and chave_lista:
            dados[chave_lista].append(linha.split("- ", 1)[1].strip().strip('"'))
            continue
        if ":" not in linha or linha.startswith(" "):
            continue
        chave, valor = linha.split(":", 1)
        chave, valor = chave.strip(), valor.strip().strip('"')
        if valor:
            dados[chave] = valor
            chave_lista = None
        else:
            dados[chave] = []
            chave_lista = chave
    return dados


# O acervo nao tem um frontmatter so: medido nos 39 arquivos, sao tres formatos.
# A maioria traz `conditions` e `last_updated`; o de Outros Transtornos
# Psicoticos traz `scope` e `last_reviewed`; o de Depressao na Infancia traz
# `keywords`, `scope` como lista e `population`. Primeira chave presente vence.
#
# Ler com tolerancia em vez de exigir um formato: a metadata nao filtra busca
# nenhuma, entao um campo ausente nao quebra recuperacao -- so empobrece o
# catalogo. Exigir uniformidade recusaria arquivo clinico bom por causa do
# cabecalho, e arquivo recusado e conduta que o medico nao ve.
ALIASES = {
    "titulo": ("title",),
    "atualizado": ("last_updated", "last_reviewed", "evidence_cutoff", "search_cutoff"),
    "condicoes": ("conditions", "keywords", "scope", "topics"),
    "populacao": ("population",),
}


def primeiro_valor(frontmatter, chaves):
    for chave in chaves:
        valor = frontmatter.get(chave)
        if isinstance(valor, list) and valor:
            return "; ".join(str(item) for item in valor)
        if isinstance(valor, str) and valor.strip():
            return valor.strip()
    return ""


def atributos(caminho, raiz, frontmatter):
    """Metadata gravada na ingestao, e NAO usada como filtro de busca.

    Decisao de 23/09/2026. Os quarenta arquivos sao todos o mesmo genero --
    diretriz de conduta --, e a regra do RAG.md vale aqui inteira: dentro de um
    genero, mais documento e estritamente melhor; o que dilui e misturar genero.
    Filtrar por transtorno nao protegeria de nada e bloquearia justamente o que
    importa: a propria diretriz de depressao manda "excluir bipolaridade antes
    de antidepressivo", e sob filtro `depressao` o arquivo do TAB nunca entra.
    Comorbidade precisa de dois arquivos, e faixa etaria tem arquivo proprio.

    Fica gravada porque medir custa caro e ligar o filtro depois, se a medicao
    mostrar diluicao, tem de ser uma linha -- nao uma reindexacao de tudo.
    """
    grupo = caminho.relative_to(raiz).parts[0] if caminho.parent != raiz else ""
    # O nome do arquivo vai na metadata para que a store saiba dizer o que ja
    # tem. Sem ele, a unica memoria do que foi enviado e o catalogo local -- e
    # catalogo local nao protege quem roda de outra pasta, de outra maquina, ou
    # depois de apagar o arquivo.
    attrs = {"acervo": "diretrizes", "arquivo": caminho.name[:MAX_ATTR_CHARS]}
    if grupo:
        attrs["grupo"] = grupo[:MAX_ATTR_CHARS]
    for nome, chaves in ALIASES.items():
        valor = primeiro_valor(frontmatter, chaves)
        if valor:
            attrs[nome] = valor[:MAX_ATTR_CHARS]
    return attrs


def associa_por_id(client, args):
    """Poe na store um arquivo que ja esta na conta, sem reenviar."""
    configured = args.store_id or os.environ.get(ENV_KEY, "").strip()
    if not configured:
        raise SystemExit(f"{ENV_KEY} nao configurado: nao ha store a que associar.")
    nome = client.files.retrieve(args.file_id).filename
    attrs = {"acervo": "diretrizes", "arquivo": nome[:MAX_ATTR_CHARS],
             "titulo": args.titulo[:MAX_ATTR_CHARS],
             "condicoes": args.condicoes[:MAX_ATTR_CHARS]}
    client.vector_stores.files.create(vector_store_id=configured, file_id=args.file_id, attributes=attrs)
    wait_until_ready(client, configured, args.file_id)
    catalogo = json.loads(args.catalog.read_text(encoding="utf-8")) if args.catalog.is_file() else {"vector_store_id": configured, "sources": []}
    catalogo["sources"] = [i for i in catalogo["sources"] if i.get("filename") != nome]
    catalogo["sources"].append({"filename": nome, "file_id": args.file_id, "status": "completed", **attrs})
    args.catalog.write_text(json.dumps(catalogo, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Associado sem reenvio: {nome}")
    print(f"  titulo:    {args.titulo}")
    print(f"  condicoes: {args.condicoes}")


def parse_args():
    parser = argparse.ArgumentParser(description="Indexa diretrizes de conduta em vector store proprio.")
    parser.add_argument("pasta", type=Path, nargs="?", default=Path("."),
                        help="Pasta com os .md, ou um arquivo unico (.md ou .pdf)")
    parser.add_argument("--store-id", help="Vector store existente; se omitido, usa o do .env ou cria um novo")
    parser.add_argument("--store-name", default="Diretrizes de conduta - Regis Braga")
    parser.add_argument("--catalog", type=Path, default=Path("guidelines_sources.local.json"))
    # Sem isto, rodar o comando duas vezes sobe quarenta arquivos duplicados e a
    # busca passa a devolver o mesmo trecho em duas vagas das oito.
    parser.add_argument("--refazer", action="store_true",
                        help="Reenvia arquivos ja listados no catalogo desta store")
    # PDF nao tem frontmatter, e sem `titulo` e `condicoes` o documento nao
    # participa da busca garantida por entidade: ele entra na store, responde na
    # busca geral e nunca ganha vaga propria -- o que, num acervo de diretrizes,
    # e quase nao estar la.
    #
    # Entao o arquivo DECLARA o que e, como o --escopo ja obriga no ingest dos
    # livros. Sem default, e de proposito: adivinhar a condicao a partir do nome
    # do arquivo poria a diretriz errada na vaga garantida do diagnostico errado.
    # Arquivo que JA esta na conta. Associar nao pede novo upload -- e a mesma
    # razao pela qual desassociar_rag.py nao apaga: o que ja subiu volta em
    # segundos, e um PDF de diretriz nao precisa atravessar a rede duas vezes.
    parser.add_argument("--file-id", help="Associa um arquivo que ja esta na conta, em vez de enviar")
    parser.add_argument("--titulo", help="Titulo do documento (obrigatorio para arquivo sem frontmatter)")
    parser.add_argument("--condicoes", help="Condicoes que ele cobre, separadas por ponto-e-virgula")
    args = parser.parse_args()
    if args.file_id and not (args.titulo and args.condicoes):
        parser.error("--file-id exige --titulo e --condicoes: nao ha frontmatter para ler")
    if not args.file_id and args.pasta.is_file() and args.pasta.suffix.lower() != ".md" and not (args.titulo and args.condicoes):
        parser.error("arquivo sem frontmatter exige --titulo e --condicoes; "
                     "sem eles o documento nunca entra na busca garantida por entidade")
    return args


def arquivos_ja_no_store(client, vector_store_id):
    """O que a STORE ja tem, e nao o que o catalogo local diz que ela tem.

    O catalogo e um arquivo nesta maquina, nesta pasta. Quem roda de outro
    lugar, ou depois de apaga-lo, reenvia os 39 -- e paga duas vezes por um
    acervo que a store ja carregava. Perguntar a propria store custa uma
    chamada e nao mente.
    """
    nomes, after = set(), None
    while True:
        pagina = client.vector_stores.files.list(vector_store_id=vector_store_id, limit=100, after=after)
        for item in pagina.data:
            nome = (getattr(item, "attributes", None) or {}).get("arquivo")
            if nome:
                nomes.add(nome)
        if not getattr(pagina, "has_more", False) or not pagina.data:
            return nomes
        after = pagina.data[-1].id


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
    client_cedo = OpenAI()
    if args.file_id:
        store = associa_por_id(client_cedo, args)
        return
    raiz = args.pasta.expanduser().resolve()
    if not raiz.is_dir():
        raise SystemExit(f"Pasta nao encontrada: {raiz}")
    # Um arquivo so, ou a pasta inteira. O CANMAT 2023 entrou pelo primeiro
    # caminho: e uma diretriz original em PDF, e nao uma das sinteses.
    if raiz.is_file():
        arquivos, raiz = [raiz], raiz.parent
    else:
        arquivos = sorted(p for p in raiz.rglob("*.md") if p.name not in NAO_INDEXAR)
    if not arquivos:
        raise SystemExit(f"Nenhum arquivo indexavel em {raiz}")

    client = OpenAI()
    configured = args.store_id or os.environ.get(ENV_KEY, "").strip()
    store = client.vector_stores.retrieve(configured) if configured else client.vector_stores.create(name=args.store_name)
    # GRAVA O ID AGORA, e nao no fim.
    #
    # Aprendido errando, em 23/09/2026: duas ingestoes comecaram com dois
    # minutos de diferenca, e como o id so era escrito depois do ultimo
    # arquivo, a segunda nao tinha como enxergar a store da primeira. Criou
    # outra. Terminaram duas stores pela metade, 39 arquivos pagos duas vezes,
    # e o `.env` apontando para a que acabasse por ultimo -- que nao era
    # necessariamente a completa.
    #
    # Escrito aqui, a execucao seguinte encontra a store e SOMA a ela. Uma
    # ingestao interrompida passa a ser retomavel em vez de recomecavel: e o
    # mesmo motivo pelo qual desassociar nao apaga da conta.
    save_vector_store_id(store.id)

    catalog = {"vector_store_id": store.id, "sources": []}
    if args.catalog.is_file():
        try:
            anterior = json.loads(args.catalog.read_text(encoding="utf-8"))
            if anterior.get("vector_store_id") == store.id:
                catalog["sources"] = list(anterior.get("sources") or [])
        except (json.JSONDecodeError, OSError):
            pass
    # A uniao das duas memorias: o catalogo local e a propria store. O catalogo
    # sozinho nao sabe do que foi enviado de outra maquina; a store sozinha nao
    # sabe do que subiu antes de a metadata `arquivo` existir.
    ja_indexados = {item.get("filename") for item in catalog["sources"]}
    try:
        ja_indexados |= arquivos_ja_no_store(client, store.id)
    except Exception as erro:  # pragma: no cover - depende da rede
        print(f"Aviso: nao consegui listar o que a store ja tem ({erro}). "
              "Seguindo so pelo catalogo local.", flush=True)

    enviados = pulados = 0
    for caminho in arquivos:
        if caminho.name in ja_indexados and not args.refazer:
            pulados += 1
            continue
        # Frontmatter so existe em .md; PDF declara pela linha de comando.
        frontmatter = {}
        if caminho.suffix.lower() == ".md":
            frontmatter = parse_frontmatter(caminho.read_text(encoding="utf-8"))
        if args.titulo:
            frontmatter["title"] = args.titulo
        if args.condicoes:
            frontmatter["conditions"] = [c.strip() for c in args.condicoes.split(";") if c.strip()]
        attrs = atributos(caminho, raiz, frontmatter)
        print(f"Enviando {caminho.name}...", flush=True)
        with caminho.open("rb") as stream:
            uploaded = client.files.create(file=stream, purpose="assistants")
        client.vector_stores.files.create(vector_store_id=store.id, file_id=uploaded.id, attributes=attrs)
        wait_until_ready(client, store.id, uploaded.id)
        catalog["sources"] = [item for item in catalog["sources"] if item.get("filename") != caminho.name]
        catalog["sources"].append({"filename": caminho.name, "file_id": uploaded.id,
                                   "status": "completed", **attrs})
        enviados += 1
        print(f"Indexado: {caminho.name}", flush=True)

    args.catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    save_vector_store_id(store.id)
    print(f"\n{enviados} indexado(s), {pulados} ja no catalogo (use --refazer para reenviar).")
    print(f"{ENV_KEY}={store.id}")
    print(f"Catalogo local: {args.catalog}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit("Interrompido.")
