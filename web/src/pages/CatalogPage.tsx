import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import type { ProductDesign } from '../types';
import { useAdminAuth } from '../context/AdminAuth';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import './CatalogPage.css';

function minVariantPrice(design: ProductDesign): number | null {
  if (design.variants.length === 0) return null;
  return Math.min(...design.variants.map((v) => Number(v.price)));
}

// The minicake price = the price of the promo (2 porciones) variant. That's what
// the price filter buckets by; falls back to the cheapest variant if a design
// somehow has no promo variant.
function minicakePrice(design: ProductDesign): number | null {
  const promo = design.variants.filter((v) => v.enPromocion).map((v) => Number(v.price));
  if (promo.length > 0) return Math.min(...promo);
  return minVariantPrice(design);
}

// Minicake price tiers. "$32.000+" catches 32.000 and anything above it.
const PRICE_BUCKETS = [
  { id: '28000', label: '$28.000', test: (p: number) => p === 28000 },
  { id: '29000', label: '$29.000', test: (p: number) => p === 29000 },
  { id: '30000', label: '$30.000', test: (p: number) => p === 30000 },
  { id: '31000', label: '$31.000', test: (p: number) => p === 31000 },
  { id: '32000plus', label: '$32.000+', test: (p: number) => p >= 32000 },
];
const DEFAULT_BUCKET = '28000';

export default function CatalogPage() {
  const { isAdmin } = useAdminAuth();
  const [designs, setDesigns] = useState<ProductDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState(DEFAULT_BUCKET);

  const activeBucket = PRICE_BUCKETS.find((b) => b.id === bucketId) ?? PRICE_BUCKETS[0];
  const visibleDesigns = designs.filter((d) => {
    const price = minicakePrice(d);
    return price !== null && activeBucket.test(price);
  });

  useEffect(() => {
    api
      .get<ProductDesign[]>('/product-designs')
      .then((res) => setDesigns(res.data))
      .catch((err) => {
        console.error('Error cargando catálogo:', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="catalog-page">
      <AnnouncementBar />
      <SiteHeader />

      <main className="section">
        <div className="section-inner">
          <p className="eyebrow">Catálogo</p>
          <h1>Elige tu diseño</h1>
          {isAdmin && (
            <Link to="/admin/catalogo" className="btn btn-ghost catalog-admin-cta">
              Editar catálogo
            </Link>
          )}
          <p className="section-lead">
            Toca un diseño para empezar tu pedido. Cada diseño se hace en minicake de 2 porciones y
            en tamaños de 5, 10, 15 y 20 porciones: el tamaño y el precio los eliges en el siguiente
            paso.
          </p>

          {!loading && !error && designs.length > 0 && (
            <div className="price-tabs" role="group" aria-label="Filtrar minicakes por precio">
              {PRICE_BUCKETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`price-tab ${b.id === bucketId ? 'price-tab-active' : ''}`}
                  aria-pressed={b.id === bucketId}
                  onClick={() => {
                    setBucketId(b.id);
                    setSelectedId(null);
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}

          {loading && <p className="muted">Cargando catálogo...</p>}
          {error && !loading && (
            <p className="warning">No se pudo cargar el catálogo. Recarga la página en un momento.</p>
          )}
          {!loading && !error && designs.length === 0 && (
            <p className="muted">Pronto vamos a subir nuestros diseños acá.</p>
          )}
          {!loading && !error && designs.length > 0 && visibleDesigns.length === 0 && (
            <p className="muted">No hay diseños en {activeBucket.label} por ahora. Prueba otro precio.</p>
          )}

          {visibleDesigns.length > 0 && (
            <ul className="catalog-grid">
              {visibleDesigns.map((design) => {
                const price = minicakePrice(design);
                const isSelected = selectedId === design.id;
                return (
                  <li key={design.id} className={`catalog-card ${isSelected ? 'is-selected' : ''}`}>
                    <button
                      type="button"
                      className="catalog-card-media"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(isSelected ? null : design.id)}
                    >
                      {design.imageUrl ? (
                        <img src={design.imageUrl} alt={design.name} loading="lazy" />
                      ) : (
                        <span className="catalog-card-noimg" aria-hidden="true">
                          Sin foto
                        </span>
                      )}
                    </button>

                    <div className="catalog-card-body">
                      <h3>{design.name}</h3>
                      {price !== null && (
                        <p className="price">desde ${price.toLocaleString('es-CO')}</p>
                      )}

                      {isSelected && (
                        <Link to={`/agendar/${design.id}`} className="btn btn-primary catalog-card-cta">
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
