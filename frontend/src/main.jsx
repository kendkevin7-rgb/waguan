import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CryptoProvider } from './context/CryptoContext.jsx';
import { CallProvider } from './context/CallContext.jsx';
import { PermissionsProvider } from './context/PermissionsContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CryptoProvider>
          <PermissionsProvider>
            <CallProvider>
              <App />
            </CallProvider>
          </PermissionsProvider>
        </CryptoProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
