require('dotenv').config();

const express = require('express');
const path = require('path');
const pool = require('./db'); //DB File connects to database from env injection. 

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const EDITABLE = ['comments', 'date'];

/**
 * Returns paginated compiled records, with associated records as JSON array. 
 *  
 * If query is passed, it will return the next alphabetical record at or after the query, and will return the page that contains that record. 
 *  
 * 
 */
app.get('/api/compiled', async (req, res) => {
  let page  = Math.max(parseInt(req.query.page)  || 0, 0);
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  let offset = page * limit;
  let highlightPK = null;
  const q = req.query.q ? req.query.q.trim() : '';
  try {
    if(q) {
      const target = await pool.query(`SELECT first_letter, first_word, name_with_valid_delimiters FROM compiled_records
        WHERE lower(canonical_name) >= lower('$a' || $1)
        ORDER BY first_letter, first_word, name_with_valid_delimiters
        LIMIT 1`, [q]
      );
    

      if(target.rowCount > 0) {
        const t = target.rows[0];
        highlightPK = t.name_with_valid_delimiters

        const before = await pool.query(`SELECT COUNT(*):: int as c FROM compiled_records
          WHERE (first_letter, first_word, name_with_valid_delimiters) < ($1, $2, $3)`, 
          [t.first_letter, t.first_word, t.name_with_valid_delimiters]);
        const rank = before.rows[0].c;
        page = Math.floor(rank / limit);
        offset = page * limit;
        }
      }

    const rows = (await pool.query( //Using subquery to order children after parents. 
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
      [limit, offset]
    )).rows;

    const total = (await pool.query(
      'SELECT COUNT(*)::int AS c FROM compiled_records'
    )).rows[0].c;

    res.json({ rows, total, page, limit, highlightPK });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// Update editable fields, called in app.js event listener following blurs. 
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

//Deletes compiled record and its children by primary key. 
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

// Update editable fields on one. I think we no longer do this one. 
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
  values.push(pk); 

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

//Gets new entries for the new entry dropdown. We only display ten at a time, but the user can convert the whole table in batch. 
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


// Runs match logic on exactly one record. 
app.post('/api/check', async (req, res) => {
  const { record_identifier } = req.body;
  if (!record_identifier) return res.status(400).json({ error: 'record_identifier required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get the one new entry that we're going to check. 
    const match = await client.query(
      `SELECT 1 FROM compiled_records 
        WHERE name_with_valid_delimiters = (
          SELECT parent_record_name FROM new_entries WHERE record_identifier = $1
        ) LIMIT 1`,
      [record_identifier]
    );

    if (match.rowCount > 0) {
      // Exact match --> delete new entry. 
      await client.query('DELETE FROM new_entries WHERE record_identifier = $1', [record_identifier]);
      await client.query('COMMIT');
      return res.json({ status: 'matched_and_deleted' }); 
    }

    // Unreachable on match found vv. 
    // No match --> make new. 
    await client.query(
      `INSERT INTO compiled_records (
         name_with_valid_delimiters, associated_record_identifier, 
         canonical_name, tag, comments, date
       ) 
       SELECT parent_record_name, record_identifier, parent_record_name, tag, comments, date 
         FROM new_entries WHERE record_identifier = $1`,
      [record_identifier]
    );

    //include children in new record. 
    await client.query(
      `INSERT INTO associated_compiled (
         associated_record_id, percent_match, lcn, tag, author_name_match, comments, date
       )
       SELECT associated_new_entry, percent_match, lcn, tag, author_name, comments, date
         FROM associated_new_entry WHERE associated_new_entry = $1`,
      [record_identifier]
    );

    // Delete old entry.
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

//Runs match logic on everyone in new entries. 
app.post('/api/check-all', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Pending new entries. 
    const entries = (await client.query(
      'SELECT record_identifier, parent_record_name FROM new_entries'
    )).rows;
    
    let converted = 0;
    let deleted = 0;

    for (const entry of entries) {
      // Exact match --> delete new entry. 
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
      } else { //No exact match --> make-a-the-new-one. 
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


// Stubs -- fill in when Ethan's XML logic is done. 
app.post('/api/upload', (req, res) => res.status(501).json({ error: 'not implemented' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));