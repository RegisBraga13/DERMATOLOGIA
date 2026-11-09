"""Registra hashes das notas após confirmação explícita de revisão médica."""

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

from dermatology_local_notes import VALIDATION_MANIFEST, local_notes_dir


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm-reviewed", action="store_true", required=True,
                        help="Confirma que o responsável revisou as notas desta pasta.")
    args = parser.parse_args()
    if not args.confirm_reviewed:
        parser.error("É necessária confirmação de revisão.")
    directory = local_notes_dir()
    notes = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
             for path in sorted(directory.glob("*.md")) if path.name != "Índice.md"}
    if not notes:
        parser.error("Nenhuma nota Markdown encontrada.")
    manifest = {
        "status": "clinician_attested",
        "validated_at": date.today().isoformat(),
        "attestation": "O usuário médico informou que revisou e atualizou as notas. Validação clínica não auditada pelo aplicativo.",
        "notes": notes,
    }
    VALIDATION_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Registradas {len(notes)} notas com hashes em {VALIDATION_MANIFEST.name}.")


if __name__ == "__main__":
    main()
