import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(phone.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111B21] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-3">
            <span className="text-2xl">💬</span>
          </div>
          <h1 className="text-white text-2xl font-semibold">Waguan</h1>
          <p className="text-gray-400 text-sm mt-1">Simple. Fast. Real-time messaging.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#202C33] rounded-xl p-6 shadow-xl">
          <h2 className="text-white text-lg font-medium mb-4">Log in</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <label className="block text-gray-300 text-sm mb-1">Phone number</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 1000000001"
            required
            className="w-full mb-4 px-3 py-2 rounded-lg bg-[#2A3942] text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-accent"
          />

          <label className="block text-gray-300 text-sm mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full mb-6 px-3 py-2 rounded-lg bg-[#2A3942] text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-accent"
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-accent hover:bg-accentDark transition-colors text-white font-medium py-2.5 rounded-lg disabled:opacity-60"
          >
            {busy ? 'Logging in…' : 'Log in'}
          </button>

          <p className="text-gray-400 text-sm mt-5 text-center">
            New here?{' '}
            <Link to="/register" className="text-accent hover:underline">
              Create an account
            </Link>
          </p>
        </form>
        <p className="text-center text-xs text-gray-500 mt-6">
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
          {' '}·{' '}
          <Link to="/terms" className="hover:underline">Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}
