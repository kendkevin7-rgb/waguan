import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api.js';
import { connectSocket, disconnectSocket } from '../socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = localStorage.getItem('waguan_token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      connectSocket(token);
    } catch (err) {
      localStorage.removeItem('waguan_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (phone, password) => {
    const { data } = await api.post('/auth/login', { phone, password });
    localStorage.setItem('waguan_token', data.token);
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  };

  const register = async (name, phone, password) => {
    const { data } = await api.post('/auth/register', { name, phone, password });
    localStorage.setItem('waguan_token', data.token);
    setUser(data.user);
    connectSocket(data.token);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('waguan_token');
    disconnectSocket();
    setUser(null);
  };

  const updateUser = (partial) => setUser((u) => ({ ...u, ...partial }));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
