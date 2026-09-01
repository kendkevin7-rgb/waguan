import React from 'react';
import { format, isToday } from 'date-fns';

export default function ChatListItem({ chat, active, onClick, isOnline }) {
  const last = chat.last_message;
  const time = last?.created_at
    ? (() => {
        const d = new Date(last.created_at.replace(' ', 'T') + 'Z');
        return isToday(d) ? format(d, 'HH:mm') : format(d, 'MMM d');
      })()
    : '';

  const preview = last ? (last.body || (last.media_url ? '📷 Photo' : '')) : 'No messages yet';

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors
        ${active ? 'bg-gray-100 dark:bg-sidebarHoverDark' : 'hover:bg-gray-50 dark:hover:bg-sidebarHoverDark'}`}
    >
      <div className="relative shrink-0">
        <img
          src={chat.display_avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${chat.display_name}`}
          alt={chat.display_name}
          className="w-12 h-12 rounded-full object-cover bg-gray-300"
        />
        {!chat.is_group && isOnline && (
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-accent rounded-full border-2 border-white dark:border-sidebarDark" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{chat.display_name}</span>
          <span className="text-xs text-gray-400 shrink-0 ml-2">{time}</span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{preview}</span>
          {chat.unread_count > 0 && (
            <span className="ml-2 shrink-0 bg-accent text-white text-xs font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
              {chat.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
