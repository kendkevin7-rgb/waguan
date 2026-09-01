const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { publicUser } = require('./auth');

const router = express.Router();

// GET /api/blocks — the current user's blocked list.
router.get('/blocks', authMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, b.created_at AS blocked_at
       FROM blocks b JOIN users u ON u.id = b.blocked_user_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(req.userId);
  res.json({ blocked: rows.map((r) => ({ ...publicUser(r), blocked_at: r.blocked_at })) });
});

function blockStatus(userId, otherId) {
  const row = db
    .prepare(
      `SELECT user_id, blocked_user_id FROM blocks
       WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)`
    )
    .get(userId, otherId, otherId, userId);
  if (!row) return { blocked_by_me: false, blocked_me: false };
  return row.user_id === userId
    ? { blocked_by_me: true, blocked_me: false }
    : { blocked_by_me: false, blocked_me: true };
}

// POST /api/users/:userId/block — block another user.
router.post('/users/:userId/block', authMiddleware, (req, res) => {
  const otherId = Number(req.params.userId);
  if (otherId === req.userId) return res.status(400).json({ error: 'You cannot block yourself' });
  const other = db.prepare('SELECT id FROM users WHERE id = ?').get(otherId);
  if (!other) return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT OR IGNORE INTO blocks (user_id, blocked_user_id) VALUES (?, ?)').run(req.userId, otherId);
  res.json({ ok: true });
});

// DELETE /api/users/:userId/block — unblock.
router.delete('/users/:userId/block', authMiddleware, (req, res) => {
  const otherId = Number(req.params.userId);
  const info = db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_user_id = ?').run(req.userId, otherId);
  res.json({ ok: true, removed: info.changes });
});

// GET /api/users/:userId — profile with block flags (for UI banners).
router.get('/users/:userId', authMiddleware, (req, res) => {
  const otherId = Number(req.params.userId);
  const other = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId);
  if (!other) return res.status(404).json({ error: 'User not found' });
  const user = publicUser(other);
  const status = blockStatus(req.userId, otherId);
  // Hide your online/last-seen from someone you blocked AND from anyone who
  // blocked you (WhatsApp hides it in both directions).
  if (status.blocked_me || status.blocked_by_me) {
    user.is_online = 0;
    user.last_seen = null;
  }
  res.json({ user: { ...user, ...status } });
});

module.exports = { router, blockStatus };