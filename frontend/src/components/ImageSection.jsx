import React, { useMemo } from 'react';
import { IconImage, IconPlus } from './icons.jsx';

// "Image section": a grid of every image shared in this chat (tap to send to
// the same chat again) plus a big upload tile for picking a new photo.
export default function ImageSection({ messages, onUpload, onSendImage, darkMode }) {
  const gallery = useMemo(() => {
    const seen = new Set();
    const images = [];
    messages.forEach((m) => {
      const url = m.mediaUrl || m.media_url;
      if (!url) return;
      const t = String(m.mediaType || m.media_type || '');
      const isImage = t.startsWith('image/') || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(url);
      if (!isImage) return;
      if (seen.has(url)) return;
      seen.add(url);
      images.push({ url, mediaType: t.startsWith('image/') ? t : 'image/jpeg' });
    });
    return images.reverse(); // newest first
  }, [messages]);

  return (
    <div className={`rounded-xl shadow-lg border overflow-hidden ${darkMode ? 'bg-[#1F2C34] border-black/40' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <IconImage className={`w-[16px] h-[16px] ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
        <span className={`text-sm font-medium ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Images shared in this chat</span>
      </div>
      <div className="px-3 pb-3 max-h-44 overflow-y-auto">
        <div className="grid grid-cols-5 gap-1.5">
          <button
            onClick={onUpload}
            title="Upload image"
            className={`h-16 rounded-lg flex flex-col items-center justify-center gap-1 border ${
              darkMode ? 'border-[#2A3942] hover:bg-[#2A3942] text-gray-300' : 'border-gray-200 hover:bg-gray-100 text-gray-600'
            }`}
          >
            <IconPlus className="w-[18px] h-[18px]" />
            <span className="text-[10px]">Upload</span>
          </button>
          {gallery.map((img) => (
            <button
              key={img.url}
              onClick={() => onSendImage(img.url, img.mediaType)}
              title="Send again"
              className="h-16 rounded-lg overflow-hidden hover:opacity-80"
            >
              <img src={img.url} alt="shared" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        {gallery.length === 0 && (
          <div className={`text-xs text-center py-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            No images shared yet — tap Upload to send one.
          </div>
        )}
      </div>
    </div>
  );
}