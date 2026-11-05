require('dotenv').config();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const os = require('os');
const { existsSync } = require('fs');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const multer = require('multer');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const { selectAuthorityMatches } = require('./importHelpers');

const execFileAsync = promisify(execFile);
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const UPLOAD_EXTENSIONS = new Set(['.htm', '.html', '.csv']);
const projectPython = path.join(
  __dirname,
  '..',
  '.venv',
  ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'])
);
const pythonExecutable = process.env.PYTHON
  || (existsSync(projectPython) ? projectPython : (process.platform === 'win32' ? 'py' : 'python3'));
const pythonArgs = pythonExecutable === 'py' ? ['-3'] : [];
const parserScript = path.join(__dirname, 'preprocessing', 'parse_file.py');
const MARC_TAG_PATTERN = /^\d{3}(?:\s+\d{1,2})?$/;
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(extension)) {
      const error = new Error('Only .htm, .html, and .csv files are supported');
      error.statusCode = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET must be set before starting the server');
}

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 60 * 1000,
  },
}));

const EDITABLE = ['comments', 'date'];

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    if (req.originalUrl.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login.html');
  }
  next();
}

app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);

app.get('/', (req, res) => {
  res.redirect(req.session.userId ? '/index.html' : '/login.html');
});
app.get('/index.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Paginated list, sorted by (first_letter, first_word, PK)
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

function receiveUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : (error.statusCode || 400);
    res.status(statusCode).json({ error: error.message });
  });
}

async function preprocessFile(filePath) {
  let result;
  try {
    ({ stdout: result } = await execFileAsync(
      pythonExecutable,
      [...pythonArgs, parserScript, filePath],
      { cwd: path.join(__dirname, 'preprocessing'), windowsHide: true, maxBuffer: 128 * 1024 * 1024 }
    ));
  } catch (error) {
    if (error.code === 'ENOENT') {
      const pythonError = new Error(
        'Python was not found. Install Python and the packages in requirements.txt, or set PYTHON in .env to the Python executable.'
      );
      pythonError.statusCode = 500;
      throw pythonError;
    }
    const details = error.stderr && error.stderr.trim();
    if (details && /Microsoft Store|was not found; run without arguments/i.test(details)) {
      const pythonError = new Error(
        `Windows redirected Python to the Microsoft Store. Install the project environment with "python -m venv .venv", activate it, install requirements.txt, then restart the server. Alternatively set PYTHON in .env to the full path of a working Python executable.`
      );
      pythonError.statusCode = 500;
      throw pythonError;
    }
    const parseError = new Error(details || 'Python preprocessing failed');
    parseError.statusCode = 422;
    throw parseError;
  }

  try {
    return JSON.parse(result);
  } catch (error) {
    throw new Error('Python preprocessing returned invalid JSON');
  }
}

