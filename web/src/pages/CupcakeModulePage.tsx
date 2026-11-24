import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuth';
import { CATALOG_LINES } from '../catalogLines';
import './adminLegacy.css';
import './cakeSettings.css';

const LINE = CATALOG_LINES.CUPCAKE;

// "Cupcakes": same two spaces as the cake module. A design is a cupcake
// decoration with its colors; the sizes are the boxes (x3, x6, x12), each with
// its own minutes and price per color.
export default function CupcakeModulePage() {
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
      <h1>Cupcakes</h1>
      <nav className="cs-menu">
        <Link to={LINE.designsHref} className="cs-menu-item">
          Modificar / agregar diseños
        </Link>
        <Link to={LINE.settingsHref} className="cs-menu-item">
          Sabores y tamaños
        </Link>
        <Link to={LINE.catalogHref} className="cs-menu-item">
          Ver el catálogo como lo ven los clientes
        </Link>
      </nav>
      <p className="edit-hint">
        Los tamaños son las cajas (x3, x6, x12), cada una con sus minutos en la agenda. Cada diseño tiene sus
        colores, y cada color su foto y su precio por caja. El relleno se cobra por cupcake y la página lo
        multiplica por la caja. Un diseño aparece en la web cuando tiene al menos un color con foto, precio,
        sabor y relleno.
      </p>
    </div>
  );
}
