import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuth';
import './adminLegacy.css';
import './cakeSettings.css';

// "Módulo tortas": hub for everything cake-related in the admin.
export default function CakeModulePage() {
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
      <h1>Módulo tortas</h1>
      <nav className="cs-menu">
        {/* Still the legacy order form; it moves to the v2 catalog later. */}
        <Link to="/admin/pedidos/nuevo" className="cs-menu-item">
          Agendar torta
        </Link>
        <Link to="/admin/tortas/disenos" className="cs-menu-item">
          Modificar / agregar diseños
        </Link>
        <Link to="/admin/tortas/sabores-tamanos" className="cs-menu-item">
          Sabores, tamaños y formas
        </Link>
        <span className="cs-menu-item is-disabled">Cotizaciones · próximamente</span>
      </nav>
    </div>
  );
}
