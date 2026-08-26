import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import './BookingPage.css';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await api.post('/auth/login', { username, password });
      localStorage.setItem('melosa_admin_token', response.data.token);
      navigate('/admin/catalogo');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo iniciar sesión');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="booking-page">
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
