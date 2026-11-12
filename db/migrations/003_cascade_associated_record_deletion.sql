BEGIN;

ALTER TABLE associated_compiled
  DROP CONSTRAINT IF EXISTS associated_compiled_associated_record_id_fkey;

ALTER TABLE associated_compiled
  ADD CONSTRAINT associated_compiled_associated_record_id_fkey
  FOREIGN KEY (associated_record_id)
  REFERENCES compiled_records(associated_record_identifier)
  ON DELETE CASCADE;

COMMIT;
