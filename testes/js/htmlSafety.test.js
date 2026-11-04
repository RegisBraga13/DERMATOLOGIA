import assert from "node:assert/strict";
import { it } from "node:test";
import { safeExternalUrl } from "../../src/ui/html.js";
import { ragSourcesView } from "../../src/views/decisions.js";
import { consultationAccessPanel } from "../../src/views/exams.js";

it("fontes externas não transformam um link em execução de script", () => {
  for (const input of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>",
    "java\nscript:alert(1)", "https://usuario:senha@exemplo.org/"]) {
    assert.equal(safeExternalUrl(input), "");
    const markup = ragSourcesView([{ url: input, title: "Fonte recebida" }]);
    assert.doesNotMatch(markup, /<a\s/i);
  }
  assert.match(ragSourcesView([{ url: "https://exemplo.org/diretriz", title: "Diretriz" }]),
    /<a href="https:\/\/exemplo\.org\/diretriz"/);
});

it("ID legado não cria atributos HTML na lista de consultas", () => {
  const id = 'consulta" onmouseover="alert(1)';
  const markup = consultationAccessPanel([{ id, label: "Consulta" }], {});
  assert.match(markup, /data-id="consulta&quot; onmouseover=&quot;alert\(1\)"/);
  assert.doesNotMatch(markup, /data-id="consulta" onmouseover=/);
});
