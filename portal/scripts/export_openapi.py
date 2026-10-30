"""Run from repository root: python -m portal.scripts.export_openapi [--check]."""

import argparse
import json
from pathlib import Path

from portal.backend.app import create_app
from portal.backend.config import PortalConfig


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    # Do not load local env or read live core settings into the checked-in schema.
    schema = json.dumps(create_app(PortalConfig()).openapi(), indent=2, sort_keys=True) + "\n"
    target = Path(__file__).resolve().parents[1] / "schema" / "openapi.json"
    if args.check:
        if not target.exists() or target.read_text() != schema:
            raise SystemExit("OpenAPI changed; regenerate the schema and frontend types.")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(schema)


if __name__ == "__main__":
    main()
