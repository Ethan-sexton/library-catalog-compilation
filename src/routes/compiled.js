const express = require('express');
const pool = require('../db');
const { runAuditedTransaction } = require('../services/auditService');

const router = express.Router();
const EDITABLE = ['comments', 'date'];

// Paginated list, sorted by (first_letter, first_word, PK).
router.get('/compiled', async (req, res) => {
  let page = Math.max(parseInt(req.query.page) || 0, 0);
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  let offset = page * limit;
  let highlightPK = null;
  const q = req.query.q ? req.query.q.trim() : '';

  try {
    if (q) {
      const target = await pool.query(
        `SELECT first_letter, first_word, name_with_valid_delimiters FROM compiled_records
          WHERE lower(canonical_name) >= lower('$a' || $1)
          ORDER BY first_letter, first_word, name_with_valid_delimiters
          LIMIT 1`,
        [q]
      );

      if (target.rowCount > 0) {
        const record = target.rows[0];
        highlightPK = record.name_with_valid_delimiters;
        const before = await pool.query(
          `SELECT COUNT(*)::int AS c FROM compiled_records
            WHERE (first_letter, first_word, name_with_valid_delimiters) < ($1, $2, $3)`,
          [record.first_letter, record.first_word, record.name_with_valid_delimiters]
        );
        page = Math.floor(before.rows[0].c / limit);
        offset = page * limit;
      }
    }

    const rows = (await pool.query(
      `WITH paginated_parents AS (
         SELECT name_with_valid_delimiters, associated_record_identifier,
                first_word, first_letter, canonical_name, tag, comments, date
           FROM compiled_records
          ORDER BY first_letter, first_word, name_with_valid_delimiters
          LIMIT $1 OFFSET $2
       )
       SELECT p.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', a.id,
                    'associated_number', a.associated_number,
                    'percent_match', a.percent_match,
                    'lcn', a.lcn,
                    'tag', a.tag,
                    'comments', a.comments,
                    'date', a.date,
                    'author_name_match', a.author_name_match
                  ) ORDER BY a.associated_number
                ) FILTER (WHERE a.id IS NOT NULL),
                '[]'::json
              ) AS associated_records
         FROM paginated_parents p
         LEFT JOIN associated_compiled a
           ON a.associated_record_id = p.associated_record_identifier
        GROUP BY p.name_with_valid_delimiters, p.associated_record_identifier,
                 p.first_word, p.first_letter, p.canonical_name, p.tag, p.comments, p.date
        ORDER BY p.first_letter, p.first_word, p.name_with_valid_delimiters`,
      [limit, offset]
    )).rows;

    const total = (await pool.query(
      'SELECT COUNT(*)::int AS c FROM compiled_records'
    )).rows[0].c;

    res.json({ rows, total, page, limit, highlightPK });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/compiled', async (req, res) => {
  const { pk, changes } = req.body || {};
  if (!pk || !changes) return res.status(400).json({ error: 'pk and changes required' });

  const sets = [];
  const values = [];
  let index = 1;
  for (const field of EDITABLE) {
    if (field in changes) {
      sets.push(`${field} = $${index++}`);
      values.push(changes[field]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no editable fields supplied' });
  values.push(pk);

  try {
    const rowCount = await runAuditedTransaction(req.session.userId, (client) => (
      client.query(
        `UPDATE compiled_records SET ${sets.join(', ')}
          WHERE name_with_valid_delimiters = $${index}`,
        values
      ).then((result) => result.rowCount)
    ));
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/compiled/:pk', async (req, res) => {
  try {
    const rowCount = await runAuditedTransaction(req.session.userId, async (client) => {
      const result = await client.query(
        'DELETE FROM compiled_records WHERE name_with_valid_delimiters = $1',
        [req.params.pk]
      );
      return result.rowCount;
    });

    if (rowCount === 0) return res.status(404).json({ error: 'Record not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/associated_compiled', async (req, res) => {
  const { pk, changes } = req.body || {};
  if (!pk || !changes) return res.status(400).json({ error: 'pk and changes required' });

  const editableChildFields = ['comments', 'date'];
  const sets = [];
  const values = [];
  let index = 1;
  for (const field of editableChildFields) {
    if (field in changes) {
      sets.push(`${field} = $${index++}`);
      let value = changes[field];
      if (field === 'date' && value === '') value = null;
      values.push(value);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no editable fields supplied' });
  values.push(pk);

  try {
    const rowCount = await runAuditedTransaction(req.session.userId, (client) => (
      client.query(
        `UPDATE associated_compiled SET ${sets.join(', ')} WHERE id = $${index}`,
        values
      ).then((result) => result.rowCount)
    ));
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;