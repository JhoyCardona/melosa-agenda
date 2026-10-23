import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWithRetry } from '../api';
import type { PublicCakeCatalog, PublicCakeDesign } from '../types';
import { useAdminAuth } from '../context/AdminAuth';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import DesignCarousel from '../components/DesignCarousel';
import EditBanner from '../components/EditBanner';
import { pesos } from '../bookingShared';
import './CatalogPage.css';

// How many price buttons to show at most. When there are more distinct prices,
// the last button becomes "<price>+" and groups everything from there up.
const MAX_PRICE_BUTTONS = 4;

// A design's MiniCake price = its smallest size, cheapest color. null when the
// design has no sizes loaded (it then only shows under "Todos").
function minicakePrice(design: PublicCakeDesign): number | null {
  let best: { portions: number; price: number } | null = null;
  for (const color of design.colors) {
    for (const size of color.sizes) {
      if (!best || size.portions < best.portions || (size.portions === best.portions && size.price < best.price)) {
        best = { portions: size.portions, price: size.price };
      }
    }
  }
  return best?.price ?? null;
}

interface PriceBucket {
  min: number;
  // true on the last button when it groups several prices ("39.000+").
  orMore: boolean;
}

// Buttons come from the prices that really exist, cheapest first, so they
// update by themselves when a design is added or repriced — never an empty one.
function priceBuckets(prices: number[]): PriceBucket[] {
  const distinct = [...new Set(prices)].sort((a, b) => a - b);
  if (distinct.length <= MAX_PRICE_BUTTONS) return distinct.map((min) => ({ min, orMore: false }));
  return distinct.slice(0, MAX_PRICE_BUTTONS).map((min, i) => ({ min, orMore: i === MAX_PRICE_BUTTONS - 1 }));
}

function inBucket(price: number | null, bucket: PriceBucket): boolean {
  if (price === null) return false;
  return bucket.orMore ? price >= bucket.min : price === bucket.min;
}

// Cake catalog (catalog v2). One card per design, cycling through its color
// photos. The price buttons filter by MiniCake price (most sales are
// minicakes); bigger sizes and flavor surcharges show while building the order.
// Other product families (alfajores, cupcakes, postres) will get their own
// catalogs; the alfajor minicake is booked from the Landing's own button.
export default function CatalogPage() {
  const { isAdmin } = useAdminAuth();
  const [designs, setDesigns] = useState<PublicCakeDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // null = "Todos".
  const [bucket, setBucket] = useState<PriceBucket | null>(null);

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

  const buckets = useMemo(
    () => priceBuckets(designs.map(minicakePrice).filter((p): p is number => p !== null)),
    [designs],
  );
  const visibleDesigns = bucket ? designs.filter((d) => inBucket(minicakePrice(d), bucket)) : designs;

  function pickBucket(next: PriceBucket | null) {
    // Tapping the active price again goes back to "Todos".
    setBucket(next && bucket && next.min === bucket.min ? null : next);
    setSelectedId(null);
  }

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
          <p className="catalog-notice">
            En este momento solo estamos agendando los diseños y colores que verás a continuación.
            Solo puedes editar la imagen y/o el texto, si el diseño lo permite.
          </p>

          {!loading && !error && buckets.length > 0 && (
            <>
              <p className="price-tabs-label">Precio MiniCake:</p>
              <div className="price-tabs" role="group" aria-label="Filtrar diseños por precio de MiniCake">
                <button
                  type="button"
                  className={`price-tab ${bucket === null ? 'price-tab-active' : ''}`}
                  aria-pressed={bucket === null}
                  onClick={() => pickBucket(null)}
                >
                  Todos
                </button>
                {buckets.map((b) => {
                  const active = bucket?.min === b.min;
                  return (
                    <button
                      key={b.min}
                      type="button"
                      className={`price-tab ${active ? 'price-tab-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => pickBucket(b)}
                    >
                      {pesos(b.min)}
                      {b.orMore && '+'}
                    </button>
                  );
                })}
              </div>
            </>
          )}

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

          {visibleDesigns.length > 0 && (
            <ul className="catalog-grid">
              {visibleDesigns.map((design) => {
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
