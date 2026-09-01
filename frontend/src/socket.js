import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(token) {
  if (socket) socket.disconnect();
  // Base URL respects VITE_SOCKET_URL (for separate hosting). Defaults to
  // same origin, where the polling-first transport stays reliable through
  // the Vite dev proxy (its websocket upgrade can fail with ECONNABORTED).
  const url = import.meta.env.VITE_SOCKET_URL || '/';
  socket = io(url, { auth: { token }, transports: ['polling', 'websocket'] });
  socket.on('connect_error', (err) => console.error('[socket] connect error:', err.message));
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
