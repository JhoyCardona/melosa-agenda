import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuth';
import { CATALOG_LINES } from '../catalogLines';
import './adminLegacy.css';
import './cakeSettings.css';

const LINE = CATALOG_LINES.ALFAJOR_UNIT;

// "Alfajores en caja": same two spaces as the cake module, with alfajor words.
// A box ("Caja x15") is a design; its packagings are the colors, each with its
// photo and its price per alfajor size.
export default function AlfajorUnitModulePage() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminAuth();

  useEffect(() => {
    if (!isAdmin) navigate('/admin', { replace: true });
  }, [isAdmin, navigate]);

  return (
    <div className="admin-page">
      <Link to="/admin/alfajores" className="admin-back">
        ← Atrás
      </Link>
      <h1>Alfajores en caja</h1>
      <nav className="cs-menu">
        <Link to={LINE.designsHref} className="cs-menu-item">
          Modificar / agregar cajas
        </Link>
        <Link to={LINE.settingsHref} className="cs-menu-item">
          Tamaños, sabores y formas
        </Link>
        <Link to={LINE.catalogHref} className="cs-menu-item">
          Ver el catálogo como lo ven los clientes
        </Link>
      </nav>
      <p className="edit-hint">
        Cada caja tiene una cantidad de alfajores (6, 15, 22…) y sus empaques. Cada empaque lleva su foto y su
        precio para cada tamaño (mini, personal, grande). Una caja aparece en la web cuando tiene al menos un
        empaque con foto, precio, forma y sabor.
      </p>
    </div>
  );
}
