const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();
const passwordRounds = 12;

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email };
}

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body || {};
  if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  const normalizedUsername = username.trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
    return res.status(400).json({ error: 'Username must be 3-30 letters, numbers, or underscores' });
  }
  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }
  if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Password must be at least 10 characters and no more than 72 bytes' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, passwordRounds);
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email`,
      [normalizedUsername, normalizedEmail, passwordHash]
    );
    await regenerateSession(req);
    req.session.userId = rows[0].id;
    await saveSession(req);
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That username or email is already registered' });
    }
    console.error('Signup failed:', err);
    res.status(500).json({ error: 'Unable to create account' });
  }
});

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body || {};
  if (typeof identifier !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username or email and password are required' });
  }

  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (!normalizedIdentifier || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Enter a valid username/email and password' });
  }

  try {
    const column = normalizedIdentifier.includes('@') ? 'email' : 'username';
    const { rows } = await pool.query(
      `SELECT id, username, email, password_hash
         FROM users
        WHERE ${column} = $1`,
      [normalizedIdentifier]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({ error: 'Unable to log in' });
  }
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (!rows[0]) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    console.error('User lookup failed:', err);
    res.status(500).json({ error: 'Unable to load account' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout failed:', err);
      return res.status(500).json({ error: 'Unable to log out' });
    }
    res.clearCookie('connect.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    res.json({ ok: true });
  });
});

module.exports = router;
