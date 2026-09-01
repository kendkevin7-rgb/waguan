// Crypto round-trip tests. These run in Node (v24 has WebCrypto + btoa/atob).
// They prove the E2E session actually converges and decrypts correctly for
// real messages — not just "looks right".
//
// Run:  node tests/crypto.test.js

import { generateKeyPair, sharedSecret, hkdfSha256, aesGcmEncrypt, aesGcmDecrypt } from '../src/crypto/primitives.js';
import { CryptoSession, deriveRootKey, sessionAD } from '../src/crypto/ratchet.js';

let pass = 0;
let fail = 0;
function assert(cond, name) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}`); }
}
async function assertRejects(fn, name) {
  try { await fn(); fail++; console.log(`  ✘ ${name} (did not reject)`); }
  catch { pass++; console.log(`  ✔ ${name}`); }
}

// Build two parties that share a session, exactly as in real life:
// - A generates its ratchet key and sends the pub to B.
// - Each computes the SAME root key from A.secret|B.pub / B.secret|A.pub.
function makePair() {
  const aliceIdentity = generateKeyPair();
  const bobIdentity = generateKeyPair();
  const A = generateKeyPair();
  const B = generateKeyPair();
  const ad = sessionAD(aliceIdentity.pub, bobIdentity.pub);

  const rootA = deriveRootKey(A.secret, B.pub);
  const rootB = deriveRootKey(B.secret, A.pub);
  // Both must agree the root key is identical.
  assert(rootA === rootB, 'both parties derive identical root key (ECDH symmetry)');

  const alice = new CryptoSession({ myIdentityPub: aliceIdentity.pub, theirIdentityPub: bobIdentity.pub, rootKey: rootA });
  const bob = new CryptoSession({ myIdentityPub: bobIdentity.pub, theirIdentityPub: aliceIdentity.pub, rootKey: rootB });
  return { alice, bob };
}

// ---------------------------------------------------------------------------
console.log('\n[1] Primitive sanity');
// ---------------------------------------------------------------------------
{
  const a = generateKeyPair();
  const b = generateKeyPair();
  const s1 = sharedSecret(a.secret, b.pub);
  const s2 = sharedSecret(b.secret, a.pub);
  assert(s1 === s2, 'X25519 shared secrets agree both directions');
  assert(typeof sharedSecret(a.secret, a.pub) === 'string', 'DH returns b64 string');
}

// ---------------------------------------------------------------------------
console.log('\n[2] HKDF determinism');
// ---------------------------------------------------------------------------
assert(hkdfSha256('aGFuZyBvbiB0aGVyZQ==', null, 'test', 32) === hkdfSha256('aGFuZyBvbiB0aGVyZQ==', null, 'test', 32), 'HKDF deterministic');
assert(hkdfSha256('aGFuZyBvbiB0aGVyZQ==', null, 'test', 48).length === 64, 'HKDF-48 returns 64 b64 chars');

// ---------------------------------------------------------------------------
console.log('\n[3] AES-GCM encrypt/decrypt round trip');
// ---------------------------------------------------------------------------
{
  const key = Buffer.from('k'.repeat(32)).toString('base64');
  const { ciphertext, iv } = await aesGcmEncrypt(key, 'hello secret world', 'YWQ=');
  const pt = await aesGcmDecrypt(key, ciphertext, iv, 'YWQ=');
  assert(new TextDecoder().decode(pt) === 'hello secret world', 'GCM round trip');
  await assertRejects(() => aesGcmDecrypt(key, ciphertext, iv, 'd3Jvbmc='), 'GCM rejects wrong AAD');
  await assertRejects(() => aesGcmDecrypt(key, ciphertext, Buffer.from('x'.repeat(12)).toString('base64'), 'YWQ='), 'GCM rejects wrong IV');
}

// ---------------------------------------------------------------------------
console.log('\n[4] Bidirectional conversation (both directions, many messages)');
// ---------------------------------------------------------------------------
{
  const { alice, bob } = makePair();
  for (let i = 0; i < 5; i++) {
    const m = await alice.send(`A${i}: hello from Alice ${i}`, 'text');
    const dec = await bob.receive(m);
    assert(dec.body === `A${i}: hello from Alice ${i}`, `Alice -> Bob msg ${i}`);
    const rep = await bob.send(`B${i}: reply from Bob ${i}`, 'text');
    const dec2 = await alice.receive(rep);
    assert(dec2.body === `B${i}: reply from Bob ${i}`, `Bob -> Alice reply ${i}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\n[5] Media payload (binary-ish) round trip');
// ---------------------------------------------------------------------------
{
  const { alice, bob } = makePair();
  const m = await alice.send('data:image/png;base64,iVBORw0KGgo=', 'media');
  const dec = await bob.receive(m);
  assert(dec.t === 'media' && dec.body.startsWith('data:image'), 'media payload round trips');
}

// ---------------------------------------------------------------------------
console.log('\n[6] Serialization round trip on both sides');
// ---------------------------------------------------------------------------
{
  const { alice, bob } = makePair();
  const m1 = await alice.send('first message', 'text');
  const dec1 = await bob.receive(m1);
  assert(dec1.body === 'first message', 'first message through');

  // Simulate relaying state through the server (multi-device / offline sync)
  const alice2 = CryptoSession.deserialize(alice.serialize());
  const bob2 = CryptoSession.deserialize(bob.serialize());

  const m2 = await alice2.send('after resync', 'text');
  const dec2 = await bob2.receive(m2);
  assert(dec2.body === 'after resync', 'decrypt after serialization round trip');
}

// ---------------------------------------------------------------------------
console.log('\n[7] Tamper detection: corrupted ciphertext must fail');
// ---------------------------------------------------------------------------
{
  const { alice, bob } = makePair();
  const m = await alice.send('integrity test', 'text');
  // Flip the first character of the ciphertext to force a tamper, regardless
  // of what it happens to be.
  const tampered = { ...m, ciphertext: (m.ciphertext[0] === 'A' ? 'B' : 'A') + m.ciphertext.slice(1) };
  await assertRejects(() => bob.receive(tampered), 'rejects tampered ciphertext');
}

// ---------------------------------------------------------------------------
console.log('\n[8] Wrong-peer rejection: B cannot decrypt a message meant for a 3rd party');
// ---------------------------------------------------------------------------
{
  const other = generateKeyPair(); // unrelated identity
  const A = generateKeyPair();
  const B = generateKeyPair();
  const root = deriveRootKey(A.secret, B.pub);
  const aliceSession = new CryptoSession({ myIdentityPub: 'alice', theirIdentityPub: 'bob', rootKey: root });
  const attacker = new CryptoSession({ myIdentityPub: 'mallory', theirIdentityPub: 'alice', rootKey: root });
  const m = await aliceSession.send('secret', 'text');
  await assertRejects(() => attacker.receive(m), 'wrong-identity session rejects (AAD mismatch)');
}

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
