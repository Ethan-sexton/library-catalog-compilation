from dataclasses import dataclass

@dataclass
class CompiledRecord:
    # Any line in the compiled lists csv that starts with two integers (the tag)
    reference : str
    tag : str
    canonical_field: str
    relevant_field : str
    date : str # TODO Change to date data type
    notes : str | None
    
@dataclass
class AuthorityMatch:
    # Any line in the csv that starts with a percentage (the confidence)
    confidence : float
    reference : str
    tag : str
    canonical_field : str #right now this is the entire MARC blob before having certain subfields removed
    relevant_field : str # after subfields being removed
    notes : str
    #parent : CompiledRecord

    
