import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

// WhatsApp-style "device permissions". A web app can't truly grant storage/
// calls/contacts the way a phone OS does, so each category maps to the closest
// real browser capability (or is a virtual in-app gate). The granted set is
// remembered per device+account, exactly like a phone stores its own grants.

const PermissionsContext = createContext(null);

const STORAGE_KEY = 'waguan_perms_';

export const PERMISSION_ITEMS = [
  { key: 'camera', title: 'Camera', desc: 'Use your camera for video calls and photos', win: 'Video calls work with your camera.' },
  { key: 'mic', title: 'Microphone', desc: 'Make voice and video calls, record voice notes', win: 'People can hear you on calls.' },
  { key: 'calls', title: 'Calls & voicemail', desc: 'Start and receive voice and video calls', win: 'You can call and be called.' },
  { key: 'contacts', title: 'Contacts', desc: 'Find contacts to start a new chat', win: 'You can look up people to chat with.' },
  { key: 'storage', title: 'Storage', desc: 'Keep photos, videos and documents on this device', win: 'Media you share stays saved.' },
  { key: 'files', title: 'Files & media', desc: 'Open your files to share them in chats', win: 'You can attach files and photos.' },
  { key: 'notifications', title: 'Notifications', desc: 'Get notified of new messages and calls', win: 'You will see message alerts.' },
];

// Browser capabilities behind each permission (virtual ones resolve instantly).
async function requestNative(key) {
  switch (key) {
    case 'camera': {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      s.getTracks().forEach((t) => t.stop());
      return true;
    }
    case 'mic': {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return true;
    }
    case 'notifications': {
      const r = await Notification.requestPermission();
      return r === 'granted';
    }
    case 'storage': {
      try {
        if (navigator.storage?.persist) await navigator.storage.persist();
        if (navigator.storage?.persisted) await navigator.storage.persisted();
      } catch (_) {}
      return true; // storage always works in the browser session
    }
    case 'files':
      return true; // browser grants per-file via the picker, so toggling is virtual
    case 'contacts': {
      try {
        if (navigator.contacts?.select) await navigator.contacts.select(['name'], { multiple: false });
      } catch (_) {}
      return true; // Contacts Picker is optional / simulated when unsupported
    }
    case 'calls':
      return true; // in-app gate, granted on toggle
    default:
      return false;
  }
}

export function PermissionsProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.id;
  const [perms, setPerms] = useState({});

  useEffect(() => {
    if (!uid) return setPerms({});
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + uid) || '{}');
      setPerms(typeof saved === 'object' && saved ? saved : {});
    } catch (_) {
      setPerms({});
    }
  }, [uid]);

  const save = (next) => {
    setPerms(next);
    if (uid) {
      try { localStorage.setItem(STORAGE_KEY + uid, JSON.stringify(next)); } catch (_) {}
    }
  };

  const grant = (key) => save({ ...perms, [key]: 'granted' });
  const revoke = (key) => {
    const next = { ...perms };
    delete next[key];
    save(next);
  };
  const granted = (key) => perms[key] === 'granted';

  // Ask the browser for a permission. Returns true if the user has it
  // available afterwards (already granted, new grant, or virtual grant).
  const request = async (key, { silent } = {}) => {
    if (granted(key) || !key) return true;
    try {
      const ok = await requestNative(key);
      if (ok) grant(key);
      return ok;
    } catch (err) {
      if (!silent) console.warn(`Permission "${key}" not granted`, err);
      return false;
    }
  };

  // Ensure a set of permissions, returning false if any is unavailable —
  // used by gates (start a call, attach media) before acting.
  const ensure = async (keys) => {
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      if (!perms[k] && !(await request(k))) return false;
    }
    return true;
  };

  return (
    <PermissionsContext.Provider value={{ perms, granted, request, ensure, grant, revoke }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used inside PermissionsProvider');
  return ctx;
}