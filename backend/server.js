require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const db = require('./db');
const { verifyToken } = require('./middleware/auth');
const { safePayload, capString, rejectOversized, safeInt } = require('./middleware/security');
const { router: authRouter, publicUser } = require('./routes/auth');
const { router: chatsRouter, assertMember } = require('./routes/chats');
const keysRouter = require('./routes/keys');
const callsRouter = require('./routes/calls');
const webrtcRouter = require('./routes/webrtc');
const { router: blocksRouter, blockStatus } = require('./routes/blocks');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 4000;

app.use(cors());
// Behind Caddy/nginx the real client IP travels in X-Forwarded-For; without
// this, rate limiting would count everyone as the proxy's IP.
app.set('trust proxy', 1);
// Security headers: every response documents and enforces the platform's
// security policies (framing, MIME sniffing, referrer leakage, feature use,
// and a Content Security Policy that only allows our own bundle + the media
// the app legitimately loads).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(self), notifications=(self)');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https: http:; media-src 'self' blob: data:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  next();
});
// Bound JSON body size — don't let a rogue client buffer MBs into memory.
app.use(express.json({ limit: '64kb' }));
// Uploads are served read-only; nosniff stops a stored file from being
// executed as HTML/JS if content sniffing ever disagrees.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  },
}));

// Socket payload caps (rogue clients can otherwise store GBs of junk).
const MAX_CIPHERTEXT = 128 * 1024;
const MAX_SHORT = 2048;
const MAX_MEDIA_URL = 2048;
const MAX_MESSAGE_IDS = 200;

function arguesOversized(payload) {
  return rejectOversized([
    ['ciphertext', payload.ciphertext, MAX_CIPHERTEXT],
    ['mediaCiphertext', payload.mediaCiphertext, MAX_CIPHERTEXT],
    ['mediaEncKey', payload.mediaEncKey, MAX_SHORT],
    ['mediaUrl', payload.mediaUrl, MAX_MEDIA_URL],
    ['ratchetHeader', payload.ratchetHeader, MAX_SHORT],
    ['body', payload.body, 4096],
    ['mediaType', payload.mediaType, 64],
    ['iv', payload.iv, 64],
  ]);
}

// Per-user, per-window send limiter (socket abuse / message spam).
const sendBuckets = new Map();
function socketRateLimited(userId) {
  const windowMs = 60000, max = 120;
  const now = Date.now();
  const b = sendBuckets.get(userId);
  if (!b || now - b.reset > windowMs) {
    sendBuckets.set(userId, { count: 1, reset: now + windowMs });
    return false;
  }
  b.count += 1;
  return b.count > max;
}

// Confirm `to` is the other participant of a 1:1 chat the caller is in.
function sharesDirectChat(callerId, to) {
  if (!Number.isInteger(to)) return false;
  return !!db
    .prepare(
      `SELECT 1 FROM chats c
       JOIN chat_members a ON a.chat_id = c.id AND a.user_id = ?
       JOIN chat_members b ON b.chat_id = c.id AND b.user_id = ?
       WHERE c.is_group = 0`
    )
    .get(callerId, to);
}

