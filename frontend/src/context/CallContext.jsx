import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { getSocket } from '../socket.js';
import { makeCall, Call, registerCallHandlers, clearCurrentCall } from '../webrtc/callManager.js';
import { useAuth } from './AuthContext.jsx';
import { usePermissions } from './PermissionsContext.jsx';

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const { user } = useAuth();
  const { ensure } = usePermissions();
  const [call, setCall] = useState(null);       // Call instance (active/current)
  const [incoming, setIncoming] = useState(null); // {callId, from, kind, chatId, sdp}
  const callRef = useRef(null);
  const cleanupRef = useRef(null);

  // Wire a Call instance to the socket and tear listeners down when it ends,
  // so repeated calls don't leave stale handler stacks behind.
  const wireCall = useCallback((c) => {
    callRef.current = c;
    const cleanup = registerCallHandlers(c, {});
    cleanupRef.current = cleanup;
    c.on('ended', () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    });
  }, []);

  const startCall = useCallback(async ({ kind, peerUserId, chatId }) => {
    const video = kind === 'video';
    // Device-permission gate: video needs mic+camera, voice needs mic, and
    // both count as "Calls & voicemail". Turning one off in Permissions
    // blocks the call until it's granted again.
    if (!(await ensure(video ? ['calls', 'mic', 'camera'] : ['calls', 'mic']))) {
      const c = new Call({ callId: `perm_${Date.now()}`, direction: 'outgoing', kind, peerUserId, chatId });
      c.fail(
        video
          ? 'Waguan needs your microphone and camera to make video calls. Allow them in Settings → Permissions.'
          : 'Waguan needs your microphone to make calls. Allow it in Settings → Permissions.'
      );
      wireCall(c);
      setCall(c);
      return c;
    }
    let c;
    try {
      c = await makeCall({ kind, peerUserId, chatId });
    } catch (err) {
      // Mic/camera denied, insecure context, ICE config failure, etc.
      // Show a "Call not connected" overlay instead of silently doing nothing.
      console.error('Failed to start call', err);
      c = new Call({ callId: `fail_${Date.now()}`, direction: 'outgoing', kind, peerUserId, chatId });
      c.fail(err?.message || 'Could not access microphone or camera');
    }
    wireCall(c);
    setCall(c);
    return c;
  }, [wireCall, ensure]);

  const acceptIncoming = useCallback(async () => {
    if (!incoming) return;
    const { callId, from, kind, chatId, sdp } = incoming;
    const c = new Call({ callId, direction: 'incoming', kind, peerUserId: from, chatId });
    wireCall(c);
    setCall(c);
    setIncoming(null);
    try {
      await c.acceptIncoming();
      await c.handleOffer(sdp);
    } catch (err) {
      // getUserMedia denied, malformed SDP, etc. — don't leave a phantom
      // call behind; bail out cleanly instead of an unhandled rejection.
      console.error('Failed to accept call', err);
      try { c.decline(); } catch (_) {}
      callRef.current = null;
      cleanupRef.current?.();
      cleanupRef.current = null;
      setCall(null);
    }
  }, [incoming, wireCall]);

  const declineIncoming = useCallback(() => {
    if (!incoming) return;
    const c = new Call({ callId: incoming.callId, direction: 'incoming', kind: incoming.kind, peerUserId: incoming.from, chatId: incoming.chatId });
    try { c.decline(); } catch (_) {}
    setIncoming(null);
  }, [incoming]);

  const endCall = useCallback(() => {
    callRef.current?.end('hangup');
    callRef.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    setCall(null);
    clearCurrentCall();
  }, []);

  // Incoming call listener + ringing. CallProvider mounts before
  // authentication completes, so this re-binds the listener every time the
  // user changes (login/reload sets the socket right after setUser). Binding
  // once at mount with a null socket would miss every incoming call:offer and
  // the callee would never see the Answer/Decline banner.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onOffer = ({ callId, from, kind, chatId, sdp }) => {
      if (callRef.current && !callRef.current._ended) {
        socket.emit('call:decline', { to: from, callId });
        return;
      }
      setIncoming({ callId, from, kind, chatId, sdp });
      socket.emit('call:ringing', { to: from, callId });
    };
    socket.on('call:offer', onOffer);
    return () => socket.off('call:offer', onOffer);
  }, [user]);

  const value = {
    call,
    incoming,
    startCall,
    acceptIncoming,
    declineIncoming,
    endCall,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCalls() {
  return useContext(CallContext);
}

export default CallContext;