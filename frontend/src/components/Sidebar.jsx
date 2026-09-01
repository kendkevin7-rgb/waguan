import React, { useState } from 'react';
import ChatListItem from './ChatListItem.jsx';
import NewChatModal from './NewChatModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import DevicesModal from './DevicesModal.jsx';
import CallsPanel from './CallsPanel.jsx';
import { IconPlus, IconEllipsis, IconLogout, IconSun, IconMoon, IconLock, IconChat, IconVideo } from './icons.jsx';

export default function Sidebar({ chats, activeChat, onSelectChat, onlineUserIds, onChatCreated, darkMode, setDarkMode, onOpenSettings, onMessageCall }) {
  const { user, logout } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [tab, setTab] = useState('chats');
  const [search, setSearch] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  const filtered = chats.filter((c) => c.display_name?.toLowerCase().includes(search.toLowerCase()));

  const isChatOnline = (chat) => {
    if (chat.is_group) return false;
    const other = chat.members?.find((m) => m.id !== user.id);
    return other ? onlineUserIds.has(other.id) : false;
  };

  const openCallAsChat = async (chatId) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      onSelectChat(chat);
      setTab('chats');
    }
  };

  return (
    <div className="w-full sm:w-[380px] shrink-0 h-full flex flex-col bg-white dark:bg-sidebarDark border-r border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between px-4 py-3 bg-panel dark:bg-panelDark">
        <div className="flex items-center gap-3">
          <img
            src={user.avatar_url}
            alt={user.name}
            className="w-9 h-9 rounded-full bg-gray-300"
          />
          <span className="text-white font-medium">{user.name}</span>
        </div>
        <div className="flex items-center gap-3 relative">
          <button
            title="New chat"
            onClick={() => setShowModal(true)}
            className="text-white/90 hover:text-white flex items-center"
          >
            <IconPlus className="w-[22px] h-[22px]" />
          </button>
          <button
            title="Menu"
            onClick={() => setShowMenu((s) => !s)}
            className="text-white/90 hover:text-white flex items-center"
          >
            <IconEllipsis className="w-[22px] h-[22px]" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 bg-white dark:bg-[#233138] rounded-lg shadow-xl py-1 w-48 z-20">
              <button
                onClick={() => { setDarkMode((d) => !d); setShowMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-sidebarHoverDark"
              >
                {darkMode ? <IconSun className="w-[18px] h-[18px]" /> : <IconMoon className="w-[18px] h-[18px]" />}
                {darkMode ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                onClick={() => { setShowDevices(true); setShowMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-sidebarHoverDark"
              >
                <IconLock className="w-[18px] h-[18px] text-gray-500" />
                Encryption & devices
              </button>
              <button
                onClick={() => { setShowMenu(false); onOpenSettings(); }}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-sidebarHoverDark"
              >
                <IconSun className="w-[18px] h-[18px]" />
                Settings
              </button>
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-sidebarHoverDark"
              >
                <IconLogout className="w-[18px] h-[18px]" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={`bg-panel dark:bg-panelDark ${tab === 'calls' ? '' : ''}`}>
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab('chats')}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'chats' ? 'border-white text-white' : 'border-transparent text-white/70'}`}
          >
            Chats
          </button>
          <button
            onClick={() => setTab('calls')}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'calls' ? 'border-white text-white' : 'border-transparent text-white/70'}`}
          >
            Calls
          </button>
        </div>
      </div>

      {tab === 'chats' ? (
        <>
      <div className="px-3 py-2 bg-white dark:bg-sidebarDark">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search or start a new chat"
          className="w-full px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-[#202C33] text-sm text-gray-800 dark:text-gray-200 outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-10 px-6">
            No chats yet. Start a new conversation.
          </div>
        )}
        {filtered.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            active={activeChat?.id === chat.id}
            onClick={() => onSelectChat(chat)}
            isOnline={isChatOnline(chat)}
          />
        ))}
      </div>
        </>
      ) : (
        <CallsPanel onClose={() => setTab('chats')} onMessageCall={onMessageCall} />
      )}

      {showModal && (
        <NewChatModal
          onClose={() => setShowModal(false)}
          onDirectChatCreated={(chat) => {
            onChatCreated(chat);
            setShowModal(false);
          }}
          onGroupChatCreated={(chat) => {
            onChatCreated(chat);
            setShowModal(false);
          }}
        />
      )}
      {showDevices && <DevicesModal onClose={() => setShowDevices(false)} />}
    </div>
  );
}
