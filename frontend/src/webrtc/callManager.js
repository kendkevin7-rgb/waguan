import { getSocket } from '../socket.js';
import api from '../api.js';

// Manages WebRTC voice/video calls over the socket.io signaling channel.
//
// Signaling events (all routed through the socket):
//   call:offer    { callId, to, sdp, kind }  ->  { callId, from, chatId, sdp, kind }
//   call:answer   { to, sdp, callId }        ->  { callId, from, sdp }
//   call:ice      { to, candidate, callId }  ->  { callId, from, candidate }
//   call:ringing  { to, callId }             ->  { callId, from }
//   call:accept   { to, callId }             ->  { callId, from }
//   call:hangup   { to, callId }             ->  { callId, from }
//   call:decline  { to, callId }             ->  { callId, from }
//
// Media encryption is handled by WebRTC's built-in SRTP (DTLS-SRTP) which is
// real end-to-end encryption of the audio/video stream.

let current = null;

export class Call {
  constructor({ callId, direction, kind, peerUserId, chatId }) {
    this.callId = callId;
    this.direction = direction;   // 'outgoing' | 'incoming'
    this.kind = kind;             // 'voice' | 'video'
    this.peerUserId = peerUserId;
    this.chatId = chatId;
    this.status = 'connecting';   // 'ringing' | 'connecting' | 'ongoing' | 'ended'
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.handlers = {};
    this._ended = false;
    this.startedAt = null;   // set once the call is answered/connected (for timer)
    this.acceptedAt = null;
    this._negotiating = false;   // mid-call (re)negotiation lock
  }

  on(event, fn) { this.handlers[event] = fn; return this; }
  _emit(event, payload) { this.handlers[event]?.(payload); }

