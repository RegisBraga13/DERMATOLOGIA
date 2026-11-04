"""Ensaio REST de RLS no Supabase local, sem credenciais ou dados reais."""

import json
import secrets
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from urllib.parse import urlparse


def local_status():
    output = subprocess.check_output(
        ["supabase", "status", "-o", "env", "--output-format", "text"], text=True
    )
    variables = {}
    for line in output.splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            variables[key] = value.strip().strip('"')
    api = variables.get("API_URL")
    database = variables.get("DB_URL")
    if not api or not database or not variables.get("ANON_KEY") or not variables.get("SERVICE_ROLE_KEY"):
        raise RuntimeError("A stack local não informou as URLs e chaves necessárias.")
    for address in (api, database):
        if urlparse(address).hostname not in {"127.0.0.1", "localhost"}:
            raise RuntimeError("Teste recusado: endpoint fora da máquina local.")
    return api.rstrip("/"), database, variables["ANON_KEY"], variables["SERVICE_ROLE_KEY"]


def request(api, path, key, token=None, method="GET", body=None, query=None):
    url = api + path + ("?" + urllib.parse.urlencode(query) if query else "")
    payload = json.dumps(body).encode() if body is not None else None
    headers = {"apikey": key, "Authorization": "Bearer " + (token or key)}
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if method in {"POST", "PATCH"}:
        headers["Prefer"] = "return=representation"
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            data = response.read()
            return response.status, json.loads(data) if data else None
    except urllib.error.HTTPError as error:
        # O corpo pode conter dados fornecidos por terceiros; não vai ao log.
        error.read()
        return error.code, None


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    api, database, anon, admin = local_status()
    subprocess.run(
        ["psql", "-X", "-v", "ON_ERROR_STOP=1", "-d", database,
         "-f", "supabase/drafts/prontuario_registros_v2.sql"],
        check=True, stdout=subprocess.DEVNULL,
    )

    accounts = []
    for number in (1, 2):
        email = f"psiquiatria-ci-{number}-{secrets.token_hex(4)}@example.test"
        password = "Synthetic!" + secrets.token_urlsafe(16)
        status, user = request(api, "/auth/v1/admin/users", admin, method="POST",
                               body={"email": email, "password": password, "email_confirm": True})
        require(status in {200, 201} and user and user.get("id"), "Falha ao criar usuário local.")
        status, session = request(api, "/auth/v1/token", anon, method="POST",
                                  body={"email": email, "password": password},
                                  query={"grant_type": "password"})
        require(status == 200 and session and session.get("access_token"), "Falha no login local.")
        accounts.append((user["id"], session["access_token"]))

    first, second = accounts
    for owner, token in accounts:
        status, rows = request(api, "/rest/v1/prontuario_registros", anon, token,
                               method="POST", body={"owner_id": owner, "kind": "patient",
                                                    "record_id": "p", "patient_id": "p",
                                                    "payload": {"id": "p", "ficticio": True}})
        require(status == 201 and len(rows) == 1, "Inserção própria falhou.")

    for owner, token in accounts:
        status, rows = request(api, "/rest/v1/prontuario_registros", anon, token,
                               query={"select": "owner_id,kind,record_id,version", "order": "owner_id.asc"})
        require(status == 200 and len(rows) == 1 and rows[0]["owner_id"] == owner,
                "Leitura entre contas não foi isolada.")

    status, _ = request(api, "/rest/v1/prontuario_registros", anon, first[1],
                        method="POST", body={"owner_id": second[0], "kind": "patient",
                                             "record_id": "intruso", "payload": {"id": "intruso"}})
    require(status in {401, 403}, "Inserção entre contas foi aceita.")

    status, rows = request(api, "/rest/v1/prontuario_registros", anon, first[1], method="PATCH",
                           query={"owner_id": "eq." + second[0], "kind": "eq.patient",
                                  "record_id": "eq.p", "select": "record_id"},
                           body={"payload": {"id": "p", "ficticio": "intruso"}})
    require(status == 200 and rows == [], "Edição entre contas foi aceita.")

    target = {"owner_id": "eq." + first[0], "kind": "eq.patient",
              "record_id": "eq.p", "version": "eq.1", "select": "record_id,version"}
    status, rows = request(api, "/rest/v1/prontuario_registros", anon, first[1],
                           method="PATCH", query=target,
                           body={"version": 2, "payload": {"id": "p", "ficticio": "v2"}})
    require(status == 200 and len(rows) == 1 and rows[0]["version"] == 2,
            "Escrita condicional própria falhou.")
    status, rows = request(api, "/rest/v1/prontuario_registros", anon, first[1],
                           method="PATCH", query=target,
                           body={"version": 2, "payload": {"id": "p", "ficticio": "obsoleto"}})
    require(status == 200 and rows == [], "Versão obsoleta sobrescreveu registro.")

    archive = {"owner_id": first[0], "kind": "patient", "record_id": "p",
               "local_payload": {"id": "p"}, "remote_payload": {"id": "p"},
               "selected": "remote", "remote_version": 2}
    status, rows = request(api, "/rest/v1/prontuario_conflitos", anon, first[1],
                           method="POST", body=archive)
    require(status == 201 and len(rows) == 1, "Arquivamento do conflito falhou.")
    status, rows = request(api, "/rest/v1/prontuario_conflitos", anon, second[1],
                           query={"select": "owner_id"})
    require(status == 200 and rows == [], "Conflito de outra conta ficou visível.")
    status, _ = request(api, "/rest/v1/prontuario_conflitos", anon, first[1],
                        method="PATCH", query={"owner_id": "eq." + first[0]},
                        body={"selected": "local"})
    require(status in {401, 403, 405}, "Histórico de conflito aceitou alteração.")
    print("Supabase local: Auth, REST, RLS, versões e conflitos aprovados com duas contas fictícias.")


if __name__ == "__main__":
    main()
