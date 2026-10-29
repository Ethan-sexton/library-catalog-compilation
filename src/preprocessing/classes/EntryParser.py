import re
from bs4 import BeautifulSoup, Tag
from .DataClasses import AuthorityMatch, CompiledRecord


class EntryParser:
    '''Parse compiled records and authority matches from the authority HTML.
    
    Attributes:
    soup (BeautifulSoup): The HTML parser that this class is wrapping   
    compiled_records (list[CompiledRecord]): A list of the parsed HTML elements corresponding to the CompiledRecord DataClass
    authority_matches (list[AuthorityMatch]): A list of the parsed HTML elements corresponding to the AuthorityMatch DataClass
    '''

    def __init__(self, data: str):
        self.soup = BeautifulSoup(data, "html5lib")
        self.compiled_records: list[CompiledRecord] = []
        self.authority_matches: list[AuthorityMatch] = []

    def parse_html(self) -> tuple[list[CompiledRecord], list[AuthorityMatch]]:
        self.compiled_records = []
        self.authority_matches = []
        current_reference = ""

        for row_number, row in enumerate(self.soup.find_all("tr"), start=1):
            cells = row.find_all("td", recursive=False)
            row_classes = row.get_attribute_list("class")

            if "rec-label-row" in row_classes:
                control_number = row.select_one(".ctl_no")
                if control_number is None:
                    raise ValueError(
                        f"Record label row {row_number} has no control number"
                    )
                current_reference = self.clean_text(self._text(control_number))

            elif "rec-compare-row" in row_classes:
                if len(cells) < 2:
                    raise ValueError(
                        f"Compiled record row {row_number} has fewer than two cells"
                    )
                if not current_reference:
                    raise ValueError(
                        f"Compiled record row {row_number} has no preceding reference"
                    )

                tag = self.clean_text(self._text(cells[0]))
                canonical_field = self.clean_text(self._text(cells[1]))
                self.compiled_records.append(
                    CompiledRecord(
                        reference=current_reference,
                        tag=tag,
                        canonical_field=canonical_field,
                        relevant_field=self.clean_marc(canonical_field),
                        date="",
                        notes="",
                    )
                )
                current_reference = ""

            elif len(cells) == 4:
                percent = row.select_one(".percent")
                confidence_text = self.clean_text(
                    self._text(percent)
                    if percent is not None
                    else self._text(cells[0])
                )
                if not confidence_text:
                    continue
                if not confidence_text.endswith("%"):
                    if percent is not None:
                        raise ValueError(
                            f"Invalid confidence in authority row {row_number}: "
                            f"{confidence_text!r}"
                        )
                    continue

                try:
                    confidence = float(confidence_text[:-1].strip())
                except ValueError as error:
                    raise ValueError(
                        f"Invalid confidence in authority row {row_number}: "
                        f"{confidence_text!r}"
                    ) from error

                reference = self.clean_text(self._text(cells[1]))
                tag = self.clean_text(self._text(cells[2]))
                canonical_field = self.clean_text(self._text(cells[3]))
                self.authority_matches.append(
                    AuthorityMatch(
                        confidence=confidence,
                        reference=reference,
                        tag=tag,
                        canonical_field=canonical_field,
                        relevant_field=self.clean_marc(canonical_field),
                        notes="",
                    )
                )

        return self.compiled_records, self.authority_matches

    @staticmethod
    def _text(element: Tag) -> str:
        ''' 
        Parameters: 
        element (Tag): The relevant HTML tag

        Returns: 
        str: The text in the body of the HTML field
        '''
        return element.get_text("", strip=False)

    @staticmethod
    def clean_text(text: str) -> str:
        """Normalize whitespace in text extracted from an HTML element."""
        text = text.replace("\xa0", " ")
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def clean_marc(text: str) -> str:
        ''' Removes unneeded MARC fields from the given string
            Ignores $e, $4, $6, and $8
            Use the text without the irrelevant MARC fields for comparison, but store/sort the entry based on all of the MARC fields

            Parameters:
            text (str): The current entry's MARC blob

            Returns:
            str: Input string without the listed subfields
        
        '''
        text = re.sub(r"\$(?:e|4|6|8)[^$]*", "", text)
        return EntryParser.clean_text(text)