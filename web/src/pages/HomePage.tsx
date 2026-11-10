import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getWithRetry } from '../api';
import type { PublicCakeCatalog, PublicCakeColor, PublicCakeDesign, ProductDesign } from '../types';
import { catalogPhotoUrl, pesos } from '../bookingShared';
import { BUSINESS } from '../config';
import './HomePage.css';

import { BulbRow } from '../components/MarqueeAnnounce';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import { ALFAJOR_HREF, PRODUCT_LINES } from '../productLines';
import minicakePhoto from '../assets/promo/minicake-blanca-verde.jpeg';
import alfajorFallback from '../assets/alfajor/minicake-alfajor.jpeg';
import localMelosa from '../assets/local-melosa.jpeg';

// Home page: every product line, hand-picked favorites, the alfajor cakes,
// how to order and the pickup-only notice. Header, announcement strip and
// footer are the shared SiteChrome ones.

// Hand-picked showcase, in display order: design name + the color whose photo
// to show. Matched by name, ignoring case and accents, so a renamed or deleted
// design just drops out. No color = the design's first one.
const FEATURED: { design: string; color?: string }[] = [
  { design: 'Encanto Coquette', color: 'Rosado' },
  { design: 'Lago Encantado', color: 'Verde Pastel' },
  { design: 'Fantasía Lambeth' },
  { design: 'Gota de cereza' },
  { design: 'Listón de Seda' },
  { design: 'Marea Dulce', color: 'Azul Pastel' },
];

interface Favorite {
  design: PublicCakeDesign;
  color: PublicCakeColor;
}

const normalize = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

function pickFeatured(designs: PublicCakeDesign[]): Favorite[] {
  return FEATURED.flatMap(({ design: name, color: colorName }) => {
    const design = designs.find((d) => normalize(d.name) === normalize(name));
    const color =
      design?.colors.find((c) => colorName && normalize(c.colorName) === normalize(colorName)) ?? design?.colors[0];
    return design && color ? [{ design, color }] : [];
  });
}

// Same order as the real flow: the date is picked last, in the cart, once the
// pickup time can account for every product.
const STEPS = [
  { title: 'Elige tu diseño', text: 'Entra al catálogo y escoge la cake que más te guste.' },
  { title: 'Personalízala', text: 'Escoge tamaño, sabores y forma, y cambia el texto o la imagen si el diseño lo permite.' },
  { title: 'Arma tu pedido', text: 'Agrégala a tu pedido. Puedes sumar más tortas antes de finalizar.' },
  { title: 'Elige la fecha y envía', text: 'En tu pedido escoges el día, ves la hora de recogida y lo envías por WhatsApp para hacer el abono.' },
];

// One alfajor cake card. Built from the new alfajor catalog (catalog v2) once
// it has designs, otherwise from the pre-v2 alfajor designs, so the section
// follows the switch by itself, like /alfajor does.
interface AlfajorCard {
  id: string;
  name: string;
  photo: string | null;
  price: number | null;
  href: string;
}

function v2AlfajorCards(designs: PublicCakeDesign[]): AlfajorCard[] {
  return designs.flatMap((design) => {
    const color = design.colors[0];
    return color
      ? [{
          id: design.id,
          name: design.name,
          photo: color.imageUrl,
          price: fromPrice(design),
          href: `/tortas/${design.id}?color=${color.id}`,
        }]
      : [];
  });
}

function legacyAlfajorCards(designs: ProductDesign[]): AlfajorCard[] {
  return designs
    .filter((d) => d.category === 'ALFAJOR_CAKE')
    .map((d) => {
      const prices = d.variants.map((v) => Number(v.price));
      return {
        id: d.id,
        name: d.name,
        photo: d.imageUrl,
        price: prices.length ? Math.min(...prices) : null,
        href: `/agendar/${d.id}`,
      };
    });
}

// Cheapest size across all colors = the "desde" price on the card.
function fromPrice(design: PublicCakeDesign): number | null {
  const prices = design.colors.flatMap((c) => c.sizes.map((s) => s.price));
  return prices.length ? Math.min(...prices) : null;
}

