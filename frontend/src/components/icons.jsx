import React from 'react';

// Professional inline SVG icon set (stroke-based, premium look). Each icon
// takes a `className` for sizing/coloring and uses currentColor so it adapts
// to theme.

const S = ({ children, className, viewBox = '0 0 24 24', filled }) => (
  <svg
    className={className}
    viewBox={viewBox}
    width="1em"
    height="1em"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconPlus = (p) => (
  <S {...p}><path d="M12 5v14M5 12h14" /></S>
);

export const IconEllipsis = (p) => (
  <S {...p} filled>
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </S>
);

export const IconLogout = (p) => (
  <S {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></S>
);

export const IconSun = (p) => (
  <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>
);

export const IconMoon = (p) => (
  <S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></S>
);

export const IconLock = (p) => (
  <S {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></S>
);

export const IconCall = (p) => (
  <S {...p}><path d="M12 3a9 9 0 0 1 9 9c0 .8-.6 1.5-1.4 1.6l-3.6.8a2 2 0 0 1-1.9-.6l-1.3-1.3a1.5 1.5 0 0 0-1.6 0L9 16.1a2 2 0 0 1-2.8 0l-1.6-1.6a2 2 0 0 1 0-2.8l1.3-1.3a1.5 1.5 0 0 0 .5-1.9l-.8-3.6C5.5 3.6 6.2 3 7 3z" /></S>
);

export const IconVideo = (p) => (
  <S {...p}><path d="M23 7l-6 4.5L23 16V7z" /><rect x="2" y="5" width="15" height="14" rx="2" /></S>
);

export const IconMic = (p) => (
  <S {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" /></S>
);

export const IconSend = (p) => (
  <S {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></S>
);

export const IconPaperclip = (p) => (
  <S {...p}><path d="M21.4 11.1l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.5 3.5 0 1 1 5 5l-8.5 8.5a1.5 1.5 0 0 1-2-2l8-8" /></S>
);

export const IconCamOff = (p) => (
  <S {...p}><path d="M23 7l-6 4.5L23 16V7zM2 5l20 14M2 5a2 2 0 0 0-0 0v9a2 2 0 0 0 2 2h9" /></S>
);

export const IconMicOff = (p) => (
  <S {...p}><path d="M9 9v4a3 3 0 0 0 5.1 2.1M17 10.5V11a5 5 0 0 1-1 3M2 2l20 20M9 5.2V6a3 3 0 0 0 4.6 2.6M12 18v4M8 22h8" /></S>
);

export const IconHangup = (p) => (
  <S {...p}><path d="M20.5 14.5l2.5.4a1.5 1.5 0 0 1 1.3 1.7l-.4 2.2M1 15.5l-2.5.4a1.5 1.5 0 0 0-1.3 1.7l.4 2.2M16.6 20.2a14.4 14.4 0 0 0-8.2 0M20.5 14.5a14 14 0 0 0-5-2.4M3.5 14.5a14 14 0 0 1 5-2.4" transform="translate(2 -1) scale(0.92)" /></S>
);

export const IconPhoneMissed = (p) => (
  <S {...p}><path d="M2 2l6 6M8 2L2 8M22 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 3.2 2 2 0 0 1 4.1 1h2a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L7 9.1a16 16 0 0 0 6 6l1.6-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.6 2z" /></S>
);

export const IconBell = (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);

export const IconArrowLeft = (p) => (
  <S {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></S>
);

export const IconChat = (p) => (
  <S {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></S>
);

export const IconIncoming = (p) => (
  <S {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></S>
);

export const IconOutgoing = (p) => (
  <S {...p}><path d="M2 22l11-11M2 22l7-20 4 9 9 4-20 7z" /></S>
);

export const IconPlay = (p) => (
  <S {...p}><circle cx="12" cy="12" r="10" /><path d="M10 8l6 4-6 4V8z" /></S>
);

export const IconPause = (p) => (
  <S {...p}><circle cx="12" cy="12" r="10" /><path d="M10 9v6M14 9v6" /></S>
);

export const IconShield = (p) => (
  <S {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></S>
);

export const IconMonitor = (p) => (
  <S {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></S>
);

export const IconSmartphone = (p) => (
  <S {...p}><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></S>
);

export const IconEdit = (p) => (
  <S {...p}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></S>
);

export const IconCopy = (p) => (
  <S {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></S>
);

export const IconForward = (p) => (
  <S {...p}><path d="M4 12v1.5A3.5 3.5 0 0 0 7.5 17H9" /><path d="m4 12 3 3m-3-3L7 9" /><path d="M14 5h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5" /></S>
);

export const IconTrash = (p) => (
  <S {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></S>
);

export const IconShare = (p) => (
  <S {...p}><path d="M2 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0Z" /><path d="M8.5 12h7M12 8.5l3.5 3.5L12 15.5" /></S>
);

export const IconImage = (p) => (
  <S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></S>
);

export const IconEmoji = (p) => (
  <S {...p}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01M15 9h.01" /></S>
);
