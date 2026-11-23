import { useEffect, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus.js';

// Schelet M1: verifică legătura cu API-ul și afișează starea conexiunii.
export default function App() {
  const online = useOnlineStatus();
  const [health, setHealth] = useState({ state: 'loading' });

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setHealth({ state: 'ok', data }))
      .catch((err) => setHealth({ state: 'error', message: err.message }));
  }, []);

  return (
    <main className="container">
      <header className="topbar">
        <h1>Inspecții de teren</h1>
        <span className={`badge ${online ? 'online' : 'offline'}`}>
          {online ? 'Online' : 'Offline'}
        </span>
      </header>

      <section className="card">
        <h2>Stare API</h2>
        {health.state === 'loading' && <p>Se verifică…</p>}
        {health.state === 'ok' && <p>Serverul răspunde ({health.data.time}).</p>}
        {health.state === 'error' && <p className="error">Serverul nu răspunde: {health.message}</p>}
      </section>
    </main>
  );
}
