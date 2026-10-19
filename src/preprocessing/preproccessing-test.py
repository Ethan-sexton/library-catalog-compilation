import csv
from classes import DataClasses as dc
from datetime import date
from classes import EntryParser as ep
import re
#psycopg

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

def clean_subfields(entry):
    ''' Searches the provided string for any subfields that can be removed from an entry's field
    Presently, we can ignore subfields "$e, $4, $6 and $8"

    Parameters:
    entry (str): The file path for the HTML file to be parsed

    Returns:
    str: The entry without the text in between relevant subfields. 

    '''
    return re.sub(r'\$(?:e|4|6|8)[^$]*', '', entry)

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
    
def read_csv(path):
    ''' Creates an EntryParser object based on the provided path then calls the EntryParser's "parse_html" function.

    Parameters:
    html_path (path): The file path for the HTML file to be parsed

    Returns:
    compilation (list): List of CompiledRecord data classes representing all parent entries
    matches (list): List of AuthorityMatch data classes representing all of the parsed match entries.
    '''
    compilation = []
    matches = []

    with open(path, "r", encoding="utf-8", newline="") as file:
        reader = csv.reader(file)
        current_reference = ""
        for row in reader:
            row_class = classify_row(row[0])

            if row_class == "authority_match":
                new_auth = dc.AuthorityMatch(
                    float(row[0][:-1]),
                    str(row[1]),
                    str(row[2]),
                    clean_subfields(row[3]), #TODO only for comparison, should store irrelevant delimiters for storage
                    row[3],
                    find_notes(row)
                    #TODO track last_row for parent 
                )
                matches.append(new_auth)

            elif row_class == "compiled_record":
                new_comp = dc.CompiledRecord(
                    current_reference,
                    str(row[0]),
                    row[1],
                    clean_subfields(row[1]),
                    row[6],
                    find_notes(row)
                )
                compilation.append(new_comp)

            else:
                current_reference = row[0]

    return compilation, matches

def read_html(html_path):
    ''' Creates an EntryParser object based on the provided path then calls the EntryParser's "parse_html" function.

    Parameters:
    html_path (path): The file path for the HTML file to be parsed

    Returns:
    tuple(list(CompiledRecord), list(AuthorityRecord)): A tuple of the lists of parsed entries from the HTML file
    '''

    with open(html_path, 'r', encoding="utf-8") as html_file:
        data = html_file.read()

        p = ep.EntryParser(data)
        c, a = p.parse_html()

    return c, a 

if __name__ == "__main__":
    print("From CSV File:")
    compiled, match = read_csv("resources\\sheets\\compiled list small set.csv")
    print(f"Authority Matches:\n{match}")
    input()
    print(f"Compiled List:\n{compiled}")
    input()

    # print("From HTML File:")
    c, a = read_html(r"resources\html\Simple Near Match Example.htm")
    # c, a = read_html(r"resources\html\R00_Near_Match.001.htm")
    
    print(f"Compiled List:\n{c}")
    input()
    print(f"Authority Matches:\n{a}")
    input()