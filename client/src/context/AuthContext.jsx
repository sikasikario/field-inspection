import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken } from '../lib/api.js';
import { loadSession, saveSession, clearSession } from '../lib/session.js';
import { syncEngine } from '../lib/syncEngine.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Sesiunea se citește din browser: aplicația pornește și fără rețea.
  const [session, setSession] = useState(() => {
    const s = loadSession();
    if (s?.token) setToken(s.token);
    return s;
  });

  useEffect(() => {
    if (session?.user.role === 'inspector') syncEngine.start(session.user);
  }, [session]);

  async function login(email, password) {
    const { token, user } = await api.post('/auth/login', { email, password });
    setToken(token);
    const next = { token, user };
    saveSession(next);
    if (syncEngine.state.needsLogin && syncEngine.user?.id === user.id) {
      syncEngine.emit({ needsLogin: false });
      syncEngine.sync();
    }
    setSession(next);
    return user;
  }

  function logout() {
    syncEngine.stop();
    setToken(null);
    clearSession();
    setSession(null);
  }

  return <AuthContext.Provider value={{ user: session?.user ?? null, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
