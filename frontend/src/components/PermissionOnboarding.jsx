import React, { useState } from 'react';
import PermissionList from './PermissionList.jsx';
import { IconShield } from './icons.jsx';

// WhatsApp-style first-run permissions screen. Runs once after login; can be
// reopened any time from Settings.
export default function PermissionOnboarding({ onClose }) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#F0F2F5] dark:bg-sidebarDark rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-b from-accent to-accentDark dark:from-[#0d4d36] dark:to-[#0a3d2c] px-6 py-8 text-center shrink-0">
          <IconShield className="w-12 h-12 text-white/90 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-white">Allow Waguan to access this device's</h1>
          <p className="text-sm text-white/80 mt-2 max-w-sm mx-auto">
            Camera, microphone, contacts, storage, files, calls and notifications.
            <br />You can turn these off later in Settings → Permissions.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <PermissionList />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-black/40 flex justify-end gap-2 shrink-0">
          <button
            onClick={() => { setSaving(true); onClose(false); }}
            className="px-4 py-2 rounded-full text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#202C33]"
          >
            Not now
          </button>
          <button
            onClick={() => { setSaving(true); onClose(true); }}
            disabled={saving}
            className="px-5 py-2 rounded-full text-sm font-medium bg-accent text-white hover:bg-accentDark disabled:opacity-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}