import re
from typing import Protocol

from .DataClasses import AuthorityMatch, CompiledRecord

class _Cursor(Protocol):
    def execute(self, query: str, params: tuple[object, ...]) -> object: ...

    def close(self) -> None: ...

class _Connection(Protocol):
    def cursor(self) -> _Cursor: ...

class PostgresInserter:
    """Insert parsed records using the tables and columns in db/schema.sql.

    The connection is supplied by the caller, which also owns transaction
    management and should commit or roll back as appropriate.
    """

    _COMPILED_RECORD_INSERT = """
        INSERT INTO compiled_records (
            name_with_valid_delimiters,
            associated_record_identifier,
            canonical_name,
            id_a,
            id_b,
            date
        ) VALUES (%s, %s, %s, %s, %s, %s)
    """
    _AUTHORITY_MATCH_INSERT = """
        INSERT INTO associated_compiled (
            associated_record_id,
            percent_match,
            value,
            id_a,
            id_b,
            author_name_match
        ) VALUES (%s, %s, %s, %s, %s, %s)
    """

    def __init__(self, connection: _Connection):
        self.connection = connection

    def insert(self, record: CompiledRecord | AuthorityMatch) -> None:
        """Insert one supported data class; database errors propagate."""
        if isinstance(record, CompiledRecord):
            id_a, id_b = self._parse_tag(record.tag)
            params = (
                record.canonical_field,
                record.reference,
                record.relevant_field,
                id_a,
                id_b,
                record.date or None,
            )
            query = self._COMPILED_RECORD_INSERT
            
        elif isinstance(record, AuthorityMatch):
            id_a, id_b = self._parse_tag(record.tag)
            params = (
                record.reference,
                record.confidence,
                record.canonical_field,
                id_a,
                id_b,
                record.relevant_field,
            )
            query = self._AUTHORITY_MATCH_INSERT
        else:
            raise TypeError(
                f"Unsupported record type: {type(record).__name__}"
            )

        cursor = self.connection.cursor()
        try:
            cursor.execute(query, params)
        finally:
            cursor.close()

    @staticmethod
    def _parse_tag(tag: str) -> tuple[int, int]:
        match = re.fullmatch(r"(\d{3})\s+(\d{1,2})", tag)
        if match is None:
            raise ValueError(f"Invalid MARC tag: {tag!r}")
        return int(match.group(1)), int(match.group(2))
