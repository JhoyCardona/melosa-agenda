import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS, SOCIAL, waLink } from '../config';
import { useAdminAuth } from '../context/AdminAuth';
import CartButton from './CartButton';
import MarqueeAnnounce from './MarqueeAnnounce';
import { PRODUCT_LINES } from '../productLines';
import './SiteChrome.css';

// Home page route. The redesigned home is still being built at /nuevo; switch
// this to '/' when it replaces the old Landing.
export const HOME_HREF = '/nuevo';

const ANNOUNCEMENTS = [
  '🍰 Promo: Minicake de alfajor desde $28.000',
  '📅 Agenda tu pedido en línea',
  '🛍️ Pedidos para recoger en el local',
];

// Top strip shared by every public page: the scrolling circus-sign marquee.
export function AnnouncementBar() {
  return <MarqueeAnnounce messages={ANNOUNCEMENTS} />;
}

// Hash links point at home sections; ScrollToTop scrolls to them on arrival.
const NAV_LINKS = [
  { to: `${HOME_HREF}#promociones`, label: 'Promociones' },
  { to: `${HOME_HREF}#como`, label: 'Cómo pedir' },
  { to: `${HOME_HREF}#domicilios`, label: '¿Domicilios?' },
];

// Same header on every public page: menu on the left, logo in the middle,
// cart on the right. On desktop the menu links sit in a row under the logo.
// "Productos" opens the list of product lines (a dropdown on desktop).
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  function closeAll() {
    setMenuOpen(false);
    setProductsOpen(false);
  }

  const [promos, ...rest] = NAV_LINKS;

  return (
    <header className="site-header">
      <div className="site-header-row">
        <button
          type="button"
          className="site-burger"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
        <Link to={HOME_HREF} className="brand" onClick={closeAll}>
          Melosa
        </Link>
        <div className="site-header-cart">
          <CartButton onClick={closeAll} />
        </div>
      </div>
      <nav id="site-nav" className={`site-nav ${menuOpen ? 'is-open' : ''}`}>
        <Link to={promos.to} onClick={closeAll}>
          {promos.label}
        </Link>
        <div className="site-nav-group">
          <button
            type="button"
            className="site-nav-toggle"
            aria-expanded={productsOpen}
            aria-controls="site-nav-products"
            onClick={() => setProductsOpen((o) => !o)}
          >
            Productos <span aria-hidden="true">{productsOpen ? '▴' : '▾'}</span>
          </button>
          {productsOpen && (
            <ul id="site-nav-products" className="site-nav-products">
              {PRODUCT_LINES.map((line) => (
                <li key={line.key}>
                  {line.href ? (
                    <Link to={line.href} onClick={closeAll}>
                      {line.name}
                    </Link>
                  ) : (
                    <span className="site-nav-soon">
                      {line.name} <small>Próximamente</small>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {rest.map((l) => (
          <Link key={l.to} to={l.to} onClick={closeAll}>
            {l.label}
          </Link>
        ))}
      </nav>
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