  async _setupPeerConnection() {
    const { data } = await api.get('/webrtc/config');
    this.pc = new RTCPeerConnection({ iceServers: data.iceServers });
    this._iceBuffer = [];
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        getSocket().emit('call:ice', { to: this.peerUserId, candidate: e.candidate, callId: this.callId });
      }
    };
    this.pc.ontrack = (e) => {
      if (!this.remoteStream) this.remoteStream = new MediaStream();
      this.remoteStream.addTrack(e.track);
      this._emit('remoteStream', this.remoteStream);
    };
    // The call is only truly "ongoing" when the media transport is up. SDP
    // exchange alone (offer/answer) says nothing about whether ICE actually
    // connected — without this check the timer ran even when no audio/video
    // could flow (e.g. media blocked or ICE still handshaking).
    this.pc.onconnectionstatechange = () => {
      if (this._ended) return;
      const cs = this.pc.connectionState;
      if (cs === 'connected') {
        if (this.status !== 'ongoing') {
          if (!this.startedAt) this.startedAt = Date.now();
          this.status = 'ongoing';
          this._emit('state', this.status);
        }
      } else if ((cs === 'failed' || cs === 'disconnected') && this.status !== 'ended' && this.status !== 'ongoing') {
        this.fail('Could not establish the call connection');
      }
    };
  }

  async _getLocalStream(video) {
    this.localStream = await navigator.mediaDevices.getUserMedia({ video: video ? { width: 640 } : false, audio: true });
    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
    this._emit('localStream', this.localStream);
  }

  // ---- Outgoing ----
  async startOutgoing(kind) {
    this.status = 'ringing';
    await this._setupPeerConnection();
    await this._getLocalStream(kind === 'video');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    // Ack-aware: if the server refuses the call (offline / busy / not a
    // member), the caller must stop ringing immediately instead of forever.
    await new Promise((resolve) => {
      getSocket().emit(
        'call:offer',
        { to: this.peerUserId, sdp: this.pc.localDescription, callId: this.callId, kind, chatId: this.chatId },
        (ack) => {
          if (ack && ack.error) this.fail(ack.error);
          resolve();
        }
      );
    });
    if (this._ended) return this;
    this._emit('state', this.status);
    return this;
  }

  // Hard-stop a call that can never connect (peer offline / busy / rejected).
  // Keep the object around so the UI can show the reason, but free media.
  fail(message) {
    if (this._ended) return;
    this._ended = true;
    this.status = 'ended';
    this.error = message;
    if (this._iceBuffer) this._iceBuffer = [];
    try {
      this.localStream?.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    try { this.pc?.close(); } catch (_) {}
    this._emit('error', message);
    if (current === this) current = null;
  }

  _flushIce() {
    if (!this._iceBuffer?.length || !this.pc?.remoteDescription) return;
    const pending = this._iceBuffer;
    this._iceBuffer = [];
    pending.forEach((c) => this.handleIce(c));
  }

  async handleAnswer(sdp) {
    if (this._ended) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this._flushIce();
    // Don't declare the call started here — wait for the ICE/media transport
    // to actually connect (onconnectionstatechange sets 'ongoing' + timer).
    this.status = 'connecting';
    this._emit('state', this.status);
  }

  // ---- Incoming ----
  async acceptIncoming() {
    this.status = 'connecting';
    await this._setupPeerConnection();
    await this._getLocalStream(this.kind === 'video');
    getSocket().emit('call:accept', { to: this.peerUserId, callId: this.callId });
    return this;
  }

  async handleOffer(sdp) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this._flushIce();
    getSocket().emit('call:answer', { to: this.peerUserId, sdp: this.pc.localDescription, callId: this.callId });
    // Same as handleAnswer: the call becomes ongoing only when the media
    // transport connects.
    this.status = 'connecting';
    this._emit('state', this.status);
  }

  async handleIce(candidate) {
    if (!this.pc) return;
    // Some browsers reject candidates that arrive before the remote
    // description is set. Buffer them and flush once the SDP lands, so
    // early trickled ICE isn't silently dropped (call fails to connect).
    if (!this.pc.remoteDescription) {
      if (!this._iceBuffer) this._iceBuffer = [];
      this._iceBuffer.push(candidate);
      return;
    }
    try { await this.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
  }

  // Mid-call voice -> video upgrade. Gets a camera track, adds it to the PC,
  // and renegotiates with the peer (does NOT create a new call).
  async enableVideo() {
    if (this._ended) return this;
    if (this.remoteStream && this.remoteStream.getVideoTracks().length) return this;
    if (!this.localStream) return this;
    // Concurrent clicks / simultaneous upgrades on both peers can collide;
    // a single in-flight negotiation lock prevents the SDP race.
    if (this._negotiating) return this;
    this._negotiating = true;
    try {
      let videoTrack = this.localStream.getVideoTracks()[0];
      if (!videoTrack) {
        const ms = await navigator.mediaDevices.getUserMedia({ video: { width: 640 }, audio: false });
        videoTrack = ms.getVideoTracks()[0];
        ms.getAudioTracks().forEach((t) => t.stop());
        this.localStream.addTrack(videoTrack);
        this.pc.addTrack(videoTrack, this.localStream);
      } else if (!this.pc.getSenders().find((s) => s.track === videoTrack)) {
        this.pc.addTrack(videoTrack, this.localStream);
      }
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await new Promise((resolve) => {
        getSocket().emit(
          'call:renegotiate',
          { to: this.peerUserId, sdp: this.pc.localDescription, callId: this.callId },
          (ack) => resolve(ack || {})
        );
      });
      this._emit('videoEnabled');
    } catch (e) {
      console.error('video upgrade failed', e);
    } finally {
      this._negotiating = false;
    }
    return this;
  }

  // Incoming: peer upgraded voice -> video, apply their new offer.
  async handleRenegotiate(sdp) {
    if (this._ended) return;
    // Perfect-negotiation fallback: if we fired our own upgrade at the same
    // time, roll back our pending local offer and answer theirs instead of
    // crashing on "cannot create answer in a state other than have-remote-offer".
    try {
      if (this.pc.signalingState === 'have-local-offer') {
        await this.pc.setLocalDescription({ type: 'rollback' });
      }
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      this._flushIce();
      getSocket().emit('call:answer', { to: this.peerUserId, sdp: this.pc.localDescription, callId: this.callId });
      this._emit('peerVideo');
    } catch (e) {
      console.error('renegotiation failed', e);
    }
  }

  sendReact(emoji) {
    if (this._ended) return;
    getSocket().emit('call:react', { to: this.peerUserId, callId: this.callId, emoji });
    this._emit('react', { emoji, self: true });
  }

  end(cause = 'hangup', notifyPeer = true) {
    if (this._ended) return;
    // Before tearing down, make sure no late signaling can resurrect it.
    this._teardown(notifyPeer ? 'call:hangup' : null);
  }

  decline() {
    this._teardown('call:decline');
  }

  _teardown(signalEvent) {
    if (this._ended) return;
    this._ended = true;
    if (signalEvent) getSocket().emit(signalEvent, { to: this.peerUserId, callId: this.callId });
    this.status = 'ended';
    if (this._iceBuffer) this._iceBuffer = [];
    try {
      this.localStream?.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    try { this.pc?.close(); } catch (_) {}
    const cause = signalEvent === 'call:decline' ? 'declined' : 'ended';
    this._emit('ended', cause);
    if (current === this) current = null;
  }
}

function randomId() {
  return `call_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// Start an outgoing call and register it as the current call.
export async function makeCall({ peerUserId, kind, chatId }) {
  if (current) current.end('cancelled', true);
  const call = new Call({ callId: randomId(), direction: 'outgoing', kind, peerUserId, chatId });
  current = call;
  await call.startOutgoing(kind);
  return call;
}

export function getCurrentCall() { return current; }
export function clearCurrentCall() { current = null; }

// Wire the socket listeners for a call lifecycle. Returns cleanup fn.
export function registerCallHandlers(call, hooks) {
  const socket = getSocket();
  if (!socket) return () => {};
  const cleanup = [];

  const offs = [
    ['call:answer', ({ callId, sdp }) => { if (callId === call.callId) call.handleAnswer(sdp).catch(console.error); }],
    ['call:ice', ({ callId, candidate }) => { if (callId === call.callId) call.handleIce(candidate).catch(console.error); }],
    ['call:hangup', ({ callId }) => { if (callId === call.callId) call.end('hangup', false); }],
    ['call:decline', ({ callId }) => { if (callId === call.callId) call.end('declined', false); }],
    ['call:renegotiate', ({ callId, sdp }) => { if (callId === call.callId) call.handleRenegotiate(sdp).catch(console.error); }],
    ['call:react', ({ callId, emoji, from }) => { if (callId === call.callId) call._emit('react', { emoji, self: false, from }); }],
  ];
  offs.forEach(([ev, fn]) => { socket.on(ev, fn); cleanup.push(() => socket.off(ev, fn)); });

  return () => cleanup.forEach((u) => u());
}

export function callRinging(call) {
  getSocket().emit('call:ringing', { to: call.peerUserId, callId: call.callId });
}
