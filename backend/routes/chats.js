const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { publicUser } = require('./auth');
const { blockStatus } = require('./blocks');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Never trust the client filename; use a random token. The extension is
    // validated by the allowlist in fileFilter so no attacker path/name can
    // leak through.
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.webm', '.mp4', '.m4a', '.mp3', '.ogg', '.wav']);

// Verify the first bytes match a real image/audio container (client-supplied
// mimetypes mean nothing).
const MAGIC = [
  { ext: ['.jpg', '.jpeg'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ['.png'], test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: ['.gif'], test: (b) => Buffer.from(b.slice(0, 4)).toString('ascii') === 'GIF8' },
  { ext: ['.webp'], test: (b) => Buffer.from(b.slice(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(b.slice(8, 12)).toString('ascii') === 'WEBP' },
  { ext: ['.webm'], test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { ext: ['.ogg'], test: (b) => Buffer.from(b.slice(0, 4)).toString('ascii') === 'OggS' },
  { ext: ['.wav'], test: (b) => Buffer.from(b.slice(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(b.slice(8, 12)).toString('ascii') === 'WAVE' },
  {
    ext: ['.mp4', '.m4a', '.mp3'],
    test: (b) => {
      // MP4/M4A: box size + "ftyp"; MP3: "ID3" tag or MPEG frame sync.
      const ascii = (s) => Buffer.from(b.slice(s, s + 4)).toString('ascii');
      return ascii(4) === 'ftyp' || ascii(0) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    },
  },
];

function sniffFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  const ext = path.extname(filePath).toLowerCase();
  const m = MAGIC.find((x) => x.ext.includes(ext));
  return m ? m.test(buf) : false;
}

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return cb(new Error('Only image and audio uploads are allowed'));
    if (!file.mimetype) return cb(new Error('Missing file type'));
    cb(null, true);
  },
});

router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // Content sniff: reject anything that isn't actually image/audio, so an
  // attacker can't hide HTML/JS behind a fake media extension.
  if (!sniffFile(req.file.path)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'File content does not match an allowed media type' });
  }
  res.json({ url: `/uploads/${req.file.filename}`, type: req.file.mimetype });
});

function getChatWithMembers(chatId) {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId);
  if (!chat) return null;
  const members = db
    .prepare(
      `SELECT u.* FROM users u JOIN chat_members cm ON cm.user_id = u.id WHERE cm.chat_id = ?`
    )
    .all(chatId);
  return { ...chat, members: members.map(publicUser) };
}

