import { Link } from 'react-router-dom';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import HeroCarousel, { type HeroSlide } from '../components/HeroCarousel';
import { BUSINESS } from '../config';
import './Landing.css';

import heroRosaCorazon from '../assets/hero/hero-1-rosa-corazon.jpeg';
import heroRojaCorazon from '../assets/hero/hero-2-roja-corazon.jpeg';
import heroAzulAmarillo from '../assets/hero/hero-3-azul-amarillo.jpeg';
import heroMoradoCorazon from '../assets/hero/hero-4-morado-corazon.jpeg';
import heroRosaCerezas from '../assets/hero/hero-5-rosa-cerezas.jpeg';
import heroCremaFlores from '../assets/hero/hero-6-crema-flores.jpeg';

// Placeholder photos — the client will send an organized set later.
const HERO_SLIDES: HeroSlide[] = [
  { src: heroRosaCorazon, alt: 'Minicake rosada en forma de corazón con perlas y moños' },
  { src: heroRojaCorazon, alt: 'Minicake roja en forma de corazón con borde de crema' },
  { src: heroAzulAmarillo, alt: 'Minicake azul redonda con moños amarillos' },
  { src: heroMoradoCorazon, alt: 'Minicake morada en forma de corazón con escarcha' },
  { src: heroRosaCerezas, alt: 'Minicake rosada decorada con cerezas' },
  { src: heroCremaFlores, alt: 'Minicake color crema con flores y mariposas' },
];

const STEPS = [
  'Elige el diseño y el tamaño que quieres.',
  'Escoge la fecha y la hora de entrega disponibles.',
  'Deja tus datos y personaliza tu torta.',
  'Confirma por WhatsApp y haz el abono. Listo, tu pedido queda agendado.',
];

// The landing only teases one photo per section — the full range lives in the
// catalog, so more images here would just be noise. Photos come later.
const PROMO_FEATURE = { name: 'Minicake Blanca y Rosada', price: 29000 };
const CAKE_FEATURE = { name: 'Torta de 5 porciones', price: 70000 };

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
              Nuestra minicake individual de 2 porciones: ideal para regalar o para un antojo. La
              personalizas con color, sabor y una frase o una foto para imprimir. El pago de la
              promoción es del 100% por adelantado.
            </p>

            <div className="feature">
              <div className="feature-photo" aria-hidden="true">
                Foto próximamente
              </div>
              <div className="feature-body">
                <h3>{PROMO_FEATURE.name}</h3>
                <p className="price">${PROMO_FEATURE.price.toLocaleString('es-CO')}</p>
              </div>
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

        {/* ---------- Tortas 5+ ---------- */}
        <section className="section section-soft" id="tortas">
          <div className="section-inner">
            <p className="eyebrow">¿Algo más grande?</p>
            <h2>Tortas de 5 porciones o más</h2>
            <p className="section-lead">
              Si necesitas una torta para compartir, tenemos tamaños de 5, 10, 15 y 20 porciones,
              con más sabores y rellenos para elegir. Se agendan igual que las minicakes, desde el
              mismo catálogo.
            </p>

            <div className="feature">
              <div className="feature-photo" aria-hidden="true">
                Foto próximamente
              </div>
              <div className="feature-body">
                <h3>{CAKE_FEATURE.name}</h3>
                <p className="price">${CAKE_FEATURE.price.toLocaleString('es-CO')}</p>
              </div>
            </div>

            <Link to="/catalogo" className="btn btn-primary">
              Ver el catálogo de tortas
            </Link>
          </div>
        </section>

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
              {/* TODO: foto del local cuando el cliente la envíe. */}
              <div className="location-photo-placeholder" aria-hidden="true">
                Foto del local
                <br />
                (próximamente)
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
