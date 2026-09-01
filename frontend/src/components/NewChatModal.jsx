import React, { useState, useEffect } from 'react';
import api from '../api.js';

export default function NewChatModal({ onClose, onDirectChatCreated, onGroupChatCreated }) {
  const [mode, setMode] = useState('direct'); // 'direct' | 'group'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await api.get('/auth/users/search', { params: { q: query } });
      setResults(data.users);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const toggleSelect = (user) => {
    setSelected((prev) =>
      prev.find((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user]
    );
  };

  const startDirect = async (user) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/chats/direct/${user.id}`);
      onDirectChatCreated(data.chat);
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!groupName.trim() || selected.length === 0) return;
    setBusy(true);
    try {
      const { data } = await api.post('/chats/group', {
        name: groupName.trim(),
        memberIds: selected.map((u) => u.id),
      });
      onGroupChatCreated(data.chat);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white dark:bg-[#202C33] rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-panel dark:bg-panelDark">
          <h3 className="text-white font-medium">{mode === 'direct' ? 'New chat' : 'New group'}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setMode('direct')}
            className={`flex-1 py-2 text-sm font-medium ${mode === 'direct' ? 'text-accentDark dark:text-accent border-b-2 border-accent' : 'text-gray-500'}`}
          >
            Direct message
          </button>
          <button
            onClick={() => setMode('group')}
            className={`flex-1 py-2 text-sm font-medium ${mode === 'group' ? 'text-accentDark dark:text-accent border-b-2 border-accent' : 'text-gray-500'}`}
          >
            New group
          </button>
        </div>

        <div className="p-4">
          {mode === 'group' && (
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-[#2A3942] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-accent"
            />
          )}

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-100 dark:bg-[#2A3942] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-accent"
          />

          {mode === 'group' && selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selected.map((u) => (
                <span
                  key={u.id}
                  className="bg-accent/15 text-accentDark dark:text-accent text-xs px-2 py-1 rounded-full"
                >
                  {u.name}
                </span>
              ))}
            </div>
          )}

          <div className="max-h-64 overflow-y-auto -mx-4 px-4">
            {results.length === 0 && (
              <p className="text-sm text-gray-400 py-6 text-center">No users found</p>
            )}
            {results.map((user) => {
              const isSelected = !!selected.find((u) => u.id === user.id);
              return (
                <button
                  key={user.id}
                  disabled={busy}
                  onClick={() => (mode === 'direct' ? startDirect(user) : toggleSelect(user))}
                  className={`w-full flex items-center gap-3 py-2 px-1 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-sidebarHoverDark ${
                    isSelected ? 'bg-accent/10' : ''
                  }`}
                >
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-10 h-10 rounded-full bg-gray-300"
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{user.name}</div>
                    <div className="text-xs text-gray-500 truncate">{user.phone}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {mode === 'group' && (
            <button
              onClick={createGroup}
              disabled={busy || !groupName.trim() || selected.length === 0}
              className="w-full mt-4 bg-accent hover:bg-accentDark text-white font-medium py-2.5 rounded-lg disabled:opacity-50"
            >
              Create group
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
