import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ErrorBox } from '../components/Feedback.jsx';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container narrow">
      <h1>Inspecții de teren</h1>
      <form className="card form" onSubmit={onSubmit}>
        <h2>Autentificare</h2>
        <label>Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>Parolă
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <ErrorBox error={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Se verifică…' : 'Intră în cont'}</button>
        <p className="muted small">
          Conturi demo (parola <code>parola123</code>): coordonator@demo.ro · ion@demo.ro · maria@demo.ro · andrei@demo.ro
        </p>
      </form>
    </main>
  );
}
