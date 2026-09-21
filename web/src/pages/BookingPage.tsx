import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams /*, useSearchParams */ } from 'react-router-dom';
import api, { getWithRetry } from '../api';
import type { CakeShape, DeliveryPreview, Flavor, ProductDesign } from '../types';
import { CAKE_SHAPES } from '../types';
import { useOrderDraft } from '../context/OrderDraft';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import RellenoSelect from '../components/RellenoSelect';
import { waLink, rellenoSurcharge, BUSINESS } from '../config';
import './BookingPage.css';

const flavorLabels: Record<Flavor, string> = { VAINILLA: 'Vainilla', CHOCOLATE: 'Chocolate', ALFAJOR: 'Alfajor' };
const FLAVORS: Flavor[] = ['VAINILLA', 'CHOCOLATE'];

// Mirrors the backend cap (createPublicOrder). Bigger orders go through WhatsApp.
const MAX_ITEMS = 12;
const MAX_CLIENT_NAME = 120;
const MAX_NOTES = 500;

// Earliest bookable delivery date = today (Colombia, UTC-5) + 2 calendar days,
// i.e. the 48h booking cutoff. The public order endpoint re-checks this.
function earliestDeliveryDateString(): string {
  const colombiaNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
  colombiaNow.setUTCDate(colombiaNow.getUTCDate() + 2);
  return colombiaNow.toISOString().slice(0, 10);
}

// Catalog designs have no name (the photo is the identity), so fall back to a
// generic label wherever a non-empty string is structurally needed.
const DESIGN_FALLBACK = 'Minicake';

// $28.000, $30.000 (CAKE) y el alfajor (ALFAJOR_CAKE) ya tienen precios reales
// de torta grande, así que muestran todos los tamaños. La única forma de
// distinguir un catálogo con precios reales hoy es el precio de la minicake —
// no hay un flag propio en el schema.
const CAKE_TIERS_WITH_REAL_SIZES = [28000, 30000, 31000];
function bookableVariants(design: ProductDesign | undefined): ProductDesign['variants'] {
  if (!design) return [];
  if (design.category === 'ALFAJOR_CAKE') return design.variants;
  const minicake = design.variants.find((v) => v.enPromocion);
  if (minicake && CAKE_TIERS_WITH_REAL_SIZES.includes(Number(minicake.price))) return design.variants;
  return design.variants.filter((v) => v.enPromocion);
}

// "MiniCake x1\nTorta 6 porciones x1\nTorta 10 porciones x2" — the compact,
// size-only breakdown (not per design/color) that goes into the WhatsApp
// order message.
function whatsappItemLabel(variantLabel: string): string {
  // "Minicake (2 porciones) · 3 gatos" -> "MiniCake (3 gatos)": keep the option.
  const option = variantLabel.split(' · ')[1];
  if (variantLabel.startsWith('Minicake')) return option ? `MiniCake (${option})` : 'MiniCake';
  return `Torta ${variantLabel}`;
}

