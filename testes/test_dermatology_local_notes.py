import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from dermatology_local_notes import retrieve_plan_notes


class LocalNoteRetrievalTests(unittest.TestCase):
    def test_only_numbered_saved_hypothesis_with_treatment_is_selected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "Tinea_Corporis.md").write_text("# Tinea corporis\n\n## Tratamento\nConduta de exemplo.", encoding="utf-8")
            (root / "Melanoma_Cutaneo.md").write_text("# Melanoma cutâneo\n\n## Tratamento\nConduta de exemplo.", encoding="utf-8")
            (root / "Psoriase.md").write_text("# Psoríase\n\n## Diagnóstico\nSem seção terapêutica.", encoding="utf-8")
            hd = "1. Tinea corporis\nApoio no material:\nMelanoma cutâneo\n2. Psoríase"
            with patch.dict(os.environ, {"DERMATOLOGY_NOTES_DIR": directory}):
                found = retrieve_plan_notes(hd)
            self.assertEqual([item["filename"] for item in found], ["Tinea_Corporis.md"])
            self.assertIn("## Tratamento", found[0]["text"])
            self.assertEqual(len(found[0]["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
