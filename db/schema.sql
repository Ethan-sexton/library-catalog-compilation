--   psql "$DATABASE_URL" -f db/schema.sql   to run this file. 

BEGIN;

CREATE TABLE compiled_records (
  name_with_valid_delimiters   TEXT        PRIMARY KEY,

  associated_record_identifier TEXT        UNIQUE,

  first_word                   TEXT        NOT NULL
                                 GENERATED ALWAYS AS (
                                   split_part(
                                     trim(regexp_replace(
                                       regexp_replace(lower(
                                         substring(name_with_valid_delimiters
                                                   from '\$a([^$]*)')
                                       ),
                                       '([a-z])\.', '\1', 'g'),
                                       '[^a-z0-9]+', ' ', 'g'
                                     )),
                                     ' ', 1
                                   )
                                 ) STORED,

  canonical_name               TEXT        NOT NULL,

  id_a                         SMALLINT    NOT NULL CHECK (id_a BETWEEN 0 AND 999),
  id_b                         SMALLINT    NOT NULL CHECK (id_b BETWEEN 0 AND 999),

  date                         DATE        
);

CREATE INDEX compiled_records_first_word_idx
  ON compiled_records (first_word);


CREATE TABLE associated_compiled (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  associated_record_id TEXT        REFERENCES compiled_records(associated_record_identifier),

  associated_number    INT         NOT NULL CHECK (associated_number BETWEEN 1 AND 4),

  percent_match        NUMERIC(5,2),

  value                TEXT,

  id_a                 SMALLINT    NOT NULL CHECK (id_a BETWEEN 0 AND 999),
  id_b                 SMALLINT    NOT NULL CHECK (id_b BETWEEN 0 AND 999),

  author_name_match    TEXT,

  CONSTRAINT associated_compiled_parent_number_uniq
    UNIQUE (associated_record_id, associated_number)
);


CREATE TABLE new_entries (
  record_identifier  TEXT        PRIMARY KEY,

  id_a               SMALLINT    NOT NULL CHECK (id_a BETWEEN 0 AND 999),
  id_b               SMALLINT    NOT NULL CHECK (id_b BETWEEN 0 AND 999),

  parent_record_name TEXT
);


CREATE TABLE associated_new_entry (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  associated_new_entry TEXT       REFERENCES new_entries(record_identifier)
                                    ON DELETE CASCADE,

  associated_number   INT         NOT NULL CHECK (associated_number BETWEEN 1 AND 4),

  percent_match       NUMERIC(5,2),

  value               TEXT,

  id_a                SMALLINT    NOT NULL CHECK (id_a BETWEEN 0 AND 999),
  id_b                SMALLINT    NOT NULL CHECK (id_b BETWEEN 0 AND 999),

  author_name         TEXT,

  CONSTRAINT associated_new_entry_parent_number_uniq
    UNIQUE (associated_new_entry, associated_number)
);
CREATE OR REPLACE FUNCTION set_associated_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num INT;
BEGIN
  IF TG_TABLE_NAME = 'associated_compiled' THEN
    SELECT coalesce(max(associated_number), 0) + 1
      INTO next_num
      FROM associated_compiled
     WHERE associated_record_id = NEW.associated_record_id;
  ELSE
    SELECT coalesce(max(associated_number), 0) + 1
      INTO next_num
      FROM associated_new_entry
     WHERE associated_new_entry = NEW.associated_new_entry;
  END IF;

  IF next_num > 4 THEN
    RAISE EXCEPTION 'at most 4 associated records allowed per parent (table %)', TG_TABLE_NAME;
  END IF;

  NEW.associated_number := next_num;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER associated_compiled_set_number
  BEFORE INSERT ON associated_compiled
  FOR EACH ROW EXECUTE FUNCTION set_associated_number();

CREATE TRIGGER associated_new_entry_set_number
  BEFORE INSERT ON associated_new_entry
  FOR EACH ROW EXECUTE FUNCTION set_associated_number();

  COMMIT;