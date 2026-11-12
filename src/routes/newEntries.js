const express = require('express');
const pool = require('../db');
const { runAuditedTransaction } = require('../services/auditService');

const router = express.Router();

router.get('/new-entries', async (_req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT record_identifier, parent_record_name
         FROM new_entries
        ORDER BY record_identifier
        LIMIT 10`
    )).rows;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/check', async (req, res) => {
  const { record_identifier: recordIdentifier } = req.body || {};
  if (!recordIdentifier) {
    return res.status(400).json({ error: 'record_identifier required' });
  }

  try {
    const status = await runAuditedTransaction(req.session.userId, async (client) => {
      const match = await client.query(
        `SELECT 1 FROM compiled_records
          WHERE name_with_valid_delimiters = (
            SELECT parent_record_name FROM new_entries WHERE record_identifier = $1
          ) LIMIT 1`,
        [recordIdentifier]
      );

      if (match.rowCount > 0) {
        await client.query(
          'DELETE FROM new_entries WHERE record_identifier = $1',
          [recordIdentifier]
        );
        return 'matched_and_deleted';
      }

      await client.query(
        `INSERT INTO compiled_records (
           name_with_valid_delimiters, associated_record_identifier,
           canonical_name, tag, comments, date
         )
         SELECT parent_record_name, record_identifier, parent_record_name, tag, comments, date
           FROM new_entries WHERE record_identifier = $1`,
        [recordIdentifier]
      );
      await client.query(
        `INSERT INTO associated_compiled (
           associated_record_id, percent_match, lcn, tag, author_name_match, comments, date
         )
         SELECT associated_new_entry, percent_match, lcn, tag, author_name, comments, date
           FROM associated_new_entry WHERE associated_new_entry = $1`,
        [recordIdentifier]
      );
      await client.query(
        'DELETE FROM new_entries WHERE record_identifier = $1',
        [recordIdentifier]
      );
      return 'converted';
    });
    res.json({ status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/check-all', async (req, res) => {
  try {
    const result = await runAuditedTransaction(req.session.userId, async (client) => {
      const entries = (await client.query(
        'SELECT record_identifier, parent_record_name FROM new_entries'
      )).rows;

      let converted = 0;
      let deleted = 0;
      for (const entry of entries) {
        const match = await client.query(
          'SELECT 1 FROM compiled_records WHERE name_with_valid_delimiters = $1 LIMIT 1',
          [entry.parent_record_name]
        );

        if (match.rowCount > 0) {
          await client.query(
            'DELETE FROM new_entries WHERE record_identifier = $1',
            [entry.record_identifier]
          );
          deleted++;
        } else {
          await client.query(
            `INSERT INTO compiled_records (
               name_with_valid_delimiters, associated_record_identifier,
               canonical_name, tag, comments, date
             )
             SELECT parent_record_name, record_identifier, parent_record_name, tag, comments, date
               FROM new_entries WHERE record_identifier = $1`,
            [entry.record_identifier]
          );
          await client.query(
            `INSERT INTO associated_compiled (
               associated_record_id, percent_match, lcn, tag, author_name_match, comments, date
             )
             SELECT associated_new_entry, percent_match, lcn, tag, author_name, comments, date
               FROM associated_new_entry WHERE associated_new_entry = $1`,
            [entry.record_identifier]
          );
          await client.query(
            'DELETE FROM new_entries WHERE record_identifier = $1',
            [entry.record_identifier]
          );
          converted++;
        }
      }

      return { status: 'success', converted, deleted };
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;