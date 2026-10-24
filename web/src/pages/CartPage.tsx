import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderDraft } from '../context/OrderDraft';
import { useCartRevalidation } from '../cartValidation';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import BookingCheckout from '../components/BookingCheckout';
import { manageHref } from '../bookingShared';
import './BookingPage.css';

const CATALOG_HREF = '/catalogo';

// "Tu pedido": the one place to review the cart, pick the date, leave the
// customer data and send the order. The booking pages only add products.
export default function CartPage() {
  const draft = useOrderDraft();
  const navigate = useNavigate();
  const cartWasStale = useCartRevalidation(draft.items, (items) => draft.patch({ items }));

  // While modifying an existing order, its own page is the cart.
  useEffect(() => {
    if (draft.edit) navigate(manageHref(draft.edit.token), { replace: true });
  }, [draft.edit, navigate]);

  return (
    <div className="booking-page">
      <AnnouncementBar />
      <SiteHeader />

      <main className="booking-main">
        <h1>Tu pedido</h1>
        <p className="muted cart-intro">
          Aquí no pagas todavía: envías tu pedido por WhatsApp y haces el abono por Nequi o Bancolombia.
        </p>

        {cartWasStale && (
          <p className="warning">
            Quitamos uno o más productos de tu pedido porque el catálogo cambió. Revísalo y vuelve a agregarlos si
            los necesitas.
          </p>
        )}

        <BookingCheckout catalogHref={CATALOG_HREF} />
      </main>

      <SiteFooter />
    </div>
  );
}
