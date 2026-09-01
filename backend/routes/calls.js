const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { assertMember } = require('./chats');

const router = express.Router();

// Record a call that has ended, missed, or was rejected.
// Body: { chatId, kind, status, startedAt?, endedAt?, durationSec? }
router.post('/', authMiddleware, (req, res) => {
  const { chatId, kind, status, startedAt, endedAt, durationSec } = req.body;
  if (!chatId || !kind || !status) {
    return res.status(400).json({ error: 'chatId, kind and status are required' });
  }
  if (!assertMember(chatId, req.userId)) {
    return res.status(403).json({ error: 'Not a member of this chat' });
  }
  const normalized = { ringing: 'ringing', ongoing: 'ongoing', ended: 'ended', missed: 'missed', rejected: 'rejected', declined: 'declined' }[status];
  const info = db
    .prepare(
      `INSERT INTO calls (chat_id, initiator_id, kind, status, started_at, ended_at, duration_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(chatId, req.userId, kind === 'video' ? 'video' : 'voice', normalized,
      startedAt || null, endedAt || null, durationSec || null);
  res.status(201).json({ call: db.prepare('SELECT * FROM calls WHERE id = ?').get(info.lastInsertRowid) });
});

// GET /api/calls?chatId=
// Return call history for a chat (or all of the user's calls), enriched with
// the peer's identity (the OTHER party in the call's 1:1 chat) so the UI can
// call back / message them directly.
router.get('/', authMiddleware, (req, res) => {
  const chatId = req.query.chatId ? Number(req.query.chatId) : null;
  const base = `
    SELECT c.*, cm.user_id AS peer_id, u.name AS peer_name, u.avatar_url AS peer_avatar
    FROM calls c
    JOIN chat_members cm ON cm.chat_id = c.chat_id AND cm.user_id <> ?
    JOIN users u ON u.id = cm.user_id
    WHERE %CONDITION%
    ORDER BY c.id DESC LIMIT 100`;
  const condition = chatId
    ? `c.chat_id = ? AND c.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?)`
    : `c.chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = ?)`;
  const sql = base.replace('%CONDITION%', condition);
  const rows = chatId
    ? db.prepare(sql).all(req.userId, chatId, req.userId)
    : db.prepare(sql).all(req.userId, req.userId);
  res.json({ calls: rows });
});

// DELETE /api/calls/:id — delete a single call-history entry.
router.delete('/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid call id' });
  const call = db.prepare('SELECT chat_id FROM calls WHERE id = ?').get(id);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (!assertMember(call.chat_id, req.userId)) return res.status(403).json({ error: 'Not a member' });
  db.prepare('DELETE FROM calls WHERE id = ?').run(id);
  res.status(204).end();
});

// DELETE /api/calls?chatId= — clear the user's call history (optionally for
// one chat). Because a 1:1 chat's call rows are shared, this clears them for
// both parties.
router.delete('/', authMiddleware, (req, res) => {
  const chatId = req.query.chatId ? Number(req.query.chatId) : null;
  if (chatId) {
    if (!assertMember(chatId, req.userId)) return res.status(403).json({ error: 'Not a member' });
    const info = db.prepare('DELETE FROM calls WHERE chat_id = ?').run(chatId);
    return res.json({ deleted: info.changes });
  }
  const ids = db
    .prepare('SELECT DISTINCT c.id FROM calls c JOIN chat_members cm ON cm.chat_id = c.chat_id WHERE cm.user_id = ?')
    .all(req.userId)
    .map((r) => r.id);
  if (!ids.length) return res.json({ deleted: 0 });
  const ph = ids.map(() => '?').join(',');
  const info = db.prepare(`DELETE FROM calls WHERE id IN (${ph})`).run(...ids);
  res.json({ deleted: info.changes });
});

module.exports = router;
