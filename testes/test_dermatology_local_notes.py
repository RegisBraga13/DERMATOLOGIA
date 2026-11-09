import os
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from dermatology_local_notes import retrieve_plan_notes, saved_hypothesis_names


class LocalNoteRetrievalTests(unittest.TestCase):
    def test_only_numbered_saved_hypothesis_with_treatment_is_selected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "Tinea_Corporis.md").write_text("# Tinea corporis\n\n## Tratamento\nConduta de exemplo.", encoding="utf-8")
            (root / "Melanoma_Cutaneo.md").write_text("# Melanoma cutâneo\n\n## Tratamento\nConduta de exemplo.", encoding="utf-8")
            (root / "Psoriase.md").write_text("# Psoríase\n\n## Abordagem terapêutica\nConduta de exemplo.", encoding="utf-8")
            manifest = root / "validation.json"
            manifest.write_text(json.dumps({"status": "clinician_attested", "validated_at": "2026-11-09", "notes": {
                path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in root.glob("*.md")
            }}), encoding="utf-8")
            hd = "1. Tinea corporis\nApoio no material:\nMelanoma cutâneo\n2. Psoríase"
            with patch.dict(os.environ, {"DERMATOLOGY_NOTES_DIR": directory}), patch(
                "dermatology_local_notes.VALIDATION_MANIFEST", manifest
            ):
                found = retrieve_plan_notes(hd)
                (root / "Tinea_Corporis.md").write_text("# Alterado\n\n## Tratamento\nNovo texto.", encoding="utf-8")
                changed = retrieve_plan_notes(hd)
            self.assertEqual([item["filename"] for item in found], ["Tinea_Corporis.md", "Psoriase.md"])
            self.assertIn("## Tratamento", found[0]["text"])
            self.assertIn("## Abordagem terapêutica", found[1]["text"])
            self.assertEqual(len(found[0]["sha256"]), 64)
            self.assertEqual([item["filename"] for item in changed], ["Psoriase.md"])
            self.assertEqual(saved_hypothesis_names(hd), ["Tinea corporis", "Psoríase"])


if __name__ == "__main__":
    unittest.main()
