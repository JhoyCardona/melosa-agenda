import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWithRetry } from '../api';
import type { PublicCakeCatalog, PublicCakeDesign } from '../types';
import { useAdminAuth } from '../context/AdminAuth';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import DesignCarousel from '../components/DesignCarousel';
import EditBanner from '../components/EditBanner';
import './CatalogPage.css';

// Cake catalog (catalog v2). One card per design, cycling through its color
// photos. No prices or price filters here on purpose: the price depends on the
// size (and a little on the flavors), and the client sees it while building the
// order. Other product families (alfajores, cupcakes, postres) will get their
// own catalogs; the alfajor minicake is booked from the Landing's own button.
export default function CatalogPage() {
  const { isAdmin } = useAdminAuth();
  const [designs, setDesigns] = useState<PublicCakeDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadCatalog = useCallback(() => {
    setLoading(true);
    setSlow(false);
    setError(false);
    getWithRetry<PublicCakeCatalog>('/public-orders/cake-catalog', { onSlow: () => setSlow(true) })
      .then((data) => setDesigns(data.designs))
      .catch((err) => {
        console.error('Error cargando catálogo:', err);
        setError(true);
      })
      .finally(() => {
        setLoading(false);
        setSlow(false);
      });
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  return (
    <div className="catalog-page">
      <AnnouncementBar />
      <SiteHeader />

      <main className="section">
        <div className="section-inner">
          <EditBanner />
          <p className="eyebrow">Catálogo de tortas</p>
          <h1>Elige tu diseño</h1>
          {isAdmin && (
            <Link to="/admin/tortas/disenos" className="btn btn-ghost catalog-admin-cta">
              Editar diseños
            </Link>
          )}
          <p className="section-lead">
            Toca un diseño para empezar tu pedido. En el siguiente paso eliges el color, el tamaño y los
            sabores, y ves el precio.
          </p>

          {loading && (
            <p className="muted">
              {slow
                ? 'Estamos despertando el servidor, la primera carga del día puede tardar unos segundos...'
                : 'Cargando catálogo...'}
            </p>
          )}
          {error && !loading && (
            <p className="warning">
              No se pudo cargar el catálogo.{' '}
              <button type="button" className="link-button" onClick={loadCatalog}>
                Reintentar
              </button>
            </p>
          )}
          {!loading && !error && designs.length === 0 && (
            <p className="muted">Pronto vamos a subir nuestros diseños acá.</p>
          )}

          {designs.length > 0 && (
            <ul className="catalog-grid">
              {designs.map((design) => {
                const isSelected = selectedId === design.id;
                return (
                  <li key={design.id} className={`catalog-card ${isSelected ? 'is-selected' : ''}`}>
                    <button
                      type="button"
                      className="catalog-card-media"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(isSelected ? null : design.id)}
                    >
                      <DesignCarousel
                        images={design.colors.map((c) => ({ id: c.id, colorName: c.colorName, imageUrl: c.imageUrl }))}
                        fallbackImageUrl={design.colors[0]?.imageUrl ?? null}
                        alt={design.name}
                      />
                    </button>

                    <div className="catalog-card-body">
                      <h3>{design.name}</h3>
                      {isSelected && (
                        <Link to={`/tortas/${design.id}`} className="btn btn-primary catalog-card-cta">
                          Quiero esta
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
