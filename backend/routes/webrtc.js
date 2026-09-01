const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// GET /api/webrtc/config
// Returns ICE server configuration for RTCPeerConnection.
// In a real deployment TURN would be a paid relay; the STUN list below is
// sufficient for same-LAN/localhost testing (typical for this app).
router.get('/config', authMiddleware, (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
    // Add TURN here (username/credential) for NAT traversal across WAN.
  });
});

module.exports = router;
