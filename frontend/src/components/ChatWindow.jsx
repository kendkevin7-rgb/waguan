import React, { useEffect, useRef, useState, useMemo } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import MessageBubble from './MessageBubble.jsx';
import ProfilePanel from './ProfilePanel.jsx';
import api from '../api.js';
import { getSocket } from '../socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCrypto } from '../context/CryptoContext.jsx';
import { usePermissions } from '../context/PermissionsContext.jsx';
import { IconCall, IconVideo, IconPaperclip, IconMic, IconSend, IconEdit, IconEllipsis, IconSun, IconMoon, IconEmoji } from './icons.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import ImageSection from './ImageSection.jsx';

function dateLabel(dateStr) {
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

function useDeletedForMe(chatId) {
  const [deletedForMeIds, setDeletedForMeIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`tomb:${chatId}`) || '[]')); } catch (_) { return new Set(); }
  });
  const toggleDeleteForMe = (messageId) => {
    setDeletedForMeIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      try { localStorage.setItem(`tomb:${chatId}`, JSON.stringify(Array.from(next))); } catch (_) {}
      return next;
    });
  };
  return { deletedForMeIds, toggleDeleteForMe };
}

export default function ChatWindow({ chat, messages, setMessages, typingUsers, onlineUserIds, onVoiceCall, onVideoCall, darkMode, setDarkMode, chats, onBlockChange }) {
  const { user } = useAuth();
  const { ensure: ensurePerm } = usePermissions();
  const { encryptForPeer } = useCrypto();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editText, setEditText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showImageSection, setShowImageSection] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const typingTimeout = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  const otherUser = !chat.is_group ? chat.members?.find((m) => m.id !== user.id) : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, chat.id]);

  // Mark unread messages as read when opening / receiving
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const unreadIds = messages.filter((m) => m.sender_id !== user.id && m.status !== 'read').map((m) => m.id);
    if (unreadIds.length > 0) {
      socket.emit('message:read', { chatId: chat.id, messageIds: unreadIds });
    }
  }, [messages, chat.id, user.id]);

  // "Delete for me" hide-list — persisted locally so hidden messages stay
  // hidden after a refresh (the server copy stays for the other person).
  const { deletedForMeIds, toggleDeleteForMe } = useDeletedForMe(chat.id);

  const grouped = useMemo(() => {
    // Edits arrive as new encrypted messages pointing back at their original
    // (edited_message_id). We fold them in-place so the original bubble shows
    // the edit's plaintext + an "(edited)" marker.
    const edits = new Map();
    const originals = new Set();
    messages.forEach((m) => {
      if (m.edited_message_id) edits.set(m.edited_message_id, m);
      else originals.add(m.id);
    });
    const groups = [];
    let lastDate = null;
    messages.forEach((m) => {
      if (deletedForMeIds.has(m.id)) return;
      if (m.edited_message_id && originals.has(m.edited_message_id)) return; // folded below
      const edit = edits.get(m.id);
      const dateKey = String(m.created_at || '').slice(0, 10);
      if (dateKey !== lastDate) {
        groups.push({ type: 'date', key: `d-${dateKey}`, label: dateLabel(m.created_at) });
        lastDate = dateKey;
      }
      const display = edit
        ? { ...m, body: edit.decrypted && edit.body != null ? edit.body : m.body, edited: true }
        : m;
      groups.push({ type: 'message', key: `m-${m.id}`, message: display });
    });
    return groups;
  }, [messages, deletedForMeIds]);

  const senderName = (senderId) => chat.members?.find((m) => m.id === senderId)?.name || 'Unknown';

  const handleTyping = (val) => {
    setText(val);
    const socket = getSocket();
    if (!socket) return;
    socket.emit('typing:start', { chatId: chat.id });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('typing:stop', { chatId: chat.id });
    }, 1500);
  };

  const sendMessage = async (extra = {}) => {
    const body = text.trim();
    if ((!body && !extra.mediaUrl) || sending) return;
    const socket = getSocket();
    setSending(true);
    try {
      if (!chat.is_group && otherUser) {
        // ---- E2E encrypted 1:1 message ----
        // Encrypt the plaintext (or the media URL) with a per-peer session
        // before it leaves the device. The server stores only ciphertext.
        const isMedia = !!extra.mediaUrl;
        const plaintext = isMedia ? extra.mediaUrl : body;
        const type = isMedia ? (extra.mediaType?.startsWith('audio') ? 'audio' : 'media') : 'text';
        const packet = await encryptForPeer(otherUser.id, plaintext, type);
        socket.emit(
          'message:send',
          { chatId: chat.id, ciphertext: packet.ciphertext, iv: packet.iv, n: packet.n, senderDeviceId: null, ratchetHeader: JSON.stringify({ iv: packet.iv, n: packet.n }) },
          (res) => {
            if (res?.message) {
              // The server only echoes ciphertext; we already know our own
              // plaintext, so render it locally.
              const shown = { ...res.message, body: isMedia ? undefined : plaintext, mediaUrl: isMedia ? plaintext : undefined, mediaType: extra.mediaType, decrypted: true, e2e: true };
              setMessages((prev) => [...prev, shown]);
              // Cache own plaintext so it survives re-open (server stores
              // body=null for ciphertext messages).
              try { localStorage.setItem(`own:${chat.id}:${res.message.id}`, JSON.stringify({ body: plaintext, type })); } catch (_) {}
            }
          }
        );
      } else {
        // Group chat: plaintext path (E2E per-member is future work).
        socket.emit('message:send', { chatId: chat.id, body: body || null, ...extra }, (res) => {
          if (res?.message) setMessages((prev) => [...prev, res.message]);
        });
      }
      setText('');
      setShowEmoji(false);
      setShowImageSection(false);
      socket.emit('typing:stop', { chatId: chat.id });
    } catch (err) {
      console.error('Failed to send encrypted message', err);
    } finally {
      setSending(false);
    }
  };

  const startEdit = (message) => {
    if (!message.edited && message.body) {
      setEditing(message);
      setEditText(message.body);
    }
  };

  const saveEdit = async () => {
    const newText = editText.trim();
    if (!newText || !editing || sending) return;
    const socket = getSocket();
    setSending(true);
    try {
      if (!chat.is_group && otherUser) {
        const packet = await encryptForPeer(otherUser.id, newText, 'text');
        socket.emit(
          'message:edit',
          { chatId: chat.id, messageId: editing.id, ciphertext: packet.ciphertext, iv: packet.iv, n: packet.n, ratchetHeader: JSON.stringify({ iv: packet.iv, n: packet.n }) },
          (res) => {
            if (res?.message) {
              // Cache our own edit plaintext so the fold-in still works after a refresh.
              try { localStorage.setItem(`own:${chat.id}:${res.message.id}`, JSON.stringify({ body: newText, type: 'text' })); } catch (_) {}
              const shown = { ...res.message, body: newText, decrypted: true, e2e: true };
              setMessages((prev) => [...prev.map((m) => (m.id === editing.id ? { ...m, edited: true } : m)), shown]);
            }
          }
        );
      }
    } catch (err) {
      console.error('Failed to save edit', err);
    } finally {
      setSending(false);
    }
    setEditing(null);
    setEditText('');
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditText('');
  };

  // Insert an emoji at the current cursor position while keeping focus.
  const insertEmoji = (ch) => {
    const el = textInputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + ch + text.slice(end);
    setText(next);
    handleTyping(next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + ch.length;
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    });
  };

  const toggleEmoji = () => {
    setShowEmoji((s) => !s);
    if (showImageSection) setShowImageSection(false);
  };

  const toggleImageSection = () => {
    setShowImageSection((s) => !s);
    if (showEmoji) setShowEmoji(false);
  };

  const sendImage = (url, mediaType) => {
    setShowImageSection(false);
    sendMessage({ mediaUrl: url, mediaType: mediaType || 'image/jpeg' });
  };

  const clearChat = () => {
    if (!window.confirm('Delete all messages in this chat for both of you? This cannot be undone.')) return;
    setShowMenu(false);
    try {
      getSocket().emit('chat:clear', { chatId: chat.id }, (ack) => {
        if (ack?.error) {
          console.error('Clear chat failed', ack.error);
          alert(ack.error);
        }
      });
    } catch (err) {
      console.error('Clear chat failed', err);
    }
  };

  const isBlocked = chat.blocked || chat.blocked_me;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isBlocked) return;
    if (editing) saveEdit();
    else sendMessage();
  };

  // ---- Message actions (long-press / right-click menu) ----
  const handleCopy = (text) => {
    try { navigator.clipboard?.writeText(text); } catch (_) {}
  };

  const handleDeleteForEveryone = (message) => {
    if (!window.confirm('Delete this message for both of you?')) return;
    getSocket().emit('message:delete', { chatId: chat.id, messageId: message.id }, (ack) => {
      if (ack?.error) {
        console.error('Delete failed', ack.error);
        alert(ack.error);
      }
    });
  };

  const handleDeleteForMe = (message) => {
    toggleDeleteForMe(message.id);
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
  };

  const performForward = async (target) => {
    const msg = forwardMsg;
    setForwardMsg(null);
    if (!msg) return;
    const peer = !target.is_group ? target.members?.find((m) => m.id !== user.id) : null;
    if (!peer) return;
    const socket = getSocket();
    try {
      const isMedia = !!msg.mediaUrl;
      const plaintext = isMedia ? msg.mediaUrl : msg.body;
      const mtype = isMedia ? (String(msg.mediaType || msg.media_type || '').startsWith('audio') ? 'audio' : 'media') : 'text';
      if (!plaintext) return;
      const packet = await encryptForPeer(peer.id, plaintext, mtype);
      socket.emit(
        'message:send',
        { chatId: target.id, ciphertext: packet.ciphertext, iv: packet.iv, n: packet.n, senderDeviceId: null, ratchetHeader: JSON.stringify({ iv: packet.iv, n: packet.n }), mediaType: isMedia ? (msg.mediaType || msg.media_type || undefined) : undefined },
        (res) => {
          if (res?.message) {
            try { localStorage.setItem(`own:${target.id}:${res.message.id}`, JSON.stringify({ body: plaintext, type: mtype })); } catch (_) {}
          }
        }
      );
    } catch (err) {
      console.error('Forward failed', err);
    }
  };

  const handleAction = (action, message) => {
    if (action === 'copy') handleCopy(message.body);
    else if (action === 'edit') startEdit(message);
    else if (action === 'forward') setForwardMsg(message);
    else if (action === 'deleteEveryone') handleDeleteForEveryone(message);
    else if (action === 'deleteForMe') handleDeleteForMe(message);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/chats/upload', formData);
      sendMessage({ mediaUrl: data.url, mediaType: data.type });
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // ---- Voice notes (MediaRecorder) ----
  const mediaTypeFor = (blob) => blob.type || 'audio/webm';

  const startRecording = async () => {
    try {
      if (!(await ensurePerm('mic'))) {
        alert('Waguan needs microphone permission to record voice notes. Allow it in Settings → Permissions.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : '';
      if (!mime) { console.error('No supported audio MIME type'); return; }
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onerror = (e) => {
        console.error('MediaRecorder error', e);
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        setRecordTime(0);
      };
      recorder.onstop = () => {
        try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
        const blob = new Blob(chunksRef.current, { type: mime });
        setRecording(false);
        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        setRecordTime(0);
        if (blob.size > 0) {
          uploadVoiceNote(blob);
        } else {
          console.warn('Voice note blob is empty — no audio data recorded');
        }
      };
      // Use a 1-second timeslice so dataavailable fires reliably across browsers
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
      setRecordTime(0);
      recordTimerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000);
    } catch (err) {
      console.error('Failed to start recording', err);
      setRecording(false);
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    try { rec.stop(); } catch (e) { console.error('stop() failed', e); }
  };

  const uploadVoiceNote = async (blob) => {
    setUploading(true);
    try {
      const formData = new FormData();
      const ext = blob.type === 'audio/mp4' ? '.m4a' : '.webm';
      formData.append('file', blob, `voice${ext}`);
      const { data } = await api.post('/chats/upload', formData);
      if (!data?.url) throw new Error('Upload returned no URL');
      await sendMessage({ mediaUrl: data.url, mediaType: mediaTypeFor(blob) });
    } catch (err) {
      console.error('Failed to upload voice note', err);
    } finally {
      setUploading(false);
    }
  };

  const isTyping = typingUsers.size > 0;
  const isOnline = otherUser ? onlineUserIds.has(otherUser.id) : false;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-panel dark:bg-panelDark shrink-0">
        <button onClick={() => setShowProfile(true)} className="flex items-center gap-3 min-w-0 text-left">
        <img
          src={chat.display_avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${chat.display_name}`}
          alt={chat.display_name}
          className="w-10 h-10 rounded-full bg-gray-300"
        />
        <div className="min-w-0">
          <div className="text-white font-medium truncate">{chat.display_name}</div>
          <div className="text-xs text-white/70 truncate">
            {chat.blocked ? 'Blocked' : chat.blocked_me ? "You're blocked" : isTyping ? 'typing…' : chat.is_group ? `${chat.members?.length || 0} members` : isOnline ? 'online' : 'offline'}
          </div>
        </div>
      </button>
        {!chat.is_group && (
          <div className="flex items-center gap-1 ml-auto">
            <button onClick={onVoiceCall} disabled={isBlocked} title={isBlocked ? 'Blocked' : 'Voice call'} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-white disabled:opacity-30">
              <IconCall className="w-[20px] h-[20px]" />
            </button>
            <button onClick={onVideoCall} disabled={isBlocked} title={isBlocked ? 'Blocked' : 'Video call'} className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-white disabled:opacity-30">
              <IconVideo className="w-[20px] h-[20px]" />
            </button>
          </div>
        )}
        {!chat.is_group && (
          <div className="ml-1 relative">
            <button onClick={() => setShowMenu((s) => !s)} title="Chat settings" className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-white">
              <IconEllipsis className="w-[20px] h-[20px]" />
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-10 z-30 w-52 rounded-lg shadow-lg bg-white dark:bg-[#233138] border border-gray-200 dark:border-black/30 overflow-hidden">
                  <button
                    onClick={() => setDarkMode((d) => !d)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-[#182229]"
                  >
                    {darkMode ? <IconSun className="w-[18px] h-[18px]" /> : <IconMoon className="w-[18px] h-[18px]" />}
                    {darkMode ? 'Light mode' : 'Dark mode'}
                  </button>
                  <button
                    onClick={clearChat}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Clear chat
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {(chat.blocked || chat.blocked_me) && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-b border-gray-200 dark:border-black/40 shrink-0">
          <span>
            {chat.blocked
              ? `You blocked ${chat.display_name}. They can't message or call you.`
              : `You can't message or call ${chat.display_name} until they unblock you.`}
          </span>
          {chat.blocked && (
            <button onClick={() => onBlockChange?.(chat.id, false)} className="underline font-semibold whitespace-nowrap">
              Unblock
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto chat-bg-pattern py-3">
        {grouped.map((item) =>
          item.type === 'date' ? (
            <div key={item.key} className="flex justify-center my-3">
              <span className="bg-white/80 dark:bg-[#182229] text-xs text-gray-600 dark:text-gray-300 px-3 py-1 rounded-lg shadow-sm">
                {item.label}
              </span>
            </div>
          ) : (
            <MessageBubble
              key={item.key}
              message={item.message}
              isMine={Number(item.message.sender_id) === Number(user.id)}
              senderName={senderName(item.message.sender_id)}
              showSender={chat.is_group && item.message.sender_id !== user.id}
              onEdit={startEdit}
              onAction={handleAction}
            />
          )
        )}
        <div ref={bottomRef} />
      </div>

      {editing && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#333D46] dark:bg-[#202C33] shrink-0">
          <IconEdit className="w-[16px] h-[16px] text-accent shrink-0" />
          <span className="text-sm text-gray-300 shrink-0">Editing</span>
          <form
            className="flex-1 flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); saveEdit(); }}
          >
            <input
              autoFocus
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-full bg-white/90 dark:bg-[#2A3942] text-sm text-gray-900 dark:text-white outline-none"
            />
            <button type="submit" disabled={sending} className="text-accent font-medium text-sm shrink-0 px-1">Save</button>
            <button type="button" onClick={cancelEdit} className="text-gray-400 text-sm shrink-0 px-1">Cancel</button>
          </form>
        </div>
      )}

      {(showEmoji || showImageSection) && (
        <div className="relative z-10 shrink-0">
          {showEmoji && (
            <div className="absolute bottom-full right-2 mb-1 w-[340px] max-w-[calc(100vw-24px)]">
              <EmojiPicker onPick={(ch) => { insertEmoji(ch); }} darkMode={darkMode} />
            </div>
          )}
          {showImageSection && (
            <div className="absolute bottom-full right-16 mb-1 w-[360px] max-w-[calc(100vw-24px)]">
              <ImageSection
                messages={messages}
                onUpload={async () => {
                // Files & media + Storage must be allowed to attach media.
                if (await ensurePerm(['files', 'storage'])) fileInputRef.current?.click();
              }}
                onSendImage={sendImage}
                darkMode={darkMode}
              />
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2.5 bg-[#F0F2F5] dark:bg-[#202C33] shrink-0">
        {recording ? (
          <div className="flex items-center gap-3 flex-1 bg-white dark:bg-[#2A3942] rounded-full px-4 py-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-sm text-red-500 font-medium tabular-nums">{Math.floor(recordTime / 60)}:{String(recordTime % 60).padStart(2, '0')}</span>
            <span className="text-sm text-gray-500 dark:text-gray-300 flex-1">Recording voice note…</span>
            <button type="button" onClick={stopRecording} disabled={uploading} className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center shrink-0">
              {uploading ? '…' : <IconSend className="w-[18px] h-[18px]" />}
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleEmoji}
              disabled={uploading}
              title="Emojis"
              className={`text-[22px] px-1 flex items-center rounded-lg ${
                showEmoji ? 'text-accent bg-accent/10' : 'text-gray-500 dark:text-gray-300'
              }`}
            >
              <IconEmoji className="w-[22px] h-[22px]" />
            </button>
            <button
              type="button"
              onClick={toggleImageSection}
              disabled={uploading}
              title="Image section"
              className={`text-[22px] px-1 flex items-center rounded-lg ${
                showImageSection ? 'text-accent bg-accent/10' : 'text-gray-500 dark:text-gray-300'
              }`}
            >
              <IconPaperclip className="w-[22px] h-[22px]" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
            <input
              ref={textInputRef}
              type="text"
              value={text}
              onChange={(e) => handleTyping(e.target.value)}
              placeholder={isBlocked ? "You can't send messages to this contact" : uploading ? 'Uploading…' : 'Type a message'}
              disabled={uploading || isBlocked}
              className="flex-1 px-4 py-2.5 rounded-full bg-white dark:bg-[#2A3942] text-sm text-gray-900 dark:text-white outline-none disabled:opacity-60"
            />
            {!text.trim() && !uploading ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={isBlocked}
                title="Record voice note"
                className="w-10 h-10 rounded-full bg-accent hover:bg-accentDark disabled:opacity-30 flex items-center justify-center text-white shrink-0"
              >
                <IconMic className="w-[20px] h-[20px]" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={(!text.trim() && !uploading) || sending || isBlocked}
                className="w-10 h-10 rounded-full bg-accent hover:bg-accentDark disabled:opacity-40 flex items-center justify-center text-white shrink-0"
              >
                {sending ? '…' : <IconSend className="w-[20px] h-[20px]" />}
              </button>
            )}
          </>
        )}
      </form>

      {showProfile && (
        <div className="fixed inset-0 z-40 bg-black/20 flex justify-end">
          <ProfilePanel chat={chat} darkMode={darkMode} setDarkMode={setDarkMode} onClose={() => setShowProfile(false)} onBlockChange={onBlockChange} />
        </div>
      )}

      {forwardMsg && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#111B21] rounded-2xl overflow-hidden shadow-xl max-h-[70vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-black/40 font-medium text-gray-900 dark:text-gray-50">
              Forward to…
            </div>
            <div className="flex-1 overflow-y-auto">
              {chats.filter((c) => c.id !== chat.id).map((c) => (
                <button key={c.id} onClick={() => performForward(c)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-[#202C33]">
                  <img
                    src={c.display_avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${c.display_name}`}
                    alt={c.display_name}
                    className="w-10 h-10 rounded-full bg-gray-300"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.display_name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {c.last_message?.body || (c.last_message?.media_url ? 'Media' : 'No messages')}
                    </div>
                  </div>
                </button>
              ))}
              {!chats.some((c) => c.id !== chat.id) && (
                <div className="px-4 py-6 text-sm text-gray-500 text-center">No other chats to forward to</div>
              )}
            </div>
            <button onClick={() => setForwardMsg(null)} className="w-full py-3 text-sm text-accent font-medium border-t border-gray-200 dark:border-black/40">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
