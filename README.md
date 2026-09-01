# Waguan — WhatsApp-style Messaging App

A full-stack, real-time chat application inspired by WhatsApp's core UX:
1:1 and group messaging, delivery/read receipts, typing indicators, online
presence, and image sharing. See `PRD.md` for the full product spec.

**Stack:** React + Vite + Tailwind (frontend) · Node.js + Express +
Socket.io + SQLite (backend).

## Project structure

```
whatsapp-clone/
├── PRD.md              product requirements doc
├── backend/             Express API + Socket.io server + SQLite DB
└── frontend/            React (Vite) single-page app
```

## Prerequisites

- Node.js 18+ and npm

## 1. Run the backend

```bash
cd backend
npm install
cp .env.example .env      # optional: edit JWT_SECRET
npm start
```

The API + WebSocket server starts on **http://localhost:4000**. A SQLite
database file (`waguan.db`) is created automatically on first run — no
external database setup needed.

## 2. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The app opens on **http://localhost:5173** (Vite dev server proxies
`/api` and `/socket.io` to the backend automatically).

## 3. Try it out

1. Open http://localhost:5173 in two different browser windows (or one
   normal + one incognito).
2. Register two different accounts (any name/phone/password — this is a
   local demo, no real phone verification).
3. In one window, tap the ✏️ icon → search for the other account by name
   or phone → start chatting.
4. Watch messages, typing indicators, read receipts (✓✓ turning blue),
   and online status update live in both windows.
5. Try 📎 to send an image, or "New group" to create a group chat.

## Building for production

```bash
cd frontend
npm run build       # outputs static files to frontend/dist
```

Serve `frontend/dist` with any static host, and point it at a deployed
instance of the `backend` (set `VITE`/proxy config or a reverse proxy
accordingly since this demo defaults to same-origin `/api` calls).

## Notes & next steps

See the "Non-Goals" section in `PRD.md` for what's intentionally out of
scope (end-to-end encryption, calling, multi-device sync, etc.) — good
follow-up features if you want to keep extending this project.
