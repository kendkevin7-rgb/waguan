import React, { useEffect, useState, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import api from '../api.js';
import { getSocket } from '../socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCrypto } from '../context/CryptoContext.jsx';
import { useCalls } from '../context/CallContext.jsx';
import CallScreen from '../components/CallScreen.jsx';
import IncomingCall from '../components/IncomingCall.jsx';
import { useEncryptedMessages } from '../hooks/useEncryptedMessages.js';
import PermissionOnboarding from '../components/PermissionOnboarding.jsx';
import Settings from './Settings.jsx';

export default function Chat() {
  const { user } = useAuth();
  const { ready: e2eReady } = useCrypto();
  const calls = useCalls();
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [typingByChat, setTypingByChat] = useState({}); // chatId -> Set(userId)
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('waguan_theme') === 'dark'; } catch (_) { return false; }
  });
  const [showSettings, setShowSettings] = useState(false);
  // First-run device-permissions onboarding (shown once per device+account).
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem('waguan_perms_seen_' + (user?.id || '')) !== '1'; } catch (_) { return false; }
  });
  const closeOnboarding = () => {
    try { localStorage.setItem('waguan_perms_seen_' + user.id, '1'); } catch (_) {}
    setShowOnboarding(false);
  };
  const activeChatRef = useRef(null);

  activeChatRef.current = activeChat;

  const { decryptAndMerge, decryptMessage } = useEncryptedMessages({ chat: activeChat, messages, setMessages, user });

  // Re-decrypt the open chat's messages whenever crypto becomes ready (e.g.
  // right after a page refresh where bootstrap may still be in-flight).
  useEffect(() => {
    if (!e2eReady || !activeChat || activeChat.is_group) return;
    decryptAndMerge(activeChat, messages).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e2eReady, activeChat?.id]);

  const loadChats = useCallback(async () => {
    const { data } = await api.get('/chats');
    setChats(data.chats);
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  useEffect(() => {
    try { localStorage.setItem('waguan_theme', darkMode ? 'dark' : 'light'); } catch (_) {}
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const openChat = useCallback(async (chat) => {
    setActiveChat(chat);
    const { data } = await api.get(`/chats/${chat.id}/messages`);
    setMessages(data.messages);
    // Decrypt any E2E-encrypted backlog in the background. Not gated on
    // e2eReady: if crypto isn't ready yet, decryptAndMerge fails gracefully
    // and a separate effect re-decrypts once crypto is ready.
    if (!chat.is_group && activeChatRef.current?.id !== chat.id) {
      decryptAndMerge(chat, data.messages);
    }
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, unread_count: 0 } : c)));
    const socket = getSocket();
    socket?.emit('chat:join', chat.id);
  }, [decryptAndMerge]);

  // Persist block/unblock state into the chats list so UI banners update live.
  const handleBlockChange = useCallback((chatId, blocked) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, blocked } : c));
  }, []);

  // Open a chat from the Call history "Message" action.
  const openCallAsChat = useCallback(async (chatId) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) openChat(chat);
  }, [chats, openChat]);

  const handleChatCreated = useCallback((chat) => {
    setChats((prev) => {
      const exists = prev.find((c) => c.id === chat.id);
      if (exists) return prev;
      let displayName = chat.name;
      let displayAvatar = chat.avatar_url;
      if (!chat.is_group) {
        const other = chat.members.find((m) => m.id !== user.id);
        displayName = other?.name || 'Unknown';
        displayAvatar = other?.avatar_url;
      }
      return [{ ...chat, display_name: displayName, display_avatar: displayAvatar, last_message: null, unread_count: 0 }, ...prev];
    });
    openChat(chat);
  }, [openChat, user.id]);

  // Socket event wiring
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNewMessage = ({ chatId, message }) => {
      const isActive = activeChatRef.current?.id === chatId;
      const chatObj = isActive ? activeChatRef.current : null;
      if (!isActive) {
        // Not viewing this chat: nothing to render here; it will be decrypted
        // on open. Just update the list.
      } else if (message.ciphertext && !message.decrypted) {
        // Active E2E message: decrypt then append.
        decryptAndMerge(chatObj, [message]).catch(console.error);
      } else {
        setMessages((prev) => (prev.find((m) => m.id === message.id) ? prev : [...prev, message]));
      }
      setChats((prev) => {
        const idx = prev.findIndex((c) => c.id === chatId);
        if (idx === -1) {
          loadChats();
          return prev;
        }
        const updated = [...prev];
        const chat = { ...updated[idx], last_message: message };
        if (!isActive && message.sender_id !== user.id) {
          chat.unread_count = (chat.unread_count || 0) + 1;
        }
        updated.splice(idx, 1);
        return [chat, ...updated];
      });
    };

    const onPresence = ({ userId, isOnline }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });
    };

    // Full presence snapshot sent on connect — lets us know right away which
    // contacts are online, even if they connected before us.
    const onPresenceSnapshot = ({ onlineUserIds }) => {
      setOnlineUserIds(new Set(onlineUserIds));
    };

    const onTypingStart = ({ chatId, userId }) => {
      setTypingByChat((prev) => {
        const set = new Set(prev[chatId] || []);
        set.add(userId);
        return { ...prev, [chatId]: set };
      });
    };

    const onTypingStop = ({ chatId, userId }) => {
      setTypingByChat((prev) => {
        const set = new Set(prev[chatId] || []);
        set.delete(userId);
        return { ...prev, [chatId]: set };
      });
    };

    const onMessageRead = ({ chatId, messageIds }) => {
      if (activeChatRef.current?.id === chatId) {
        setMessages((prev) =>
          prev.map((m) => (messageIds.includes(m.id) ? { ...m, status: 'read' } : m))
        );
      }
    };

    const onChatCleared = ({ chatId }) => {
      // Drop local plaintext caches so no stale/zeroed bodies reappear on refresh.
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.includes(`:${chatId}:`) || k.startsWith(`own:${chatId}:`)) localStorage.removeItem(k);
        });
      } catch (_) {}
      if (activeChatRef.current?.id === chatId) setMessages([]);
      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, last_message: null } : c)));
    };

    const onMessageDeleted = ({ chatId, messageId }) => {
      if (activeChatRef.current?.id === chatId) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.includes(`:${chatId}:`) && k.includes(`:${messageId}`)) localStorage.removeItem(k);
        });
      } catch (_) {}
      setChats((prev) => prev.map((c) => (c.id === chatId && c.last_message?.id === messageId ? { ...c, last_message: null } : c)));
    };

    socket.on('message:new', onNewMessage);
    socket.on('presence:update', onPresence);
    socket.on('presence:snapshot', onPresenceSnapshot);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('message:read', onMessageRead);
    socket.on('chat:cleared', onChatCleared);
    socket.on('message:deleted', onMessageDeleted);

    return () => {
      socket.off('message:new', onNewMessage);
      socket.off('presence:update', onPresence);
      socket.off('presence:snapshot', onPresenceSnapshot);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('message:read', onMessageRead);
      socket.off('chat:cleared', onChatCleared);
      socket.off('message:deleted', onMessageDeleted);
    };
  }, [loadChats, user.id, decryptAndMerge]);

  return (
    <>
      {showOnboarding && <PermissionOnboarding onClose={closeOnboarding} />}
      <div className="h-screen w-screen flex overflow-hidden bg-gray-100 dark:bg-sidebarDark">
      <div className={`${activeChat ? 'hidden sm:flex' : 'flex'} h-full`}>
        <Sidebar
          chats={chats}
          activeChat={activeChat}
          onSelectChat={openChat}
          onlineUserIds={onlineUserIds}
          onChatCreated={handleChatCreated}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          onOpenSettings={() => setShowSettings(true)}
          onMessageCall={openCallAsChat}
        />
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-40 bg-[#F0F2F5] dark:bg-sidebarDark">
          <Settings onClose={() => setShowSettings(false)} darkMode={darkMode} setDarkMode={setDarkMode} />
        </div>
      )}

      {activeChat ? (
        <div className="flex-1 flex h-full min-w-0">
          <div className="sm:hidden absolute top-2 left-2 z-10">
            <button
              onClick={() => setActiveChat(null)}
              className="bg-white/90 dark:bg-black/40 rounded-full w-8 h-8 flex items-center justify-center text-lg"
            >
              ←
            </button>
          </div>
          <ChatWindow
            chat={activeChat}
            messages={messages}
            setMessages={setMessages}
            chats={chats}
            typingUsers={typingByChat[activeChat.id] || new Set()}
            onlineUserIds={onlineUserIds}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            onVoiceCall={() => {
              const other = activeChat.members?.find((m) => m.id !== user.id);
              if (other) calls.startCall({ kind: 'voice', peerUserId: other.id, chatId: activeChat.id });
            }}
            onVideoCall={() => {
              const other = activeChat.members?.find((m) => m.id !== user.id);
              if (other) calls.startCall({ kind: 'video', peerUserId: other.id, chatId: activeChat.id });
            }}
            onBlockChange={handleBlockChange}
          />
        </div>
      ) : (
        <div className="hidden sm:flex flex-1 items-center justify-center bg-[#F0F2F5] dark:bg-[#222E35]">
          <div className="text-center text-gray-400 max-w-sm px-6">
            <div className="text-6xl mb-4">💬</div>
            <h2 className="text-xl text-gray-600 dark:text-gray-300 font-light">Waguan Web</h2>
            <p className="text-sm mt-2">Select a chat or start a new conversation to begin messaging.</p>
          </div>
        </div>
      )}

      {/* WebRTC call overlays */}
      {calls.call && (
        <CallScreen
          call={calls.call}
          onEnd={calls.endCall}
          displayName={activeChat?.display_name}
        />
      )}
      {calls.incoming && (
        <IncomingCall
          incoming={calls.incoming}
          displayName={chats.find((c) => c.id === calls.incoming.chatId)?.display_name || ''}
          onAccept={calls.acceptIncoming}
          onDecline={calls.declineIncoming}
        />
      )}
      </div>
    </>
  );
}
