import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuth';
import './adminLegacy.css';
import './cakeSettings.css';

// "Módulo alfajores": hub for everything alfajor-related in the admin. Only the
// alfajor cake exists today; loose alfajores come later.
export default function AlfajorModulePage() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminAuth();

  useEffect(() => {
    if (!isAdmin) navigate('/admin', { replace: true });
  }, [isAdmin, navigate]);

  return (
    <div className="admin-page">
      <Link to="/admin/panel" className="admin-back">
        ← Atrás
      </Link>
      <h1>Módulo alfajores</h1>
      <nav className="cs-menu">
        <Link to="/admin/alfajores/torta" className="cs-menu-item">
          Torta de alfajor
        </Link>
        <span className="cs-menu-item is-disabled">Alfajores sueltos · próximamente</span>
      </nav>
    </div>
  );
}
