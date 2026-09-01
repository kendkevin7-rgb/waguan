import React, { useEffect, useState } from 'react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { IconSun, IconMoon, IconImage, IconChat, IconShield } from './icons.jsx';

export default function ProfilePanel({ chat, darkMode, setDarkMode, onClose, onBlockChange }) {
  const { user } = useAuth();
  const other = !chat.is_group ? chat.members?.find((m) => m.id !== user.id) : null;
  const [stats, setStats] = useState(null);
  const [blocked, setBlocked] = useState(!!chat.blocked);
  const blockedMe = !!chat.blocked_me;

  const toggleBlock = async () => {
    if (!other || chat.is_group) return;
    const next = !blocked;
    try {
      if (next) await api.post(`/users/${other.id}/block`);
      else await api.delete(`/users/${other.id}/block`);
      setBlocked(next);
      onBlockChange?.(chat.id, next);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update block');
    }
  };

  useEffect(() => {
    let alive = true;
    api.get(`/chats/${chat.id}/messages`)
      .then(({ data }) => {
        if (!alive) return;
        const items = data.messages || [];
        setStats({
          total: items.length,
          media: items.filter((m) => m.media_url || m.media_ciphertext || m.ciphertext).length,
        });
      })
      .catch(() => alive && setStats({ total: 0, media: 0 }));
    return () => { alive = false; };
  }, [chat.id]);

  const name = chat.is_group ? chat.display_name : other?.name || chat.display_name;
  const avatar = chat.is_group ? chat.display_avatar : other?.avatar_url || chat.display_avatar;
  const username = !chat.is_group ? other?.username : null;
  const about = !chat.is_group ? other?.about : null;
  const phone = !chat.is_group ? other?.phone : null;
  const memberSince = other?.created_at ? new Date(other.created_at + (other.created_at.includes('T') ? '' : 'T00:00:00')).getFullYear() : null;

  return (
    <div className="w-80 max-w-[85vw] h-full bg-white dark:bg-[#111B21] border-l border-gray-200 dark:border-black/40 flex flex-col overflow-y-auto shrink-0">
      <div className="h-28 bg-gradient-to-br from-accent to-[#007B4D] shrink-0 relative">
        <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/20 hover:bg-black/30 text-white flex items-center justify-center text-lg">
          ×
        </button>
      </div>

      <div className="-mt-12 px-6 pb-4 relative">
        <img
          src={avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`}
          alt={name}
          className="w-24 h-24 rounded-full border-4 border-white dark:border-[#111B21] shadow object-cover bg-gray-300"
        />
        <h2 className="mt-3 text-xl font-semibold text-gray-900 dark:text-gray-50">{name}</h2>
        {username ? (
          <p className="text-sm text-accentDark dark:text-accent font-medium">@{username}</p>
        ) : (
          <p className="text-sm text-gray-400">no username yet</p>
        )}
        {about && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{about}</p>}
        {phone && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="text-gray-400">Phone</span>
            <div className="font-medium">+{String(phone).replace(/^\+/, '')}</div>
          </div>
        )}
        {memberSince && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="text-gray-400">Member since</span>
            <div className="font-medium">{memberSince}</div>
          </div>
        )}
      </div>

      <div className="flex gap-3 px-6 pb-4">
        <div className="flex-1 bg-gray-100 dark:bg-[#202C33] rounded-xl px-4 py-3 flex items-center gap-3">
          <IconChat className="w-[18px] h-[18px] text-accent" />
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-50">{stats ? stats.total : '-'}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">messages</div>
          </div>
        </div>
        <div className="flex-1 bg-gray-100 dark:bg-[#202C33] rounded-xl px-4 py-3 flex items-center gap-3">
          <IconImage className="w-[18px] h-[18px] text-accent" />
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-50">{stats ? stats.media : '-'}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">shared media</div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-black/40">
        {blockedMe && (
          <div className="px-6 py-3 text-xs text-amber-700 dark:text-amber-300">
            You can't message or call this contact — they've blocked you.
          </div>
        )}
        {!chat.is_group && other && !blockedMe && (
          <button
            onClick={toggleBlock}
            className="w-full flex items-center gap-3 px-6 py-4 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10"
          >
            <IconShield className="w-[20px] h-[20px]" />
            {blocked ? 'Unblock user' : 'Block user'}
          </button>
        )}
        <button
          onClick={() => setDarkMode((d) => !d)}
          className="w-full flex items-center gap-3 px-6 py-4 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-[#202C33]"
        >
          {darkMode ? <IconSun className="w-[20px] h-[20px] text-accent" /> : <IconMoon className="w-[20px] h-[20px] text-accent" />}
          {darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        </button>
      </div>
    </div>
  );
}