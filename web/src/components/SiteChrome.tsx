import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS, SOCIAL, waLink } from '../config';
import { useAdminAuth } from '../context/AdminAuth';
import './SiteChrome.css';

// Announcement strip: shows one full message at a time and rotates through them
// with a short fade. On a phone a scrolling marquee only ever shows a chopped
// fragment, so we swap whole lines instead. The fade is dropped under
// prefers-reduced-motion (handled in CSS); the rotation itself stays.
// Keep each line short enough to fit on one line on a phone — see the
// white-space:nowrap rule in SiteChrome.css. Rough limit: ~34 characters.
const ANNOUNCEMENTS = [
  '🍰 Minicakes en promo desde $28.000',
  '📅 Agenda tu pedido en línea',
  '🛍️ Pedidos para recoger en el local',
];

const ROTATE_MS = 4000;

export function AnnouncementBar() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (ANNOUNCEMENTS.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % ANNOUNCEMENTS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="announce dot-edges" role="region" aria-label="Anuncios de Melosa">
      {/* key forces a remount so the fade-in animation replays on every change. */}
      <p key={index} className="announce-msg" aria-live="polite">
        {ANNOUNCEMENTS[index]}
      </p>
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
