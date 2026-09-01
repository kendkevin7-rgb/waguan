import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Chat from './pages/Chat.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import { useAuth } from './context/AuthContext.jsx';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#111B21] text-white gap-2 px-6 text-center">
          <div className="text-lg font-medium">Something went wrong</div>
          <div className="text-sm text-white/60 max-w-md break-words">{String(this.state.error)}</div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-accent text-black text-sm"
          >
            Reload Waguan
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return user ? children : <Navigate to="/login" replace />;
}

function FullScreenLoader() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#111B21]">
      <div className="text-accent text-lg font-medium">Loading Waguan…</div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <ErrorBoundary>
      <Routes>
        <Route
          path="/login"
          element={loading ? <FullScreenLoader /> : user ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/register"
          element={loading ? <FullScreenLoader /> : user ? <Navigate to="/" replace /> : <Register />}
        />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Chat />
            </PrivateRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