// MiniCake first, then ascending by portion count, so the message reads in a
// predictable size order regardless of the order items were added in.
function whatsappSortKey(label: string): number {
  if (label === 'MiniCake') return 0;
  const match = label.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function itemsBreakdown(items: { variantLabel: string }[]): string {
  const counts = new Map<string, number>();
  for (const i of items) {
    const label = whatsappItemLabel(i.variantLabel);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => whatsappSortKey(a) - whatsappSortKey(b))
    .map(([label, n]) => `${label} x${n}`)
    .join('\n');
}

// "2026-09-01" -> "martes 1 de septiembre". Noon avoids any timezone day-shift.
function formatDeliveryDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface OrderResult {
  ticketNumber: number;
  totalPrice: string;
  deliveryTimeLabel?: string;
}

export default function BookingPage() {
  const { designId } = useParams();
  const navigate = useNavigate();
  // const [searchParams] = useSearchParams();
  const draft = useOrderDraft();

  // Entered from "Ver el catálogo de tortas" → default the size to a real torta,
  // not the promo minicake, and keep "volver al catálogo" pointing at that view.
  //
  // Tortas 5+ deshabilitadas temporalmente (sin precios reales todavía, ver
  // CLAUDE.md / Landing.tsx). Para reactivar: descomentar estas dos líneas y el
  // import/hook de useSearchParams arriba.
  // const grandes = searchParams.get('ver') === 'tortas';
  // const catalogHref = grandes ? '/catalogo?ver=tortas' : '/catalogo';
  const grandes = false;
  const catalogHref = '/catalogo';
  const earliestDate = earliestDeliveryDateString();

  const [designs, setDesigns] = useState<ProductDesign[]>([]);
  const [designsLoaded, setDesignsLoaded] = useState(false);
  const [catalogSlow, setCatalogSlow] = useState(false);
  // Set when the stored cart had lines that no longer match the live catalog
  // (design deleted, variant gone, or price changed) and we dropped them.
  const [cartWasStale, setCartWasStale] = useState(false);

  // Per-item configurator (the product currently being built, not yet added).
  const [variantId, setVariantId] = useState('');
  const [flavor, setFlavor] = useState<Flavor>('VAINILLA');
  const [shape, setShape] = useState<CakeShape>('Redonda');
  const [color, setColor] = useState('');
  const [relleno, setRelleno] = useState('');
  const [customText, setCustomText] = useState('');
  // Holds every uploaded print image, in order. For the ordinary case
  // (variant.maxCustomImages === 1) this is at most 1 URL — same behavior as
  // before, just stored as an array so a design like the memory cake (up to
  // 5/10 images) doesn't need separate state.
  const [customImages, setCustomImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [justAdded, setJustAdded] = useState(false);

  const [preview, setPreview] = useState<DeliveryPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const design = designs.find((d) => d.id === designId);
  const variant = design?.variants.find((v) => v.id === variantId);

  useEffect(() => {
    getWithRetry<ProductDesign[]>('/product-designs', { onSlow: () => setCatalogSlow(true) })
      .then((data) => {
        setDesigns(data);
        // Reconcile the stored cart against the fresh catalog, once. A line whose
        // design or variant is gone, or whose price changed, would otherwise
        // fail on submit with an unhelpful error — drop it and warn instead.
        const byId = new Map(data.map((d) => [d.id, d]));
        const kept = draft.items.filter((i) => {
          const d = byId.get(i.designId);
          const v = d?.variants.find((x) => x.id === i.variantId);
          if (!d || !v) return false;
          const expected = Number(v.price) + rellenoSurcharge(i.relleno, v.portions, v.enPromocion);
          return Math.round(expected) === Math.round(i.price);
        });
        if (kept.length !== draft.items.length) {
          draft.patch({ items: kept });
          setCartWasStale(true);
        }
      })
      .catch((err) => console.error('Error cargando catálogo:', err))
      .finally(() => {
        setDesignsLoaded(true);
        setCatalogSlow(false);
      });
    // Runs once on mount; the cart snapshot it validates is the one loaded from
    // storage, which is exactly what we want to check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bad or missing design id → back to the catalog to pick one.
  useEffect(() => {
    if (designsLoaded && !design) navigate(catalogHref, { replace: true });
  }, [designsLoaded, design, navigate, catalogHref]);

  // Reset the configurator whenever the design changes. From the "tortas" view we
  // preselect the first non-promo size so a buyer who came for a 10-porciones
  // cake doesn't silently end up ordering a minicake.
  //
  // Tortas 5+ deshabilitadas temporalmente: solo se ofrece la variante minicake
  // (enPromocion), sin importar `grandes`. Original para reactivar:
  // const variants = design?.variants ?? [];
  // const preferred = grandes ? variants.find((v) => !v.enPromocion) ?? variants[0] : variants[0];
  useEffect(() => {
    const variants = bookableVariants(design);
    // Cheapest first: for a design with options (gatitos) that lands on the
    // first option, and for an ordinary design it's the minicake, same as before.
    const preferred = [...variants].sort((a, b) => Number(a.price) - Number(b.price))[0];
    setVariantId(preferred ? preferred.id : '');
    setFlavor(design?.category === 'ALFAJOR_CAKE' ? 'ALFAJOR' : 'VAINILLA');
    setShape('Redonda');
    setColor(design?.images[0]?.colorName ?? '');
    setCustomText('');
    setCustomImages([]);
    setImageError('');
  }, [design, grandes]);

  // The picked color swaps the displayed photo; falls back to the design's
  // cover photo when no color is picked or none matches (design with no
  // color images loaded yet).
  // A variant's own photo (an option like "3 gatos") sits between the two.
  const displayedImageUrl =
    design?.images.find((img) => img.colorName === color)?.imageUrl ??
    variant?.imageUrl ??
    design?.imageUrl ??
    null;

  // Option picker (gatitos: "1 gato" / "3 gatos"): variants sharing an
  // optionLabel form one option; picking one swaps the variant, so price and
  // photo follow. Keeps the current size when the new option has it.
  const bookable = bookableVariants(design);
  // Sorted by price so "1 gato" comes before "3 gatos" (the API's order between
  // equal-points variants isn't guaranteed).
  const optionLabels = Array.from(
    new Set(
      [...bookable]
        .sort((a, b) => Number(a.price) - Number(b.price))
        .map((v) => v.optionLabel)
        .filter((o): o is string => !!o)
    )
  );
  const sizeVariants = variant?.optionLabel
    ? bookable.filter((v) => v.optionLabel === variant.optionLabel)
    : bookable;
  // The label already carries the option ("Minicake (2 porciones) · 1 gato") so
  // orders show it everywhere; the size button doesn't repeat it.
  const sizeText = (v: ProductDesign['variants'][number]) =>
    v.optionLabel ? v.label.replace(` · ${v.optionLabel}`, '') : v.label;

  function pickOption(optionLabel: string) {
    const target =
      bookable.find(
        (v) =>
          v.optionLabel === optionLabel &&
          v.portions === variant?.portions &&
          v.enPromocion === variant?.enPromocion
      ) ?? bookable.find((v) => v.optionLabel === optionLabel);
    if (target) setVariantId(target.id);
  }

  // A minicake (promo variant) defaults to Arequipe but can be changed; every
  // size of the alfajor minicake is locked to it (its filling never changes).
  // Any other size needs the client to actually choose, so the field resets
  // whenever the size changes.
  useEffect(() => {
    setRelleno(variant?.enPromocion || design?.category === 'ALFAJOR_CAKE' ? 'Arequipe' : '');
  }, [variant?.id, variant?.enPromocion, design?.category]);

  // maxCustomImages is per size (the memory cake: 5 on the minicake/6-porciones,
  // 10 on bigger sizes) — trim already-uploaded images down if switching to a
  // smaller size drops the cap.
  useEffect(() => {
    const max = variant?.maxCustomImages ?? 1;
    setCustomImages((prev) => (prev.length > max ? prev.slice(0, max) : prev));
  }, [variant?.id, variant?.maxCustomImages]);

  useEffect(() => {
    if (!draft.deliveryDate) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    setPreviewError(false);
    api
      .get<DeliveryPreview>('/public-orders/availability', {
        params: { date: draft.deliveryDate, minutes: draft.totalMinutes },
      })
      .then((res) => setPreview(res.data))
      .catch((err) => {
        console.error('Error cargando disponibilidad:', err);
        setPreview(null);
        setPreviewError(true);
      })
      .finally(() => setLoadingPreview(false));
  }, [draft.deliveryDate, draft.totalMinutes]);

  // Uploads every file the client just picked (one request each, sequentially —
  // simpler to reason about than parallel uploads racing each other's errors),
  // stopping at however many slots are left under the current size's cap.
  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // lets picking the exact same file again re-trigger onChange
    if (files.length === 0 || !design || !variant) return;
    const remaining = Math.max(0, variant.maxCustomImages - customImages.length);
    const toUpload = files.slice(0, remaining);
    if (toUpload.length === 0) return;
    setImageError('');
    setUploadingImage(true);
    try {
      const uploaded: string[] = [];
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('productDesignId', design.id);
        const response = await api.post<{ imageUrl: string }>('/public-orders/upload-image', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        uploaded.push(response.data.imageUrl);
      }
      setCustomImages((prev) => [...prev, ...uploaded]);
    } catch (error) {
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No se pudo subir la imagen. Prueba con otra foto.';
      setImageError(message);
    } finally {
      setUploadingImage(false);
    }
  }

  function removeImage(index: number) {
    setCustomImages((prev) => prev.filter((_, i) => i !== index));
  }

  const cartFull = draft.items.length >= MAX_ITEMS;

  function handleAddItem() {
    if (!design || !variant || !relleno || cartFull) return;
    const surcharge = rellenoSurcharge(relleno, variant.portions, variant.enPromocion);
    const multiImage = variant.maxCustomImages > 1;
    draft.addItem({
      key: newKey(),
      designId: design.id,
      designName: design.name || DESIGN_FALLBACK,
      designImageUrl: displayedImageUrl,
      variantId: variant.id,
      variantLabel: variant.label,
      price: Number(variant.price) + surcharge,
      points: variant.points,
      prepMinutes: variant.prepMinutes,
      flavor,
      relleno,
      shape,
      color: color || undefined,
      customText: customText.trim() || undefined,
      customImageUrl: !multiImage ? customImages[0] || undefined : undefined,
      customImageUrls: multiImage && customImages.length > 0 ? customImages : undefined,
    });
    setCustomText('');
    setCustomImages([]);
    setImageError('');
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2500);
  }

  // The date picker's `min` is only a soft hint (typable on desktop, and it goes
  // stale if the page sits open past midnight), so re-check the 48h floor here —
  // the backend rejects it anyway, this just stops a confusing "preview says OK,
  // submit says no".
  const dateTooSoon = !!draft.deliveryDate && draft.deliveryDate < earliestDate;

  const canSubmit =
    draft.items.length > 0 &&
    !!draft.deliveryDate &&
    !dateTooSoon &&
    !!preview?.isBusinessDay &&
    !preview?.isBlocked &&
    !!preview?.fits &&
    !!draft.clientName.trim() &&
    !!draft.clientPhone.trim() &&
    !submitting;

  async function handleSubmit() {
    setErrorMessage('');
    setSubmitting(true);
    // Opened synchronously, still inside the click handler's own gesture —
    // browsers block a popup opened after an `await`, so this blank tab is
    // the placeholder we redirect once the order actually exists.
    const whatsappTab = window.open('', '_blank');
    try {
      const name = draft.clientName.trim();
      const normalizedPhone = draft.clientPhone.replace(/[^\d+]/g, '');
      const breakdown = itemsBreakdown(draft.items);

      const response = await api.post<OrderResult>('/public-orders', {
        clientName: name,
        // Keep only digits and a leading +, but accept any country's number.
        clientPhone: normalizedPhone,
        deliveryDate: draft.deliveryDate,
        notes: draft.notes.trim() || undefined,
        items: draft.items.map((i) => ({
          productDesignId: i.designId,
          variantId: i.variantId,
          flavor: i.flavor,
          relleno: i.relleno,
          shape: i.shape,
          color: i.color,
          customText: i.customText,
          customImageUrl: i.customImageUrl,
          customImageUrls: i.customImageUrls,
        })),
      });

      const waHref = waLink(
        `${name}\n` +
          `Tel: ${normalizedPhone}\n\n` +
          `Ticket #${response.data.ticketNumber}\n\n` +
          `${breakdown}\n\n` +
          `Hora: ${response.data.deliveryTimeLabel ?? 'por confirmar'} (Esta es la hora mínima de entrega de mi pedido)\n\n` +
          `Total: $${Number(response.data.totalPrice).toLocaleString('es-CO')}\n\n` +
          `Este es el resumen de mi pedido, quiero proceder con el pago.`
      );
      draft.reset();
      if (whatsappTab) {
        whatsappTab.location.href = waHref;
      } else {
        // Popup blocked anyway — fall back to navigating this tab.
        window.location.href = waHref;
      }
    } catch (error) {
      whatsappTab?.close();
      const message =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No se pudo enviar el pedido. Intenta de nuevo.';
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!designsLoaded || !design) {
    return (
      <div className="booking-page">
        <AnnouncementBar />
        <SiteHeader />
        <main className="booking-main">
          <p className="muted">
            {catalogSlow
              ? 'Estamos despertando el servidor, esto puede tardar unos segundos la primera vez...'
              : 'Cargando...'}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="booking-page">
      <AnnouncementBar />
      <SiteHeader />

      <main className="booking-main">
        <Link to={catalogHref} className="booking-back">
          ← Volver al catálogo
        </Link>
        <h1>Arma tu pedido</h1>

        {cartWasStale && (
          <p className="warning">
            Quitamos uno o más productos de tu pedido porque el catálogo cambió. Revísalo y vuelve a
            agregarlos si los necesitas.
          </p>
        )}

        {/* ---------- Configurador del producto actual ---------- */}
        <section className="booking-block">
          <div className="config-head">
            {displayedImageUrl ? (
              <img className="config-photo" src={displayedImageUrl} alt={design.name || DESIGN_FALLBACK} />
            ) : (
              <div className="config-photo config-photo-empty" aria-hidden="true">
                Sin foto
              </div>
            )}
            <div>
              <p className="eyebrow">Estás personalizando</p>
              <h2>{design.name || DESIGN_FALLBACK}</h2>
            </div>
          </div>

          {optionLabels.length > 0 && (
            <>
              <label className="field-label">{design.optionTitle ?? 'Opción'}</label>
              <div className="pills">
                {optionLabels.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`pill ${variant?.optionLabel === opt ? 'pill-active' : ''}`}
                    onClick={() => pickOption(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}

          {design.images.length > 0 && (
            <>
              <label className="field-label">Color</label>
              <div className="pills">
                {design.images.map((img) => (
                  <button
                    key={img.colorName}
                    type="button"
                    className={`pill ${color === img.colorName ? 'pill-active' : ''}`}
                    onClick={() => setColor(img.colorName)}
                  >
                    {img.colorName}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="field-label">Forma</label>
          <div className="pills">
            {CAKE_SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                className={`pill ${shape === s ? 'pill-active' : ''}`}
                onClick={() => setShape(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <label className="field-label">Tamaño</label>
          <div className="pills">
            {/* Original (para cuando se reactiven tortas 5+): design.variants.map(...) */}
            {sizeVariants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`pill ${variantId === v.id ? 'pill-active' : ''}`}
                onClick={() => setVariantId(v.id)}
              >
                {sizeText(v)} — ${Number(v.price).toLocaleString('es-CO')}
              </button>
            ))}
          </div>

          {design.category !== 'ALFAJOR_CAKE' && (
            <>
              <label className="field-label">Sabor de la torta</label>
              <div className="pills">
                {FLAVORS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`pill ${flavor === f ? 'pill-active' : ''}`}
                    onClick={() => setFlavor(f)}
                  >
                    {flavorLabels[f]}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="field-label">Sabor de relleno</label>
          {variant && (
            <RellenoSelect
              portions={variant.portions}
              isPromo={variant.enPromocion}
              locked={design.category === 'ALFAJOR_CAKE'}
              value={relleno}
              onChange={setRelleno}
            />
          )}

          {design.allowsCustomText && (
            <>
              <label className="field-label">Texto personalizado (opcional)</label>
              <input
                type="text"
                maxLength={design.customTextMaxLength}
                placeholder="Ej: Feliz cumple Ana"
                value={customText}
                onChange={(e) => setCustomText(e.target.value.slice(0, design.customTextMaxLength))}
              />
              <p className="field-hint">
                Máximo {design.customTextMaxLength} letras ({customText.length}/{design.customTextMaxLength}).
              </p>
            </>
          )}

          {design.allowsCustomImage && variant && (
            <>
              <label className="field-label">
                {variant.maxCustomImages > 1
                  ? `Imágenes para imprimir (hasta ${variant.maxCustomImages}${design.requiresCustomImage ? ', mínimo 1' : ''})`
                  : `Imagen para imprimir ${design.requiresCustomImage ? '(obligatoria)' : '(opcional)'}`}
              </label>
              {design.requiresCustomImage && (
                <p className="field-hint">
                  No editamos ni diseñamos la imagen: súbela lista para imprimir tal como la quieres en la
                  minicake.
                </p>
              )}
              <input
                type="file"
                accept="image/*"
                multiple={variant.maxCustomImages > 1}
                onChange={handleImageChange}
                disabled={uploadingImage || customImages.length >= variant.maxCustomImages}
              />
              {variant.maxCustomImages > 1 && (
                <p className="field-hint">
                  {customImages.length}/{variant.maxCustomImages} imágenes.
                </p>
              )}
              {uploadingImage && <p className="muted">Subiendo imagen...</p>}
              {imageError && <p className="warning">{imageError}</p>}
              {customImages.length > 0 && (
                <div className={variant.maxCustomImages > 1 ? 'custom-images-grid' : 'custom-image-single'}>
                  {customImages.map((url, i) => (
                    <div key={url} className="custom-image-thumb">
                      <img
                        src={url}
                        alt={variant.maxCustomImages > 1 ? `Imagen ${i + 1}` : 'Imagen personalizada'}
                      />
                      <button
                        type="button"
                        className="custom-image-remove"
                        aria-label="Quitar imagen"
                        onClick={() => removeImage(i)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddItem}
            disabled={
              !variant ||
              !relleno ||
              uploadingImage ||
              cartFull ||
              (design.requiresCustomImage && customImages.length === 0)
            }
          >
            Agregar al pedido
          </button>
          {design.requiresCustomImage && customImages.length === 0 && (
            <p className="field-hint">Sube tu imagen para poder agregar este producto.</p>
          )}
          {cartFull && (
            <p className="warning">
              Un pedido web admite hasta {MAX_ITEMS} productos. Para más, escríbenos por WhatsApp.
            </p>
          )}
          {justAdded && !cartFull && <p className="added-flash">Agregado a tu pedido ✓</p>}
        </section>

        {/* ---------- Carrito ---------- */}
        {draft.items.length > 0 && (
          <section className="booking-block">
            <h2>Tu pedido ({draft.items.length})</h2>
            <ul className="cart-list">
              {draft.items.map((i) => (
                <li key={i.key}>
                  <span>
                    {[i.designName, i.variantLabel, flavorLabels[i.flavor], i.relleno, i.color, i.shape]
                      .filter(Boolean)
                      .join(' · ')}
                    {i.customText ? ` · "${i.customText}"` : ''}
                    {i.customImageUrl ? ' · con imagen' : ''}
                    {i.customImageUrls?.length ? ` · ${i.customImageUrls.length} imágenes` : ''}
                  </span>
                  <span className="cart-item-right">
                    ${i.price.toLocaleString('es-CO')}
                    <button type="button" aria-label="Quitar del pedido" onClick={() => draft.removeItem(i.key)}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <Link to={catalogHref} className="btn btn-ghost">
              Agregar otro producto
            </Link>
          </section>
        )}

        {/* ---------- Entrega ---------- */}
        <section className="booking-block">
          <h2>Fecha de entrega</h2>
          <input
            type="date"
            min={earliestDate}
            value={draft.deliveryDate}
            onChange={(e) => draft.patch({ deliveryDate: e.target.value })}
          />
          <p className="field-hint">Necesitamos al menos 2 días de anticipación.</p>
          {dateTooSoon && (
            <p className="warning">
              Esa fecha es muy pronto. Elige una a partir del {formatDeliveryDate(earliestDate)}.
            </p>
          )}

          {/* Live pickup-time estimate: recalculates whenever the date or the
              cart changes, so the client sees the hour before adding anything. */}
          <div className="slot-box">
            {!draft.deliveryDate && (
              <p className="slot-hint">Elige una fecha para ver a qué hora estaría listo tu pedido.</p>
            )}

            {draft.deliveryDate && loadingPreview && (
              <p className="slot-hint">Calculando la hora...</p>
            )}

            {draft.deliveryDate && !loadingPreview && previewError && (
              <p className="warning">
                No pudimos calcular la hora ahora mismo. Revisa tu conexión y vuelve a intentar en un
                momento.
              </p>
            )}

            {draft.deliveryDate && !loadingPreview && preview && (
              <>
                {!preview.isBusinessDay && (
                  <p className="warning">
                    Ese día no agendamos (domingo, lunes o festivo). Elige otra fecha.
                  </p>
                )}

                {preview.isBusinessDay && preview.isBlocked && (
                  <p className="warning">Ese día no está disponible. Elige otra fecha.</p>
                )}

                {/* No hay productos aún: mostramos desde qué hora entrega ese día. */}
                {preview.isBusinessDay && !preview.isBlocked && draft.totalMinutes === 0 && (
                  <>
                    <p className="slot-label">Ese día entregamos</p>
                    <p className="slot-time">desde las {preview.deliveryTimeLabel}</p>
                    <p className="slot-sub">
                      Agrega productos y te calculamos la hora exacta de recogida de tu pedido.
                    </p>
                  </>
                )}

                {preview.isBusinessDay && !preview.isBlocked && draft.totalMinutes > 0 && preview.fits && (
                  <>
                    <p className="slot-label">Tu pedido estaría listo</p>
                    <p className="slot-time">a partir de las {preview.deliveryTimeLabel}</p>
                    <p className="slot-sub">
                      Puedes recogerlo a esa hora o más tarde ese mismo día, hasta las{' '}
                      {preview.closesAtLabel}. Si lo necesitas antes, elige otro día.
                    </p>
                  </>
                )}

                {preview.isBusinessDay && !preview.isBlocked && draft.totalMinutes > 0 && !preview.fits && (
                  <p className="warning">
                    Ese día ya está lleno (entregamos hasta las {preview.closesAtLabel}). Elige otra
                    fecha.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* ---------- Datos ---------- */}
        <section className="booking-block">
          <h2>Tus datos</h2>
          <label className="field-label">Nombre completo</label>
          <input
            type="text"
            maxLength={MAX_CLIENT_NAME}
            value={draft.clientName}
            onChange={(e) => draft.patch({ clientName: e.target.value })}
          />

          <label className="field-label">Teléfono (WhatsApp)</label>
          <input
            type="tel"
            value={draft.clientPhone}
            onChange={(e) => draft.patch({ clientPhone: e.target.value })}
          />

          <label className="field-label">Especificaciones (opcional)</label>
          <textarea
            maxLength={MAX_NOTES}
            value={draft.notes}
            onChange={(e) => draft.patch({ notes: e.target.value })}
          />
        </section>

        {/* ---------- Resumen antes de pagar ---------- */}
        {draft.items.length > 0 &&
          draft.deliveryDate &&
          preview?.isBusinessDay &&
          preview?.fits && (
            <section className="booking-block booking-recap">
              <h2>Antes de enviar</h2>
              <dl className="recap-list">
                <div>
                  <dt>Productos</dt>
                  <dd>{draft.items.length}</dd>
                </div>
                <div>
                  <dt>Entrega</dt>
                  <dd>{formatDeliveryDate(draft.deliveryDate)}</dd>
                </div>
                <div>
                  <dt>Hora de recogida</dt>
                  <dd>a partir de las {preview.deliveryTimeLabel}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>${draft.totalPrice.toLocaleString('es-CO')}</dd>
                </div>
              </dl>
            </section>
          )}

        {/* ---------- Ubicación para recoger ---------- */}
        <section className="booking-block booking-pickup dot-edges">
          <h2>Todos los pedidos son para recoger en el local</h2>
          <p className="booking-pickup-address">{BUSINESS.addressLine}</p>
          <p className="booking-pickup-sub">
            {BUSINESS.city} · Estación de metro más cercana: {BUSINESS.nearestMetro}
          </p>
          <a className="btn btn-accent" href={BUSINESS.mapsUrl} target="_blank" rel="noreferrer">
            Abrir en Google Maps
          </a>
        </section>

        <div className="checkout-bar">
          <div className="checkout-bar-inner">
            <div className="checkout-total">
              <span className="checkout-total-label">Total</span>
              <span className="checkout-total-amount">
                ${draft.totalPrice.toLocaleString('es-CO')}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary checkout-send"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {submitting ? 'Enviando...' : 'Enviar por WhatsApp'}
            </button>
          </div>
          {errorMessage && <p className="warning checkout-error">{errorMessage}</p>}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