app.use('/api/auth', authRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/keys', keysRouter);
app.use('/api/calls', callsRouter);
app.use('/api/webrtc', webrtcRouter);
app.use('/api', blocksRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// userId -> Set of socket ids (support multiple tabs)
const onlineUsers = new Map();

// Active ringing/ongoing calls by client-generated callId, so we can persist
// a call record (including missed/declined) once it ends.
const activeCalls = new Map();

function beginCall(entry) {
  const info = db
    .prepare(
      `INSERT INTO calls (chat_id, initiator_id, kind, status, started_at)
       VALUES (?, ?, ?, 'ringing', ?)`
    )
    .run(entry.chatId, entry.initiatorId, entry.kind, entry.startedAt || null);
  activeCalls.set(entry.callId, { ...entry, rowId: info.lastInsertRowid });
}

function acceptCall(callId) {
  const call = activeCalls.get(callId);
  if (!call) return;
  call.acceptedAt = new Date().toISOString();
  db.prepare("UPDATE calls SET status = 'ongoing' WHERE id = ?").run(call.rowId);
}

// outcome: 'ended' | 'declined' | 'missed' | 'cancelled'
// endedByUserId is used to decide missed (callee never answered, initiator gave
// up → canceled) vs cancelled (initiator hung up while still ringing).
function finalizeCall(callId, outcome, endedByUserId) {
  const call = activeCalls.get(callId);
  if (!call) return;
  let status;
  if (outcome === 'missed') status = 'missed';
  else if (outcome === 'declined') status = 'rejected';
  else if (outcome === 'cancelled') status = 'cancelled';
  else if (call.acceptedAt) status = 'ended';
  else status = endedByUserId === call.initiatorId ? 'cancelled' : 'missed';
  const duration = call.acceptedAt ? Math.max(0, Math.round((Date.now() - new Date(call.acceptedAt).getTime()) / 1000)) : 0;
  db.prepare('UPDATE calls SET status = ?, ended_at = ?, duration_sec = ? WHERE id = ?')
    .run(status, new Date().toISOString(), duration || null, call.rowId);
  activeCalls.delete(callId);
}

// Is this user already participating in an active (ringing/ongoing) call?
function isUserInCall(uid) {
  for (const c of activeCalls.values()) {
    if (c.initiatorId === uid || c.calleeId === uid) return true;
  }
  return false;
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token || typeof token !== 'string') return next(new Error('Missing auth token'));
  try {
    const payload = verifyToken(token);
    if (!Number.isInteger(payload.userId)) return next(new Error('Invalid auth token'));
    socket.userId = payload.userId;
    next();
  } catch (err) {
    next(new Error('Invalid auth token'));
  }
});

// Insert delivery receipts for every other member of a chat in ONE statement
// (multi-row VALUES) so message fan-out stays one write, not N.
function batchInsertReceipts(members, messageId, senderId) {
  const others = members.filter((m) => m.user_id !== senderId);
  if (!others.length) return;
  const now = new Date().toISOString();
  const values = others
    .map((m) => `(${messageId}, ${m.user_id}, ${onlineUsers.has(m.user_id) ? `'${now}'` : 'NULL'})`)
    .join(',');
  db.prepare(`INSERT OR IGNORE INTO message_receipts (message_id, user_id, delivered_at) VALUES ${values}`).run();
}

function broadcastPresence(userId, isOnline) {
  // Hide the presence user from anyone they blocked or who blocked them, so
  // online/last-seen stay private between blocked parties (both directions,
  // like WhatsApp's "no status for blocked contacts").
  const hidden = new Set();
  db.prepare('SELECT user_id, blocked_user_id FROM blocks WHERE user_id = ? OR blocked_user_id = ?')
    .all(userId, userId)
    .forEach((r) => { hidden.add(r.user_id); hidden.add(r.blocked_user_id); });
  const payload = { userId, isOnline, lastSeen: new Date().toISOString() };
  io.sockets.sockets.forEach((s) => {
    if (!s.userId || s.userId === userId || hidden.has(s.userId)) return;
    s.emit('presence:update', payload);
  });
}

