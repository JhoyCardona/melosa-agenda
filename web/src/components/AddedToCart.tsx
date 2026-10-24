import { Link } from 'react-router-dom';
import { CART_HREF } from './CartButton';

// Shown under "Agregar al pedido" once a product is in the cart: the two ways
// on from a booking page, now that the checkout lives on its own page.
export default function AddedToCart({ catalogHref }: { catalogHref: string }) {
  return (
    <div className="added-to-cart" role="status">
      <p className="added-to-cart-title">✓ Agregada a tu pedido</p>
      <div className="added-to-cart-actions">
        <Link to={catalogHref} className="btn btn-ghost">
          Agregar otra torta
        </Link>
        <Link to={CART_HREF} className="btn btn-primary">
          Finalizar pedido
        </Link>
      </div>
    </div>
  );
}
