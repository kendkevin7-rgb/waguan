import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import EncryptionService from '../crypto/encryption.js';
import { getSocket } from '../socket.js';
import { useAuth } from './AuthContext.jsx';

const CryptoContext = createContext(null);

export function CryptoProvider({ children }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [fingerprintStr, setFingerprintStr] = useState('');
  const serviceRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;

  // Bootstrap the encryption service when a user logs in.
  useEffect(() => {
    if (!user) {
      serviceRef.current = null;
      setReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const svc = await new EncryptionService(user).bootstrap();
        if (cancelled) return;
        serviceRef.current = svc;
        setFingerprintStr(svc.fingerprint());
        setReady(true);
      } catch (err) {
        console.error('E2E bootstrap failed', err);
        if (!cancelled) setReady(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // When our prekeys change on another device, refresh cached sessions.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onPrekeysChanged = () => {
      console.log('[e2e] prekeys changed on another device');
    };
    socket.on('prekeys:changed', onPrekeysChanged);
    return () => socket.off('prekeys:changed', onPrekeysChanged);
  }, []);

  const getService = useCallback(() => {
    if (!serviceRef.current) throw new Error('Encryption not ready yet');
    return serviceRef.current;
  }, []);

  // Encrypt a message for a chat (establishes session on demand).
  const encryptForPeer = useCallback(async (peerUserId, plaintext, type = 'text') => {
    const svc = getService();
    const { session, peerIdentityPub } = await svc.getOrCreateSession(peerUserId);
    const packet = await session.send(plaintext, type);
    // Persist the session AFTER advancing the send ratchet so the next
    // message stays in sync with the peer's receive chain.
    await svc.cacheSession(peerUserId, session, peerIdentityPub);
    return { ...packet, peerUserId };
  }, [getService]);

  // Decrypt a received message. Returns {type, body} on success.
  const decryptFromPeer = useCallback(async (peerUserId, packet) => {
    const svc = getService();
    const { session, peerIdentityPub } = await svc.getOrCreateSession(peerUserId);
    console.log('[e2e] decryptFromPeer peer=', peerUserId, 'peerPub=', peerIdentityPub, 'n=', packet.n, 'iv?', !!packet.iv, 'myPub=', svc.identity?.identity?.pub);
    const result = await session.receive(packet);
    await svc.cacheSession(peerUserId, session, peerIdentityPub);
    return result;
  }, [getService]);

  return (
    <CryptoContext.Provider value={{ ready, fingerprint: fingerprintStr, encryptForPeer, decryptFromPeer, getService }}>
      {children}
    </CryptoContext.Provider>
  );
}

export function useCrypto() {
  return useContext(CryptoContext);
}

export default CryptoContext;
