const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, it } = require('node:test');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://unit-test:unit-test@127.0.0.1:1/unit-test';
process.env.SESSION_SECRET = 'unit-test-session-secret';

const bcrypt = require('bcrypt');
const pool = require('../src/db');
const { app } = require('../src/server');
const {
  insertAuthorityMatches,
  insertCompiledRecords,
  normalizeDate,
  validateParsedRecords,
} = require('../src/services/importService');
const { createServer } = require('node:http');

const originalQuery = pool.query;
const originalConnect = pool.connect;
const testPassword = 'unit-test-password';
const testUser = {
  id: 42,
  username: 'unit_tester',
  email: 'unit@example.test',
};

let server;
let baseUrl;
let passwordHash;
let authCookie;

async function request(path, options = {}, cookie = authCookie) {
  const headers = { ...options.headers };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  return {
    response,
    body: text ? JSON.parse(text) : null,
  };
}

describe('backend API', () => {
  before(async () => {
    passwordHash = await bcrypt.hash(testPassword, 4);
    server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(async () => {
    pool.query = async (sql) => {
      if (sql.includes('FROM users')) {
        return { rows: [{ ...testUser, password_hash: passwordHash }] };
      }
      throw new Error(`Unexpected query during authentication: ${sql}`);
    };

    const { response, body } = await request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: testUser.username, password: testPassword }),
      },
      null
    );
    assert.equal(response.status, 200, JSON.stringify(body));
    authCookie = response.headers.get('set-cookie').split(';', 1)[0];
    pool.query = originalQuery;
  });

  it('rejects unauthenticated API requests', async () => {
    const { response, body } = await request('/api/new-entries', {}, null);

    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: 'Authentication required' });
  });

  it('rejects invalid login credentials', async () => {
    pool.query = async () => ({
      rows: [{ ...testUser, password_hash: passwordHash }],
    });

    const { response, body } = await request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: testUser.username, password: 'wrong-password' }),
      },
      null
    );

    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: 'Invalid username/email or password' });
    assert.equal(response.headers.get('set-cookie'), null);
  });

  it('lists catalog records and their total count', async () => {
    const rows = [{ name_with_valid_delimiters: '$aExample', associated_records: [] }];
    const calls = [];
    pool.query = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('WITH paginated_parents')) return { rows };
      if (sql.includes('SELECT COUNT(*)::int AS c FROM compiled_records')) {
        return { rows: [{ c: 1 }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    };

    const { response, body } = await request('/api/compiled?page=0&limit=10');

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      rows,
      total: 1,
      page: 0,
      limit: 10,
      highlightPK: null,
    });
    assert.deepEqual(calls[0].params, [10, 0]);
    assert.equal(calls.length, 2);
  });

  it('updates only allowed compiled-record fields', async () => {
    let update;
    pool.query = async (sql, params) => {
      update = { sql, params };
      return { rowCount: 1 };
    };

    const { response, body } = await request('/api/compiled', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pk: 'record-1',
        changes: { comments: 'Reviewed', date: '2026-03-04', tag: 'malicious' },
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.match(update.sql, /comments = \$1, date = \$2/);
    assert.doesNotMatch(update.sql, /tag/);
    assert.deepEqual(update.params, ['Reviewed', '2026-03-04', 'record-1']);
  });

  it('rejects updates that contain no editable fields without querying the database', async () => {
    pool.query = async () => {
      throw new Error('Database should not be queried');
    };

    const { response, body } = await request('/api/compiled', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pk: 'record-1', changes: { tag: '245' } }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(body, { error: 'no editable fields supplied' });
  });

  it('converts an unmatched new entry in one transaction', async () => {
    const statements = [];
    const client = {
      async query(sql) {
        statements.push(sql);
        if (sql.startsWith('SELECT 1 FROM compiled_records')) return { rowCount: 0 };
        return { rowCount: 1 };
      },
      release() {
        statements.push('RELEASE');
      },
    };
    pool.connect = async () => client;

    const { response, body } = await request('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record_identifier: 'new-1' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: 'converted' });
    assert.equal(statements[0], 'BEGIN');
    assert.ok(statements.some((sql) => sql.includes('INSERT INTO compiled_records')));
    assert.ok(statements.some((sql) => sql.includes('INSERT INTO associated_compiled')));
    assert.equal(statements.at(-2), 'COMMIT');
    assert.equal(statements.at(-1), 'RELEASE');
  });
});

describe('backend data validation and inserts', () => {
  it('normalizes supported dates and rejects impossible dates', () => {
    assert.equal(normalizeDate('2024-2-29'), '2024-02-29');
    assert.equal(normalizeDate('3/4/2026'), '2026-03-04');
    assert.equal(normalizeDate(''), null);
    assert.throws(() => normalizeDate('2025-02-29'), { statusCode: 422 });
  });

  it('validates and maps parsed records into database rows', () => {
    const result = validateParsedRecords({
      compiled_records: [{
        canonical_field: '$aAuthor',
        reference: ' control-1 ',
        relevant_field: '$aAuthor',
        tag: ' 100 1 ',
        notes: '',
        date: '3/4/2026',
      }],
      authority_matches: [{
        reference: 'authority-1',
        associated_record_id: 'control-1',
        canonical_field: '$aCandidate',
        relevant_field: '$aCandidate',
        tag: ' 100 1 ',
        confidence: 98.5,
      }],
    });

    assert.deepEqual(result, {
      compiledRecords: [['$aAuthor', 'control-1', '$aAuthor', '100 1', null, '2026-03-04']],
      authorityMatches: [['control-1', 98.5, 'authority-1', '100 1', '$aCandidate']],
    });
  });

  it('rejects malformed or empty parser results', () => {
    assert.throws(
      () => validateParsedRecords({ compiled_records: [], authority_matches: [] }),
      { statusCode: 422, message: 'No catalog records were found in the uploaded file' }
    );
    assert.throws(
      () => validateParsedRecords({
        compiled_records: [{
          canonical_field: '$aAuthor',
          relevant_field: '$aAuthor',
          tag: 'invalid',
        }],
        authority_matches: [],
      }),
      { statusCode: 422, message: 'Python preprocessing returned an incomplete compiled record' }
    );
  });

  it('inserts compiled rows in batches and inserts authority matches', async () => {
    const calls = [];
    const client = {
      async query(sql, params) {
        calls.push({ sql, params });
        return {
          rows: calls.length === 1
            ? [{ associated_record_identifier: 'record-1' }]
            : [],
        };
      },
    };
    const rows = Array.from({ length: 501 }, (_, index) => [
      `$aAuthor${index}`,
      `record-${index}`,
      `$aAuthor${index}`,
      '100 1',
      null,
      null,
    ]);

    const inserted = await insertCompiledRecords(client, rows);
    await insertAuthorityMatches(client, [
      ['record-1', 98.5, 'authority-1', '100 1', '$aCandidate'],
    ]);

    assert.deepEqual(inserted, [{ associated_record_identifier: 'record-1' }]);
    assert.equal(calls.length, 3);
    assert.match(calls[0].sql, /INSERT INTO compiled_records/);
    assert.equal(calls[0].params.length, 500 * 6);
    assert.equal(calls[1].params.length, 6);
    assert.deepEqual(calls[0].params.slice(0, 6), rows[0]);
    assert.match(calls[2].sql, /INSERT INTO associated_compiled/);
    assert.deepEqual(calls[2].params, ['record-1', 98.5, 'authority-1', '100 1', '$aCandidate']);
  });
});
