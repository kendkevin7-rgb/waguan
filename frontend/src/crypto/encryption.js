// E2E encryption service: ties the crypto core to the backend (prekey bundle
// registration + retrieval) and to local persistence (IndexedDB).
//
// Responsibilities:
//   - Register/refresh this device's identity + prekeys with the server.
//   - Fetch a peer's prekey bundle and establish a session.
//   - Encrypt a message before it leaves the client; decrypt on receipt.
//   - Keep per-peer CryptoSession state, serialized so it can be re-hydrated
//     across reloads (and later synced for multi-device).

import api from '../api.js';
import { getSocket } from '../socket.js';
import { generateKeyPair, generateIdentityKeyPair, randomB64, fingerprint, signMessage } from './primitives.js';
import { CryptoSession, sessionAD, deriveRootKey } from './ratchet.js';
import { store } from './keyStore.js';

// A stable per-browser+account device id, reused across logins so the server
// upserts rather than creating duplicate devices.
function getDeviceId(userId) {
  const key = `deviceId:${userId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = `dev_${randomB64(16).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
  localStorage.setItem(key, id);
  return id;
}

async function loadOrCreateIdentity(userId) {
  const key = `identity:${userId}`;
  let id = await store.get('kv', key);
  if (!id) {
    const identityX = generateKeyPair();      // X25519 for DH
    const signing = await generateIdentityKeyPair(); // ECDSA for signatures/verification
    id = {
      deviceId: getDeviceId(userId),
      identity: identityX,
      signing,
      created: Date.now(),
    };
    await store.set('kv', key, id);
  }
  return id;
}

// Generate a fresh signed prekey (rotated) + a batch of one-time prekeys.
function generatePreKeys() {
  const signed = { key: generateKeyPair(), keyId: Math.floor(Math.random() * 1e6) };
  const oneTime = Array.from({ length: 20 }, () => ({
    key: generateKeyPair(),
    keyId: Math.floor(Math.random() * 1e9),
  }));
  return { signed, oneTime };
}

async function fetchBundle(userId, deviceIdFilter) {
  const { data } = await api.get(`/keys/bundle/${userId}`);
  return data.bundles || [];
}

export class EncryptionService {
  constructor(user) { this.user = user; }

  isReady() { return !!this.identity; }

  // Setup on login/bootstrap: ensure device registered AND prekeys fresh.
  // We ALWAYS re-register so the server's stored identity_pub always matches
  // the current browser identity (a stale registration after IndexedDB was
  // cleared would break root-key convergence and decrypt).
  async bootstrap() {
    this.identity = await loadOrCreateIdentity(this.user.id);
    await this.registerDevice();
    const regKey = `registered:${this.user.id}`;
    if (!localStorage.getItem(regKey)) localStorage.setItem(regKey, '1');
    return this;
  }

  async registerDevice() {
    const { signed, oneTime } = generatePreKeys();
    // Signature over the signed prekey using the signing key, so peers can
    // verify the bundle truly belongs to this identity.
    const signingKey = this.identity.signing.privateJwk;
    const msgToSign = `signedprekey:${signed.key.pub}:${signed.keyId}`;
    const signature = await signMessage(signingKey, msgToSign);
    await api.post('/keys/register-device', {
      name: 'Web App',
      deviceId: this.identity.deviceId,
      identityPub: this.identity.identity.pub,
      signedPreKeyPub: signed.key.pub,
      signedPreKeyId: signed.keyId,
      signature,
      oneTimePreKeys: oneTime.map((o) => ({ keyId: o.keyId, pub: o.key.pub })),
    });
    // Persist the freshly generated secret prekeys for session setup.
    await store.set('kv', `prekeys:${this.user.id}`, { signed, oneTime });
    // Notify other devices of this user to refresh.
    getSocket()?.emit('keys:changed');
    return signed;
  }

  // --- Key/identity display ---
  fingerprint() {
    return fingerprint(this.identity.identity.pub);
  }

  // --- Session + message pipeline ---
  // Establish a session with a peer. To guarantee the sender and receiver
  // converge on the SAME root key, we always:
  //   1. fetch the peer's CURRENT identity public key from their prekey bundle
  //   2. derive root = DH(ourSecret, peerPub)   (the peer mirrors this)
  // Sessions are cached keyed by the peer's identity pub, so if a peer
  // re-registers (new identity), a fresh session is established automatically.
  async getOrCreateSession(peerUserId, peerIdentityPub) {
    if (!peerIdentityPub) {
      const bundles = await fetchBundle(peerUserId);
      const b = bundles[0];
      if (!b) { console.warn('[e2e] No bundle for peer', peerUserId, 'bundles=', bundles.length); throw new Error('Peer has no devices available for E2E'); }
      peerIdentityPub = b.identityPub;
    }
    const key = `session:${this.user.id}:${peerUserId}:${peerIdentityPub}`;
    const cached = await store.get('kv', key);
    if (cached) {
      const s = CryptoSession.deserialize(cached);
      console.log('[e2e] session cache hit peer', peerUserId, 'peerPub', peerIdentityPub, 'txNs', s.txNs, 'rxNr', s.rxNr);
      return { session: s, peerIdentityPub };
    }
    const rootKey = deriveRootKey(this.identity.identity.secret, peerIdentityPub);
    const session = new CryptoSession({ myIdentityPub: this.identity.identity.pub, theirIdentityPub: peerIdentityPub, rootKey });
    session.peerDeviceId = null;
    console.log('[e2e] session created peer', peerUserId, 'peerPub', peerIdentityPub, 'myPub', this.identity.identity.pub, 'root', rootKey.slice(0,8));
    await store.set('kv', key, session.serialize());
    return { session, peerIdentityPub };
  }

  // Persist a session after advancing its ratchet (send or receive).
  async cacheSession(peerUserId, session, peerIdentityPub) {
    const pub = peerIdentityPub || (session.theirIdentityPub);
    await store.set('kv', `session:${this.user.id}:${peerUserId}:${pub}`, session.serialize());
  }

  async getSession(peerUserId) {
    const ser = await store.get('kv', `session:${this.user.id}:${peerUserId}`);
    return ser ? CryptoSession.deserialize(ser) : null;
  }
}

export default EncryptionService;
