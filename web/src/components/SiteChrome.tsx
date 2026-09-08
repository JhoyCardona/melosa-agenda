import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS, SOCIAL, waLink } from '../config';
import { useAdminAuth } from '../context/AdminAuth';
import './SiteChrome.css';

// Announcement strip: a continuous right-to-left marquee (Levain style). The
// message list is repeated MARQUEE_COPIES times back-to-back inside the track;
// the CSS animation slides it by exactly one copy (translateX 0 -> -1/COPIES),
// so it loops seamlessly. 4 copies keep the strip full even on wide desktops
// (2 copies leave a visible gap when one copy is narrower than the viewport).
// Pauses on hover; static under prefers-reduced-motion (handled in CSS).
const MARQUEE_COPIES = 4;
const ANNOUNCEMENTS = [
  '🍰 Minicakes en promo desde $28.000',
  '📅 Agenda tu pedido en línea',
  '🛍️ Pedidos para recoger en el local',
];

function AnnounceGroup() {
  return (
    <div className="announce-group">
      {ANNOUNCEMENTS.map((msg, i) => (
        <span key={i} className="announce-item">
          {msg}
        </span>
      ))}
    </div>
  );
}

export function AnnouncementBar() {
  return (
    <div className="announce dot-edges" role="region" aria-label="Anuncios de Melosa">
      <div className="announce-track" aria-hidden="true">
        {Array.from({ length: MARQUEE_COPIES }, (_, i) => (
          <AnnounceGroup key={i} />
        ))}
      </div>
      {/* One clean copy for screen readers — the visual track is repeated. */}
      <p className="sr-only">{ANNOUNCEMENTS.join('. ')}</p>
    </div>
  );
}

// Anchors point at the landing sections. Prefixed with BASE_URL so they also
// work from sub-pages (/catalogo, /agendar): from the landing the browser just
// scrolls, from elsewhere it navigates home and then scrolls.
const NAV_LINKS = [
  { hash: '#promo', label: 'Promoción Minicakes' },
  { hash: '#como', label: 'Cómo pedir' },
  { hash: '#tortas', label: 'Tortas 5+ porciones' },
  { hash: '#ubicacion', label: 'Ubicación' },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const base = import.meta.env.BASE_URL;

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
          Melosa
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? '✕' : '☰'}
          <span className="sr-only">Menú</span>
        </button>

        <nav id="site-nav" className={`site-nav ${menuOpen ? 'is-open' : ''}`}>
          {NAV_LINKS.map((l) => (
            <a key={l.hash} href={`${base}${l.hash}`} onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
          <Link to="/catalogo" className="nav-cta" onClick={() => setMenuOpen(false)}>
            Ver catálogo
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const { isAdmin } = useAdminAuth();

  return (
    <>
      <div className="closing-strip">Gracias por visitar a Melosa 🤎</div>

      <footer className="site-footer" id="redes">
        <div className="site-footer-grid">
          <div>
            <h3>Contacto</h3>
            <p>{BUSINESS.attentionChannel}</p>
            <p>{BUSINESS.attentionHours}</p>
            <a className="footer-link" href={waLink()} target="_blank" rel="noreferrer">
              Escríbenos por WhatsApp
            </a>
          </div>

          <div>
            <h3>Ubicación</h3>
            <p>{BUSINESS.addressLine}</p>
            <p>Estación de metro más cercana: {BUSINESS.nearestMetro}</p>
            <a className="footer-link" href={BUSINESS.mapsUrl} target="_blank" rel="noreferrer">
              Abrir en Google Maps
            </a>
          </div>

          <div>
            <h3>Horarios</h3>
            <p>Atención (WhatsApp): {BUSINESS.attentionHours}</p>
            <p>Entregas: {BUSINESS.deliveryHours}</p>
            <p className="muted">{BUSINESS.deliveryNote}</p>
          </div>

          <div>
            <h3>Redes</h3>
            <p>
              <a className="footer-link" href={SOCIAL.instagram} target="_blank" rel="noreferrer">
                Instagram
              </a>
            </p>
            <p>
              <a className="footer-link" href={SOCIAL.tiktok} target="_blank" rel="noreferrer">
                TikTok
              </a>
            </p>
            <p>
              <a className="footer-link" href={SOCIAL.facebook} target="_blank" rel="noreferrer">
                Facebook
              </a>
            </p>
          </div>
        </div>

        <p className="site-footer-legal">
          © {year} Melosa · Hecho con 🤎 en {BUSINESS.city}
          {!isAdmin && (
            <>
              {' · '}
              <Link className="footer-admin-link" to="/admin">
                Administradora
              </Link>
            </>
          )}
        </p>
      </footer>
    </>
  );
}
