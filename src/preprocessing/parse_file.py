import json
import sys
from dataclasses import asdict
from pathlib import Path

from classes.CSVParser import CSVParser
from classes.EntryParser import EntryParser


def parse_file(file_path: Path) -> dict[str, list[dict[str, object]]]:
    extension = file_path.suffix.lower()
    if extension == ".csv":
        parser = CSVParser()
        parser.read_csv(file_path)
        compiled_records = parser.get_compiled()
        authority_matches = parser.get_matches()
    elif extension in {".htm", ".html"}:
        data = file_path.read_text(encoding="utf-8-sig")
        compiled_records, authority_matches = EntryParser(data).parse_html()
    else:
        raise ValueError("Only .htm, .html, and .csv files are supported")

    return {
        "compiled_records": [asdict(record) for record in compiled_records],
        "authority_matches": [asdict(match) for match in authority_matches],
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        print("Usage: parse_file.py <file>", file=sys.stderr)
        return 2

    try:
        result = parse_file(Path(sys.argv[1]))
    except (OSError, UnicodeError, ValueError) as error:
        print(f"Preprocessing failed: {error}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
