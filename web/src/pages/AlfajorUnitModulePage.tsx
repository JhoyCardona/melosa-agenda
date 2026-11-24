import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuth';
import { CATALOG_LINES } from '../catalogLines';
import './adminLegacy.css';
import './cakeSettings.css';

const LINE = CATALOG_LINES.ALFAJOR_UNIT;

// "Alfajores en caja": the flavors (each a design with its photo, shapes and
// price of one alfajor per size), the boxes every flavor shares (quantities +
// decorations with their prices), and the global sizes/shapes.
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
          Modificar / agregar sabores
        </Link>
        <Link to={LINE.boxesHref ?? ''} className="cs-menu-item">
          Cajas y cantidades
        </Link>
        <Link to={LINE.settingsHref} className="cs-menu-item">
          Tamaños y formas
        </Link>
        <Link to={LINE.catalogHref} className="cs-menu-item">
          Ver el catálogo como lo ven los clientes
        </Link>
      </nav>
      <p className="edit-hint">
        Cada sabor (alfajor clásico, de chocolate…) lleva su foto, sus formas y el precio de 1 alfajor en cada
        tamaño. Las cajas son para todos los sabores: en "Cajas y cantidades" pones las cantidades (x6, x15…) y
        cada caja (clásica, navideña…) con su foto y su precio. El cliente paga los alfajores × la cantidad + la
        caja.
      </p>
    </div>
  );
}