// List all chats for current user, with last message + unread count
router.get('/', authMiddleware, (req, res) => {
  const chats = db
    .prepare(
      `SELECT c.* FROM chats c JOIN chat_members cm ON cm.chat_id = c.id WHERE cm.user_id = ?`
    )
    .all(req.userId);

  const result = chats.map((chat) => {
    const members = db
      .prepare(`SELECT u.* FROM users u JOIN chat_members cm ON cm.user_id = u.id WHERE cm.chat_id = ?`)
      .all(chat.id);
    const lastMessage = db
      .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1')
      .get(chat.id);
    const unread = db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages m
         LEFT JOIN message_receipts r ON r.message_id = m.id AND r.user_id = ?
         WHERE m.chat_id = ? AND m.sender_id != ? AND (r.read_at IS NULL)`
      )
      .get(req.userId, chat.id, req.userId);

    let displayName = chat.name;
    let displayAvatar = chat.avatar_url;
    let blocked = false;
    let blocked_me = false;
    if (!chat.is_group) {
      const other = members.find((m) => m.id !== req.userId);
      displayName = other ? other.name : 'Unknown';
      displayAvatar = other ? other.avatar_url : null;
      if (other) {
        const st = blockStatus(req.userId, other.id);
        blocked = st.blocked_by_me;
        blocked_me = st.blocked_me;
      }
    }

    return {
      ...chat,
      display_name: displayName,
      display_avatar: displayAvatar,
      members: members.map(publicUser),
      last_message: lastMessage || null,
      unread_count: unread.n,
      blocked,
      blocked_me,
    };
  });

  result.sort((a, b) => {
    const at = a.last_message ? a.last_message.created_at : a.created_at;
    const bt = b.last_message ? b.last_message.created_at : b.created_at;
    return at < bt ? 1 : -1;
  });

  res.json({ chats: result });
});

// Start or fetch a 1:1 chat with another user
router.post('/direct/:userId', authMiddleware, (req, res) => {
  const otherId = Number(req.params.userId);
  if (otherId === req.userId) return res.status(400).json({ error: 'Cannot chat with yourself' });
  const otherUser = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId);
  if (!otherUser) return res.status(404).json({ error: 'User not found' });

  const existing = db
    .prepare(
      `SELECT c.id FROM chats c
       JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
       JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
       WHERE c.is_group = 0`
    )
    .get(req.userId, otherId);

  let chatId;
  if (existing) {
    chatId = existing.id;
  } else {
    const info = db.prepare('INSERT INTO chats (is_group, created_by) VALUES (0, ?)').run(req.userId);
    chatId = info.lastInsertRowid;
    const insertMember = db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)');
    insertMember.run(chatId, req.userId);
    insertMember.run(chatId, otherId);
  }
  res.json({ chat: getChatWithMembers(chatId) });
});

// Create a group chat
router.post('/group', authMiddleware, (req, res) => {
  const { name, memberIds } = req.body;
  if (!name || typeof name !== 'string' || name.length > 60) {
    return res.status(400).json({ error: 'name is required (max 60 chars)' });
  }
  if (!Array.isArray(memberIds) || memberIds.length < 1 || memberIds.length > 100) {
    return res.status(400).json({ error: 'name and at least 1 memberId are required' });
  }
  // Only add members that actually exist; reject invalid IDs instead of
  // crashing mid-insert (foreign key error -> 500 + partial state).
  const ids = [...new Set(memberIds.filter((x) => Number.isInteger(x))).values()].map(Number);
  if (ids.length < 1) return res.status(400).json({ error: 'At least one valid memberId is required' });
  const placeholders = ids.map(() => '?').join(',');
  const existingIds = db
    .prepare(`SELECT id FROM users WHERE id IN (${placeholders})`)
    .all(...ids)
    .map((r) => r.id);
  if (existingIds.length !== ids.length) {
    return res.status(400).json({ error: 'One or more memberIds do not exist' });
  }
  const info = db
    .prepare('INSERT INTO chats (is_group, name, created_by) VALUES (1, ?, ?)')
    .run(name, req.userId);
  const chatId = info.lastInsertRowid;
  const insertMember = db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)');
  insertMember.run(chatId, req.userId);
  for (const id of ids) insertMember.run(chatId, id);

  res.status(201).json({ chat: getChatWithMembers(chatId) });
});

function assertMember(chatId, userId) {
  return db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
}

// Get messages in a chat (paginated, newest last)
router.get('/:chatId/messages', authMiddleware, (req, res) => {
  const chatId = Number(req.params.chatId);
  if (!assertMember(chatId, req.userId)) return res.status(403).json({ error: 'Not a member of this chat' });

  const before = req.query.before ? Number(req.query.before) : null;
  const limit = 50;
  let rows;
  if (before) {
    rows = db
      .prepare('SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
      .all(chatId, before, limit);
  } else {
    rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').all(chatId, limit);
  }
  rows.reverse();

  // Attach a `status` to each message from the current user's perspective so
  // the sender can render the correct tick: 'sent' (clock/grey single),
  // 'delivered' (grey double), 'read' (blue double). Others see no tick.
  const statuses = new Map();
  if (rows.length) {
    const mine = rows.filter((r) => r.sender_id === req.userId).map((r) => r.id);
    if (mine.length) {
      const placeholders = mine.map(() => '?').join(',');
      const receipts = db
        .prepare(
          `SELECT message_id, MAX(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) AS is_read,
                  MAX(CASE WHEN (delivered_at IS NOT NULL OR read_at IS NOT NULL) THEN 1 ELSE 0 END) AS is_delivered
           FROM message_receipts
           WHERE message_id IN (${placeholders}) AND user_id != ?
           GROUP BY message_id`
        )
        .all(...mine, req.userId);
      receipts.forEach((r) => {
        statuses.set(r.message_id, r.is_read ? 'read' : r.is_delivered ? 'delivered' : 'sent');
      });
    }
  }

  res.json({ messages: rows.map((m) => (m.sender_id === req.userId ? { ...m, status: statuses.get(m.id) || 'sent' } : m)) });
});

module.exports = { router, getChatWithMembers, assertMember, uploadDir };
