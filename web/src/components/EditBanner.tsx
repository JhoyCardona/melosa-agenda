import { Link } from 'react-router-dom';
import { useOrderDraft } from '../context/OrderDraft';
import { manageHref } from '../bookingShared';
import './EditBanner.css';

// Shown on the catalog / configurator pages while the client is modifying an
// existing order, so it's always clear they're changing ticket #N (not booking
// a new one) and there's a one-tap way back to the order.
export default function EditBanner() {
  const { edit } = useOrderDraft();
  if (!edit) return null;
  return (
    <div className="edit-banner">
      <span>
        Estás modificando tu pedido <strong>#{edit.original.ticketNumber}</strong>
      </span>
      <Link to={manageHref(edit.token)} className="btn btn-ghost">
        Volver a mi pedido
      </Link>
    </div>
  );
}
