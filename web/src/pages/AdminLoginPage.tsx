import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAdminAuth } from '../context/AdminAuth';
import './adminLegacy.css';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { isAdmin, login } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Already signed in → skip the form.
  useEffect(() => {
    if (isAdmin) navigate('/admin/catalogo', { replace: true });
  }, [isAdmin, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await api.post('/auth/login', { username, password });
      login(response.data.token);
      navigate('/admin/catalogo');
    } catch (err: any) {
      // 429 from the login rate-limiter carries its own "espera 15 minutos" text.
      setError(err?.response?.data?.error ?? 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="booking-page">
      <Link to="/" className="booking-back">
        ← Volver al inicio
      </Link>
      <h1>Ingresar</h1>
      <form className="form-section" onSubmit={handleSubmit}>
        <label className="field-label">Usuario</label>
        <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} />

        <label className="field-label">Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <p className="warning">{error}</p>}

        <button type="submit" className="cta-button" style={{ marginTop: 14 }} disabled={submitting}>
          {submitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
