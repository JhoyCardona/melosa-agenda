import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuth';
import './adminLegacy.css';
import './cakeSettings.css';

// Admin landing ("Modo administradora"): one entry per product family. Only
// Tortas has its module so far; the rest are placeholders so the layout
// already matches the planned structure.
export default function AdminPanelPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminAuth();

  useEffect(() => {
    if (!isAdmin) navigate('/admin', { replace: true });
  }, [isAdmin, navigate]);

  return (
    <div className="admin-page">
      <h1>Modo administradora</h1>
      <nav className="cs-menu">
        <Link to="/admin/tortas" className="cs-menu-item">
          Tortas
        </Link>
        <span className="cs-menu-item is-disabled">Alfajores · próximamente</span>
        <span className="cs-menu-item is-disabled">Cupcakes · próximamente</span>
        <span className="cs-menu-item is-disabled">Postres · próximamente</span>
      </nav>
      <p className="edit-hint">
        El catálogo anterior sigue disponible en{' '}
        <Link to="/admin/catalogo">Catálogo (versión anterior)</Link> mientras terminamos el nuevo.
      </p>
    </div>
  );
}
