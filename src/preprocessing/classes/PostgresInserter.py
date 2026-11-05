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
            tag,
            comments,
            date
        ) VALUES (%s, %s, %s, %s, %s, %s)
    """
    _AUTHORITY_MATCH_INSERT = """
        INSERT INTO associated_compiled (
            associated_record_id,
            percent_match,
            lcn,
            tag,
            author_name_match
        ) VALUES (%s, %s, %s, %s, %s)
    """

    def __init__(self, connection: _Connection):
        self.connection = connection

    def insert(self, record: CompiledRecord | AuthorityMatch) -> None:
        """Insert one supported data class; database errors propagate."""
        if isinstance(record, CompiledRecord):
            params = (
                record.canonical_field,
                record.reference,
                record.relevant_field,
                record.tag,
                record.notes or None,
                record.date or None,
            )
            query = self._COMPILED_RECORD_INSERT
            
        elif isinstance(record, AuthorityMatch):
            params = (
                record.associated_record_id,
                record.confidence,
                record.reference,
                record.tag,
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
