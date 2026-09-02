const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/webrtc/config
// Returns ICE server configuration for RTCPeerConnection.
// STUN alone is enough for same-LAN/localhost testing. Add a TURN relay via
// the TURN_URL / TURN_USER / TURN_CREDENTIAL env vars to make calls through
// different NATs (cross-network) reliable.
router.get('/config', authMiddleware, (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USER || '',
      credential: process.env.TURN_CREDENTIAL || '',
    });
  }
  res.json({ iceServers });
});

module.exports = router;
