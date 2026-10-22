import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import type { ManagedOrderView, OrderChangeSummary } from '../types';
import { isCakeItem } from '../types';
import { useOrderDraft } from '../context/OrderDraft';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import { waLink } from '../config';
import {
  MAX_ITEMS,
  cartItemSummary,
  cartItemsFromOrder,
  earliestDeliveryDateString,
  formatDeliveryDate,
  itemsBreakdown,
  pesos,
  toOrderLine,
} from '../bookingShared';
import './BookingPage.css';
import './ManageOrderPage.css';

// "Modificar mi pedido": opened from the private link in the client's own
// WhatsApp message. Asks for phone + ticket, then shows the order as an
// editable cart (Cambiar / Quitar / Agregar), the delivery date, and what the
// change does to the pickup time and the money before confirming. Cancelling
// lives here too, behind a no-refund warning and a mandatory checkbox.

const CATALOG_HREF = '/catalogo';

function apiError(error: unknown, fallback: string): string {
  return (error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

type Done =
  | { kind: 'modified'; order: ManagedOrderView; change: OrderChangeSummary }
  | { kind: 'cancelled'; order: ManagedOrderView; credit: number };

export default function ManageOrderPage() {
  const { token = '' } = useParams();
  const draft = useOrderDraft();
  const session = draft.edit?.token === token ? draft.edit : null;

  // Unlock form.
  const [phone, setPhone] = useState('');
  const [ticket, setTicket] = useState('');
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  // An order that can't be changed anymore: shown read-only with the reason.
  const [locked, setLocked] = useState<ManagedOrderView | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setOpenError('');
    setOpening(true);
    try {
      const { data } = await api.post<ManagedOrderView>('/public-orders/manage/open', { token, phone, ticket });
      if (data.lockedReason) {
        setLocked(data);
        return;
      }
      draft.startEdit(
        { token, phone, ticket, original: data },
        { items: cartItemsFromOrder(data), deliveryDate: data.deliveryDate, clientName: data.clientName, clientPhone: phone }
      );
    } catch (error) {
      setOpenError(apiError(error, 'No pudimos abrir tu pedido. Revisa tu conexión e intenta de nuevo.'));
    } finally {
      setOpening(false);
    }
  }

  let content;
  if (done) content = <DoneView done={done} />;
  else if (locked) content = <LockedView order={locked} />;
  else if (session) content = <EditView onDone={setDone} />;
  else
    content = (
      <section className="booking-block">
        <h2>Para ver tu pedido, confirma tus datos</h2>
        <form onSubmit={handleOpen}>
          <label className="field-label">Teléfono (WhatsApp) con el que agendaste</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
          <label className="field-label">Número de ticket</label>
          <input
            type="text"
            inputMode="numeric"
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            placeholder="Ej: 396"
          />
          <p className="field-hint">Lo encuentras en el mensaje de WhatsApp de tu pedido.</p>
          {openError && <p className="warning">{openError}</p>}
          <button type="submit" className="btn btn-primary" disabled={opening || !phone.trim() || !ticket.trim()}>
            {opening ? 'Buscando...' : 'Ver mi pedido'}
          </button>
        </form>
      </section>
    );

  return (
    <div className="booking-page">
      <AnnouncementBar />
      <SiteHeader />
      <main className="booking-main">
        <h1>Mi pedido</h1>
        {content}
      </main>
      <SiteFooter />
    </div>
  );
}

function LockedView({ order }: { order: ManagedOrderView }) {
  return (
    <section className="booking-block">
      <h2>Pedido #{order.ticketNumber}</h2>
      <p className="warning">{order.lockedReason}</p>
      <ul className="cart-list">
        {order.items.map((it) => (
          <li key={it.id}>
            <span>
              {[it.designName, it.sizeLabel, it.color].filter(Boolean).join(' · ')}
            </span>
            <span className="cart-item-right">{pesos(it.price)}</span>
          </li>
        ))}
      </ul>
      <a className="btn btn-primary" href={waLink(`Hola, tengo una pregunta sobre mi pedido #${order.ticketNumber}.`)}>
        Escribir por WhatsApp
      </a>
    </section>
  );
}

function EditView({ onDone }: { onDone: (d: Done) => void }) {
  const draft = useOrderDraft();
  const session = draft.edit!;
  const original = session.original;
  const earliest = earliestDeliveryDateString();
  const credentials = { token: session.token, phone: session.phone, ticket: session.ticket };

  const changed =
    draft.deliveryDate !== original.deliveryDate ||
    draft.items.length !== original.items.length ||
    draft.items.some((i) => !i.keepItemId);

  const [preview, setPreview] = useState<OrderChangeSummary | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Live preview of what the change does (new pickup time, money), debounced.
  const payloadKey = JSON.stringify([draft.deliveryDate, draft.items.map(toOrderLine)]);
  useEffect(() => {
    setPreview(null);
    setPreviewError('');
    if (!changed || draft.items.length === 0 || !draft.deliveryDate) return;
    let stale = false;
    setLoadingPreview(true);
    const timer = window.setTimeout(() => {
      api
        .post<OrderChangeSummary>('/public-orders/manage/preview', {
          ...credentials,
          deliveryDate: draft.deliveryDate,
          items: draft.items.map(toOrderLine),
        })
        .then((res) => !stale && setPreview(res.data))
        .catch((error) => !stale && setPreviewError(apiError(error, 'No pudimos calcular el cambio. Intenta de nuevo.')))
        .finally(() => !stale && setLoadingPreview(false));
    }, 400);
    return () => {
      stale = true;
      window.clearTimeout(timer);
    };
    // payloadKey stands for the date + lines; credentials are fixed per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, changed]);

  async function handleModify() {
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await api.post<ManagedOrderView & { change: OrderChangeSummary }>('/public-orders/manage/modify', {
        ...credentials,
        deliveryDate: draft.deliveryDate,
        items: draft.items.map(toOrderLine),
      });
      draft.endEdit();
      onDone({ kind: 'modified', order: data, change: data.change });
    } catch (error) {
      setConfirming(false);
      setSaveError(apiError(error, 'No se pudo modificar el pedido. Intenta de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setSaving(true);
    setSaveError('');
    try {
      const { data } = await api.post<ManagedOrderView & { credit: number }>('/public-orders/manage/cancel', {
        ...credentials,
        acknowledge: true,
      });
      draft.endEdit();
      onDone({ kind: 'cancelled', order: data, credit: data.credit });
    } catch (error) {
      setCancelling(false);
      setSaveError(apiError(error, 'No se pudo cancelar el pedido. Intenta de nuevo.'));
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = changed && !!preview && !loadingPreview && !saving;

  return (
    <>
      <p className="manage-intro">
        Hola, <strong>{original.clientName}</strong>. Este es tu pedido <strong>#{original.ticketNumber}</strong>.
        Cambia lo que necesites y al final toca <strong>Modificar mi pedido</strong>.
      </p>

      {/* ---------- Productos ---------- */}
      <section className="booking-block">
        <h2>Tus productos ({draft.items.length})</h2>
        {draft.items.length === 0 && (
          <p className="warning">Tu pedido tiene que tener al menos un producto. Agrega uno, o cancela el pedido abajo.</p>
        )}
        <ul className="manage-items">
          {draft.items.map((i) => (
            <li key={i.key}>
              {i.designImageUrl && <img src={i.designImageUrl} alt="" className="manage-item-photo" />}
              <div className="manage-item-body">
                <p className="manage-item-text">{cartItemSummary(i)}</p>
                <p className="manage-item-price">
                  {pesos(i.price)}
                  {!i.keepItemId && <span className="manage-item-tag">{i.wasEdited ? 'Cambiada' : 'Nueva'}</span>}
                </p>
                <div className="manage-item-actions">
                  {isCakeItem(i) && i.designId && (
                    <Link to={`/tortas/${i.designId}?editar=${i.key}`} className="btn btn-ghost">
                      Cambiar
                    </Link>
                  )}
                  <button type="button" className="btn btn-ghost" onClick={() => draft.removeItem(i.key)}>
                    Quitar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {draft.items.length < MAX_ITEMS && (
          <Link to={CATALOG_HREF} className="btn btn-ghost">
            Agregar otra torta
          </Link>
        )}
      </section>

      {/* ---------- Fecha ---------- */}
      <section className="booking-block">
        <h2>Fecha de entrega</h2>
        <input
          type="date"
          min={earliest}
          value={draft.deliveryDate}
          onChange={(e) => draft.patch({ deliveryDate: e.target.value })}
        />
        <p className="field-hint">
          Hoy está para el <strong>{formatDeliveryDate(original.deliveryDate)}</strong>, a partir de las{' '}
          {original.deliveryTimeLabel} Si cambias el pedido, puede que la hora de recogida quede más tarde.
        </p>
      </section>

      {/* ---------- Resumen del cambio ---------- */}
      <section className="booking-block booking-recap">
        <h2>Resumen del cambio</h2>
        {!changed && <p className="field-hint">Todavía no has cambiado nada.</p>}
        {changed && loadingPreview && <p className="field-hint">Calculando...</p>}
        {changed && previewError && <p className="warning">{previewError}</p>}
        {changed && preview && (
          <dl className="recap-list">
            <div>
              <dt>Entrega</dt>
              <dd>{formatDeliveryDate(preview.deliveryDate)}</dd>
            </div>
            <div>
              <dt>Hora de recogida</dt>
              <dd>
                {preview.previousTimeLabel !== preview.deliveryTimeLabel && (
                  <span className="manage-old">{preview.previousTimeLabel}</span>
                )}
                a partir de las {preview.deliveryTimeLabel}
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>
                {preview.previousTotal !== preview.totalPrice && (
                  <span className="manage-old">{pesos(preview.previousTotal)}</span>
                )}
                {pesos(preview.totalPrice)}
              </dd>
            </div>
            <div>
              <dt>Ya pagaste</dt>
              <dd>{pesos(preview.paid)}</dd>
            </div>
            {preview.owed > 0 && (
              <div className="manage-owed">
                <dt>Te falta pagar</dt>
                <dd>{pesos(preview.owed)}</dd>
              </div>
            )}
            {preview.credit > 0 && (
              <div className="manage-credit">
                <dt>Te queda a favor</dt>
                <dd>{pesos(preview.credit)}</dd>
              </div>
            )}
          </dl>
        )}
        {changed && preview && preview.credit > 0 && (
          <p className="field-hint">
            El dinero no se devuelve, pero ese saldo queda a tu favor para un próximo pedido.
          </p>
        )}
      </section>

      {saveError && <p className="warning">{saveError}</p>}

      <div className="manage-actions">
        <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => setConfirming(true)}>
          Modificar mi pedido
        </button>
        <Link
          to="/"
          className="btn btn-ghost"
          onClick={() => draft.endEdit()}
        >
          Salir sin cambios
        </Link>
      </div>

      <div className="manage-cancel-zone">
        <button type="button" className="manage-cancel-link" onClick={() => setCancelling(true)}>
          Quiero cancelar mi pedido
        </button>
      </div>

      {confirming && (
        <Modal onClose={() => !saving && setConfirming(false)}>
          <h2>¿Modificar tu pedido?</h2>
          <p className="manage-modal-text">
            Esta acción no se puede deshacer, ¿estás segur@ de que quieres modificar tu pedido?
          </p>
          <div className="manage-modal-buttons">
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleModify}>
              {saving ? 'Guardando...' : 'Sí'}
            </button>
          </div>
        </Modal>
      )}

      {cancelling && (
        <CancelModal
          paid={original.depositPaid}
          saving={saving}
          onClose={() => !saving && setCancelling(false)}
          onConfirm={handleCancel}
        />
      )}
    </>
  );
}

function CancelModal({
  paid,
  saving,
  onClose,
  onConfirm,
}: {
  paid: number;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [understood, setUnderstood] = useState(false);
  return (
    <Modal onClose={onClose}>
      <h2>¿Cancelar tu pedido?</h2>
      <div className="manage-warning-box">
        <p>
          <strong>Esta acción no se puede deshacer.</strong>
        </p>
        <p>
          <strong>Tu abono no se devuelve.</strong>
          {paid > 0
            ? ` Los ${pesos(paid)} que pagaste quedan como saldo a tu favor y se tienen en cuenta si haces un nuevo pedido.`
            : ' Si pagaste algo, queda como saldo a tu favor y se tiene en cuenta si haces un nuevo pedido.'}
        </p>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
        Sí, entiendo que mi abono no será devuelto
      </label>
      <div className="manage-modal-buttons">
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>
          Volver
        </button>
        <button type="button" className="btn btn-primary" disabled={!understood || saving} onClick={onConfirm}>
          {saving ? 'Cancelando...' : 'Cancelar mi pedido'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="manage-modal-backdrop" onClick={onClose}>
      <div className="manage-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function DoneView({ done }: { done: Done }) {
  const { order } = done;
  let message: string;
  let body: React.ReactNode;
  if (done.kind === 'modified') {
    const { change } = done;
    const items = cartItemsFromOrder(order);
    message =
      `${order.clientName}\nTicket #${order.ticketNumber}\n\nModifiqué mi pedido. Así quedó:\n\n` +
      `${itemsBreakdown(items)}\n\n` +
      `Día: ${formatDeliveryDate(order.deliveryDate)}\n` +
      `Hora: ${order.deliveryTimeLabel} (Esta es la hora mínima de entrega de mi pedido)\n\n` +
      `Total: ${pesos(change.totalPrice)}\nYa pagué: ${pesos(change.paid)}` +
      (change.owed > 0 ? `\nMe falta: ${pesos(change.owed)}` : '') +
      (change.credit > 0 ? `\nSaldo a favor: ${pesos(change.credit)}` : '');
    body = (
      <>
        <h2>¡Tu pedido quedó modificado!</h2>
        <p>
          Pedido <strong>#{order.ticketNumber}</strong> para el <strong>{formatDeliveryDate(order.deliveryDate)}</strong>,
          listo a partir de las <strong>{order.deliveryTimeLabel}</strong> Total: <strong>{pesos(change.totalPrice)}</strong>.
        </p>
        {change.owed > 0 && (
          <p>
            Te falta pagar <strong>{pesos(change.owed)}</strong>.
          </p>
        )}
        {change.credit > 0 && (
          <p>
            Te quedan <strong>{pesos(change.credit)}</strong> a favor para un próximo pedido.
          </p>
        )}
        <p>Avísanos por WhatsApp para confirmar el cambio.</p>
      </>
    );
  } else {
    message =
      `${order.clientName}\nTicket #${order.ticketNumber}\n\nCancelé mi pedido.` +
      (done.credit > 0 ? `\nSaldo a favor: ${pesos(done.credit)}` : '');
    body = (
      <>
        <h2>Tu pedido fue cancelado</h2>
        <p>
          Pedido <strong>#{order.ticketNumber}</strong>.
          {done.credit > 0 && (
            <>
              {' '}
              Te quedan <strong>{pesos(done.credit)}</strong> a favor para un próximo pedido.
            </>
          )}
        </p>
        <p>Avísanos por WhatsApp.</p>
      </>
    );
  }
  return (
    <section className="booking-block booking-sent">
      {body}
      <a className="btn btn-primary" href={waLink(message)}>
        Avisar por WhatsApp
      </a>
    </section>
  );
}
