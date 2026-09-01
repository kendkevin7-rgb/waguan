const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, signToken } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');

const router = express.Router();

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

const NAME_MAX = 60;
const ABOUT_MAX = 300;
const AVATAR_MAX = 500;
const PHONE_MAX = 20;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

function validAvatar(url) {
  if (typeof url !== 'string' || url.length > AVATAR_MAX) return false;
  return /^(https?:\/\/|\/uploads\/)/.test(url);
}

router.post('/register', rateLimit({ windowMs: 60000, max: 5, keyPrefix: 'reg' }), (req, res) => {
  const { name, phone, password, username } = req.body;
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'name, phone and password are required' });
  }
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > NAME_MAX) {
    return res.status(400).json({ error: `Name must be 1-${NAME_MAX} characters` });
  }
  if (typeof phone !== 'string' || phone.length < 3 || phone.length > PHONE_MAX || !/^\+?[0-9]+$/.test(phone)) {
    return res.status(400).json({ error: 'Phone must be digits, optionally starting with +' });
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return res.status(400).json({ error: `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters` });
  }
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) return res.status(409).json({ error: 'Phone number already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
  let uname = null;
  if (username) {
    uname = String(username).trim().replace(/^@/, '').toLowerCase();
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(uname)) {
      return res.status(400).json({ error: 'Username must be 3-20 chars (letters, numbers, _ or .)' });
    }
    if (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(uname)) {
      return res.status(409).json({ error: 'Username already taken' });
    }
  }
  const info = db
    .prepare('INSERT INTO users (name, phone, password_hash, avatar_url, username) VALUES (?, ?, ?, ?, ?)')
    .run(name, phone, hash, avatar, uname);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken({ userId: user.id });
  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'login' }), (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ error: 'phone and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid phone or password' });
  }
  const token = signToken({ userId: user.id });
  res.json({ token, user: publicUser(user) });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

router.put('/me', authMiddleware, (req, res) => {
  const { name, about, avatar_url, username } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > NAME_MAX)) {
    return res.status(400).json({ error: `Name must be 1-${NAME_MAX} characters` });
  }
  if (about !== undefined && (typeof about !== 'string' || about.length > ABOUT_MAX)) {
    return res.status(400).json({ error: `About is limited to ${ABOUT_MAX} characters` });
  }
  if (avatar_url !== undefined && !validAvatar(avatar_url)) {
    return res.status(400).json({ error: 'Avatar URL must be http(s) or /uploads/...' });
  }

  let uname = null;
  if (username !== undefined && username !== null) {
    uname = String(username).trim().replace(/^@/, '').toLowerCase();
    if (uname && !/^[a-zA-Z0-9_.]{3,20}$/.test(uname)) {
      return res.status(400).json({ error: 'Username must be 3-20 chars (letters, numbers, _ or .)' });
    }
    const taken = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').get(uname, req.userId);
    if (taken) return res.status(409).json({ error: 'Username already taken' });
  }

  db.prepare(
    'UPDATE users SET name = COALESCE(?, name), about = COALESCE(?, about), avatar_url = COALESCE(?, avatar_url), username = COALESCE(?, username) WHERE id = ?'
  ).run(name, about, avatar_url, uname, req.userId);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(updated) });
});

router.get('/users/search', authMiddleware, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const users = db
    .prepare('SELECT * FROM users WHERE (name LIKE ? OR phone LIKE ? OR username LIKE ?) AND id != ? LIMIT 20')
    .all(q, q, q, req.userId);
  const { blockStatus } = require('./blocks');
  res.json({ users: users.map((u) => ({ ...publicUser(u), ...blockStatus(req.userId, u.id) })) });
});

module.exports = { router, publicUser };
