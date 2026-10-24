import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS, SOCIAL, waLink } from '../config';
import { useAdminAuth } from '../context/AdminAuth';
import CartButton, { CART_HREF } from './CartButton';
import MarqueeAnnounce from './MarqueeAnnounce';
import { PRODUCT_LINES } from '../productLines';
import './SiteChrome.css';

export const HOME_HREF = '/';

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
  const { isAdmin } = useAdminAuth();
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
        {/* gretica's way into the admin; hidden once she's logged in (the
            admin pages have their own bar). */}
        {!isAdmin && (
          <Link to="/admin" className="site-nav-admin" onClick={closeAll}>
            Administradora
          </Link>
        )}
      </nav>
    </header>
  );
}

// Single short message, repeated so one copy of the strip is wider than any
// screen (otherwise the loop shows a gap on desktop).
const FAREWELL = Array<string>(4).fill('Gracias por visitarnos 🎪');

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <>
      <MarqueeAnnounce messages={FAREWELL} />

      <footer className="site-footer">
        <Link to={HOME_HREF} className="brand">
          Melosa
        </Link>

        <div className="site-footer-cols">
          <div>
            <h4>Pedidos</h4>
            <Link to="/catalogo">Catálogo</Link>
            <Link to={CART_HREF}>Tu pedido</Link>
            <Link to={`${HOME_HREF}#como`}>Cómo pedir</Link>
            <Link to={`${HOME_HREF}#domicilios`}>¿Domicilios?</Link>
          </div>

          <div>
            <h4>Contacto</h4>
            <a href={waLink()} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
            <a href={SOCIAL.instagram} target="_blank" rel="noreferrer">
              Instagram
            </a>
            <a href={SOCIAL.tiktok} target="_blank" rel="noreferrer">
              TikTok
            </a>
            <a href={SOCIAL.facebook} target="_blank" rel="noreferrer">
              Facebook
            </a>
          </div>

          <div>
            <h4>Horarios</h4>
            <p>
              <strong>Atención por WhatsApp</strong>
              <br />
              {BUSINESS.attentionHours}
            </p>
            <p>
              <strong>Entregas</strong>
              <br />
              {BUSINESS.deliveryHours}
            </p>
            <p className="muted">{BUSINESS.deliveryNote}</p>
          </div>
        </div>

        <p className="site-footer-legal">
          © {year} Melosa · Hecho con 🤎 en {BUSINESS.city}
        </p>
      </footer>
    </>
  );
}