io.on('connection', (socket) => {
  const userId = socket.userId;

  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);

  db.prepare('UPDATE users SET is_online = 1 WHERE id = ?').run(userId);
  broadcastPresence(userId, true);

  // Send the connecting socket a full presence snapshot so it immediately
  // knows who else is online (fixes seeing everyone as offline when they
  // connected before this client). Exclude users blocked by or blocking me.
  const hidden = new Set();
  db.prepare('SELECT user_id, blocked_user_id FROM blocks WHERE user_id = ? OR blocked_user_id = ?')
    .all(userId, userId)
    .forEach((r) => { hidden.add(r.user_id); hidden.add(r.blocked_user_id); });
  const snapshot = Array.from(onlineUsers.keys()).filter((uid) => uid !== userId && !hidden.has(uid));
  socket.emit('presence:snapshot', { onlineUserIds: snapshot });

  // Join a room per chat the user belongs to, so we can emit to chat members
  const chats = db.prepare('SELECT chat_id FROM chat_members WHERE user_id = ?').all(userId);
  chats.forEach((c) => socket.join(`chat:${c.chat_id}`));

  socket.on('chat:join', (chatId) => {
    if (assertMember(chatId, userId)) socket.join(`chat:${chatId}`);
  });

  socket.on('message:edit', (payload, ack) => {
    try {
      const chatId = safeInt(payload?.chatId);
      const messageId = safeInt(payload?.messageId);
      const { ciphertext, iv, n, ratchetHeader } = safePayload(payload);
      if (!chatId || !messageId) return ack && ack({ error: 'chatId and messageId required' });
      const tooBig = arguesOversized(safePayload(payload));
      if (tooBig) return ack && ack({ error: tooBig });
      if (!ciphertext) return ack && ack({ error: 'Empty edit' });
      if (!assertMember(chatId, userId)) {
        return ack && ack({ error: 'Not a member of this chat' });
      }
      // Only the author may edit, and only their own text message.
      const original = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
      if (!original || original.chat_id !== chatId || original.sender_id !== userId) {
        return ack && ack({ error: 'Cannot edit this message' });
      }
      // Editing is sending — blocked contacts can't edit either.
      const peerId = db.prepare('SELECT is_group FROM chats WHERE id = ?').get(chatId)?.is_group ? null : directPeerId(chatId);
      if (blockedFrom(peerId)) return ack && ack({ error: blockErrorMessage(peerId) });

      const info = db
        .prepare(
          `INSERT INTO messages
             (chat_id, sender_id, body, media_url, media_type,
              ciphertext, media_ciphertext, media_enc_key, sender_device_id,
              ratchet_header, edited_message_id, edited_at)
           VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, ?, ?, datetime('now'))`
        )
        .run(chatId, userId, ciphertext, ratchetHeader || null, original.id);

      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

      const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId);
      batchInsertReceipts(members, message.id, userId);

      io.to(`chat:${chatId}`).emit('message:new', { chatId, message });
      ack && ack({ message: { ...message, status: 'sent' } });
    } catch (err) {
      console.error(err);
      ack && ack({ error: 'Failed to edit message' });
    }
  });

  socket.on('message:send', (payload, ack) => {
    try {
      if (socketRateLimited(userId)) return ack && ack({ error: 'Rate limited — too many messages' });
      const chatId = safeInt(payload?.chatId);
      const { body, mediaUrl, mediaType, ciphertext, mediaCiphertext, mediaEncKey, senderDeviceId, ratchetHeader } = safePayload(payload);
      if (!chatId) return ack && ack({ error: 'Chat ID required' });
      const tooBig = arguesOversized(safePayload(payload));
      if (tooBig) return ack && ack({ error: tooBig });
      if (!assertMember(chatId, userId)) {
        return ack && ack({ error: 'Not a member of this chat' });
      }
      // E2E: a message must carry ciphertext (or encrypted media ciphertext).
      // The server never sees or stores plaintext `body`. `body` is allowed
      // to stay for legacy plaintext clients but is ignored when ciphertext
      // is present.
      if (!ciphertext && !mediaCiphertext && !body) return ack && ack({ error: 'Empty message' });

      // Blocked contacts cannot message each other (either direction).
      const peerId = db.prepare('SELECT is_group FROM chats WHERE id = ?').get(chatId)?.is_group ? null : directPeerId(chatId);
      if (blockedFrom(peerId)) return ack && ack({ error: blockErrorMessage(peerId) });

      const info = db
        .prepare(
          `INSERT INTO messages
             (chat_id, sender_id, body, media_url, media_type,
              ciphertext, media_ciphertext, media_enc_key, sender_device_id, ratchet_header)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          chatId,
          userId,
          ciphertext ? null : (body || null),
          mediaUrl || null,
          mediaType || null,
          ciphertext || null,
          mediaCiphertext || null,
          mediaEncKey || null,
          senderDeviceId || null,
          ratchetHeader || null
        );

      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);

      const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId);
      batchInsertReceipts(members, message.id, userId);

      io.to(`chat:${chatId}`).emit('message:new', { chatId, message });
      // The sender's ack carries a `status` so it can render the correct tick
      // for its own message immediately.
      ack && ack({ message: { ...message, status: 'sent' } });
    } catch (err) {
      console.error(err);
      ack && ack({ error: 'Failed to send message' });
    }
  });

  socket.on('message:delete', (payload, ack) => {
    try {
      const chatId = Number(payload?.chatId);
      const messageId = Number(payload?.messageId);
      if (!chatId || !messageId) return ack && ack({ error: 'chatId and messageId required' });
      if (!assertMember(chatId, userId)) return ack && ack({ error: 'Not a member of this chat' });
      // Only the author can delete for everyone (like WhatsApp).
      const msg = db.prepare('SELECT id FROM messages WHERE id = ? AND chat_id = ? AND sender_id = ?').get(messageId, chatId, userId);
      if (!msg) return ack && ack({ error: 'You can only delete your own messages' });
      db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
      io.to(`chat:${chatId}`).emit('message:deleted', { chatId, messageId });
      ack && ack({ ok: true });
    } catch (err) {
      console.error('message:delete failed', err);
      ack && ack({ error: err.message });
    }
  });

  socket.on('message:read', (payload, ack) => {
    const chatId = safeInt(payload?.chatId);
    const messageIds = Array.isArray(payload?.messageIds)
      ? payload.messageIds.filter((x) => Number.isInteger(x)).slice(0, MAX_MESSAGE_IDS)
      : [];
    if (!chatId || !messageIds.length || !assertMember(chatId, userId)) return;
    // Only mark messages that actually belong to this chat as read (prevents
    // fabricating receipts against other chats' rows).
    const known = new Set(
      db
        .prepare('SELECT id FROM messages WHERE chat_id = ? AND id IN (' + messageIds.map(() => '?').join(',') + ')')
        .all(chatId, ...messageIds)
        .map((r) => r.id)
    );
    const validIds = messageIds.filter((id) => known.has(id));
    if (!validIds.length) return;
    const now = new Date().toISOString();
    const upsert = db.prepare(
      `INSERT INTO message_receipts (message_id, user_id, delivered_at, read_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(message_id, user_id) DO UPDATE SET read_at = excluded.read_at,
         delivered_at = COALESCE(message_receipts.delivered_at, excluded.delivered_at)`
    );
    validIds.forEach((id) => upsert.run(id, userId, now, now));
    io.to(`chat:${chatId}`).emit('message:read', { chatId, messageIds: validIds, readerId: userId, readAt: now });
  });

  socket.on('chat:clear', (payload, ack) => {
    try {
      const chatId = Number(payload?.chatId);
      if (!chatId) return ack && ack({ error: 'Chat ID required' });
      if (!assertMember(chatId, userId)) return ack && ack({ error: 'Not a member of this chat' });
      const result = db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId);
      io.to(`chat:${chatId}`).emit('chat:cleared', { chatId });
      ack && ack({ ok: true, deleted: result.changes });
    } catch (err) {
      console.error('chat:clear failed', err);
      ack && ack({ error: err.message });
    }
  });

  socket.on('typing:start', (payload) => {
    const chatId = safeInt(payload?.chatId);
    if (!chatId || !assertMember(chatId, userId)) return;
    const peerId = directPeerId(chatId);
    if (blockedFrom(peerId)) return;
    if (peerId != null) emitToUser(peerId, 'typing:start', { chatId, userId });
    else socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId });
  });

  socket.on('typing:stop', (payload) => {
    const chatId = safeInt(payload?.chatId);
    if (!chatId || !assertMember(chatId, userId)) return;
    const peerId = directPeerId(chatId);
    if (blockedFrom(peerId)) return;
    if (peerId != null) emitToUser(peerId, 'typing:stop', { chatId, userId });
    else socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
  });

  // ---------- WebRTC voice/video call signaling ----------
  // Only the callee's socket(s) receive signaling (we emit to ALL of the
  // callee's devices so multi-device ringing works; they reconcile on the
  // client).
  function emitToUser(targetUserId, event, data) {
    const set = onlineUsers.get(targetUserId);
    if (set) set.forEach((sid) => io.to(sid).emit(event, data));
  }

  // Signaling to `to` is only allowed when both parties share a 1:1 chat —
  // this stops anyone from spraying SDP/ICE spam at arbitrary user ids.
  function canSignalTo(to) {
    return sharesDirectChat(userId, safeInt(to));
  }

  // The other 1:1 participant for a chat (null for groups).
  function directPeerId(chatId) {
    return (
      db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id <> ?').get(chatId, userId)?.user_id ?? null
    );
  }

  // Blocks are one-way but messaging/calls/typing become symmetric: if either
  // user blocked the other, no interaction goes through.
  function blockedFrom(peerId) {
    return peerId != null && (blockStatus(userId, peerId).blocked_by_me || blockStatus(userId, peerId).blocked_me);
  }

  function blockErrorMessage(peerId) {
    const st = blockStatus(userId, peerId);
    return st.blocked_by_me
      ? 'You blocked this contact. Unblock to send messages.'
      : 'You can no longer send messages to this contact.';
  }

  socket.on('call:offer', (payload, ack) => {
    const { chatId, to, sdp, callId, kind } = safePayload(payload);
    if (!safeInt(chatId) || !safeInt(to) || !callId || typeof callId !== 'string' || callId.length > 64) {
      return ack && ack({ error: 'Invalid call offer' });
    }
    // The frontend sends sdp as the RTCSessionDescription object {type, sdp}
    // (browsers also accept a bare SDP string). Validate the SDP text size
    // regardless of shape, then relay the payload untouched.
    const sdpText = (sdp && typeof sdp === 'object' && typeof sdp.sdp === 'string')
      ? sdp.sdp
      : (typeof sdp === 'string' ? sdp : '');
    if (!sdpText) return ack && ack({ error: 'Invalid call offer' });
    if (sdpText.length > 65536) return ack && ack({ error: 'Offer too large' });
    if (activeCalls.size > 500) return ack && ack({ error: 'Too many active calls' });
    if (socketRateLimited(`${userId}|call`)) return ack && ack({ error: 'Rate limited — slow down' });
    if (!assertMember(chatId, userId)) return ack && ack({ error: 'Not a member' });
    if (!canSignalTo(to)) return ack && ack({ error: 'Not allowed to signal this user' });
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(to);
    if (!target) return ack && ack({ error: 'User not found' });
    // Busy handling: don't let overlapping calls pile up on either side.
    if (isUserInCall(userId)) return ack && ack({ error: 'You are already in a call' });
    if (isUserInCall(to)) return ack && ack({ error: 'User is in another call' });
    // Blocked contacts can't call each other (either direction).
    if (blockedFrom(to)) return ack && ack({ error: blockErrorMessage(to) });

    const callId_ = callId;
    const kind_ = kind === 'video' ? 'video' : 'voice';
    const startedAt = new Date().toISOString();
    beginCall({ callId: callId_, chatId, initiatorId: userId, calleeId: to, kind: kind_, startedAt });

    // Callee is offline: don't leave the caller ringing forever — record a
    // missed call and tell the caller immediately.
    if (!onlineUsers.has(to)) {
      finalizeCall(callId_, 'missed');
      return ack && ack({ error: 'User is not online' });
    }

    emitToUser(to, 'call:offer', {
      callId: callId_, kind: kind_,
      from: userId, chatId, sdp,
    });
    ack && ack({ ok: true });
  });

  socket.on('call:answer', (payload, ack) => {
    const { to, sdp, callId } = safePayload(payload);
    if (!canSignalTo(to)) return ack && ack({ error: 'Not allowed' });
    const sdpText = (sdp && typeof sdp === 'object' && typeof sdp.sdp === 'string')
      ? sdp.sdp
      : (typeof sdp === 'string' ? sdp : '');
    if (!sdpText) return ack && ack({ error: 'Invalid answer' });
    if (sdpText.length > 65536) return ack && ack({ error: 'Answer too large' });
    emitToUser(to, 'call:answer', { callId, from: userId, sdp });
    ack && ack({ ok: true });
  });

  socket.on('call:ice', (payload) => {
    const { to, candidate, callId } = safePayload(payload);
    if (!canSignalTo(to)) return;
    if (candidate && typeof candidate === 'string' && candidate.length > 65536) return;
    emitToUser(to, 'call:ice', { callId, from: userId, candidate });
  });

  socket.on('call:hangup', (payload) => {
    const { to, callId } = safePayload(payload);
    if (!canSignalTo(to)) return;
    finalizeCall(callId, 'ended', userId);
    emitToUser(to, 'call:hangup', { callId, from: userId });
  });

  socket.on('call:decline', (payload) => {
    const { to, callId } = safePayload(payload);
    if (!canSignalTo(to)) return;
    finalizeCall(callId, 'declined', userId);
    emitToUser(to, 'call:decline', { callId, from: userId });
  });

  socket.on('call:ringing', (payload) => {
    const { to, callId } = safePayload(payload);
    if (!canSignalTo(to)) return;
    emitToUser(to, 'call:ringing', { callId, from: userId });
  });

  socket.on('call:accept', (payload) => {
    const { to, callId } = safePayload(payload);
    if (!canSignalTo(to)) return;
    acceptCall(callId);
    emitToUser(to, 'call:accept', { callId, from: userId });
  });

  // Mid-call renegotiation (e.g. voice -> video): relay a fresh offer for an
  // already-active call without creating a new call record or busy-checking.
  socket.on('call:renegotiate', (payload, ack) => {
    const { to, sdp, callId } = safePayload(payload);
    if (!canSignalTo(to)) return ack && ack({ error: 'Not allowed' });
    const sdpText = (sdp && typeof sdp === 'object' && typeof sdp.sdp === 'string')
      ? sdp.sdp
      : (typeof sdp === 'string' ? sdp : '');
    if (!callId || typeof callId !== 'string' || callId.length > 64) return ack && ack({ error: 'Invalid call' });
    if (!sdpText) return ack && ack({ error: 'Invalid offer' });
    if (sdpText.length > 65536) return ack && ack({ error: 'Offer too large' });
    emitToUser(to, 'call:renegotiate', { callId, from: userId, sdp });
    ack && ack({ ok: true });
  });

  // In-call emoji reaction: broadcast the reaction to the peer's sockets.
  socket.on('call:react', (payload) => {
    const { to, callId, emoji } = safePayload(payload);
    if (!canSignalTo(to)) return;
    if (!callId || typeof callId !== 'string' || callId.length > 64) return;
    if (!emoji || typeof emoji !== 'string' || emoji.length > 16) return;
    emitToUser(to, 'call:react', { callId, from: userId, emoji });
  });

  // ---------- Multi-device key sync ----------
  // When a device registers new prekeys, tell the user's OTHER devices so
  // they can refresh bundles and re-establish sessions.
  socket.on('keys:changed', () => {
    const set = onlineUsers.get(userId);
    if (set) set.forEach((sid) => { if (sid !== socket.id) io.to(sid).emit('prekeys:changed'); });
  });

  socket.on('disconnect', () => {
    const set = onlineUsers.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(userId);
        const now = new Date().toISOString();
        db.prepare('UPDATE users SET is_online = 0, last_seen = ? WHERE id = ?').run(now, userId);
        broadcastPresence(userId, false);
      }
    }
  });
});

// Production: serve the built frontend from this same process (single always-on
// server — no Vite dev server needed). Dev keeps using Vite; this only engages
// when frontend/dist exists. The SPA fallback never shadows API/socket/upload
// paths.
const distDir = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (['/api', '/uploads', '/socket.io', '/health'].some((p) => req.path.startsWith(p))) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Waguan backend running on http://localhost:${PORT}`);
});
