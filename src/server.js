require('dotenv').config();

const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const path = require('path');
const pool = require('./db');
const authRoutes = require('./routes/auth');
const compiledRoutes = require('./routes/compiled');
const newEntryRoutes = require('./routes/newEntries');
const uploadRoutes = require('./routes/upload');

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error('SESSION_SECRET must be set before starting the server');
}

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(session({
  store: process.env.NODE_ENV === 'test'
    ? new session.MemoryStore()
    : new PgSession({
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
app.use('/api', compiledRoutes);
app.use('/api', newEntryRoutes);
app.use('/api', uploadRoutes);

app.get('/', (req, res) => {
  res.redirect(req.session.userId ? '/index.html' : '/login.html');
});
app.get('/index.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
}

module.exports = { app };