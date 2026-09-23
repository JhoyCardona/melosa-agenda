import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams /*, useSearchParams */ } from 'react-router-dom';
import api, { getWithRetry } from '../api';
import type { CakeShape, Flavor, ProductDesign } from '../types';
import { CAKE_SHAPES, isCakeItem } from '../types';
import { useOrderDraft } from '../context/OrderDraft';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import RellenoSelect from '../components/RellenoSelect';
import BookingCheckout from '../components/BookingCheckout';
import { rellenoSurcharge } from '../config';
import { MAX_ITEMS, flavorLabels, newKey } from '../bookingShared';
import './BookingPage.css';

const FLAVORS: Flavor[] = ['VAINILLA', 'CHOCOLATE'];

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
        // Catalog v2 cake lines are checked by their own page, not here.
        const kept = draft.items.filter((i) => {
          if (isCakeItem(i)) return true;
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
      kind: 'legacy',
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

        <BookingCheckout catalogHref={catalogHref} />
      </main>

      <SiteFooter />
    </div>
  );
}
