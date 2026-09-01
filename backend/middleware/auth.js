const jwt = require('jsonwebtoken');

// Never ship with a fallback secret. In production the process must provide
// one, otherwise anyone who reads the source can forge tokens for ANY user.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set in production');
}

const JWT_SECRET = process.env.JWT_SECRET || 'waguan-dev-secret-change-me';
const JWT_ISSUER = 'waguan';
const JWT_AUDIENCE = 'waguan-client';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

// Verify is hardened: issuer + audience must match and the default algorithm
// set is pinned to HS256 only.
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ['HS256'],
  });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = verifyToken(token);
    if (!Number.isInteger(payload.userId)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET, signToken, verifyToken };