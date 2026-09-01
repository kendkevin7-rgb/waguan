import React, { useEffect, useState } from 'react';
import api from '../api.js';
import { format, isToday } from 'date-fns';
import { useAuth } from '../context/AuthContext.jsx';
import { useCalls } from '../context/CallContext.jsx';
import { IconCall, IconArrowLeft, IconVideo, IconTrash, IconChat } from './icons.jsx';

// Preference function inspired by WhatsApp: a call appears the same
// (incoming/outgoing) to both the initiator and the callee, so we show it
// based on the persisted direction flag the client always sends.
function callLabel(call, userId) {
  const outgoing = call.initiator_id === userId;
  const missed = call.status === 'missed';
  const icon = missed ? <IconCall className="w-[20px] h-[20px] text-red-500" />
    : outgoing ? <IconCall className="w-[20px] h-[20px] text-green-500" />
    : <IconCall className="w-[20px] h-[20px] text-blue-500" />;
  const color = missed
    ? 'text-red-500'
    : call.status === 'rejected'
      ? 'text-red-400'
      : 'text-green-500';
  const label = missed ? 'Missed call'
    : outgoing ? 'Outgoing' : 'Incoming';
  const dir = missed ? 'missed' : outgoing ? 'outgoing' : 'incoming';
  return { icon, color, label, dir };
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T') + (ts.includes('Z') ? '' : 'Z'));
  return isToday(d) ? format(d, 'HH:mm') : format(d, 'MMM d, HH:mm');
}

function fmtDuration(sec) {
  if (!sec) return null;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function statusText(status) {
  return { missed: 'Missed', rejected: 'Rejected', declined: 'Declined', cancelled: 'Cancelled' }[status] || 'Ended';
}

export default function CallsPanel({ onClose, onMessageCall }) {
  const { user } = useAuth();
  const calls = useCalls();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);   // call opened in the info panel

  const load = () => api.get('/calls').then(({ data }) => setList(data.calls)).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const callBack = (kind) => {
    if (!selected) return;
    calls.startCall({ kind, peerUserId: selected.peer_id, chatId: selected.chat_id });
  };

  const deleteOne = async () => {
    if (!selected) return;
    await api.delete(`/calls/${selected.id}`);
    setSelected(null);
    load();
  };

  const clearAll = async () => {
    await api.delete('/calls');
    setSelected(null);
    load();
  };

  const openMessage = () => {
    if (!selected) return;
    const ch = selected.chat_id;
    setSelected(null);
    onMessageCall?.(ch);
    onClose?.();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 bg-panel dark:bg-panelDark">
        <div className="flex items-center gap-3">
          <button onClick={() => (selected ? setSelected(null) : onClose())} className="text-white flex items-center">
            <IconArrowLeft className="w-[22px] h-[22px]" />
          </button>
          <span className="text-white font-medium">{selected ? 'Call info' : 'Call history'}</span>
        </div>
        {!selected && list.length > 0 && (
          <button onClick={clearAll} className="text-white/80 hover:text-white text-xs flex items-center gap-1" title="Clear all call history">
            <IconTrash className="w-[18px] h-[18px]" /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-white dark:bg-sidebarDark">
        {selected ? (
          <div className="p-4">
            {/* Peer info */}
            <div className="flex flex-col items-center mb-6">
              <img src={selected.peer_avatar} alt={selected.peer_name} className="w-24 h-24 rounded-full bg-gray-300 mb-3" />
              <div className="text-lg font-medium text-gray-900 dark:text-gray-100">{selected.peer_name}</div>
              <div className={`text-sm mt-1 ${selected.status === 'missed' || selected.status === 'rejected' ? 'text-red-500' : 'text-green-500'}`}>
                {callLabel(selected, user.id).label} · {selected.kind === 'video' ? 'Video call' : 'Voice call'} · {statusText(selected.status)}
              </div>
            </div>

            {/* Call meta */}
            <div className="rounded-xl bg-gray-50 dark:bg-sidebarHoverDark px-4 py-3 mb-6 divide-y divide-gray-200 dark:divide-gray-700">
              <div className="flex justify-between py-1.5"><span className="text-gray-500 dark:text-gray-400">Date</span><span>{fmtTime(selected.started_at)}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-gray-500 dark:text-gray-400">Duration</span><span>{fmtDuration(selected.duration_sec) || '—'}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-gray-500 dark:text-gray-400">Type</span><span>{selected.kind === 'video' ? 'Video' : 'Voice'}</span></div>
              <div className="flex justify-between py-1.5"><span className="text-gray-500 dark:text-gray-400">Status</span><span>{statusText(selected.status)}</span></div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => callBack('voice')} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-medium">
                <IconCall className="w-[20px] h-[20px]" /> Call back
              </button>
              <button onClick={() => callBack('video')} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-panel dark:bg-panelDark text-white font-medium">
                <IconVideo className="w-[20px] h-[20px]" /> Video call
              </button>
              <button onClick={openMessage} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-panel dark:bg-panelDark text-white font-medium">
                <IconChat className="w-[20px] h-[20px]" /> Message
              </button>
              <button onClick={deleteOne} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600/90 text-white font-medium">
                <IconTrash className="w-[20px] h-[20px]" /> Delete
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="text-center text-gray-400 text-sm py-10">Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-10 px-6">
            No calls yet. Voice & video calls you make or miss will appear here.
          </div>
        ) : (
          list.map((c) => {
            const meta = callLabel(c, user.id);
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 dark:hover:bg-sidebarHoverDark transition-colors"
              >
                <div className="text-2xl shrink-0">{meta.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className={`font-medium truncate ${meta.dir === 'missed' ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                    {c.peer_name || (c.kind === 'video' ? 'Video call' : 'Voice call')}
                  </div>
                  <div className={`text-xs flex items-center gap-1 ${meta.color}`}>
                    <span>{meta.label}</span>
                    {c.duration_sec ? <span> · {fmtDuration(c.duration_sec)}</span> : null}
                  </div>
                  <div className="text-xs text-gray-400">{fmtTime(c.started_at)}</div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}