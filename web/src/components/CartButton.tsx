import { Link } from 'react-router-dom';
import { useOrderDraft } from '../context/OrderDraft';
import { manageHref } from '../bookingShared';
import './CartButton.css';

export const CART_HREF = '/tu-pedido';

// Header bag icon with the number of products in the order. While a client is
// modifying an existing order, that order's page is their cart.
export default function CartButton({ onClick }: { onClick?: () => void }) {
  const draft = useOrderDraft();
  const count = draft.items.length;
  const href = draft.edit ? manageHref(draft.edit.token) : CART_HREF;

  return (
    <Link
      to={href}
      className="cart-button"
      aria-label={count ? `Tu pedido, ${count} ${count === 1 ? 'producto' : 'productos'}` : 'Tu pedido'}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8h14l-1.2 12H6.2L5 8Z" />
        <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
      </svg>
      {count > 0 && <span className="cart-button-count">{count}</span>}
    </Link>
  );
}
