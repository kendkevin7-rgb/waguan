import React, { useEffect } from 'react';
import { IconCall } from './icons.jsx';
import { startRing, stopRing } from '../webrtc/tones.js';

export default function IncomingCall({ incoming, displayName, onAccept, onDecline }) {
  // Ring while the banner is shown; stops automatically on accept/decline (unmount).
  useEffect(() => {
    startRing({ freq: 660, pattern: [0.4, 0.25, 0.4, 1.0] });
    return () => stopRing();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-[#0b141a] text-white rounded-2xl p-8 w-80 text-center shadow-2xl">
        <div className="w-24 h-24 mx-auto rounded-full bg-white/10 flex items-center justify-center mb-4">
          <IconCall className="w-[48px] h-[48px]" />
        </div>
        <div className="text-xl font-medium mb-1">Incoming {incoming?.kind === 'video' ? 'video' : 'voice'} call</div>
        <div className="text-white/60 mb-6">{displayName}</div>
        <div className="flex justify-center gap-10">
          <button onClick={onDecline} className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center" title="Decline">
            <IconCall className="w-[24px] h-[24px]" />
          </button>
          <button onClick={onAccept} className="w-14 h-14 rounded-full bg-green-600 flex items-center justify-center" title="Accept">
            <IconCall className="w-[24px] h-[24px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
