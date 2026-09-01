import React, { useEffect, useState } from 'react';
import api from '../api.js';
import { useCrypto } from '../context/CryptoContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { IconLock, IconMonitor, IconSmartphone } from './icons.jsx';

export default function DevicesModal({ onClose, onDevicesChanged }) {
  const { user } = useAuth();
  const { fingerprint } = useCrypto();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/keys/devices/me')
      .then(({ data }) => setDevices(data.devices))
      .finally(() => setLoading(false));
  }, []);

  const revoke = async (deviceId) => {
    await api.delete(`/keys/devices/${deviceId}`);
    const { data } = await api.get('/keys/devices/me');
    setDevices(data.devices);
    onDevicesChanged?.();
  };

  const currentDeviceId = localStorage.getItem(`deviceId:${user.id}`);

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111B21] rounded-lg w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-medium text-gray-800 dark:text-gray-100">Encryption</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Security number / fingerprint */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2 text-accentDark dark:text-accent text-sm font-medium mb-2">
            <IconLock className="w-[16px] h-[16px]" /> Your security number
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Verify this number in a conversation to confirm end-to-end encryption with the other person.
          </p>
          <div className="bg-gray-100 dark:bg-[#202C33] rounded-lg p-3 font-mono text-sm text-center tracking-widest text-gray-700 dark:text-gray-200 break-all">
            {loading ? '…' : fingerprint || 'Not ready'}
          </div>
        </div>

        {/* Linked devices */}
        <div className="px-5 py-4">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Linked devices</div>
          {loading ? (
            <div className="text-sm text-gray-400">Loading devices…</div>
          ) : devices.length === 0 ? (
            <div className="text-sm text-gray-400">No devices registered yet.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {devices.map((d) => (
                <li key={d.id} className="py-2 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-[#202C33] flex items-center justify-center">
                      {d.device_id === currentDeviceId ? <IconMonitor className="w-[18px] h-[18px] text-gray-500" /> : <IconSmartphone className="w-[18px] h-[18px] text-gray-400" />}
                    </div>
                    <div>
                      <div className="text-sm text-gray-800 dark:text-gray-200">
                        {d.name}
                        {d.device_id === currentDeviceId && <span className="ml-2 text-xs text-accentDark dark:text-accent">This device</span>}
                      </div>
                      <div className="text-xs text-gray-400">Linked {new Date(d.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  {d.device_id !== currentDeviceId && (
                    <button onClick={() => revoke(d.device_id)} className="text-xs text-red-500 hover:underline">
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-800 text-right">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm">Done</button>
        </div>
      </div>
    </div>
  );
}
