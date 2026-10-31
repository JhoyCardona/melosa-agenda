import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuth';
import { CATALOG_LINES } from '../catalogLines';
import './adminLegacy.css';
import './cakeSettings.css';

const LINE = CATALOG_LINES.ALFAJOR_CAKE;

// "Torta de alfajor": same two spaces as the cake module (designs + their
// sizes/flavors/shapes), with the alfajor's own lists. The single pre-v2 alfajor
// design keeps its old editor until the new designs replace it; past orders
// stay linked to it either way.
export default function AlfajorCakeModulePage() {
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
      <h1>Torta de alfajor</h1>
      <nav className="cs-menu">
        <Link to={LINE.designsHref} className="cs-menu-item">
          Modificar / agregar diseños
        </Link>
        <Link to={LINE.settingsHref} className="cs-menu-item">
          Sabores, tamaños y formas
        </Link>
        <Link to="/admin/alfajores/torta/anterior" className="cs-menu-item">
          Torta de alfajor actual (versión anterior)
        </Link>
      </nav>
      <p className="edit-hint">
        Mientras no haya diseños nuevos completos, la web sigue mostrando la torta de alfajor actual. En cuanto
        exista al menos un diseño nuevo con su color, tamaño, sabores y forma activos, la web pasa a mostrar el
        catálogo nuevo de tortas de alfajor. Los pedidos ya hechos no cambian.
      </p>
    </div>
  );
}
