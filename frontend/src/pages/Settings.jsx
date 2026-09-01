import React, { useState, useEffect, useRef } from 'react';
import api from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCrypto } from '../context/CryptoContext.jsx';
import { IconArrowLeft, IconLock, IconLogout, IconSun, IconMoon, IconShield } from '../components/icons.jsx';
import { Link } from 'react-router-dom';
import { store } from '../crypto/keyStore.js';
import PermissionList from '../components/PermissionList.jsx';

export default function Settings({ onClose, darkMode, setDarkMode }) {
  const { user, logout, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [resetState, setResetState] = useState('');
  const [form, setForm] = useState({ name: user?.name || '', username: user?.username || '', about: user?.about || '', avatar_url: user?.avatar_url || '' });
  const avatarInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('profile'); // profile | devices | blocked | appearance
  const [blockedList, setBlockedList] = useState(null);

  const loadBlocked = () => {
    api.get('/blocks').then(({ data }) => setBlockedList(data.blocked || [])).catch(() => setBlockedList([]));
  };

  const unblock = async (id) => {
    try {
      await api.delete(`/users/${id}/block`);
      loadBlocked();
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to unblock');
    }
  };

  useEffect(() => {
    if (user) setForm({ name: user.name || '', username: user.username || '', about: user.about || '', avatar_url: user.avatar_url || '' });
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'blocked') loadBlocked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const saveProfile = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const { data } = await api.put('/auth/me', { name: form.name, username: form.username, about: form.about, avatar_url: form.avatar_url });
      updateUser(data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save profile', err);
      setSaveError(err?.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/chats/upload', fd);
      setForm((f) => ({ ...f, avatar_url: data.url }));
    } catch (err) {
      console.error('Avatar upload failed', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Wipe local E2E key material (identity, sessions, prekeys) and the
  // "registered" flag so the next bootstrap re-registers fresh keys. Useful
  // when decryption fails due to stale test sessions.
  const resetEncryption = async () => {
    if (!window.confirm('Reset end-to-end encryption keys for this browser? Messages sent before reset may not be decryptable.')) return;
    setResetState('working');
    try {
      await store.clear('kv');
      if (user) localStorage.removeItem(`registered:${user.id}`);
      setResetState('done');
      window.location.reload();
    } catch (err) {
      console.error('Reset encryption failed', err);
      setResetState('');
    }
  };

  const row = 'flex items-center justify-between px-4 py-3.5 bg-white dark:bg-[#111B21] hover:bg-gray-50 dark:hover:bg-[#202C33] cursor-pointer transition-colors';

  return (
    <div className="h-full w-full max-w-2xl mx-auto flex flex-col bg-[#F0F2F5] dark:bg-sidebarDark">
      {/* Header */}
      <div className="bg-panel dark:bg-panelDark px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="text-white flex items-center"><IconArrowLeft className="w-[24px] h-[24px]" /></button>
        <h1 className="text-white font-medium text-lg">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex bg-panel dark:bg-panelDark px-2 pb-2 shrink-0">
        {[['profile', 'Profile'], ['devices', 'Devices & Security'], ['permissions', 'Permissions'], ['blocked', 'Blocked'], ['appearance', 'Appearance']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setActiveTab(k)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${activeTab === k ? 'bg-white/20 text-white' : 'text-white/70'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {activeTab === 'profile' && (
          <>
            {/* Avatar + name */}
            <div className="bg-white dark:bg-[#111B21] p-6 mb-3 flex flex-col items-center">
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="relative group"
                title="Change photo"
              >
                <img
                  src={form.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${form.name}`}
                  alt="avatar"
                  className="w-24 h-24 rounded-full object-cover border-4 border-white dark:border-sidebarDark shadow"
                />
                <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity">
                  {uploading ? 'Uploading…' : 'Change'}
                </span>
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={handleAvatar} />
              <h2 className="mt-4 text-xl font-medium text-gray-900 dark:text-gray-100">{user?.name}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">+{user?.phone}</p>
            </div>

            {/* Editable fields */}
            <div className="bg-white dark:bg-[#111B21] mb-3 divide-y divide-gray-100 dark:divide-gray-800">
              <div className="px-5 py-4">
                <label className="block text-xs text-accentDark dark:text-accent mb-1 font-medium uppercase tracking-wide">Your name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-transparent text-gray-800 dark:text-gray-200 outline-none"
                />
              </div>
              <div className="px-5 py-4">
                <label className="block text-xs text-accentDark dark:text-accent mb-1 font-medium uppercase tracking-wide">Username</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.replace(/^@/, '') }))}
                  placeholder="choose a username (3-20 chars)"
                  className="w-full bg-transparent text-gray-800 dark:text-gray-200 outline-none"
                />
                {form.username && <p className="text-xs text-accentDark dark:text-accent mt-1">@{form.username}</p>}
              </div>
              <div className="px-5 py-4">
                <label className="block text-xs text-accentDark dark:text-accent mb-1 font-medium uppercase tracking-wide">About</label>
                <input
                  value={form.about}
                  onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
                  className="w-full bg-transparent text-gray-800 dark:text-gray-200 outline-none"
                />
              </div>
            </div>

            <div className="px-5">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="w-full py-2.5 rounded-lg bg-accent hover:bg-accentDark text-white font-medium disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              {saved && <p className="text-center text-green-500 text-sm mt-2">Profile updated</p>}
              {saveError && <p className="text-center text-red-500 text-sm mt-2">{saveError}</p>}
            </div>
          </>
        )}

        {activeTab === 'blocked' && (
          <div className="px-5">
            <div className="bg-white dark:bg-[#111B21] mt-2 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
              {blockedList === null ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Loading…</div>
              ) : blockedList.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400">
                  <IconShield className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No blocked contacts. Blocked users can't message or call you, and can't see when you're online.
                </div>
              ) : (
                blockedList.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                    <img src={u.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${u.name}`} alt={u.name} className="w-10 h-10 rounded-full bg-gray-300" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{u.name}</div>
                      <div className="text-xs text-gray-400">+{String(u.phone || '').replace(/^\+/, '')}</div>
                    </div>
                    <button onClick={() => unblock(u.id)} className="px-3 py-1.5 rounded-full text-sm font-medium bg-accent/10 text-accentDark dark:text-accent hover:bg-accent/20">
                      Unblock
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <>
            <div className="px-5 space-y-2">
              <div className={`${row} text-gray-800 dark:text-gray-200`}>
                <span>Linked devices</span>
                <span className="text-sm text-gray-400">Open to manage</span>
              </div>
              <button onClick={resetEncryption} className={`${row} ${
                resetState === 'done' ? 'text-green-500' : 'text-amber-600 dark:text-amber-400'
              } w-full`}>
                <span>{resetState === 'done' ? 'Reset complete — reloading' : 'Reset encryption keys'}</span>
                {resetState === 'working' ? <span className="text-sm">Working…</span> : <IconShield className="w-[20px] h-[20px]" />}
              </button>
              <Link to="/privacy" className={`${row} text-gray-800 dark:text-gray-200`}>
                <span>Privacy Policy</span>
              </Link>
              <Link to="/terms" className={`${row} text-gray-800 dark:text-gray-200`}>
                <span>Terms of Service</span>
              </Link>
              <button onClick={logout} className={`${row} text-red-500 w-full`}>
                <span>Log out</span>
                <IconLogout className="w-[20px] h-[20px]" />
              </button>
            </div>
          </>
        )}

        {activeTab === 'permissions' && (
          <div className="px-5 pt-2">
            <PermissionList />
            <p className="text-center text-xs text-gray-400 mt-4 px-6">
              Camera, microphone and notifications request access through your browser.
              Contacts and files use it only when you pick something to share.
            </p>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="px-5 space-y-2 pt-2">
            <button onClick={() => setDarkMode((d) => !d)} className={`${row} text-gray-800 dark:text-gray-200 w-full`}>
              <span className="flex items-center gap-3">
                {darkMode ? <IconSun className="w-[20px] h-[20px]" /> : <IconMoon className="w-[20px] h-[20px]" />}
                {darkMode ? 'Light mode' : 'Dark mode'}
              </span>
              <span className={`relative w-11 h-6 rounded-full transition-colors ${darkMode ? 'bg-accent' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
