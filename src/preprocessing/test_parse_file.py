import json
import tempfile
import unittest
from pathlib import Path

from parse_file import parse_file


class ParseFileTests(unittest.TestCase):
    def test_serializes_csv_records_and_authority_matches(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "records.CSV"
            csv_path.write_text(
                'control-123,,,\n'
                '100 1,"$aAuthor Name",,,,\n'
                '98.5%,authority-456,100 1,"$aCandidate",,\n',
                encoding="utf-8",
            )

            result = parse_file(csv_path)

        self.assertEqual(len(result["compiled_records"]), 1)
        self.assertEqual(
            result["compiled_records"][0],
            {
                "reference": "control-123",
                "tag": "100 1",
                "canonical_field": "$aAuthor Name",
                "relevant_field": "$aAuthor Name",
                "date": "",
                "notes": None,
            },
        )
        self.assertEqual(result["authority_matches"][0]["reference"], "authority-456")
        self.assertEqual(result["authority_matches"][0]["associated_record_id"], "control-123")
        self.assertEqual(
            json.loads(json.dumps(result))["authority_matches"][0]["confidence"],
            98.5,
        )

    def test_parses_html_records(self):
        with tempfile.TemporaryDirectory() as directory:
            html_path = Path(directory) / "records.HTM"
            html_path.write_text(
                """
                <table>
                  <tr class="rec-label-row">
                    <td><span class="ctl_no">bib-123</span></td>
                  </tr>
                  <tr class="rec-compare-row">
                    <td>100 1</td><td>$aAuthor</td>
                  </tr>
                </table>
                """,
                encoding="utf-8",
            )

            result = parse_file(html_path)

        self.assertEqual(result["compiled_records"][0]["reference"], "bib-123")
        self.assertEqual(result["compiled_records"][0]["relevant_field"], "$aAuthor")
        self.assertEqual(result["authority_matches"], [])

    def test_rejects_unsupported_extensions(self):
        with tempfile.TemporaryDirectory() as directory:
            unsupported_path = Path(directory) / "records.xlsx"

            with self.assertRaisesRegex(ValueError, "Only .htm, .html, and .csv"):
                parse_file(unsupported_path)


if __name__ == "__main__":
    unittest.main()
