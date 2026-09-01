import axios from 'axios';

// Base URL respects VITE_API_URL so the frontend can later be hosted apart
// from the backend (e.g. static host + API server). Defaults to same origin.
const baseURL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const api = axios.create({ baseURL: baseURL + '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('waguan_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
