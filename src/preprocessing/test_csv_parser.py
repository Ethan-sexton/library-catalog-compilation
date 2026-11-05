import tempfile
import unittest
from pathlib import Path

from classes.CSVParser import CSVParser


class CSVParserTests(unittest.TestCase):
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
