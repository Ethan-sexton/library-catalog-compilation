const path = require('path');
const { existsSync } = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const projectPython = path.join(
  __dirname,
  '..',
  '..',
  '.venv',
  ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'])
);
const pythonExecutable = process.env.PYTHON
  || (existsSync(projectPython) ? projectPython : (process.platform === 'win32' ? 'py' : 'python3'));
const pythonArgs = pythonExecutable === 'py' ? ['-3'] : [];
const parserScript = path.join(__dirname, '..', 'preprocessing', 'parse_file.py');
const MARC_TAG_PATTERN = /^\d{3}(?:\s+\d{1,2})?$/;

async function preprocessFile(filePath) {
  let result;
  try {
    ({ stdout: result } = await execFileAsync(
      pythonExecutable,
      [...pythonArgs, parserScript, filePath],
      { cwd: path.join(__dirname, '..', 'preprocessing'), windowsHide: true, maxBuffer: 128 * 1024 * 1024 }
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
        'Windows redirected Python to the Microsoft Store. Install the project environment with "python -m venv .venv", activate it, install requirements.txt, then restart the server. Alternatively set PYTHON in .env to the full path of a working Python executable.'
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
  } catch {
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

module.exports = {
  insertAuthorityMatches,
  insertCompiledRecords,
  normalizeDate,
  preprocessFile,
  validateParsedRecords,
};
