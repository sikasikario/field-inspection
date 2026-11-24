import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useSyncState } from '../hooks/useSync.js';
import { SyncBar } from './SyncBar.jsx';
import { NetSimPanel } from './NetSimPanel.jsx';

export function Layout() {
  const { user, logout } = useAuth();
  const online = useOnlineStatus();
  const sync = useSyncState();
  const isInspector = user.role === 'inspector';

  function handleLogout() {
    if (isInspector && sync.pending > 0
      && !window.confirm(`Ai ${sync.pending} modificări nesincronizate. Ele rămân salvate pe acest dispozitiv și se trimit la următoarea autentificare. Te deconectezi?`)) return;
    logout();
  }

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <span className="brand">Inspecții de teren</span>
          <nav className="nav">
            {isInspector ? (
              <>
                <NavLink to="/" end>Inspecțiile mele</NavLink>
                <NavLink to="/new">Inspecție nouă</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/" end>Inspecții</NavLink>
                <NavLink to="/assign">Asignare</NavLink>
                <NavLink to="/reports">Raport</NavLink>
              </>
            )}
          </nav>
          <div className="topbar-right">
            <span className={`badge ${online ? 'online' : 'offline'}`}>{online ? 'Online' : 'Offline'}</span>
            <span className="user">{user.name} · {isInspector ? 'inspector' : 'coordonator'}</span>
            <button type="button" className="btn btn-small btn-ghost" onClick={handleLogout}>Ieșire</button>
          </div>
        </div>
      </header>
      <main className="container">
        {isInspector && <SyncBar />}
        {isInspector && sync.needsLogin && (
          <div className="alert alert-warn">Sesiunea a expirat. <button type="button" className="btn btn-small" onClick={logout}>Autentifică-te din nou</button> (modificările rămân pe dispozitiv)</div>
        )}
        {!isInspector && !online && <div className="alert alert-warn">Ești offline. Paginile coordonatorului au nevoie de conexiune.</div>}
        <Outlet />
        {isInspector && <NetSimPanel />}
      </main>
    </>
  );
}
