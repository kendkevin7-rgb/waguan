// Lightweight security helpers (no extra dependencies).
//
// rateLimit: in-memory sliding-window limiter used for abuse-prone endpoints
// such as auth (brute force / account creation spam).

const buckets = new Map();

function rateLimit({ windowMs = 60000, max = 20, keyPrefix = 'rl' } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now - b.resetAt > windowMs) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    b.count += 1;
    if (b.count > max) {
      return res.status(429).json({ error: 'Too many requests — slow down' });
    }
    next();
  };
}

function safePayload(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

// Returns the input capped to max chars (rejects absurdly large inputs so a
// rogue client can't stuff the server/DB with GBs of junk).
function capString(v, max) {
  if (typeof v !== 'string') return null;
  return v.length <= max ? v : null;
}

// Reject a request when any provided string field exceeds its cap.
function rejectOversized(fields) {
  for (const [label, value, max] of fields) {
    if (typeof value === 'string' && value.length > max) return `${label} too large`;
  }
  return null;
}

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { rateLimit, safePayload, capString, rejectOversized, safeInt };