function normalizeDate(value) {
  if (value == null || value === '') return null;
  const date = String(value).trim();
  let year;
  let month;
  let day;
  let match = date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    [, year, month, day] = match;
  } else {
    match = date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
      const error = new Error(`Invalid date value: ${date}`);
      error.statusCode = 422;
      throw error;
    }
    [, month, day, year] = match;
  }

  const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsedDate.getUTCFullYear() !== Number(year)
    || parsedDate.getUTCMonth() !== Number(month) - 1
    || parsedDate.getUTCDate() !== Number(day)
  ) {
    const error = new Error(`Invalid date value: ${date}`);
    error.statusCode = 422;
    throw error;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function validateParsedRecords(data) {
  if (
    !data
    || !Array.isArray(data.compiled_records)
    || !Array.isArray(data.authority_matches)
  ) {
    const error = new Error('Python preprocessing returned an invalid record set');
    error.statusCode = 422;
    throw error;
  }
  if (!data.compiled_records.length && !data.authority_matches.length) {
    const error = new Error('No catalog records were found in the uploaded file');
    error.statusCode = 422;
    throw error;
  }

  const compiledRecords = data.compiled_records.map((record) => {
    if (!record || typeof record !== 'object') {
      const error = new Error('Python preprocessing returned an invalid compiled record');
      error.statusCode = 422;
      throw error;
    }
    if (
      typeof record.canonical_field !== 'string'
      || (record.reference != null && typeof record.reference !== 'string')
      || typeof record.relevant_field !== 'string'
      || typeof record.tag !== 'string'
      || !MARC_TAG_PATTERN.test(record.tag.trim())
    ) {
      const error = new Error('Python preprocessing returned an incomplete compiled record');
      error.statusCode = 422;
      throw error;
    }
    return [
      record.canonical_field,
      record.reference?.trim() || null,
      record.relevant_field,
      record.tag.trim(),
      record.notes || null,
      normalizeDate(record.date),
    ];
  });
  const authorityMatches = data.authority_matches.map((match) => {
    if (!match || typeof match !== 'object') {
      const error = new Error('Python preprocessing returned an invalid authority match');
      error.statusCode = 422;
      throw error;
    }
    if (
      typeof match.reference !== 'string'
      || (match.associated_record_id != null && typeof match.associated_record_id !== 'string')
      || typeof match.canonical_field !== 'string'
      || typeof match.relevant_field !== 'string'
      || typeof match.tag !== 'string'
      || !match.reference.trim()
      || !MARC_TAG_PATTERN.test(match.tag.trim())
      || typeof match.confidence !== 'number'
      || !Number.isFinite(match.confidence)
      || match.confidence < 0
      || match.confidence > 100
    ) {
      const error = new Error('Python preprocessing returned an incomplete authority match');
      error.statusCode = 422;
      throw error;
    }
    return [
      match.associated_record_id || null,
      match.confidence,
      match.reference,
      match.tag.trim(),
      match.relevant_field,
    ];
  });

  return { compiledRecords, authorityMatches };
}

async function insertCompiledRecords(client, rows) {
  const columns = 6;
  const batchSize = 500;
  const insertedRecords = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map((row, rowIndex) => {
      const placeholders = row.map((value, columnIndex) => {
        values.push(value);
        return `$${rowIndex * columns + columnIndex + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const result = await client.query(
      `INSERT INTO compiled_records (
         name_with_valid_delimiters, associated_record_identifier,
         canonical_name, tag, comments, date
       ) VALUES ${tuples.join(', ')}
       ON CONFLICT DO NOTHING
       RETURNING associated_record_identifier`,
      values
    );
    insertedRecords.push(...result.rows);
  }
  return insertedRecords;
}

async function insertAuthorityMatches(client, rows) {
  for (const row of rows) {
    await client.query(
      `INSERT INTO associated_compiled (
         associated_record_id, percent_match, lcn, tag, author_name_match
       ) VALUES ($1, $2, $3, $4, $5)`,
      row
    );
  }
}

app.post('/api/upload', receiveUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A file is required' });

  try {
    const parsed = await preprocessFile(req.file.path);
    const { compiledRecords, authorityMatches } = validateParsedRecords(parsed);
    const client = await pool.connect();
    let transactionStarted = false;
    let insertedRecords;
    let importedAuthorityMatches;
    let eligibleAuthorityMatches;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      insertedRecords = await insertCompiledRecords(client, compiledRecords);
      const insertedIdentifierSet = new Set(
        insertedRecords
          .map((record) => record.associated_record_identifier)
          .filter((identifier) => identifier != null)
      );
      eligibleAuthorityMatches = authorityMatches.filter(
        ([associatedRecordId]) => insertedIdentifierSet.has(associatedRecordId)
      );
      importedAuthorityMatches = selectAuthorityMatches(
        eligibleAuthorityMatches,
        insertedIdentifierSet
      );
      await insertAuthorityMatches(client, importedAuthorityMatches);
      await client.query('COMMIT');
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Failed to roll back file import:', rollbackError);
        }
      }
      throw error;
    } finally {
      client.release();
    }

    res.json({
      compiledRecords: insertedRecords.length,
      authorityMatches: importedAuthorityMatches.length,
      skippedCompiledRecords: compiledRecords.length - insertedRecords.length,
      skippedAuthorityMatches: eligibleAuthorityMatches.length - importedAuthorityMatches.length,
    });
  } catch (error) {
    if (error.statusCode === 422) {
      return res.status(422).json({ error: error.message });
    }
    console.error('File import failed:', error);
    res.status(500).json({ error: 'File import failed' });
  } finally {
    try {
      await fs.unlink(req.file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to remove uploaded temporary file:', error);
      }
    }
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));