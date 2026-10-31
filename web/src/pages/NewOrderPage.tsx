import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getWithRetry } from '../api';
import type { CakeSettings, PrintImageType, PublicCakeCatalog, PublicCakeDesign } from '../types';
import { useAdminAuth } from '../context/AdminAuth';
import PasswordPrompt from '../components/PasswordPrompt';
import { PRINT_TYPE_LABELS } from '../bookingShared';
import './adminLegacy.css';

// A cake from the new catalog (designs → colors → size / bizcocho / relleno /
// shape). Priced by the server exactly like the public web.
interface CatalogLine {
  kind: 'catalog';
  key: string;
  designId: string;
  colorId: string;
  sizeId: string;
  bizcochoId: string;
  rellenoId: string;
  shapeId: string;
  customText: string;
  customImageUrl: string;
  printImageType: PrintImageType;
  // Optional for catalog cakes (the design photo already shows the cake).
  referenceImageUrl: string;
  skipReference: boolean;
}
interface FreeLine {
  kind: 'free';
  key: string;
  customName: string;
  price: string;
  customSize: string;
  shape: string;
  customFlavor: string;
  relleno: string;
  customText: string;
  customImageUrl: string;
  printImageType: PrintImageType;
  referenceImageUrl: string;
  skipReference: boolean;
}
type Line = CatalogLine | FreeLine;

const MAX_CLIENT_NAME = 120;
const MAX_NOTES = 500;

