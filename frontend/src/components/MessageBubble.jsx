import React, { useEffect, useRef, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { IconLock, IconPlay, IconPause, IconEdit, IconCopy, IconForward, IconTrash } from './icons.jsx';

function StatusLabel({ status }) {
  // status: 'sent' | 'delivered' | 'read' — shown as tiny words
  const label = status === 'read' ? 'seen' : status === 'delivered' ? 'received' : 'sent';
  const color = status === 'read' ? 'text-[#53BDEB]' : 'text-gray-500 dark:text-gray-400';
  return <span className={`text-[10px] ${color} shrink-0`}>{label}</span>;
}

function VoiceNote({ url }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => a.duration ? setProgress((a.currentTime / a.duration) * 100) : 0;
    const onEnd = () => { setPlaying(false); setProgress(0); };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('ended', onEnd); };
  }, []);

  return (
    <div className="flex items-center gap-2 min-w-[180px] w-full max-w-[240px]">
      <audio ref={audioRef} src={url} preload="metadata" />
      <button onClick={toggle} className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-sm shrink-0">
        {playing ? <IconPause className="w-[14px] h-[14px]" /> : <IconPlay className="w-[14px] h-[14px]" />}
      </button>
      <div className="flex-1">
        <div className="h-1.5 bg-black/20 rounded-full relative">
          <div className="h-1.5 bg-accent rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-[10px] mt-0.5 opacity-60">Voice note</div>
      </div>
    </div>
  );
}

const menuItem = 'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-[#182229] text-left';

export default function MessageBubble({ message, isMine, senderName, showSender, onAction = null, onEdit = null }) {
  const [menu, setMenu] = useState(null);
  const pressTimer = useRef(null);
  const time = message.created_at ? format(new Date(message.created_at.replace(' ', 'T') + 'Z'), 'HH:mm') : '';
  const isAudio = (message.mediaType && String(message.mediaType).startsWith('audio')) || (message.media_type && String(message.media_type).startsWith('audio'));
  const editable = isMine && !message.failedDecrypt && !!message.body;
  // A message is actionable once its plaintext is available (decrypted or own).
  const actionsAvailable = !message.failedDecrypt && (!!message.body || !!message.mediaUrl);

  const openMenu = useCallback((x, y) => {
    if (!actionsAvailable) return;
    const W = window.innerWidth || 999, H = window.innerHeight || 999;
    setMenu({ x: Math.max(8, Math.min(x, W - 184)), y: Math.max(8, Math.min(y, H - 190)) });
  }, [actionsAvailable]);

  const startPress = (e) => {
    if (!actionsAvailable || menu) return;
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (_) {} }
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => openMenu(e.clientX, e.clientY), 400);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  const onContext = (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY); };

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const fire = (act) => {
    setMenu(null);
    if (onAction) onAction(act, message);
  };

  return (
    <div
      className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'} mb-1.5 px-3 group`}
      onContextMenu={onContext}
      onTouchStart={startPress}
      onTouchMove={cancelPress}
      onTouchEnd={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
    >
      <div
        className={`max-w-[75%] sm:max-w-[65%] rounded-lg px-2.5 py-1.5 shadow-sm relative
          ${isMine ? 'bg-bubbleOut dark:bg-bubbleOutDark' : 'bg-bubbleIn dark:bg-bubbleInDark'}`}
      >
        {showSender && !isMine && (
          <div className="text-xs font-semibold text-accentDark dark:text-accent mb-0.5">{senderName}</div>
        )}
        {message.failedDecrypt && (
          <div className="text-[15px] text-gray-500 dark:text-gray-400 italic flex items-center gap-1.5">
            <IconLock className="w-[15px] h-[15px] shrink-0" /> Could not decrypt this message
          </div>
        )}
        {!message.failedDecrypt && message.mediaUrl && !isAudio && (
          <img
            src={message.mediaUrl}
            alt="attachment"
            className="rounded-md mb-1 max-h-64 object-cover"
          />
        )}
        {!message.failedDecrypt && isAudio && message.mediaUrl && (
          <VoiceNote url={message.mediaUrl} />
        )}
        {!message.failedDecrypt && message.body && (
          <div className="text-[15px] text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
            {message.body}
            {message.edited && <span className="text-[10px] text-gray-400 dark:text-gray-500 italic ml-1.5">(edited)</span>}
          </div>
        )}
        {!message.failedDecrypt && !message.body && !message.mediaUrl && message.encrypted && (
          <div className="text-[15px] text-gray-500 dark:text-gray-400 italic flex items-center gap-1.5">
            <IconLock className="w-[15px] h-[15px] shrink-0" /> Encrypted message
          </div>
        )}
        <div className="flex items-center justify-end gap-1 mt-0.5 ml-6">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">{time}</span>
          {editable && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(message)}
              title="Edit message"
              className="text-gray-400 hover:text-accent transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            >
              <IconEdit className="w-[14px] h-[14px]" />
            </button>
          )}
          {isMine && <StatusLabel status={message.status || 'sent'} />}
        </div>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div
            className="fixed z-50 w-44 rounded-lg overflow-hidden shadow-xl border border-gray-200 dark:border-black/40 bg-white dark:bg-[#233138] py-1"
            style={{ top: menu.y, left: menu.x }}
          >
            {!!message.body && (
              <button onClick={() => fire('copy')} className={menuItem}>
                <IconCopy className="w-[15px] h-[15px] text-gray-500" /> Copy
              </button>
            )}
            {editable && (
              <button onClick={() => fire('edit')} className={menuItem}>
                <IconEdit className="w-[15px] h-[15px] text-gray-500" /> Edit
              </button>
            )}
            {actionsAvailable && (
              <button onClick={() => fire('forward')} className={menuItem}>
                <IconForward className="w-[15px] h-[15px] text-gray-500" /> Forward
              </button>
            )}
            <div className="my-1 border-t border-gray-200 dark:border-white/10" />
            {editable && (
              <button onClick={() => fire('deleteEveryone')} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left">
                <IconTrash className="w-[15px] h-[15px]" /> Delete for everyone
              </button>
            )}
            <button onClick={() => fire('deleteForMe')} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left">
              <IconTrash className="w-[15px] h-[15px]" /> Delete for me
            </button>
          </div>
        </>
      )}
    </div>
  );
}