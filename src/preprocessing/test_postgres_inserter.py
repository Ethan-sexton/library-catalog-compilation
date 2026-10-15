import unittest
from unittest.mock import Mock

from classes.DataClasses import AuthorityMatch, CompiledRecord
from classes.PostgresInserter import PostgresInserter


class PostgresInserterTests(unittest.TestCase):
    def setUp(self):
        self.connection = Mock()
        self.cursor = self.connection.cursor.return_value
        self.inserter = PostgresInserter(self.connection)

    def test_inserts_compiled_record_and_omits_empty_date(self):
        record = CompiledRecord(
            reference="control-123",
            tag="245 10",
            canonical_field="$aA title",
            relevant_field="$aA title",
            date="",
            notes=None,
        )

        self.inserter.insert(record)

        query, params = self.cursor.execute.call_args.args
        self.assertIn("INSERT INTO compiled_records", query)
        self.assertEqual(
            params,
            ("$aA title", "control-123", "$aA title", 245, 10, None),
        )
        self.cursor.close.assert_called_once_with()

    def test_inserts_authority_match(self):
        match = AuthorityMatch(
            confidence=98.5,
            reference="control-123",
            tag="100 1",
            canonical_field="$aAuthor",
            relevant_field="$aAuthor",
            notes="",
        )

        self.inserter.insert(match)

        query, params = self.cursor.execute.call_args.args
        self.assertIn("INSERT INTO associated_compiled", query)
        self.assertEqual(
            params,
            ("control-123", 98.5, "$aAuthor", 100, 1, "$aAuthor"),
        )
        self.cursor.close.assert_called_once_with()

    def test_rejects_malformed_tag_before_opening_cursor(self):
        record = CompiledRecord(
            reference="control-123",
            tag="245",
            canonical_field="$aA title",
            relevant_field="$aA title",
            date="",
            notes=None,
        )

        with self.assertRaisesRegex(ValueError, "Invalid MARC tag"):
            self.inserter.insert(record)

        self.connection.cursor.assert_not_called()

    def test_rejects_unsupported_data_class(self):
        with self.assertRaisesRegex(TypeError, "Unsupported record type"):
            self.inserter.insert(object())

        self.connection.cursor.assert_not_called()


if __name__ == "__main__":
    unittest.main()
