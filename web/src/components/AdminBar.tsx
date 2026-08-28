import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuth';
import './AdminBar.css';

// Thin strip pinned to the top of every page while an admin session is active.
// Renders nothing for normal visitors.
export default function AdminBar() {
  const { isAdmin, logout } = useAdminAuth();
  const navigate = useNavigate();

  if (!isAdmin) return null;

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="admin-bar">
      <span className="admin-bar-tag">Modo administradora</span>
      <nav className="admin-bar-nav">
        <Link to="/admin/pedidos/nuevo">Crear pedido</Link>
        <Link to="/admin/catalogo">Catálogo</Link>
        <button type="button" onClick={handleLogout}>
          Salir
        </button>
      </nav>
    </div>
  );
}
