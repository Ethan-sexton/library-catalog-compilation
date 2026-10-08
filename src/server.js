require('dotenv').config();

const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const EDITABLE = ['canonical_name', 'tag', 'comments'];

// Paginated list, sorted by (first_letter, first_word, PK)
app.get('/api/compiled', async (req, res) => {
  const page  = Math.max(parseInt(req.query.page)  || 0, 0);
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const offset = page * limit;
  try {
    const rows = (await pool.query(
      `SELECT name_with_valid_delimiters, associated_record_identifier,
              first_word, first_letter, canonical_name, tag, comments, date
         FROM compiled_records
        ORDER BY first_letter, first_word, name_with_valid_delimiters
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    )).rows;
    const total = (await pool.query(
      'SELECT COUNT(*)::int AS c FROM compiled_records'
    )).rows[0].c;
    res.json({ rows, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update editable fields on one row
app.patch('/api/compiled', async (req, res) => {
  const { pk, changes } = req.body || {};
  if (!pk || !changes) return res.status(400).json({ error: 'pk and changes required' });

  const sets = [];
  const values = [];
  let i = 1;
  for (const field of EDITABLE) {
    if (field in changes) {
      sets.push(`${field} = $${i++}`);
      values.push(changes[field]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no editable fields supplied' });
  values.push(pk);

  try {
    const { rowCount } = await pool.query(
      `UPDATE compiled_records SET ${sets.join(', ')}
        WHERE name_with_valid_delimiters = $${i}`,
      values
    );
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Stubs — fill in when the XML format and check logic are settled
app.post('/api/upload', (req, res) => res.status(501).json({ error: 'not implemented' }));
app.post('/api/check',  (req, res) => res.status(501).json({ error: 'not implemented' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));