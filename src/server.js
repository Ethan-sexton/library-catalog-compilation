require('dotenv').config();

const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const EDITABLE = ['comments', 'date'];

// Paginated list, sort by (first_letter, first_word, PK)
app.get('/api/compiled', async (req, res) => {
  const page  = Math.max(parseInt(req.query.page)  || 0, 0);
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const offset = page * limit;
  const q = req.query.q ? req.query.q.trim() : '';
  try {
    let whereSQL = '';
    const params = [limit, offset];

    if(q) {
      whereSQL = `WHERE lower(canonical_name) >= lower('$a' || $3)`;
      params.push(q);
    }

    const rows = (await pool.query(
      `WITH paginated_parents AS (
         SELECT name_with_valid_delimiters, associated_record_identifier,
                first_word, first_letter, canonical_name, tag, comments, date
           FROM compiled_records
           ${whereSQL}
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
                    'author_name_match', a.author_name_match,
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
      params
    )).rows;

    let totalQuery = 'SELECT COUNT(*)::int AS c FROM compiled_records';
    let totalParams = [];
    if (q) {
      totalQuery += ` WHERE lower(canonical_name) >= lower('$a' || $1)`;
      totalParams.push(q);
    }
    const total = (await pool.query(totalQuery, totalParams)).rows[0].c;
    
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

// Update editable fields on one associated_compiled row
app.patch('/api/associated_compiled', async (req, res) => {
  const { pk, changes } = req.body || {};
  if (!pk || !changes) return res.status(400).json({ error: 'pk and changes required' });

  const EDITABLE_CHILD = ['comments', 'date'];
  
  const sets = [];
  const values = [];
  let i = 1;
  for (const field of EDITABLE_CHILD) {
    if (field in changes) {
      sets.push(`${field} = $${i++}`);
      let val = changes[field];
      if (field === 'percent_match' && val === '') val = null;
      if (field === 'date' && val === '') val = null;
      values.push(val);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no editable fields supplied' });
  values.push(pk); // pk is the UUID

  try {
    const { rowCount } = await pool.query(
      `UPDATE associated_compiled SET ${sets.join(', ')}
        WHERE id = $${i}`,
      values
    );
    if (!rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/new-entries', async (req, res) => {
  try {
    const rows = (await pool.query(
      `SELECT record_identifier, parent_record_name 
         FROM new_entries 
        ORDER BY record_identifier 
        LIMIT 10`
    )).rows;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/compiled/:pk', async (req, res) => {
  const pk = req.params.pk;
  try {
    const result = await pool.query(
      'DELETE FROM compiled_records WHERE name_with_valid_delimiters = $1',
      [pk]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/check', async (req, res) => {
  const { record_identifier } = req.body;
  if (!record_identifier) return res.status(400).json({ error: 'record_identifier required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check for exact match
    const match = await client.query(
      `SELECT 1 FROM compiled_records 
        WHERE name_with_valid_delimiters = (
          SELECT parent_record_name FROM new_entries WHERE record_identifier = $1
        ) LIMIT 1`,
      [record_identifier]
    );

    if (match.rowCount > 0) {
      // MATCH FOUND: Delete new_entry (cascade deletes associated_new_entry)
      await client.query('DELETE FROM new_entries WHERE record_identifier = $1', [record_identifier]);
      await client.query('COMMIT');
      return res.json({ status: 'matched_and_deleted' });
    }

    // NO MATCH FOUND: Convert new_entry to compiled_records
    // 1. Insert parent
    await client.query(
      `INSERT INTO compiled_records (
         name_with_valid_delimiters, associated_record_identifier, 
         canonical_name, tag, comments, date
       ) 
       SELECT parent_record_name, record_identifier, parent_record_name, tag, comments, date 
         FROM new_entries WHERE record_identifier = $1`,
      [record_identifier]
    );

    // 2. Insert children
    await client.query(
      `INSERT INTO associated_compiled (
         associated_record_id, percent_match, lcn, tag, author_name_match, comments, date
       )
       SELECT associated_new_entry, percent_match, lcn, tag, author_name, comments, date
         FROM associated_new_entry WHERE associated_new_entry = $1`,
      [record_identifier]
    );

    // 3. Delete the old new_entry
    await client.query('DELETE FROM new_entries WHERE record_identifier = $1', [record_identifier]);
    
    await client.query('COMMIT');
    res.json({ status: 'converted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

//Do conversions for all new entries. 
app.post('/api/check-all', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Fetch all pending entries
    const entries = (await client.query(
      'SELECT record_identifier, parent_record_name FROM new_entries'
    )).rows;
    
    let converted = 0;
    let deleted = 0;

    for (const entry of entries) {
      // Check for exact match
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

    await client.query('COMMIT');
    res.json({ status: 'success', converted, deleted });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});


// Stubs — fill in when the XML format and check logic are settled
app.post('/api/upload', (req, res) => res.status(501).json({ error: 'not implemented' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));