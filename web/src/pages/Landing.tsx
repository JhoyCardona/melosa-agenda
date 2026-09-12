import { Link } from 'react-router-dom';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import HeroCarousel, { type HeroSlide } from '../components/HeroCarousel';
import { BUSINESS } from '../config';
import './Landing.css';

import heroCorazonAmarillo from '../assets/hero/hero-1-corazon-amarillo.jpeg';
import heroCorazonRoja from '../assets/hero/hero-2-corazon-roja.jpeg';
import heroCorazonRosadaVintage from '../assets/hero/hero-3-corazon-rosada-vintage.jpeg';
import heroAzulBrillante from '../assets/hero/hero-4-azul-brillante.jpeg';
import heroVerdeMariposas from '../assets/hero/hero-5-verde-mariposas.jpeg';
import heroNaranjaFlores from '../assets/hero/hero-6-naranja-flores.jpeg';
import heroDegradadoAzul from '../assets/hero/hero-7-degradado-azul.jpeg';
import promoMinicake from '../assets/promo/minicake-blanca-verde.jpeg';
import localMelosa from '../assets/local-melosa.jpeg';

const HERO_SLIDES: HeroSlide[] = [
  { src: heroCorazonAmarillo, alt: 'Torta corazón amarilla con crema batida y florecitas rosadas' },
  { src: heroCorazonRoja, alt: 'Torta corazón roja con borde de crema y la frase "1 year"' },
  { src: heroCorazonRosadaVintage, alt: 'Torta corazón rosada estilo vintage con perlas y detalles verdes' },
  { src: heroAzulBrillante, alt: 'Torta azul brillante redonda con moños amarillos y perlas' },
  { src: heroVerdeMariposas, alt: 'Torta verde con crema batida, rosas azules y mariposas moradas' },
  { src: heroNaranjaFlores, alt: 'Torta naranja con flores de crema y la frase "Feliz cumple"' },
  { src: heroDegradadoAzul, alt: 'Torta con degradado azul y lila y la frase "the best is yet to come"' },
];

const STEPS = [
  'Elige el diseño y el tamaño que quieres.',
  'Escoge la fecha y la hora de entrega disponibles.',
  'Deja tus datos y personaliza tu torta.',
  'Confirma por WhatsApp y haz el abono. Listo, tu pedido queda agendado.',
];

// The landing only teases one photo per section — the full range lives in the
// catalog, so more images here would just be noise.

export default function Landing() {
  return (
    <div className="landing">
      <AnnouncementBar />
      <SiteHeader />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="hero" id="inicio">
          <div className="hero-text">
            <h1>Tortas y minicakes hechas a pedido</h1>
            <p className="hero-lead">
              Agenda tu pedido en línea y recógelo en nuestro local de {BUSINESS.city}. Sin filas y
              sin esperas por WhatsApp.
            </p>
          </div>
          <div className="hero-media">
            <HeroCarousel slides={HERO_SLIDES} />
          </div>
        </section>

        {/* ---------- Promoción ---------- */}
        <section className="section section-soft" id="promo">
          <div className="section-inner">
            <p className="eyebrow">En promoción</p>
            <h2>Minicakes en promoción</h2>
            <p className="section-lead">
              Nuestra MiniCake es perfecta para 2 personas, ideal para un regalo especial o un
              antojo en pareja. Entra a nuestro catálogo y mira los diseños que tenemos disponibles.
            </p>

            <div className="feature">
              <img
                className="feature-photo"
                src={promoMinicake}
                alt="MiniCake blanca con crema batida, rosas azules y mariposas moradas"
                loading="lazy"
              />
            </div>

            <div className="feature-notes">
              <p className="feature-notes-title">Tener en cuenta que:</p>
              <ol>
                <li>
                  Puedes elegir el sabor del bizcocho: Vainilla o Chocolate. El relleno siempre es
                  de arequipe (nuevos sabores estarán disponibles pronto).
                </li>
                <li>Puedes modificar el texto o la imagen que lleva el diseño de ejemplo.</li>
                <li>
                  Se agenda con el 100% del valor de la MiniCake. Si pides 2 o más, se agenda con
                  el 50% del valor total del pedido.
                </li>
              </ol>
            </div>

            <div className="btn-row">
              <Link to="/catalogo" className="btn btn-primary">
                Ver minicakes
              </Link>
              <a href="#como" className="btn btn-ghost">
                Cómo pedir
              </a>
            </div>
          </div>
        </section>

        {/* ---------- Cómo pedir ---------- */}
        <section className="section" id="como">
          <div className="section-inner">
            <p className="eyebrow">Paso a paso</p>
            <h2>Cómo pedir</h2>
            <ol className="steps">
              {STEPS.map((step, i) => (
                <li key={i}>
                  <span className="step-num">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="muted">
              Agendamos de martes a sábado en horario de entrega de {BUSINESS.deliveryHours}. No
              agendamos domingos ni festivos.
            </p>
          </div>
        </section>

        {/* ---------- Tortas 5+ ----------
            Deshabilitada temporalmente: todavía no hay precios reales definidos
            para tamaños de 5+ porciones (quedaron con precio placeholder desde
            rebuildCatalog28000.ts). Mientras tanto la web solo ofrece minicakes.
            Ver CLAUDE.md / memoria del proyecto. Para reactivar: descomentar este
            bloque y el equivalente en CatalogPage.tsx y BookingPage.tsx.
        <section className="section section-soft" id="tortas">
          <div className="section-inner">
            <p className="eyebrow">¿Algo más grande?</p>
            <h2>Tortas de 5 porciones o más</h2>
            <p className="section-lead">
              Si necesitas una torta para compartir, tenemos tamaños de 5, 10, 15 y 20 porciones,
              con más sabores y rellenos para elegir. Se agendan igual que las minicakes, desde el
              mismo catálogo.
            </p>

            <Link to="/catalogo?ver=tortas" className="btn btn-primary">
              Ver el catálogo de tortas
            </Link>
          </div>
        </section>
        ---------- */}

        {/* ---------- Solo para recoger ---------- */}
        <section className="section pickup dot-edges" id="recoger">
          <div className="section-inner">
            <h2>Todos los pedidos son para recoger</h2>
            <p className="section-lead">
              Por ahora no hacemos domicilios. Todos los pedidos se recogen en nuestro local en la
              fecha y hora que eliges al agendar.
            </p>
          </div>
        </section>

        {/* ---------- Ubicación ---------- */}
        <section className="section section-soft" id="ubicacion">
          <div className="section-inner">
            <p className="eyebrow">Dónde estamos</p>
            <h2>Ubicación</h2>
            <div className="location-card">
              <div>
                <p className="location-address">{BUSINESS.addressLine}</p>
                <p className="muted">
                  {BUSINESS.city} · Estación de metro más cercana: {BUSINESS.nearestMetro}
                </p>
                <a
                  className="btn btn-primary"
                  href={BUSINESS.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir en Google Maps
                </a>
              </div>
              <img
                className="location-photo"
                src={localMelosa}
                alt="Fachada de Melosa Bakery en el barrio Guayabal, Medellín"
                loading="lazy"
              />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
