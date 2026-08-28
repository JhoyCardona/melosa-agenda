import { useState } from 'react';
import api from '../api';

interface PasswordPromptProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmation gate: re-checks the admin's login password against
// POST /auth/verify-password before a sensitive edit goes through.
export default function PasswordPrompt({ message, onConfirm, onCancel }: PasswordPromptProps) {
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (!password) return;
    setChecking(true);
    setError('');
    try {
      await api.post('/auth/verify-password', { password });
      onConfirm();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No se pudo verificar la contraseña';
      setError(message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="pw-overlay" role="dialog" aria-modal="true">
      <div className="pw-box">
        <p className="pw-message">{message}</p>
        <p className="pw-sub">Confirma con tu contraseña para continuar.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
          placeholder="Contraseña"
        />
        {error && <p className="warning">{error}</p>}
        <div className="pw-actions">
          <button type="button" className="secondary-button" style={{ marginTop: 0 }} onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="cta-button"
            style={{ marginTop: 0 }}
            onClick={handleConfirm}
            disabled={!password || checking}
          >
            {checking ? 'Verificando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