function newKey(): string {
  return `l-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Price of a catalog cake as configured — same formula as the public booking
// page (size price + flavor surcharges + print-image surcharge).
function catalogLinePrice(catalog: PublicCakeCatalog, l: CatalogLine): number | null {
  const design = catalog.designs.find((d) => d.id === l.designId);
  const size = design?.colors.find((c) => c.id === l.colorId)?.sizes.find((s) => s.sizeId === l.sizeId);
  if (!size) return null;
  const extra = (flavorId: string) => catalog.flavors.find((f) => f.id === flavorId)?.surcharges[size.sizeId] ?? 0;
  const image = l.customImageUrl ? catalog.printImagePrices[l.printImageType] : 0;
  return size.price + extra(l.bizcochoId) + extra(l.rellenoId) + image;
}

// Accent/case-insensitive search ("album" finds "Álbum de Recuerdos").
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// "15:30" -> 930 minutes from midnight. Empty -> null.
function timeToMinutes(t: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export default function NewOrderPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAdminAuth();

  const [catalog, setCatalog] = useState<PublicCakeCatalog | null>(null);
  // Sizes / flavors / shapes from "Sabores, tamaños y formas", offered as lists
  // on free lines (names only — the price there is whatever the admin types).
  const [settings, setSettings] = useState<CakeSettings | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [deposit, setDeposit] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  // "<lineKey>|<field>" while that specific file input is uploading, else null.
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState('');
  const [checkingOverlap, setCheckingOverlap] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin', { replace: true });
      return;
    }
    // Cakes and alfajor cakes: both can be added as catalog lines.
    getWithRetry<PublicCakeCatalog>('/public-orders/cake-catalog', { config: { params: { category: 'ALL' } } })
      .then(setCatalog)
      .catch(() => setError('No se pudo cargar el catálogo'));
    api
      .get<CakeSettings>('/cake-settings')
      .then((res) => setSettings(res.data))
      .catch(() => setError('No se pudieron cargar los sabores y tamaños'));
  }, [isAdmin, navigate]);

  const total = useMemo(() => {
    return lines.reduce((sum, l) => {
      if (l.kind === 'free') return sum + (Number(l.price) || 0);
      return sum + ((catalog && catalogLinePrice(catalog, l)) || 0);
    }, 0);
  }, [lines, catalog]);

  function patchLine(key: string, patch: Partial<Omit<CatalogLine, 'kind'>> & Partial<Omit<FreeLine, 'kind'>>) {
    setLines((prev) => prev.map((l) => (l.key === key ? ({ ...l, ...patch } as Line) : l)));
  }
  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }
  function addCatalogLine() {
    setLines((prev) => [
      ...prev,
      {
        kind: 'catalog',
        key: newKey(),
        designId: '',
        colorId: '',
        sizeId: '',
        bizcochoId: '',
        rellenoId: '',
        shapeId: '',
        customText: '',
        customImageUrl: '',
        printImageType: 'NON_EDIBLE',
        referenceImageUrl: '',
        skipReference: false,
      },
    ]);
  }
  function addFreeLine() {
    setLines((prev) => [
      ...prev,
      {
        kind: 'free',
        key: newKey(),
        customName: '',
        price: '',
        customSize: '',
        shape: '',
        customFlavor: '',
        relleno: '',
        customText: '',
        customImageUrl: '',
        printImageType: 'NON_EDIBLE',
        referenceImageUrl: '',
        skipReference: false,
      },
    ]);
  }

  async function uploadPhoto(key: string, file: File, field: 'customImageUrl' | 'referenceImageUrl') {
    setUploadingSlot(`${key}|${field}`);
    setError('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api.post<{ imageUrl: string }>('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      patchLine(key, { [field]: res.data.imageUrl });
    } catch {
      setError('No se pudo subir la foto');
    } finally {
      setUploadingSlot(null);
    }
  }

  // Free lines (custom cakes) need the client's reference photo, unless "Sin
  // foto de referencia" (skipReference) waives it. Catalog cakes don't: the
  // design photo already is the reference.
  function lineNeedsReference(l: Line): boolean {
    return l.kind === 'free';
  }
  function lineReferenceOk(l: Line): boolean {
    return !lineNeedsReference(l) || !!l.referenceImageUrl || l.skipReference;
  }

  const pickupMinutes = timeToMinutes(pickupTime);

  // Drives both canSubmit and the on-screen checklist next to the button — a
  // disabled button with no explanation reads as "broken" (ver conversación:
  // el botón no avisaba que faltaba la foto de referencia del cliente).
  const missingReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!clientName.trim()) reasons.push('Falta el nombre del cliente');
    if (!clientPhone.trim()) reasons.push('Falta el teléfono del cliente');
    if (!deliveryDate) reasons.push('Falta la fecha de entrega');
    if (pickupMinutes === null) reasons.push('Falta la hora de recogida');
    if (lines.length === 0) reasons.push('Agrega al menos un producto');
    lines.forEach((l, i) => {
      const label = `Producto ${i + 1}`;
      if (!lineReferenceOk(l)) {
        reasons.push(
          `${label}: falta la foto de referencia del cliente (la que mandó por WhatsApp) — o marca "Sin foto de referencia"`
        );
      }
      if (l.kind === 'catalog') {
        if (!l.designId) reasons.push(`${label}: falta elegir el diseño`);
        else if (!l.colorId || !l.sizeId || !l.bizcochoId || !l.rellenoId || !l.shapeId) {
          reasons.push(`${label}: falta elegir color, tamaño, sabores o forma`);
        }
        const design = catalog?.designs.find((d) => d.id === l.designId);
        if (design?.allowsCustomImage && design.requiresCustomImage && !l.customImageUrl) {
          reasons.push(`${label}: este diseño necesita la imagen para imprimir`);
        }
      } else {
        if (!l.customName.trim()) reasons.push(`${label}: falta la descripción`);
        if (l.price === '' || Number(l.price) < 0) reasons.push(`${label}: falta el precio`);
        if (!l.customSize.trim()) reasons.push(`${label}: faltan las porciones`);
        if (!l.shape.trim()) reasons.push(`${label}: falta la forma`);
        if (!l.customFlavor.trim()) reasons.push(`${label}: falta el sabor`);
        if (!l.relleno.trim()) reasons.push(`${label}: falta el relleno`);
      }
    });
    return reasons;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientName, clientPhone, deliveryDate, pickupMinutes, lines, catalog]);

  const canSubmit = missingReasons.length === 0 && !submitting;

  interface ExistingOrder {
    ticketNumber: number;
    clientName: string;
    deliveryDate: string;
    deliveryStartMinutes: number;
    deliveryDurationMin: number;
    status: string;
  }

  // Soft warning only — the admin freeform channel intentionally allows
  // overlapping/odd-hour bookings (family orders, custom slots), so this never
  // blocks submission, it just makes sure Melosa notices before confirming.
  async function checkOverlapThenConfirm() {
    if (pickupMinutes === null || !deliveryDate) {
      setPendingConfirm(true);
      return;
    }
    setCheckingOverlap(true);
    try {
      const [year, month] = deliveryDate.split('-').map(Number);
      const res = await api.get<ExistingOrder[]>('/orders', { params: { month, year } });
      const clash = res.data.find((o) => {
        if (o.status === 'CANCELLED') return false;
        if (o.deliveryDate.slice(0, 10) !== deliveryDate) return false;
        const start = o.deliveryStartMinutes;
        const end = start + Math.max(o.deliveryDurationMin, 1);
        return pickupMinutes >= start && pickupMinutes < end;
      });
      if (clash) {
        setOverlapWarning(
          `Ese horario ya está ocupado por el pedido de ${clash.clientName} (#${clash.ticketNumber}). ¿Deseas continuar de todas formas?`
        );
      } else {
        setPendingConfirm(true);
      }
    } catch {
      // Can't verify — don't block the admin over it, just proceed normally.
      setPendingConfirm(true);
    } finally {
      setCheckingOverlap(false);
    }
  }

  async function doCreate() {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<{ ticketNumber: number }>('/orders', {
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        deliveryDate,
        deliveryStartMinutes: pickupMinutes,
        depositPaid: deposit ? Number(deposit) : undefined,
        notes: notes.trim() || undefined,
        items: lines.map((l) =>
          l.kind === 'catalog'
            ? {
                productDesignId: l.designId,
                colorId: l.colorId,
                sizeId: l.sizeId,
                bizcochoId: l.bizcochoId,
                rellenoId: l.rellenoId,
                shapeId: l.shapeId,
                customText: l.customText.trim() || undefined,
                customImageUrls: l.customImageUrl ? [l.customImageUrl] : undefined,
                printImageType: l.customImageUrl ? l.printImageType : undefined,
                referenceImageUrl: l.referenceImageUrl || undefined,
              }
            : {
                customName: l.customName.trim(),
                priceAtOrder: Number(l.price),
                customSize: l.customSize.trim(),
                shape: l.shape.trim(),
                customFlavor: l.customFlavor.trim(),
                relleno: l.relleno.trim(),
                customText: l.customText.trim() || undefined,
                customImageUrl: l.customImageUrl || undefined,
                printImageType: l.customImageUrl ? l.printImageType : undefined,
                referenceImageUrl: l.referenceImageUrl || undefined,
                skipReference: l.skipReference || undefined,
              }
        ),
      });
      setCreatedTicket(res.data.ticketNumber);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo crear el pedido');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setClientName('');
    setClientPhone('');
    setDeliveryDate('');
    setPickupTime('');
    setDeposit('');
    setNotes('');
    setLines([]);
    setCreatedTicket(null);
  }

  if (createdTicket !== null) {
    return (
      <div className="admin-page">
        <h1>Pedido creado</h1>
        <p className="form-section">
          Ticket <strong>#{createdTicket}</strong>
          {deposit && Number(deposit) > 0
            ? ' · creado como ABONADO'
            : ' · queda en espera de pago'}
        </p>
        <button type="button" className="cta-button" onClick={resetForm}>
          Crear otro
        </button>{' '}
        <Link className="secondary-button" to="/catalogo">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Link to="/" className="admin-back">
        ← Volver al inicio
      </Link>
      <h1>Crear pedido</h1>
      <p className="edit-hint">
        Canal de administradora: sin validación de fecha ni hora, no ocupa la agenda pública.
      </p>

      <div className="form-section">
        <h2>Cliente</h2>
        <label className="admin-field-label">Nombre</label>
        <input
          type="text"
          maxLength={MAX_CLIENT_NAME}
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
        <label className="admin-field-label">Teléfono</label>
        <input type="text" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
      </div>

      <div className="form-section">
        <h2>Entrega</h2>
        <label className="admin-field-label">Fecha</label>
        <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        <label className="admin-field-label">Hora de recogida</label>
        <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
      </div>

      <div className="form-section">
        <h2>Productos</h2>
        {lines.length === 0 && <p className="muted">Agrega al menos un producto o una línea libre.</p>}

        {lines.map((l, i) => (
          <div key={l.key} className="edit-variant">
            <div className="edit-row" style={{ justifyContent: 'space-between' }}>
              <strong>
                {i + 1}. {l.kind === 'catalog' ? 'Del catálogo' : 'Línea libre'}
              </strong>
              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: 0 }}
                onClick={() => removeLine(l.key)}
              >
                ✕
              </button>
            </div>

            <label className="admin-field-label">
              Foto de referencia de la torta {lineNeedsReference(l) ? '(obligatoria)' : '(opcional)'}
            </label>
            <p className="muted">Lo que mandó el cliente por WhatsApp: "quiero algo así". Es la foto que se ve en el pedido.</p>
            <input
              type="file"
              accept="image/*"
              disabled={uploadingSlot === `${l.key}|referenceImageUrl`}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadPhoto(l.key, f, 'referenceImageUrl');
              }}
            />
            {uploadingSlot === `${l.key}|referenceImageUrl` && <p className="muted">Subiendo...</p>}
            {l.referenceImageUrl && <img className="design-preview" src={l.referenceImageUrl} alt="" />}
            {lineNeedsReference(l) && (
              <label style={{ display: 'block', marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={l.skipReference}
                  onChange={(e) => patchLine(l.key, { skipReference: e.target.checked })}
                />{' '}
                Sin foto de referencia (torta lisa / "sorpréndeme")
              </label>
            )}

            {l.kind === 'catalog' ? (
              catalog && <CatalogLineEditor catalog={catalog} line={l} onChange={(patch) => patchLine(l.key, patch)} />
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Descripción (ej: Torta 3 leches frutos rojos)"
                  value={l.customName}
                  onChange={(e) => patchLine(l.key, { customName: e.target.value })}
                />
                <input
                  type="number"
                  placeholder="Precio"
                  value={l.price}
                  onChange={(e) => patchLine(l.key, { price: e.target.value })}
                />
                <PickOrType
                  label="Tamaño"
                  options={settings?.sizes.filter((x) => x.active).map((x) => x.label) ?? []}
                  value={l.customSize}
                  placeholder="Ej: 20 porciones"
                  onChange={(v) => patchLine(l.key, { customSize: v })}
                />
                <PickOrType
                  label="Forma"
                  options={settings?.shapes.filter((x) => x.active).map((x) => x.name) ?? []}
                  value={l.shape}
                  placeholder="Ej: Corazón"
                  onChange={(v) => patchLine(l.key, { shape: v })}
                />
                <PickOrType
                  label="Sabor del bizcocho"
                  options={settings?.bizcochos.filter((x) => x.active).map((x) => x.name) ?? []}
                  value={l.customFlavor}
                  placeholder="Sabor de torta"
                  onChange={(v) => patchLine(l.key, { customFlavor: v })}
                />
                <PickOrType
                  label="Relleno"
                  options={settings?.rellenos.filter((x) => x.active).map((x) => x.name) ?? []}
                  value={l.relleno}
                  placeholder="Relleno"
                  onChange={(v) => patchLine(l.key, { relleno: v })}
                />
              </>
            )}

            <input
              type="text"
              placeholder="Texto personalizado (opcional)"
              value={l.customText}
              onChange={(e) => patchLine(l.key, { customText: e.target.value })}
            />
            {/* A catalog design that doesn't take a print image would have it
                dropped by the server — don't offer the upload at all. */}
            {(l.kind === 'free' || catalog?.designs.find((d) => d.id === l.designId)?.allowsCustomImage) && (
              <>
              <label className="admin-field-label">Imagen para imprimir (opcional)</label>
              <input
                type="file"
                accept="image/*"
                disabled={uploadingSlot === `${l.key}|customImageUrl`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhoto(l.key, f, 'customImageUrl');
                }}
              />
              {uploadingSlot === `${l.key}|customImageUrl` && <p className="muted">Subiendo...</p>}
              {l.customImageUrl && <img className="design-preview" src={l.customImageUrl} alt="" />}
              {l.customImageUrl && (
                <>
                  <label className="admin-field-label">Tipo de imagen</label>
                  <div className="np-pills">
                    {(['NON_EDIBLE', 'EDIBLE'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`np-pill ${l.printImageType === t ? 'is-selected' : ''}`}
                        onClick={() => patchLine(l.key, { printImageType: t })}
                      >
                        {PRINT_TYPE_LABELS[t]}
                        {/* Catalog cakes add the surcharge; on a free line the
                            admin's own price already includes it. */}
                        {l.kind === 'catalog' && catalog
                          ? ` (+$${catalog.printImagePrices[t].toLocaleString('es-CO')})`
                          : ''}
                      </button>
                    ))}
                  </div>
                </>
              )}
              </>
            )}
            {l.kind === 'catalog' && catalog && (
              <p className="np-line-price">
                Precio: ${(catalogLinePrice(catalog, l) ?? 0).toLocaleString('es-CO')}
              </p>
            )}
          </div>
        ))}

        <button type="button" className="secondary-button" onClick={addCatalogLine} disabled={!catalog}>
          + Producto del catálogo
        </button>{' '}
        <button type="button" className="secondary-button" onClick={addFreeLine}>
          + Línea libre
        </button>
      </div>

      <div className="form-section">
        <h2>Pago y origen</h2>
        <label className="admin-field-label">Abono recibido (opcional — si lo pones, el pedido queda ABONADO)</label>
        <input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        <label className="admin-field-label">Notas</label>
        <textarea maxLength={MAX_NOTES} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <p style={{ fontWeight: 700 }}>Total: ${total.toLocaleString('es-CO')}</p>
      {error && <p className="warning">{error}</p>}

      {missingReasons.length > 0 && !submitting && (
        <ul className="missing-list">
          {missingReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="cta-button"
        disabled={!canSubmit || checkingOverlap}
        onClick={checkOverlapThenConfirm}
      >
        {checkingOverlap ? 'Revisando horario...' : submitting ? 'Creando...' : 'Crear pedido'}
      </button>

      {overlapWarning && (
        <div className="pw-overlay" role="dialog" aria-modal="true">
          <div className="pw-box">
            <p className="pw-message">Horario ocupado</p>
            <p className="pw-sub">{overlapWarning}</p>
            <div className="pw-actions">
              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: 0 }}
                onClick={() => setOverlapWarning('')}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="cta-button"
                style={{ marginTop: 0 }}
                onClick={() => {
                  setOverlapWarning('');
                  setPendingConfirm(true);
                }}
              >
                Continuar de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingConfirm && (
        <PasswordPrompt
          message={`Crear pedido para ${clientName || 'cliente'} · $${total.toLocaleString('es-CO')}`}
          onConfirm={() => {
            setPendingConfirm(false);
            doCreate();
          }}
          onCancel={() => setPendingConfirm(false)}
        />
      )}
    </div>
  );
}

