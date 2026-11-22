import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWithRetry } from '../api';
import type { PublicCakeCatalog, PublicCakeDesign } from '../types';
import { useAdminAuth } from '../context/AdminAuth';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import DesignCarousel from '../components/DesignCarousel';
import MarqueeFrame from '../components/MarqueeFrame';
import EditBanner from '../components/EditBanner';
import { catalogPhotoUrl, pesos } from '../bookingShared';
import { CATALOG_LINES, type CatalogLine } from '../catalogLines';
import { searchByName } from '../fuzzySearch';
import { waLink, ALFAJOR_QUOTE_MESSAGE } from '../config';
import { MAX_ALFAJORES } from '../bookingShared';
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

interface CatalogCardProps {
  design: PublicCakeDesign;
}

// true while the element is on screen, or within `margin` of it. Used so only
// the visible cards blink and rotate photos — the rest of the catalog sits still.
function useInView<T extends Element>(margin: string): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: margin,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [margin]);
  return [ref, inView];
}

// One design: its photo (the customer flips through the colors with the
// arrows; nothing moves on its own) and the marquee sign with its name.
// Tapping the photo opens the design with the color on screen preselected.
function CatalogCard({ design }: CatalogCardProps) {
  const [index, setIndex] = useState(0);
  const [cardRef, inView] = useInView<HTMLLIElement>('0px');
  // A screen ahead: start fetching this card's color photos before the
  // customer scrolls to it, so the arrows switch instantly.
  const [preloadRef, nearView] = useInView<HTMLDivElement>('100% 0px');
  const images = design.colors.map((c) => ({ id: c.id, colorName: c.colorName, imageUrl: c.imageUrl }));
  const count = images.length;

  useEffect(() => {
    if (!nearView) return;
    for (const img of images) {
      if (img.imageUrl) new Image().src = catalogPhotoUrl(img.imageUrl);
    }
    // Only re-run when the card comes into view, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearView]);

  function step(delta: number) {
    setIndex((i) => (i + delta + count) % count);
  }

  const colorId = images[index]?.id;

  return (
    <li ref={cardRef} className="catalog-card">
      <div className="catalog-card-photo" ref={preloadRef}>
        <Link
          to={`/tortas/${design.id}${colorId ? `?color=${colorId}` : ''}`}
          className="catalog-card-media"
          aria-label={`Agendar ${design.name}${images[index] ? `, color ${images[index].colorName}` : ''}`}
        >
          <DesignCarousel
            images={images}
            fallbackImageUrl={design.colors[0]?.imageUrl ?? null}
            alt={design.name}
            index={index}
          />
        </Link>
        {count > 1 && (
          <>
            <button
              type="button"
              className="catalog-photo-arrow catalog-photo-arrow-prev"
              aria-label="Ver decoración anterior"
              onClick={() => step(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="catalog-photo-arrow catalog-photo-arrow-next"
              aria-label="Ver decoración siguiente"
              onClick={() => step(1)}
            >
              ›
            </button>
          </>
        )}
      </div>

      <div className="catalog-card-body">
        {design.name && (
          <div className="catalog-card-frame">
            <MarqueeFrame title={design.name} live={inView} />
          </div>
        )}
      </div>
    </li>
  );
}

// Cake catalog (catalog v2). One card per design, its color photos one tap
// of the arrows away. The price buttons filter by MiniCake price (most sales are
// minicakes); bigger sizes and flavor surcharges show while building the order.
// The same page, with category="ALFAJOR_CAKE", is the alfajor cake catalog
// (/catalogo-alfajor), and with "ALFAJOR_UNIT" the small-alfajor boxes
// (/catalogo-alfajores, "Antojo de alfajores"); cupcakes and postres will get
// their own later.
export default function CatalogPage({ category = 'CAKE' }: { category?: CatalogLine }) {
  const line = CATALOG_LINES[category];
  const isAlfajor = category === 'ALFAJOR_CAKE';
  const boxes = line.boxes;
  const { isAdmin } = useAdminAuth();
  const [designs, setDesigns] = useState<PublicCakeDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  // null = "Todos".
  const [bucket, setBucket] = useState<PriceBucket | null>(null);
  const [query, setQuery] = useState('');

  const loadCatalog = useCallback(() => {
    setLoading(true);
    setSlow(false);
    setError(false);
    getWithRetry<PublicCakeCatalog>('/public-orders/cake-catalog', {
      onSlow: () => setSlow(true),
      config: { params: { category } },
    })
      // Always A→Z by name (Spanish rules: accents and case don't matter), so
      // every price filter shows its designs in the same order. Alfajor boxes
      // go smallest box first instead.
      .then((data) =>
        setDesigns(
          [...data.designs].sort(
            (a, b) =>
              (boxes ? (a.unitsPerBox ?? 0) - (b.unitsPerBox ?? 0) : 0) ||
              a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
          ),
        ),
      )
      .catch((err) => {
        console.error('Error cargando catálogo:', err);
        setError(true);
      })
      .finally(() => {
        setLoading(false);
        setSlow(false);
      });
  }, [category, boxes]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Alfajor boxes filter by how many alfajores come in the box (x6, x15...),
  // which is what a buyer decides first; every other line filters by price.
  // Box sizes are few (x6–x50), so each one gets its own button, no "+" group.
  const filterValue = useCallback(
    (d: PublicCakeDesign) => (boxes ? d.unitsPerBox ?? null : minicakePrice(d)),
    [boxes],
  );
  const buckets = useMemo(() => {
    const values = designs.map(filterValue).filter((v): v is number => v !== null);
    return boxes
      ? [...new Set(values)].sort((a, b) => a - b).map((min) => ({ min, orMore: false }))
      : priceBuckets(values);
  }, [designs, filterValue, boxes]);
  const priceFiltered = bucket ? designs.filter((d) => inBucket(filterValue(d), bucket)) : designs;
  // Name search runs inside the price filter; no matches → closest names instead.
  const search = useMemo(() => searchByName(priceFiltered, query, (d) => d.name), [priceFiltered, query]);
  const searching = query.trim() !== '';
  const visibleDesigns = search.matches.length > 0 ? search.matches : search.suggestions;

  function pickBucket(next: PriceBucket | null) {
    // Tapping the active price again goes back to "Todos".
    setBucket(next && bucket && next.min === bucket.min ? null : next);
  }

  return (
    <div className="catalog-page">
      <AnnouncementBar />
      <SiteHeader />

      <main className="section">
        <div className="section-inner">
          <EditBanner />
          <p className="eyebrow">
            {boxes ? 'Antojo de alfajores' : isAlfajor ? 'Catálogo de tortas de alfajor' : 'Catálogo de tortas'}
          </p>
          <h1>{boxes ? 'Elige tu caja' : 'Elige tu diseño'}</h1>
          {isAdmin && (
            <Link to={line.designsHref} className="btn btn-ghost catalog-admin-cta">
              Editar diseños
            </Link>
          )}
          {boxes ? (
            <>
              <p className="section-lead">
                Toca la foto de una caja para empezar tu pedido. En el siguiente paso eliges el empaque, el tamaño
                de los alfajores y la forma, y ves el precio. Puedes agregar varias cajas al mismo pedido.
              </p>
              <div className="catalog-notice">
                <p>
                  Por la web puedes pedir hasta {MAX_ALFAJORES} alfajores. ¿Necesitas más? Te cotizamos por
                  WhatsApp.
                </p>
                <a className="btn btn-ghost" href={waLink(ALFAJOR_QUOTE_MESSAGE)} target="_blank" rel="noreferrer">
                  +{MAX_ALFAJORES} alfajores: cotizar por WhatsApp
                </a>
              </div>
            </>
          ) : (
            <>
              <p className="section-lead">
                Toca la foto de un diseño para empezar tu pedido. En el siguiente paso eliges el color, el tamaño y
                los sabores, y ves el precio.
              </p>
              <p className="catalog-notice">
                En este momento solo estamos agendando los diseños y colores que verás a continuación.
                Solo puedes editar la imagen y/o el texto, si el diseño lo permite.
              </p>
            </>
          )}

          {!loading && !error && designs.length > 0 && (
            <div className="catalog-search">
              <label htmlFor="catalog-search-input" className="price-tabs-label">
                {boxes ? 'Busca tu caja por nombre:' : 'Busca tu torta por nombre:'}
              </label>
              <input
                id="catalog-search-input"
                type="search"
                className="catalog-search-input"
                placeholder={boxes ? 'Ej: x15, navidad...' : 'Ej: corazón, vintage...'}
                value={query}
                autoComplete="off"
                enterKeyHint="search"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          {!loading && !error && buckets.length > 0 && (
            <>
              <p className="price-tabs-label">
                {boxes ? 'Alfajores por caja:' : isAlfajor ? 'Precio desde:' : 'Precio MiniCake:'}
              </p>
              <div
                className="price-tabs"
                role="group"
                aria-label={boxes ? 'Filtrar cajas por cantidad de alfajores' : 'Filtrar diseños por precio'}
              >
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
                      {boxes ? `x${b.min}` : pesos(b.min)}
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
            <p className="muted">
              {boxes ? 'Pronto vamos a subir nuestras cajas de alfajores acá.' : 'Pronto vamos a subir nuestros diseños acá.'}
            </p>
          )}

          {searching && search.matches.length === 0 && (
            <div className="catalog-search-empty">
              <p>
                No encontramos {boxes ? 'una caja llamada' : 'una torta llamada'} <strong>“{query.trim()}”</strong>
                {bucket ? (boxes ? ' en esta cantidad' : ' en este precio') : ''}.
                {search.suggestions.length > 0 && ' ¿Quisiste decir alguna de estas?'}
              </p>
              <div className="catalog-search-actions">
                {bucket && (
                  <button type="button" className="link-button" onClick={() => setBucket(null)}>
                    Buscar en todos los precios
                  </button>
                )}
                <button type="button" className="link-button" onClick={() => setQuery('')}>
                  Borrar búsqueda
                </button>
              </div>
            </div>
          )}

          {visibleDesigns.length > 0 && (
            <ul className="catalog-grid">
              {visibleDesigns.map((design) => (
                <CatalogCard
                  key={design.id}
                  design={design}
                />
              ))}
            </ul>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
