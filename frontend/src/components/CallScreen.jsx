import React, { useEffect, useState, useRef } from 'react';
import { IconMic, IconMicOff, IconCamOff, IconHangup, IconVideo, IconCall } from './icons.jsx';
import { startRing, stopRing } from '../webrtc/tones.js';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥', '🎉'];

export default function CallScreen({ call, onEnd, displayName }) {
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(call?.kind !== 'voice');
  const [state, setState] = useState(call?.status || 'connecting');
  const [errorMsg, setErrorMsg] = useState(call?.error || null);
  const [elapsed, setElapsed] = useState(0);
  const [reactions, setReactions] = useState([]);       // [{ id, emoji, self }]
  const [showReactions, setShowReactions] = useState(false);
  const reactId = useRef(0);

  useEffect(() => {
    if (!call) return;
    call.on('localStream', setLocalStream);
    call.on('remoteStream', setRemoteStream);
    call.on('state', setState);
    call.on('error', (m) => {
      setErrorMsg(m);
      setRemoteStream(null);
      setLocalStream(null);
    });
    call.on('videoEnabled', () => setCamOn(true));
    call.on('peerVideo', () => setCamOn(true));
    call.on('react', ({ emoji, self }) => {
      const id = ++reactId.current;
      setReactions((r) => [...r, { id, emoji, self }]);
      setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 2200);
    });
    call.on('ended', () => onEnd());
    if (call.error) setErrorMsg(call.error);
    return () => {
      call.on('localStream', null);
      call.on('remoteStream', null);
      call.on('state', null);
      call.on('error', null);
      call.on('videoEnabled', null);
      call.on('peerVideo', null);
      call.on('react', null);
      call.on('ended', null);
    };
  }, [call, onEnd]);

  // Live elapsed timer while the call is connected.
  useEffect(() => {
    if (state !== 'ongoing') return;
    const start = call?.startedAt || Date.now();
    setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000)));
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - start) / 1000))), 1000);
    return () => clearInterval(t);
  }, [state, call]);

  // Track whether we should be showing a camera preview: video calls start with
  // video; voice calls set this true only when upgraded to video mid-call.
  useEffect(() => {
    if (call?.kind !== 'voice' || (localStream && localStream.getVideoTracks().length)) {
      setCamOn(true);
    }
  }, [call, localStream]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      call?.localStream?.getAudioTracks().forEach((t) => { t.enabled = !next; });
      return next;
    });
  };

  const toggleCam = () => {
    const next = !camOn;
    setCamOn(next);
    if (call?.kind === 'video') {
      call.localStream?.getVideoTracks().forEach((t) => { t.enabled = next; });
    }
  };

  const upgradeToVideo = () => { call?.enableVideo().catch(console.error); };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  // Outgoing ring tone while the other side is ringing (stops on connect,
  // error, or hangup — cleaned up on unmount too).
  useEffect(() => {
    if (state === 'ringing') startRing({ freq: 440, pattern: [0.5, 0.3, 0.5, 1.3] });
    else stopRing();
    return () => stopRing();
  }, [state]);

  const ongoing = state === 'ongoing' || state === 'connecting';
  const label = errorMsg
    ? 'Call not connected'
    : state === 'ringing' ? 'Ringing…'
    : state === 'connecting' ? 'Connecting…'
    : ongoing ? fmt(elapsed)
    : 'Call ended';

  return (
    <div className="fixed inset-0 z-50 bg-[#0b141a] text-white flex flex-col">
      {/* Remote video */}
      <div className="flex-1 relative overflow-hidden">
        {remoteStream && remoteStream.getVideoTracks().length > 0 ? (
          <video autoPlay playsInline ref={(el) => { if (el) el.srcObject = remoteStream; }} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto rounded-full bg-white/10 flex items-center justify-center mb-4">
                <IconCall className="w-[48px] h-[48px]" />
              </div>
              <div className="text-xl font-medium">{errorMsg ? 'Call ended' : (displayName || 'Calling…')}</div>
              <div className={`text-sm mt-1 ${errorMsg ? 'text-red-400' : 'text-white/60'}`}>{errorMsg || label}</div>
            </div>
          </div>
        )}

        {/* Local video PiP */}
        {camOn && localStream && localStream.getVideoTracks().length > 0 && (
          <video
            autoPlay playsInline muted
            ref={(el) => { if (el) el.srcObject = localStream; }}
            className="absolute bottom-4 right-4 w-32 h-44 object-cover rounded-lg border border-white/20 bg-black"
          />
        )}

        {/* Reaction "bubbles" */}
        {reactions.map((r) => (
          <div
            key={r.id}
            className="absolute left-1/2 top-1/3 -translate-x-1/2 text-6xl animate-bounce pointer-events-none"
          >
            {r.emoji}
          </div>
        ))}

        {/* Timer badge */}
        {ongoing && !errorMsg && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-sm">
            {fmt(elapsed)}
          </div>
        )}

        {/* Reaction picker */}
        {showReactions && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex gap-2 bg-black/80 rounded-full px-3 py-2">
            {REACTIONS.map((e) => (
              <button key={e} className="text-2xl hover:scale-125 transition-transform" onClick={() => { call?.sendReact(e); setShowReactions(false); }}>
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="pb-8 pt-2 flex items-center justify-center gap-6">
        <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? 'bg-white text-black' : 'bg-white/10'}`} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <IconMicOff className="w-[24px] h-[24px]" /> : <IconMic className="w-[24px] h-[24px]" />}
        </button>
        {call?.kind === 'video' ? (
          <button onClick={toggleCam} className={`w-14 h-14 rounded-full flex items-center justify-center ${camOn ? 'bg-white/10' : 'bg-white text-black'}`} title="Toggle camera">
            {camOn ? <IconVideo className="w-[24px] h-[24px]" /> : <IconCamOff className="w-[24px] h-[24px]" />}
          </button>
        ) : (
          <button onClick={upgradeToVideo} className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10" title="Switch to video">
            <IconVideo className="w-[24px] h-[24px]" />
          </button>
        )}
        <button onClick={() => setShowReactions((s) => !s)} className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10" title="Send reaction">
          <span className="text-2xl">😀</span>
        </button>
        <button onClick={onEnd} className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center" title="End call">
          <IconHangup className="w-[28px] h-[28px]" />
        </button>
      </div>
    </div>
  );
}
