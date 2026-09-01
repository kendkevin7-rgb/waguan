import { useCallback, useEffect, useRef } from 'react';
import { useCrypto } from '../context/CryptoContext.jsx';

// Wraps the decryption of E2E-encrypted messages. Each encrypted message is
// decrypted once (with the peer's session) and cached with a stable id, so
// React re-renders reflect plaintext without re-decrypting.
export function useEncryptedMessages({ chat, messages, setMessages, user }) {
  const { decryptFromPeer } = useCrypto();
  const inFlight = useRef(new Set());

  // Determine the peer for a 1:1 chat (E2E applies only to 1:1).
  const peerForMessage = useCallback((chatObj, senderId) => {
    if (!chatObj || chatObj.is_group) return null;
    return chatObj.members?.find((m) => m.id !== user.id)?.id ?? null;
  }, [user]);

  const cacheKey = useCallback((chatId, msgId) => `dec:${chatId}:${msgId}`, []);
  const readCache = useCallback((chatId, msgId) => {
    try { return JSON.parse(localStorage.getItem(cacheKey(chatId, msgId)) || 'null'); } catch (_) { return null; }
  }, [cacheKey]);
  const writeCache = useCallback((chatId, msg, result) => {
    try { localStorage.setItem(cacheKey(chatId, msgIdKey(chatId, msg)), JSON.stringify(result)); } catch (_) {}
  }, [cacheKey]);
  const msgIdKey = useCallback((chatId, msg) => msg.id, []);
  const chatIdOf = useCallback((chatObj, msg) => msg.chat_id || (chatObj && chatObj.id), []);

  const decryptMessage = useCallback(async (chatObj, msg) => {
    if (!msg.ciphertext || msg.decrypted) return msg;
    const chatId = chatIdOf(chatObj, msg);
    const cache = readCache(chatId, msg.id);

    // Already-decrypted result cached (e.g. sender's own message, or a message
    // received real-time and then re-fetched on reopen). The ratchet is
    // forward-only and one-shot, so we MUST reuse it rather than re-decrypt.
    if (cache) return { ...msg, ...cache, decrypted: true };

    // The sender: can't decrypt its own outgoing ciphertext (it uses the send
    // chain, not the receive chain). Restore from the own-plaintext cache.
    if (msg.sender_id === user.id) {
      let body, isMedia = false, mediaType, found = false;
      try {
        const cached = JSON.parse(localStorage.getItem(`own:${chatId}:${msg.id}`) || 'null');
        if (cached) { found = true; body = cached.body; isMedia = cached.type === 'media' || cached.type === 'audio'; mediaType = cached.type === 'audio' ? 'audio/webm' : cached.type === 'media' ? msg.media_type : undefined; }
      } catch (_) {}
      // Only persist a DECRYPTED result if we actually restored plaintext.
      // Otherwise the ack handler / live broadcast may still be about to write
      // the own-cache, and caching an EMPTY dec result here would permanently
      // blank this message on every later load ("0" instead of the text).
      if (found) {
        const result = { e2e: true, body: isMedia ? undefined : body, mediaUrl: isMedia ? body : undefined, mediaType: isMedia ? mediaType : undefined };
        writeCache(chatId, msg, result);
        return { ...msg, ...result, decrypted: true };
      }
      return { ...msg, decrypted: true };
    }
    const peerId = peerForMessage(chatObj, msg.sender_id);
    if (!peerId) return msg;
    if (inFlight.current.has(msg.id)) return msg;
    inFlight.current.add(msg.id);
    try {
      // The server stores only ciphertext + a ratchet_header JSON blob
      // ({iv, n}) since the DB has no iv/n columns. Reconstruct iv/n from it.
      let iv = msg.iv, n = msg.n;
      if (msg.ratchet_header && typeof msg.ratchet_header === 'string') {
        try { const h = JSON.parse(msg.ratchet_header); iv = h.iv; n = h.n; } catch (_) {}
      }
      const payload = { ciphertext: msg.ciphertext, iv, n };
      const dec = await decryptFromPeer(peerId, payload);
      const isAudio = dec.t === 'audio';
      const result = {
        e2e: true, body: dec.t === 'text' && dec.body ? dec.body : undefined,
        mediaUrl: (dec.t === 'media' || isAudio) ? dec.body : msg.media_url,
        mediaType: isAudio ? 'audio/webm' : undefined,
      };
      writeCache(chatId, msg, result);
      return { ...msg, ...result, decrypted: true };
    } catch (e) {
      // If crypto wasn't ready yet, don't mark failed — a retry will run the
      // moment the crypto service finishes bootstrapping.
      if (/not ready|Encryption not ready/i.test(e.message || '')) {
        return msg;
      }
      return { ...msg, decrypted: true, body: null, failedDecrypt: true, chat_id: chatId };
    } finally {
      inFlight.current.delete(msg.id);
    }
  }, [decryptFromPeer, peerForMessage, readCache, writeCache, chatIdOf, user.id]);

  // Decrypt a batch and merge into state (replacing encrypted versions).
  // Messages are decrypted SEQUENTIALLY in chronological order — the ratchet
  // is strictly sequential (message N can only be opened after N-1 advanced
  // the chain), so parallel decryption would break order and fail.
  const decryptAndMerge = useCallback(async (chatObj, newMessages) => {
    const ordered = [...newMessages].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '') || (a.id - b.id));
    const results = [];
    for (const m of ordered) {
      results.push(await decryptMessage(chatObj, m));
    }
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      results.forEach((r) => {
        const prevMsg = map.get(r.id);
        // Never downgrade a message that already shows plaintext (e.g. the
        // sender's just-acked version) with an empty decrypt result.
        if (prevMsg && (prevMsg.body || prevMsg.mediaUrl) && !r.body && !r.mediaUrl) return;
        map.set(r.id, r);
      });
      return Array.from(map.values());
    });
  }, [decryptMessage, setMessages]);

  return { decryptAndMerge, decryptMessage };
}

export default useEncryptedMessages;
