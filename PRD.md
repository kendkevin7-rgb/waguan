# Product Requirements Document — "Waguan" (WhatsApp-style Messenger)

## 1. Overview
Waguan is a real-time, web-based messaging application inspired by WhatsApp's
core UX: 1:1 and group chats, live delivery/read receipts, typing indicators,
online presence, and media sharing — built as a self-contained full-stack app
(no third-party services required) so it runs entirely on localhost.

## 2. Goals
- Recreate WhatsApp's core messaging experience end-to-end.
- Ship a runnable MVP (not a mockup): real accounts, real persistence, real
  sockets.
- Keep the stack simple to run locally with two commands (backend + frontend).

## 3. Non-Goals (out of scope for this build)
- End-to-end encryption (Signal protocol) — noted as a future item.
- Voice/video calling.
- Native mobile apps (this is a responsive web app).
- Multi-device sync / backup-restore.
- Payments, status/stories, channels/broadcast lists.

## 4. Target Users
Developers/learners who want a working reference implementation of a
WhatsApp-like chat product to run, inspect, and extend.

## 5. Functional Requirements

### 5.1 Authentication
- Register with name, phone/email, password (bcrypt-hashed).
- Login issues a JWT; JWT required for all API + socket connections.
- Profile: display name, avatar (uploaded image), status/about text.

### 5.2 Contacts & Chat List
- Search/add any registered user by phone or name to start a chat.
- Chat list sorted by most recent activity, showing last message preview,
  timestamp, unread count, and online/last-seen state.

### 5.3 1:1 Messaging
- Real-time send/receive via WebSockets (Socket.io).
- Message states: sent (✓), delivered (✓✓), read (✓✓ blue).
- Typing indicator ("Alice is typing…").
- Timestamps, date separators, auto-scroll.
- Persisted message history (SQLite), loaded on chat open with pagination.

### 5.4 Group Messaging
- Create a group, name it, add multiple members.
- Group messages show sender name/avatar.
- Member list view.

### 5.5 Media Sharing
- Send images (upload → stored on server → shown inline in chat).
- File size limit (5MB) and image-type validation.

### 5.6 Presence
- Online / offline indicator per user.
- "Last seen" timestamp when offline.

### 5.7 UI/UX
- WhatsApp-familiar layout: left sidebar (chat list) + right panel (active
  chat), dark/light theme toggle, responsive down to mobile width.

## 6. Non-Functional Requirements
- Backend: Node.js + Express + Socket.io + SQLite (file-based, zero external
  DB setup).
- Frontend: React + Vite + Tailwind CSS.
- Auth: JWT (7-day expiry), bcrypt password hashing.
- Clear separation: `/backend` (API + sockets) and `/frontend` (SPA).
- Runs fully offline/local — no external API keys required.

## 7. Success Criteria
- Two users can register, find each other, chat in real time in two browser
  windows, see typing + read receipts update live, and create/use a group
  chat with image sharing.

## 8. Architecture Summary
```
Client (React SPA) <--HTTP (REST, JWT)--> Express API
        |                                      |
        '-------- WebSocket (Socket.io) --------'
                                                |
                                          SQLite (better-sqlite3)
                                          local file storage (/uploads)
```

## 9. Data Model (simplified)
- **users**: id, name, phone, password_hash, avatar_url, about, last_seen
- **chats**: id, is_group, name (for groups), created_at
- **chat_members**: chat_id, user_id
- **messages**: id, chat_id, sender_id, body, media_url, created_at, status
- **message_receipts**: message_id, user_id, delivered_at, read_at