// Catalog cake: pick the design (photo grid + search), then its color (photos),
// then size / bizcocho / relleno / shape. Picking a design or color fills every
// other pick with its first valid option, so a line is never half-invalid.
function CatalogLineEditor({
  catalog,
  line,
  onChange,
}: {
  catalog: PublicCakeCatalog;
  line: CatalogLine;
  onChange: (patch: Partial<Omit<CatalogLine, 'kind'>>) => void;
}) {
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(!line.designId);
  const design = catalog.designs.find((d) => d.id === line.designId);
  const color = design?.colors.find((c) => c.id === line.colorId);

  function pickColor(d: PublicCakeDesign, colorId: string) {
    const c = d.colors.find((x) => x.id === colorId) ?? d.colors[0];
    onChange({
      designId: d.id,
      colorId: c.id,
      sizeId: c.sizes[0]?.sizeId ?? '',
      bizcochoId: c.bizcochoIds[0] ?? '',
      rellenoId: c.rellenoIds[0] ?? '',
      shapeId: c.shapes[0]?.id ?? '',
      ...(d.allowsCustomImage ? {} : { customImageUrl: '' }),
    });
  }

  if (picking || !design) {
    const q = normalize(search.trim());
    const shown = q ? catalog.designs.filter((d) => normalize(d.name).includes(q)) : catalog.designs;
    return (
      <>
        <label className="admin-field-label">Diseño</label>
        <input type="search" placeholder="Buscar diseño por nombre" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="design-picker np-design-picker" role="radiogroup" aria-label="Elegir diseño">
          {shown.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={d.id === line.designId}
              className={`np-design ${d.id === line.designId ? 'is-selected' : ''}`}
              onClick={() => {
                pickColor(d, d.colors[0].id);
                setPicking(false);
              }}
            >
              <img src={d.colors[0].imageUrl} alt="" loading="lazy" />
              <span>{d.name}</span>
            </button>
          ))}
          {shown.length === 0 && <p className="muted">Ningún diseño se llama así.</p>}
        </div>
      </>
    );
  }

  const flavor = (id: string) => catalog.flavors.find((f) => f.id === id);
  const surcharge = (id: string) => {
    const extra = color && line.sizeId ? flavor(id)?.surcharges[line.sizeId] ?? 0 : 0;
    return extra > 0 ? ` (+$${extra.toLocaleString('es-CO')})` : '';
  };

  return (
    <>
      <div className="np-chosen">
        <img src={color?.imageUrl ?? design.colors[0].imageUrl} alt="" />
        <div>
          <strong>{design.name}</strong>
          <button type="button" className="secondary-button" style={{ marginTop: 6 }} onClick={() => setPicking(true)}>
            Cambiar diseño
          </button>
        </div>
      </div>

      {design.colors.length > 1 && (
        <>
          <label className="admin-field-label">Color</label>
          <div className="np-colors">
            {design.colors.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`np-design np-color ${c.id === line.colorId ? 'is-selected' : ''}`}
                onClick={() => pickColor(design, c.id)}
              >
                <img src={c.imageUrl} alt="" loading="lazy" />
                <span>{c.colorName}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {color && (
        <>
          <PillGroup
            label="Tamaño"
            options={color.sizes.map((s) => ({ id: s.sizeId, text: `${s.label} — $${s.price.toLocaleString('es-CO')}` }))}
            value={line.sizeId}
            onChange={(sizeId) => onChange({ sizeId })}
          />
          <PillGroup
            label="Sabor del bizcocho"
            options={color.bizcochoIds.map((id) => ({ id, text: (flavor(id)?.name ?? '') + surcharge(id) }))}
            value={line.bizcochoId}
            onChange={(bizcochoId) => onChange({ bizcochoId })}
          />
          <PillGroup
            label="Relleno"
            options={color.rellenoIds.map((id) => ({ id, text: (flavor(id)?.name ?? '') + surcharge(id) }))}
            value={line.rellenoId}
            onChange={(rellenoId) => onChange({ rellenoId })}
          />
          <PillGroup
            label="Forma"
            options={color.shapes.map((s) => ({ id: s.id, text: s.name }))}
            value={line.shapeId}
            onChange={(shapeId) => onChange({ shapeId })}
          />
        </>
      )}
    </>
  );
}

function PillGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; text: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <>
      <label className="admin-field-label">{label}</label>
      <div className="np-pills">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`np-pill ${o.id === value ? 'is-selected' : ''}`}
            onClick={() => onChange(o.id)}
          >
            {o.text}
          </button>
        ))}
      </div>
    </>
  );
}

// Free-line field: pick from the configured list, or "Otro…" to type anything.
function PickOrType({
  label,
  options,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const OTHER = '__otro__';
  const [typing, setTyping] = useState(value !== '' && !options.includes(value));
  return (
    <>
      <label className="admin-field-label">{label}</label>
      <select
        value={typing ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setTyping(true);
            onChange('');
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Elegir…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>Otro (escribir)</option>
      </select>
      {typing && (
        <input type="text" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoFocus />
      )}
    </>
  );
}
