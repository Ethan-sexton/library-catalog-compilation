import csv
from classes import DataClasses as dc
import re

class CSVParser():
    def __init__(self):
        self.compilation = []
        self.matches = []
    
    def read_csv(self, path):
        ''' Creates an EntryParser object based on the provided path then calls the EntryParser's "parse_html" function.

        Parameters:
        html_path (path): The file path for the HTML file to be parsed

        Returns:
        compilation (list): List of CompiledRecord data classes representing all parent entries
        matches (list): List of AuthorityMatch data classes representing all of the parsed match entries.
        '''

        with open(path, "r", encoding="utf-8", newline="") as file:
            reader = csv.reader(file)
            current_reference = ""
            for row in reader:
                row_class = self.classify_row(row[0])

                if row_class == "authority_match":
                    new_auth = dc.AuthorityMatch(
                        float(row[0][:-1]),
                        str(row[1]),
                        str(row[2]),
                        self.clean_subfields(row[3]), #TODO only for comparison, should store irrelevant delimiters for storage
                        row[3],
                        self.find_notes(row)
                        #TODO track last_row for parent 
                    )
                    self.matches.append(new_auth)

                elif row_class == "compiled_record":
                    new_comp = dc.CompiledRecord(
                        current_reference,
                        str(row[0]),
                        row[1],
                        self.clean_subfields(row[1]),
                        row[6],
                        self.find_notes(row)
                    )
                    self.compilation.append(new_comp)

                else:
                    current_reference = row[0]

    @staticmethod
    def classify_row(heading):
        ''' Creates an EntryParser object based on the provided path then calls the EntryParser's "parse_html" function.

        Parameters:
        html_path (path): The file path for the HTML file to be parsed

        Returns:
        str: A string 
        '''
        #Determines the type of row based on the first cell
        if heading[-1] == '%':
            return "authority_match"
        elif re.search(r"^\d{3} \d{1,2}$", heading):
            return "compiled_record"
        else:
            return "reference"

    @staticmethod
    def clean_subfields(entry):
        ''' Searches the provided string for any subfields that can be removed from an entry's field
        Presently, we can ignore subfields "$e, $4, $6 and $8"

        Parameters:
        entry (str): The file path for the HTML file to be parsed

        Returns:
        str: The entry without the text in between relevant subfields. 

        '''
        return re.sub(r'\$(?:e|4|6|8)[^$]*', '', entry)

    @staticmethod
    def find_notes(rows):
        ''' Checks relevant columns in a provided row for any text.

        Parameters:
        rows (list): The rows to extract the possible notes from

        Returns:
        note (str): The text extracted from the proper column
        None: Returns none if no text is found
        '''

        note = rows[5] or rows[7]
        return note
        
    def get_compiled(self):
        return self.compilation

    def get_matches(self):
        return self.matches