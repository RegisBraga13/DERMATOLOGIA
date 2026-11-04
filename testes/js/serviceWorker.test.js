import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { it } from "node:test";

const source = readFileSync(new URL("../../sw.js", import.meta.url), "utf8");

function worker(fetch, cache) {
  const listeners = new Map();
  runInNewContext(source, {
    self: { location: { origin: "https://app.example" }, addEventListener: (type, fn) => listeners.set(type, fn) },
    fetch, caches: { open: async () => cache }, URL, Response
  });
  return listeners.get("fetch");
}

it("entrega código novo mesmo quando o cache está cheio", async () => {
  const current = { ok: true, clone() { return this; }, version: "atual" };
  const stale = { version: "antiga" };
  const listener = worker(async () => current, {
    put: async () => { throw new Error("quota"); }, match: async () => stale
  });
  let result;
  listener({ request: { method: "GET", url: "https://app.example/src/App.js" },
    respondWith: value => { result = value; } });
  assert.equal(await result, current);
});

it("nunca intercepta respostas de API clínica", () => {
  const listener = worker(async () => { throw new Error("não deve buscar"); }, {});
  let intercepted = false;
  listener({ request: { method: "GET", url: "https://app.example/api/clinical-ai" },
    respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});
