import tempfile
import unittest
from pathlib import Path

from classes.CSVParser import CSVParser


class CSVParserTests(unittest.TestCase):
    def test_parses_records_matches_subfields_notes_and_dates(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "compiled.csv"
            csv_path.write_text(
                'control-123,,,,,,\n'
                '100 1,"$aAuthor Name.$eeditor",,,,,2026-03-04,record note\n'
                '98.5%,authority-456,100 1,"$aCandidate.$4aut",,match note\n',
                encoding="utf-8",
            )

            parser = CSVParser()
            parser.read_csv(csv_path)

        compiled = parser.get_compiled()[0]
        self.assertEqual(compiled.reference, "control-123")
        self.assertEqual(compiled.tag, "100 1")
        self.assertEqual(compiled.canonical_field, "$aAuthor Name.$eeditor")
        self.assertEqual(compiled.relevant_field, "$aAuthor Name.")
        self.assertEqual(compiled.date, "2026-03-04")
        self.assertEqual(compiled.notes, "record note")

        match = parser.get_matches()[0]
        self.assertEqual(match.confidence, 98.5)
        self.assertEqual(match.reference, "authority-456")
        self.assertEqual(match.associated_record_id, "control-123")
        self.assertEqual(match.canonical_field, "$aCandidate.$4aut")
        self.assertEqual(match.relevant_field, "$aCandidate.")
        self.assertEqual(match.notes, "match note")

    def test_skips_blank_rows_and_resets_results_between_reads(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "compiled.csv"
            csv_path.write_text(
                '\n,,\n100 1,"$aFirst",,\n',
                encoding="utf-8",
            )
            parser = CSVParser()
            parser.read_csv(csv_path)
            self.assertEqual(len(parser.get_compiled()), 1)

            csv_path.write_text('245 10,"$aSecond",,\n', encoding="utf-8")
            parser.read_csv(csv_path)

        self.assertEqual(len(parser.get_compiled()), 1)
        self.assertEqual(parser.get_compiled()[0].canonical_field, "$aSecond")
        self.assertEqual(parser.get_matches(), [])

    def test_rejects_malformed_authority_and_compiled_rows(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "compiled.csv"
            cases = [
                ('control-123\n98%,authority-1\n', "Authority row 2 has fewer than four columns"),
                ('100 1\n', "Compiled record row 1 has fewer than two columns"),
            ]
            for content, message in cases:
                with self.subTest(message=message):
                    csv_path.write_text(content, encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, message):
                        CSVParser().read_csv(csv_path)

    def test_parses_compiled_rows_without_control_numbers(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "compiled.csv"
            csv_path.write_text(
                '100 1,"$aAuthor Name.",,,,\n',
                encoding="utf-8",
            )

            parser = CSVParser()
            parser.read_csv(csv_path)

        self.assertEqual(len(parser.get_compiled()), 1)
        self.assertIsNone(parser.get_compiled()[0].reference)
        self.assertEqual(parser.get_compiled()[0].tag, "100 1")
        self.assertEqual(parser.get_compiled()[0].canonical_field, "$aAuthor Name.")

    def test_preserves_control_number_when_csv_has_parent_row(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "compiled.csv"
            csv_path.write_text(
                '1. 997150212602638,,,\n100 1,"$aAuthor Name.",,\n',
                encoding="utf-8",
            )

            parser = CSVParser()
            parser.read_csv(csv_path)

        self.assertEqual(
            parser.get_compiled()[0].reference,
            "1. 997150212602638",
        )


if __name__ == "__main__":
    unittest.main()
