import unittest

from classes.EntryParser import EntryParser


class EntryParserTests(unittest.TestCase):
    def test_cleans_text_and_ignored_marc_subfields(self):
        self.assertEqual(EntryParser.clean_text("  Author\xa0   Name "), "Author Name")
        self.assertEqual(
            EntryParser.clean_marc("$aAuthor $eeditor $4aut $bTitle $6880-01"),
            "$aAuthor $bTitle",
        )

    def test_links_authority_matches_to_preceding_compiled_record(self):
        html = """
        <table>
          <tr class="rec-label-row">
            <td><span class="ctl_no">bib-123</span></td>
          </tr>
          <tr class="rec-compare-row">
            <td>100 1</td><td>$aAuthor</td>
          </tr>
          <tr>
            <td><span class="percent">98.5%</span></td>
            <td><span class="ctl_no">authority-456</span></td>
            <td>100 1</td><td>$aCandidate</td>
          </tr>
        </table>
        """

        compiled_records, authority_matches = EntryParser(html).parse_html()

        self.assertEqual(compiled_records[0].reference, "bib-123")
        self.assertEqual(authority_matches[0].associated_record_id, "bib-123")
        self.assertEqual(authority_matches[0].reference, "authority-456")

    def test_rejects_compiled_rows_without_a_preceding_control_number(self):
        html = '<table><tr class="rec-compare-row"><td>100 1</td><td>$aAuthor</td></tr></table>'

        with self.assertRaisesRegex(ValueError, "has no preceding reference"):
            EntryParser(html).parse_html()

    def test_rejects_record_labels_without_a_control_number(self):
        html = '<table><tr class="rec-label-row"><td>missing identifier</td></tr></table>'

        with self.assertRaisesRegex(ValueError, "has no control number"):
            EntryParser(html).parse_html()

    def test_rejects_invalid_explicit_confidence(self):
        html = """
        <table>
          <tr class="rec-label-row"><td><span class="ctl_no">bib-123</span></td></tr>
          <tr class="rec-compare-row"><td>100 1</td><td>$aAuthor</td></tr>
          <tr><td><span class="percent">invalid%</span></td>
              <td>authority-1</td><td>100 1</td><td>$aCandidate</td></tr>
        </table>
        """

        with self.assertRaisesRegex(ValueError, "Invalid confidence"):
            EntryParser(html).parse_html()

    def test_parse_is_repeatable_without_duplicating_results(self):
        html = """
        <table>
          <tr class="rec-label-row"><td><span class="ctl_no">bib-123</span></td></tr>
          <tr class="rec-compare-row"><td>100 1</td><td>$aAuthor</td></tr>
        </table>
        """
        parser = EntryParser(html)

        first_result = parser.parse_html()
        second_result = parser.parse_html()

        self.assertEqual(len(first_result[0]), 1)
        self.assertEqual(len(second_result[0]), 1)
        self.assertEqual(second_result[0][0].reference, "bib-123")


if __name__ == "__main__":
    unittest.main()
