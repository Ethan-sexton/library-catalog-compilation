from classes import CSVParser as csv
from classes import EntryParser as ep
import re
#psycopg

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

def test(ver):
    print(f"Reading {ver} CSV file")
    csv_parser = csv.CSVParser()
    if ver == "small":
        csv_parser.read_csv(r"resources\sheets\compiled list small set.csv")
    elif ver == "full":
        csv_parser.read_csv(r"resources\sheets\Compiled Lists N-S - O_.csv")
    print(csv_parser.get_compiled())
    print(csv_parser.get_matches())
    
    print(f"\n\nReading {ver} HTML File")
    if ver == "small":
        c,a = read_html(r"resources\html\Simple Near Match Example.htm")
    elif ver == "full":
        c,a = read_html(r"resources\html\R00_Near_Match.001.htm")
    else:
        c = []
        a = []
    print(c)
    print(a)

if __name__ == "__main__":
    test("small")
    test("full")
