import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams /*, useSearchParams */ } from 'react-router-dom';
import api, { getWithRetry } from '../api';
import type { CakeShape, Flavor, PrintImageType, ProductDesign } from '../types';
import { CAKE_SHAPES, isCakeItem } from '../types';
import { useOrderDraft } from '../context/OrderDraft';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import RellenoSelect from '../components/RellenoSelect';
import AddedToCart from '../components/AddedToCart';
import { legacyItemStillValid } from '../cartValidation';
import EditBanner from '../components/EditBanner';
import { rellenoSurcharge } from '../config';
import { MAX_ITEMS, PRINT_TYPE_LABELS, PRINT_TYPE_HINT, flavorLabels, manageHref, newKey, pesos } from '../bookingShared';
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
  // Every added image starts as non-edible; the client can switch to edible.
  const [printType, setPrintType] = useState<PrintImageType>('NON_EDIBLE');
  // "No quiero imágenes", only offered on designs whose image is optional.
  const [noImages, setNoImages] = useState(false);
  // Per-cake print surcharges, from the server. Until they load (or if the
  // request fails) the image option stays hidden rather than showing a price
  // the server might not charge.
  const [printPrices, setPrintPrices] = useState<Record<PrintImageType, number> | null>(null);


  const design = designs.find((d) => d.id === designId);
  const variant = design?.variants.find((v) => v.id === variantId);

  useEffect(() => {
    Promise.all([
      getWithRetry<ProductDesign[]>('/product-designs', { onSlow: () => setCatalogSlow(true) }),
      // Needed to re-check saved lines that carry a print surcharge; a failure
      // here just means those lines get dropped as stale, like a price change.
      getWithRetry<Record<PrintImageType, number>>('/public-orders/print-image-prices').catch(() => null),
    ])
      .then(([data, prices]) => {
        setDesigns(data);
        setPrintPrices(prices);
        // Reconcile the stored cart against the fresh catalog, once. A line whose
        // design or variant is gone, or whose price changed, would otherwise
        // fail on submit with an unhelpful error — drop it and warn instead.
        // Catalog v2 cake lines are checked by their own page, and lines kept
        // from an order being modified keep their booked price.
        const kept = draft.items.filter(
          (i) => isCakeItem(i) || !!i.keepItemId || legacyItemStillValid(data, prices, i)
        );
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
    setPrintType('NON_EDIBLE');
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
  // Same rule as the catalog v2 cake page: an optional image still blocks
  // "Agregar" until the client uploads or explicitly ticks "No quiero imágenes".
  const imageOptional = !!design?.allowsCustomImage && !design.requiresCustomImage;
  const skipImages = imageOptional && noImages;
  const needsImage = !!design?.allowsCustomImage && !skipImages && customImages.length === 0;
  // The print surcharge applies once there's at least one image.
  const linePrintType = design?.allowsCustomImage && !skipImages && customImages.length > 0 ? printType : undefined;
  const linePrice =
    variant && printPrices
      ? Number(variant.price) +
        rellenoSurcharge(relleno, variant.portions, variant.enPromocion) +
        (linePrintType ? printPrices[linePrintType] : 0)
      : null;

  function handleAddItem() {
    if (!design || !variant || !relleno || cartFull || needsImage || linePrice === null) return;
    const multiImage = variant.maxCustomImages > 1;
    draft.addItem({
      kind: 'legacy',
      key: newKey(),
      designId: design.id,
      designName: design.name || DESIGN_FALLBACK,
      designImageUrl: displayedImageUrl,
      variantId: variant.id,
      variantLabel: variant.label,
      price: linePrice,
      points: variant.points,
      prepMinutes: variant.prepMinutes,
      flavor,
      relleno,
      shape,
      color: color || undefined,
      customText: customText.trim() || undefined,
      customImageUrl: !multiImage && linePrintType ? customImages[0] : undefined,
      customImageUrls: multiImage && linePrintType ? customImages : undefined,
      printImageType: linePrintType,
      withoutImages: skipImages || undefined,
    });
    // Modifying an order: the new line goes into it, back to the order page.
    if (draft.edit) {
      navigate(manageHref(draft.edit.token));
      return;
    }
    setCustomText('');
    setCustomImages([]);
    setPrintType('NON_EDIBLE');
    setNoImages(false);
    setImageError('');
    setJustAdded(true);
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
        <EditBanner />
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

          {design.allowsCustomImage && variant && printPrices && (
            <>
              <label className="field-label">
                {variant.maxCustomImages > 1 ? `Tus imágenes (hasta ${variant.maxCustomImages})` : 'Tu imagen'}
              </label>
              <p className="field-hint">
                Esta torta lleva imagen impresa: súbela aquí, no la envíes por WhatsApp. Desde +
                {pesos(printPrices.NON_EDIBLE)} por torta
                {variant.maxCustomImages > 1 ? ', sin importar cuántas imágenes subas' : ''}.
              </p>
              {imageOptional && (
                <label className="check-row">
                  <input type="checkbox" checked={noImages} onChange={(e) => setNoImages(e.target.checked)} />
                  No quiero {variant.maxCustomImages > 1 ? 'imágenes' : 'imagen'} (la hacemos con la misma
                  decoración, sin imprimir nada)
                </label>
              )}
              {!skipImages && (
                <>
                  <p className="field-hint">
                    No editamos ni diseñamos la imagen: súbela lista para imprimir tal como la quieres en la torta.
                  </p>
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
                  {customImages.length > 0 && (
                    <>
                      <label className="field-label">Tipo de imagen</label>
                      <div className="pills">
                        {(['NON_EDIBLE', 'EDIBLE'] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={`pill ${t === printType ? 'pill-active' : ''}`}
                            onClick={() => setPrintType(t)}
                          >
                            {PRINT_TYPE_LABELS[t]} (+{pesos(printPrices[t])})
                          </button>
                        ))}
                      </div>
                      <p className="field-hint">{PRINT_TYPE_HINT}</p>
                </>
              )}
                </>
              )}
            </>
          )}

          {linePrice !== null && (
            <p className="cake-line-price">
              Precio de esta torta: <strong>{pesos(linePrice)}</strong>
            </p>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddItem}
            disabled={
              !variant ||
              linePrice === null ||
              !relleno ||
              uploadingImage ||
              cartFull ||
              needsImage
            }
          >
            Agregar al pedido
          </button>
          {needsImage && (
            <p className="field-hint">
              {imageOptional
                ? `Sube tu imagen, o marca "No quiero ${variant?.maxCustomImages ?? 1 > 1 ? 'imágenes' : 'imagen'}", para poder agregar este producto.`
                : 'Sube tu imagen para poder agregar este producto.'}
            </p>
          )}
          {cartFull && (
            <p className="warning">
              Un pedido web admite hasta {MAX_ITEMS} productos. Para más, escríbenos por WhatsApp.
            </p>
          )}
          {justAdded && <AddedToCart catalogHref={catalogHref} />}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
