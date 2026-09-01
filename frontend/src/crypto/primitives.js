// Low-level cryptographic primitives.
//
// - X25519 key agreement via @noble/curves (audited, pure-JS Curve25519).
// - HKDF-SHA256 via @noble/hashes.
// - AES-256-GCM authenticated encryption via native WebCrypto.
//
// All keys are real; all authenticated encryption is real AES-256-GCM with a
// 12-byte random IV and associated data binding the message to its recipient
// and ratchet position.

import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

const enc = new TextEncoder();

// ---------------------------------------------------------------------------
// X25519
// ---------------------------------------------------------------------------
export function generateKeyPair() {
  const secretKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(secretKey);
  return {
    pub: toB64(publicKey),
    secret: toB64(secretKey),
  };
}

// sharedSecret(mySecretB64, theirPublicB64) -> 32-byte shared secret (b64)
export function sharedSecret(mySecretB64, theirPublicB64) {
  const mySec = fromB64(mySecretB64);
  const theirPub = fromB64(theirPublicB64);
  if (mySec.length !== 32 || theirPub.length !== 32) {
    throw new Error('invalid x25519 key length');
  }
  const shared = x25519.getSharedSecret(mySec, theirPub);
  return toB64(shared);
}

// Generic DH primitive used by the ratchet: sk is OUR secret, pk is THEIR
// public point.
export function dh(mySecretB64, theirPublicB64) {
  return sharedSecret(mySecretB64, theirPublicB64);
}

// Sign a message with the identity signing key (ECDSA P-256). Returns b64.
export async function signMessage(privateJwk, message) {
  const key = await crypto.subtle.importKey(
    'jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(message)
  );
  return toB64(new Uint8Array(sig));
}

export async function verifyMessage(publicJwk, message, signatureB64) {
  const key = await crypto.subtle.importKey(
    'jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
  );
  return await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key, fromB64(signatureB64), enc.encode(message)
  );
}

export async function generateIdentityKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  );
  return {
    publicJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
  };
}

// Fingerprint for security-number display ("verify" screen).
export function fingerprint(jwk) {
  const material = (jwk.x || '') + (jwk.y || '') + (jwk.n || '');
  const hash = new Uint8Array(sha256(enc.encode(material))).slice(0, 12);
  let s = '';
  for (const b of hash) s += b.toString(16).padStart(2, '0');
  return s.match(/.{1,2}/g).join(' ');
}

// ---------------------------------------------------------------------------
// HKDF-SHA256
// ---------------------------------------------------------------------------
export function hkdfSha256(ikmB64, saltB64, info, length = 32) {
  const ikm = fromB64(ikmB64);
  const salt = saltB64 ? fromB64(saltB64) : new Uint8Array(32);
  const okm = hkdf(sha256, ikm, salt, enc.encode(info || ''), length);
  return toB64(okm);
}

// ---------------------------------------------------------------------------
// AES-256-GCM
// ---------------------------------------------------------------------------
export async function aesGcmEncrypt(keyB64, plaintext, aadB64) {
  const keyBytes = fromB64(keyB64);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = aadB64 ? fromB64(aadB64) : undefined;
  const ptBytes = typeof plaintext === 'string' ? enc.encode(plaintext) : new Uint8Array(plaintext);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, ptBytes);
  return { ciphertext: toB64(new Uint8Array(ct)), iv: toB64(iv) };
}

export async function aesGcmDecrypt(keyB64, ciphertextB64, ivB64, aadB64) {
  const keyBytes = fromB64(keyB64);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = fromB64(ivB64);
  const ct = fromB64(ciphertextB64);
  const aad = aadB64 ? fromB64(aadB64) : undefined;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, ct);
    return new Uint8Array(pt);
  } catch (e) {
    throw new Error('Message authentication failed: ciphertext was tampered with or wrong key');
  }
}

// ---------------------------------------------------------------------------
// Random + encoding helpers
// ---------------------------------------------------------------------------
export function randomB64(n) {
  return toB64(crypto.getRandomValues(new Uint8Array(n)));
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function toB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToB64(bytes) {
  return toB64(bytes);
}

export function b64ToBytes(b64) {
  return fromB64(b64);
}
