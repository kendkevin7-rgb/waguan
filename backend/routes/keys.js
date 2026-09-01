const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/keys/register-device
// Registers a new device for the authenticated user. Body:
//   { name, deviceId, identityPub, signedPreKeyPub, signedPreKeyId,
//     signature, oneTimePreKeys: [{ keyId, pub }] }
// `deviceId` is a client-generated opaque id (uuid) so a client can detect
// and re-register with the SAME device across logins without creating dupes.
router.post('/register-device', authMiddleware, (req, res) => {
  const {
    name,
    deviceId,
    identityPub,
    signedPreKeyPub,
    signedPreKeyId,
    signature,
    oneTimePreKeys = [],
  } = req.body;

  if (!deviceId || !identityPub || !signedPreKeyPub || !signedPreKeyId || !signature) {
    return res.status(400).json({ error: 'deviceId, identityPub, signedPreKeyPub, signedPreKeyId and signature are required' });
  }

  const userId = req.userId;
  if (!Array.isArray(oneTimePreKeys)) {
    return res.status(400).json({ error: 'oneTimePreKeys must be an array' });
  }
  // CRITICAL: the device_id is client-generated. Never let one user claim or
  // overwrite another user's device row — scope the lookup to this account.
  let row = db.prepare('SELECT id FROM devices WHERE device_id = ? AND user_id = ?').get(deviceId, userId);

  if (row) {
    // Device already registered (e.g. same browser re-login). Refresh
    // prekeys so other people can re-initiate sessions.
    db.prepare('UPDATE devices SET name = ?, last_seen = ? WHERE id = ?')
      .run(name || 'Unknown device', new Date().toISOString(), row.id);
  } else {
    try {
      const insert = db
        .prepare('INSERT INTO devices (user_id, name, device_id) VALUES (?, ?, ?)')
        .run(userId, name || 'Unknown device', deviceId);
      row = { id: insert.lastInsertRowid };
    } catch (err) {
      // device_id is globally unique; if it's already taken by ANOTHER
      // account, refuse instead of silently hijacking their keys. The client
      // treats this as "pick a fresh uuid".
      if (String(err && err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'device_id already registered to another account' });
      }
      throw err;
    }
  }
  const deviceId_int = row.id;

  // This app's E2E is single-device per account (documented limitation). If a
  // previous browser/profile left stale device rows for this user (e.g. after
  // a "Reset encryption keys" created a fresh identity), those identities no
  // longer match what the sender uses, so /keys/bundle would return an
  // outdated identityPub and decryption would fail. Delete every OTHER device
  // of this user so exactly one identity remains and both sides converge.
  const stale = db.prepare('SELECT id FROM devices WHERE user_id = ? AND id != ?').all(userId, deviceId_int);
  const delDevice = db.prepare('DELETE FROM devices WHERE id = ?');
  const delPrekeys = db.prepare('DELETE FROM prekeys WHERE device_id = ?');
  stale.forEach((s) => { delPrekeys.run(s.id); delDevice.run(s.id); });

  // Clear old one-time prekeys and the previous signed prekey for this
  // device so a rotated key doesn't linger with conflicting ids.
  const clearPrekey = db.prepare('DELETE FROM prekeys WHERE device_id = ?');
  clearPrekey.run(deviceId_int);

  const insertPrekey = db.prepare(
    'INSERT OR REPLACE INTO prekeys (device_id, key_id, prekey_pub, is_one_time, used) VALUES (?, ?, ?, ?, 0)'
  );
  insertPrekey.run(deviceId_int, signedPreKeyId, signedPreKeyPub, 0);

  const insertOneTime = db.prepare(
    'INSERT OR REPLACE INTO prekeys (device_id, key_id, prekey_pub, is_one_time, used) VALUES (?, ?, ?, ?, 0)'
  );
  oneTimePreKeys.forEach((ot) => insertOneTime.run(deviceId_int, ot.keyId, ot.pub, 1));

  // Store identity public key on the device row for bundle serving.
  db.prepare('UPDATE devices SET identity_pub = ?, signed_prekey_pub = ?, signed_prekey_id = ?, signature = ? WHERE id = ?')
    .run(identityPub, signedPreKeyPub, signedPreKeyId, signature, deviceId_int);

  res.status(201).json({ device: { id: deviceId_int, deviceId, name } });
});

// GET /api/keys/bundle/:userId
// Returns the prekey bundle(s) needed to start a session with every device
// of `userId` (multi-device support). If `deviceId` is supplied, only that
// device's bundle is returned and its one-time prekey is consumed.
router.get('/bundle/:userId', authMiddleware, (req, res) => {
  const targetId = Number(req.params.userId);
  if (targetId === req.userId) return res.status(400).json({ error: 'Cannot fetch your own bundle' });
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(targetId)) {
    return res.status(404).json({ error: 'User not found' });
  }

  const devices = db
    .prepare('SELECT id, device_id, name, identity_pub, signed_prekey_pub, signed_prekey_id, signature FROM devices WHERE user_id = ?')
    .all(targetId);
  if (!devices.length) return res.json({ bundles: [] });

  // Only consume a one-time prekey when the caller explicitly targets one
  // device (they are about to build a session). A broad fetch must NOT burn
  // prekeys, otherwise repeatedly listing bundles exhausts them (DoS).
  const targetedDeviceId = req.query.deviceId;

  const consumeOneTime = db.prepare(
    `UPDATE prekeys SET used = 1 WHERE device_id = ? AND key_id = (SELECT key_id FROM prekeys
     WHERE device_id = ? AND is_one_time = 1 AND used = 0 ORDER BY key_id LIMIT 1)`
  );
  const getOneTime = db.prepare(
    'SELECT prekey_pub, key_id FROM prekeys WHERE device_id = ? AND is_one_time = 1 AND used = 0 ORDER BY key_id LIMIT 1'
  );

  const bundles = devices.map((d) => {
    const ot = (targetedDeviceId && d.device_id === targetedDeviceId) ? getOneTime.get(d.id) : null;
    if (ot) consumeOneTime.run(d.id, d.id);
    return {
      deviceId: d.device_id,
      registrationId: d.id,
      identityPub: d.identity_pub,
      signedPreKeyId: d.signed_prekey_id,
      signedPreKeyPub: d.signed_prekey_pub,
      signature: d.signature,
      oneTimePreKey: ot ? { keyId: ot.key_id, pub: ot.prekey_pub } : null,
    };
  });

  res.json({ bundles });
});

// GET /api/keys/devices/me
// Returns the list of devices registered to the current user, plus
// whether the calling device is the "trusted primary".
router.get('/devices/me', authMiddleware, (req, res) => {
  const devices = db
    .prepare('SELECT id, device_id, name, created_at, last_seen FROM devices WHERE user_id = ? ORDER BY created_at')
    .all(req.userId);
  res.json({ devices });
});

// DELETE /api/keys/devices/:deviceId
// Unregister a device (sign-out from that device or revoke it remotely).
router.delete('/devices/:deviceId', authMiddleware, (req, res) => {
  const { deviceId } = req.params;
  const row = db.prepare('SELECT id, user_id FROM devices WHERE device_id = ?').get(deviceId);
  if (!row) return res.status(404).json({ error: 'Device not found' });
  if (row.user_id !== req.userId) return res.status(403).json({ error: 'Not your device' });
  db.prepare('DELETE FROM devices WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

module.exports = router;