export default function HomePage() {
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);
  const [alfajorCards, setAlfajorCards] = useState<AlfajorCard[] | null>(null);

  useEffect(() => {
    getWithRetry<PublicCakeCatalog>('/public-orders/cake-catalog')
      .then((data) => setFavorites(pickFeatured(data.designs)))
      .catch((err) => {
        console.error('Error cargando catálogo:', err);
        setFavorites([]);
      });
    async function loadAlfajor() {
      const v2 = await getWithRetry<PublicCakeCatalog>('/public-orders/cake-catalog', {
        config: { params: { category: 'ALFAJOR_CAKE' } },
      });
      if (v2.designs.length > 0) return v2AlfajorCards(v2.designs);
      return legacyAlfajorCards(await getWithRetry<ProductDesign[]>('/product-designs'));
    }
    loadAlfajor()
      .then(setAlfajorCards)
      .catch((err) => {
        console.error('Error cargando tortas de alfajor:', err);
        setAlfajorCards([]);
      });
  }, []);

  const alfajorPhoto = alfajorCards?.find((c) => c.photo)?.photo ?? alfajorFallback;

  const [addressCopied, setAddressCopied] = useState(false);

  async function copyAddress() {
    const text = `${BUSINESS.addressLine}, ${BUSINESS.city}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // navigator.clipboard only exists on https (and localhost). Plain-http
      // fallback, e.g. testing from a phone on the local network.
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    setAddressCopied(true);
    window.setTimeout(() => setAddressCopied(false), 2500);
  }

  // Photos for the bookable lines; the rest show as "Próximamente".
  const linePhotos: Record<string, string> = { cakes: minicakePhoto, alfajor: alfajorPhoto };

  return (
    <div className="nh">
      <AnnouncementBar />
      <SiteHeader />

      <main>
        {/* ---------- Every product line, each to its own catalog ---------- */}
        <section className="nh-section">
          <h2 className="nh-title">Nuestros productos</h2>
          <div className="nh-categories">
            {PRODUCT_LINES.map((line) =>
              line.href ? (
                <Link key={line.key} to={line.href} className="nh-category">
                  <img src={linePhotos[line.key]} alt="" loading="lazy" />
                  <span>{line.name}</span>
                </Link>
              ) : (
                <div key={line.key} className="nh-category is-soon">
                  <span className="nh-category-soon" aria-hidden="true">
                    Próximamente
                  </span>
                  <span>{line.name}</span>
                  <small className="sr-only">Próximamente</small>
                </div>
              )
            )}
          </div>
        </section>

        {/* ---------- Favorites: hand-picked designs, framed by bulb rows ---------- */}
        <div className="nh-lights" aria-hidden="true">
          <BulbRow />
        </div>
        <section className="nh-section nh-section-soft nh-favorites">
          <div className="nh-section-head">
            <h2 className="nh-title">Favoritos</h2>
            <Link to="/catalogo" className="nh-link">
              Ver todo
            </Link>
          </div>
          {favorites === null ? (
            <p className="nh-muted">Cargando diseños…</p>
          ) : favorites.length === 0 ? (
            <p className="nh-muted">
              No pudimos cargar los diseños. <Link to="/catalogo">Ir al catálogo</Link>
            </p>
          ) : (
            <div className="nh-products">
              {favorites.map(({ design, color }) => {
                const price = fromPrice(design);
                return (
                  <Link key={design.id} to={`/tortas/${design.id}?color=${color.id}`} className="nh-product">
                    <div className="nh-product-photo">
                      {color.imageUrl && (
                        <img src={catalogPhotoUrl(color.imageUrl)} alt={design.name} loading="lazy" />
                      )}
                    </div>
                    <p className="nh-product-name">{design.name}</p>
                    {price !== null && <p className="nh-product-price">Desde {pesos(price)}</p>}
                    <span className="nh-btn nh-btn-small">Agendar</span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
        <div className="nh-lights" aria-hidden="true">
          <BulbRow />
        </div>

        {/* ---------- Alfajor cakes: same cards and bulb frame as Favoritos ---------- */}
        <section className="nh-section nh-section-soft nh-alfajor" id="alfajor">
          <div className="nh-section-head">
            <h2 className="nh-title">Minicake de alfajor</h2>
            <Link to={ALFAJOR_HREF} className="nh-link">
              Ver todo
            </Link>
          </div>
          {alfajorCards === null ? (
            <p className="nh-muted">Cargando diseños…</p>
          ) : alfajorCards.length === 0 ? (
            <p className="nh-muted">
              No pudimos cargar los diseños. <Link to={ALFAJOR_HREF}>Ir a las tortas de alfajor</Link>
            </p>
          ) : (
            <div className="nh-products">
              {alfajorCards.map((card) => (
                <Link key={card.id} to={card.href} className="nh-product">
                  <div className="nh-product-photo">
                    {card.photo && <img src={catalogPhotoUrl(card.photo)} alt={card.name} loading="lazy" />}
                  </div>
                  <p className="nh-product-name">{card.name}</p>
                  {card.price !== null && <p className="nh-product-price">Desde {pesos(card.price)}</p>}
                  <span className="nh-btn nh-btn-small">Agendar</span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <div className="nh-lights" aria-hidden="true">
          <BulbRow />
        </div>

        {/* ---------- How to order ---------- */}
        <section className="nh-section" id="como">
          <h2 className="nh-title">Cómo pedir</h2>
          <ol className="nh-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="nh-step-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="nh-muted nh-center">
            Entregas de {BUSINESS.deliveryHours} · {BUSINESS.deliveryNote}
          </p>
        </section>

        {/* ---------- Pickup only: answers the frequent "¿tienen domicilios?" ---------- */}
        <section className="nh-section nh-delivery" id="domicilios">
          <h2 className="nh-title">¿Domicilios?</h2>
          <p className="nh-lead">
            Por ahora no contamos con domicilios, porque no tenemos personal para hacer las entregas de forma
            cuidadosa y segura. Agradecemos tu comprensión: todos nuestros pedidos son para recoger en nuestro local.
          </p>
          <img className="nh-delivery-photo" src={localMelosa} alt="Fachada de Melosa Bakery" loading="lazy" />
          <p className="nh-delivery-address">
            {BUSINESS.addressLine}, {BUSINESS.city}. Metro más cercano: {BUSINESS.nearestMetro}.
          </p>
          <div className="nh-delivery-actions">
            <a href={BUSINESS.mapsUrl} target="_blank" rel="noreferrer" className="nh-btn">
              Abrir en Google Maps
            </a>
            <button type="button" className="nh-btn nh-btn-outline" onClick={copyAddress}>
              {addressCopied ? '¡Dirección copiada!' : 'Copiar dirección'}
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
