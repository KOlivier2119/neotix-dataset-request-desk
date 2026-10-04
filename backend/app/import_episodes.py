"""CLI for importing episodes from a CSV export.

Usage: python -m app.import_episodes <file>
Prints the import report as JSON.
"""
import argparse
import json
import sys

from app.database import SessionLocal
from app.services.importer import import_csv


def main() -> int:
    parser = argparse.ArgumentParser(description="Import episodes from a CSV file.")
    parser.add_argument("file", help="Path to the episodes CSV export")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        with open(args.file, newline="", encoding="utf-8-sig", errors="replace") as f:
            report = import_csv(db, f)
    finally:
        db.close()

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
