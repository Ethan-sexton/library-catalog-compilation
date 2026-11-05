import unittest

from classes.EntryParser import EntryParser


class EntryParserTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
