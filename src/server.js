require('dotenv').config();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('./db');
const authRoutes = require('./routes/auth');

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

const EDITABLE = ['canonical_name', 'tag', 'comments'];

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

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));