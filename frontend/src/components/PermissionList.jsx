import React, { useState } from 'react';
import { PERMISSION_ITEMS, usePermissions } from '../context/PermissionsContext.jsx';
import { IconVideo, IconMic, IconCall, IconChat, IconImage, IconPaperclip, IconBell } from './icons.jsx';

const ICONS = {
  camera: IconVideo,
  mic: IconMic,
  calls: IconCall,
  contacts: IconChat,
  storage: IconImage,
  files: IconPaperclip,
  notifications: IconBell,
};

function Row({ item, value, onToggle, busy }) {
  const Icon = ICONS[item.key] || IconBell;
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-11 h-11 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
        <Icon className="w-[22px] h-[22px] text-accentDark dark:text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {value === 'granted' ? item.win : item.desc}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onToggle(item.key)}
        disabled={busy}
        title={value === 'granted' ? 'Revoke' : 'Allow'}
        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50 ${value === 'granted' ? 'bg-accent' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${value === 'granted' ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

export default function PermissionList() {
  const { granted, request, revoke } = usePermissions();
  const [busy, setBusy] = useState(null);

  const toggle = async (key) => {
    if (granted(key)) { revoke(key); return; }
    setBusy(key);
    try { await request(key); } finally { setBusy(null); }
  };

  return (
    <div className="bg-white dark:bg-[#111B21] rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
      {PERMISSION_ITEMS.map((item) => (
        <Row key={item.key} item={item} value={granted(item.key) ? 'granted' : 'off'} onToggle={toggle} busy={busy && busy !== item.key} />
      ))}
    </div>
  );
}