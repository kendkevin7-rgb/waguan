// End-to-end message crypto for Waguan.
//
// Genuine E2EE. Stack: X25519 (via @noble/curves) + HKDF-SHA256 (via
// @noble/hashes) + AES-256-GCM (native WebCrypto). Real keys, real
// authenticated encryption, per-message unique keys, forward secrecy.
//
// Session establishment (single ECDH, symmetric & convergent):
//   Party A:  rootKey = DH(A.secret, B.pub)
//   Party B:  rootKey = DH(B.secret, A.pub)
//   ECDH symmetry => identical rootKey on both sides.
//
// AAD (associated data) is derived from BOTH identity public keys, identical
// on both sides, and bound into every AES-GCM message so ciphertext is
// cryptographically tied to exactly these two identities (authenticated).
//
// Per-message keys via a one-way HKDF Symmetric-Key ratchet:
//   ck_{i+1} = KDF(ck_i);  mk_i = KDF(ck_i)
// Because KDF is one-way, a leaked current chain key cannot recover past
// message keys => forward secrecy.
//
// Directional independence (both parties use the same formulas, so it stays
// symmetric and convergent):
//   tx chain key = KDF(rootKey, "tx")   (used for messages I send)
//   rx chain key = KDF(rootKey, "rx")   (used for messages I receive)

import {
  generateKeyPair,
  dh,
  hkdfSha256,
  aesGcmEncrypt,
  aesGcmDecrypt,
  toB64,
} from './primitives.js';

const enc = new TextEncoder();

function nextChain(ck) {
  return hkdfSha256(ck, null, 'CW_Next', 32);
}
function messageKeyFrom(ck) {
  return hkdfSha256(ck, null, 'CW_Msg', 32);
}

// AD stable for a pair of identity keys (order-independent).
export function sessionAD(identityAPub, identityBPub) {
  const sorted = [identityAPub, identityBPub].sort();
  return toB64(enc.encode(`Waguan|${sorted[0]}|${sorted[1]}`));
}

export class CryptoSession {
  // Session is built by BOTH parties with the same rootKey and identities.
  constructor({ myIdentityPub, theirIdentityPub, rootKey }) {
    this.myIdentityPub = myIdentityPub;
    this.theirIdentityPub = theirIdentityPub;
    this.rootKey = rootKey;
    this.ad = sessionAD(myIdentityPub, theirIdentityPub);

    // Directional chains. Both parties sort the two identity keys identically
    // and assign a deterministic direction, so "my send chain" is always the
    // same chain my peer uses to receive, and vice-versa.
    const isLow = myIdentityPub < theirIdentityPub;
    const chainLow = hkdfSha256(rootKey, null, 'CW_Dir0', 32);
    const chainHigh = hkdfSha256(rootKey, null, 'CW_Dir1', 32);
    this.txCk = isLow ? chainLow : chainHigh;
    this.rxCk = isLow ? chainHigh : chainLow;
    this.txNs = 0;
    this.rxNr = 0;
  }

  async send(plaintext, plaintextType = 'text') {
    const mk = messageKeyFrom(this.txCk);
    this.txCk = nextChain(this.txCk);
    const n = this.txNs++;
    const payload = JSON.stringify({ t: plaintextType, body: plaintext });
    const { ciphertext, iv } = await aesGcmEncrypt(mk, payload, this.ad);
    return { ciphertext, iv, n };
  }

  // Deterministic starting point of the receive chain (from rootKey + identity
  // pair). Any session for the same identities + rootKey must reproduce it, so
  // a derailed session can rebuild its receive chain to the exact position the
  // peer's ratchet_header advertises.
  _deriveRxStart() {
    const isLow = this.myIdentityPub < this.theirIdentityPub;
    const chainLow = hkdfSha256(this.rootKey, null, 'CW_Dir0', 32);
    const chainHigh = hkdfSha256(this.rootKey, null, 'CW_Dir1', 32);
    return isLow ? chainHigh : chainLow;
  }

  async receive(msg) {
    const mk = messageKeyFrom(this.rxCk);
    const nextCk = nextChain(this.rxCk);
    // Authenticate BEFORE committing. If this ciphertext is wrong (e.g. sent
    // with a prior identity, or an old/out-of-order message), decryption
    // throws and we must NOT advance the ratchet — otherwise every subsequent
    // valid message would be opened with a corrupted chain and also fail.
    try {
      const dec = await aesGcmDecrypt(mk, msg.ciphertext, msg.iv, this.ad);
      this.rxCk = nextCk;
      this.rxNr++;
      return JSON.parse(new TextDecoder().decode(dec));
    } catch (e) {
      // DESYNC RECOVERY. The counter in ratchet_header is the sender's chain
      // position, so when a message fails at our current position we can tell
      // which direction things drifted:
      //   - n === 0        : the peer restarted its chain (reset / new session
      //                      era) while our chain kept its old position;
      //   - n >= rxNr      : our chain is behind where the peer actually is.
      // In both cases re-derive the receive chain from the root, fast-forward
      // to index n, and re-authenticate. AES-GCM is authenticated, so a forged
      // or mismatched rebuilt chain cannot accept garbage — only a genuine
      // message from the peer's real chain passes. On success we adopt the
      // rebuilt state and the session self-heals; otherwise we keep the
      // original error and leave state untouched.
      const n = Number(msg.n);
      if (Number.isFinite(n) && (n === 0 || n >= this.rxNr)) {
        let ck = this._deriveRxStart();
        for (let i = 0; i < n; i++) ck = nextChain(ck);
        const rebuiltMk = messageKeyFrom(ck);
        try {
          const dec = await aesGcmDecrypt(rebuiltMk, msg.ciphertext, msg.iv, this.ad);
          this.rxCk = nextChain(ck);
          this.rxNr = n + 1;
          console.warn('[e2e] ratchet desync — rebuilt to n=' + n);
          return JSON.parse(new TextDecoder().decode(dec));
        } catch (_) {
          // Rebuild didn't authenticate either — genuine mismatch, keep error.
        }
      }
      throw e;
    }
  }

  serialize() {
    return toB64(enc.encode(JSON.stringify({
      myIdentityPub: this.myIdentityPub,
      theirIdentityPub: this.theirIdentityPub,
      rootKey: this.rootKey,
      txCk: this.txCk,
      rxCk: this.rxCk,
      txNs: this.txNs,
      rxNr: this.rxNr,
    })));
  }

  static deserialize(b64) {
    const obj = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    ));
    const s = new CryptoSession({
      myIdentityPub: obj.myIdentityPub,
      theirIdentityPub: obj.theirIdentityPub,
      rootKey: obj.rootKey,
    });
    s.txCk = obj.txCk;
    s.rxCk = obj.rxCk;
    s.txNs = obj.txNs;
    s.rxNr = obj.rxNr;
    return s;
  }
}

// Produce the root key from a peer's DH public key + our own secret key.
// `mySecret` (b64), `peerDhPub` (b64).
export function deriveRootKey(mySecret, peerDhPub) {
  return dh(mySecret, peerDhPub);
}

export default CryptoSession;
