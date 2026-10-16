import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getWithRetry } from '../api';
import type { CakeCartItem, PrintImageType, PublicCakeCatalog, PublicCakeColor, PublicCakeSize } from '../types';
import { isCakeItem } from '../types';
import { useOrderDraft } from '../context/OrderDraft';
import { AnnouncementBar, SiteFooter, SiteHeader } from '../components/SiteChrome';
import BookingCheckout from '../components/BookingCheckout';
import { MAX_ITEMS, newKey } from '../bookingShared';
import './BookingPage.css';

// Booking page for a catalog v2 cake: pick color → size → bizcocho → relleno →
// shape (+ text / print images when the design allows; adding images costs a
// per-cake surcharge by print type), with the live price,
// then the shared checkout. The server re-validates and re-prices everything.

const CATALOG_HREF = '/catalogo';

function pesos(n: number): string {
  return `$${n.toLocaleString('es-CO')}`;
}

// Price of one cake as configured: this color's size price + the chosen
// flavors' surcharges for that size + the print-image surcharge, if any.
function linePrice(
  catalog: PublicCakeCatalog,
  size: PublicCakeSize,
  bizcochoId: string,
  rellenoId: string,
  printImageType?: PrintImageType
): number {
  const extra = (flavorId: string) =>
    catalog.flavors.find((f) => f.id === flavorId)?.surcharges[size.sizeId] ?? 0;
  const imageExtra = printImageType ? catalog.printImagePrices[printImageType] : 0;
  return size.price + extra(bizcochoId) + extra(rellenoId) + imageExtra;
}

const PRINT_TYPE_LABELS: Record<PrintImageType, string> = {
  NON_EDIBLE: 'No comestible',
  EDIBLE: 'Comestible',
};

// Is a saved cart line still valid against the live catalog, at the same price?
function stillValid(catalog: PublicCakeCatalog, item: CakeCartItem): boolean {
  const design = catalog.designs.find((d) => d.id === item.designId);
  const color = design?.colors.find((c) => c.id === item.colorId);
  const size = color?.sizes.find((s) => s.sizeId === item.sizeId);
  if (!color || !size) return false;
  if (!color.bizcochoIds.includes(item.bizcochoId) || !color.rellenoIds.includes(item.rellenoId)) return false;
  if (!color.shapes.some((s) => s.id === item.shapeId)) return false;
  const printType = item.customImageUrls?.length ? item.printImageType ?? 'NON_EDIBLE' : undefined;
  return linePrice(catalog, size, item.bizcochoId, item.rellenoId, printType) === item.price;
}

export default function CakeBookingPage() {
  const { designId } = useParams();
  const navigate = useNavigate();
  const draft = useOrderDraft();

  const [catalog, setCatalog] = useState<PublicCakeCatalog | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [cartWasStale, setCartWasStale] = useState(false);

  // The client's picks. Each is resolved against what the current color offers
  // (see below), so switching color never leaves an invalid pick behind.
  const [colorId, setColorId] = useState('');
  const [sizeId, setSizeId] = useState('');
  const [bizcochoId, setBizcochoId] = useState('');
  const [rellenoId, setRellenoId] = useState('');
  const [shapeId, setShapeId] = useState('');
  const [customText, setCustomText] = useState('');
  const [customImages, setCustomImages] = useState<string[]>([]);
  // Every added image starts as non-edible; the client can switch to edible.
  const [printType, setPrintType] = useState<PrintImageType>('NON_EDIBLE');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    getWithRetry<PublicCakeCatalog>('/public-orders/cake-catalog', { onSlow: () => setSlow(true) })
      .then((data) => {
        setCatalog(data);
        // Drop saved cake lines that no longer match the live catalog (design,
        // color, size or flavor gone, or price changed) instead of letting the
        // order fail on submit. Other kinds of lines are left to their own page.
        const kept = draft.items.filter((i) => !isCakeItem(i) || stillValid(data, i));
        if (kept.length !== draft.items.length) {
          draft.patch({ items: kept });
          setCartWasStale(true);
        }
      })
      .catch((err) => console.error('Error cargando catálogo de tortas:', err))
      .finally(() => {
        setLoaded(true);
        setSlow(false);
      });
    // Runs once on mount, validating the cart as loaded from storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const design = catalog?.designs.find((d) => d.id === designId);

  // Unknown or no-longer-bookable design → back to the catalog.
  useEffect(() => {
    if (loaded && !design) navigate(CATALOG_HREF, { replace: true });
  }, [loaded, design, navigate]);

  // Effective selection: the pick if this color offers it, else a default.
  const color: PublicCakeColor | undefined = design?.colors.find((c) => c.id === colorId) ?? design?.colors[0];
  const size = color?.sizes.find((s) => s.sizeId === sizeId) ?? color?.sizes[0];
  const bizcochos = useMemo(
    () => (catalog && color ? catalog.flavors.filter((f) => color.bizcochoIds.includes(f.id)) : []),
    [catalog, color]
  );
  const rellenos = useMemo(
    () => (catalog && color ? catalog.flavors.filter((f) => color.rellenoIds.includes(f.id)) : []),
    [catalog, color]
  );
  const bizcocho = bizcochos.find((f) => f.id === bizcochoId) ?? bizcochos[0];
  const relleno = rellenos.find((f) => f.id === rellenoId) ?? rellenos[0];
  const shape = color?.shapes.find((s) => s.id === shapeId) ?? color?.shapes[0];

  const maxImages = design && size ? design.imageLimits[size.sizeId] ?? 1 : 1;
  // A smaller size can lower the cap; extra images beyond it are just not sent.
  const images = customImages.slice(0, maxImages);
  // The surcharge only applies once there's at least one image.
  const linePrintType = design?.allowsCustomImage && images.length > 0 ? printType : undefined;

  const price =
    catalog && size && bizcocho && relleno ? linePrice(catalog, size, bizcocho.id, relleno.id, linePrintType) : null;
  const cartFull = draft.items.length >= MAX_ITEMS;
  const needsImage = !!design?.allowsCustomImage && design.requiresCustomImage && images.length === 0;

  function surchargeLabel(flavorId: string): string {
    const extra = size ? catalog?.flavors.find((f) => f.id === flavorId)?.surcharges[size.sizeId] ?? 0 : 0;
    return extra > 0 ? ` (+${pesos(extra)})` : '';
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // lets picking the exact same file again re-trigger onChange
    if (files.length === 0 || !design) return;
    const toUpload = files.slice(0, Math.max(0, maxImages - images.length));
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
      setCustomImages([...images, ...uploaded]);
    } catch (error) {
      setImageError(
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'No se pudo subir la imagen. Prueba con otra foto.'
      );
    } finally {
      setUploadingImage(false);
    }
  }

  function handleAddItem() {
    if (!design || !color || !size || !bizcocho || !relleno || !shape || price === null) return;
    if (cartFull || needsImage) return;
    draft.addItem({
      kind: 'cake',
      key: newKey(),
      designId: design.id,
      designName: design.name,
      designImageUrl: color.imageUrl,
      colorId: color.id,
      color: color.colorName,
      sizeId: size.sizeId,
      sizeLabel: size.label,
      portions: size.portions,
      bizcochoId: bizcocho.id,
      bizcochoName: bizcocho.name,
      rellenoId: relleno.id,
      rellenoName: relleno.name,
      shapeId: shape.id,
      shapeName: shape.name,
      price,
      prepMinutes: size.prepMinutes,
      customText: design.allowsCustomText ? customText.trim() || undefined : undefined,
      customImageUrls: linePrintType ? images : undefined,
      printImageType: linePrintType,
    });
    setCustomText('');
    setCustomImages([]);
    setPrintType('NON_EDIBLE');
    setImageError('');
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2500);
  }

  if (!loaded || !design || !color) {
    return (
      <div className="booking-page">
        <AnnouncementBar />
        <SiteHeader />
        <main className="booking-main">
          <p className="muted">
            {slow ? 'Estamos despertando el servidor, esto puede tardar unos segundos la primera vez...' : 'Cargando...'}
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
        <Link to={CATALOG_HREF} className="booking-back">
          ← Volver al catálogo
        </Link>
        <h1>Arma tu pedido</h1>

        {cartWasStale && (
          <p className="warning">
            Quitamos uno o más productos de tu pedido porque el catálogo cambió. Revísalo y vuelve a agregarlos
            si los necesitas.
          </p>
        )}

        <section className="booking-block">
          <div className="config-head">
            <img className="config-photo" src={color.imageUrl} alt={`${design.name}, color ${color.colorName}`} />
            <div>
              <p className="eyebrow">Estás personalizando</p>
              <h2>{design.name}</h2>
            </div>
          </div>

          {design.colors.length > 1 && (
            <>
              <label className="field-label">Color</label>
              <div className="pills">
                {design.colors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`pill ${c.id === color.id ? 'pill-active' : ''}`}
                    onClick={() => setColorId(c.id)}
                  >
                    {c.colorName}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="field-label">Tamaño</label>
          <div className="pills">
            {color.sizes.map((s) => (
              <button
                key={s.sizeId}
                type="button"
                className={`pill ${s.sizeId === size?.sizeId ? 'pill-active' : ''}`}
                onClick={() => setSizeId(s.sizeId)}
              >
                {s.label} — {pesos(s.price)}
              </button>
            ))}
          </div>

          <label className="field-label">Sabor del bizcocho</label>
          <div className="pills">
            {bizcochos.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`pill ${f.id === bizcocho?.id ? 'pill-active' : ''}`}
                onClick={() => setBizcochoId(f.id)}
              >
                {f.name}
                {surchargeLabel(f.id)}
              </button>
            ))}
          </div>

          <label className="field-label">Sabor del relleno</label>
          <div className="pills">
            {rellenos.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`pill ${f.id === relleno?.id ? 'pill-active' : ''}`}
                onClick={() => setRellenoId(f.id)}
              >
                {f.name}
                {surchargeLabel(f.id)}
              </button>
            ))}
          </div>

          <label className="field-label">Forma</label>
          <div className="pills">
            {color.shapes.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`pill ${s.id === shape?.id ? 'pill-active' : ''}`}
                onClick={() => setShapeId(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>

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

          {design.allowsCustomImage && catalog && (
            <>
              <label className="field-label">
                {maxImages > 1
                  ? `Agregar imágenes (hasta ${maxImages}${design.requiresCustomImage ? ', mínimo 1' : ''})`
                  : `Agregar imagen ${design.requiresCustomImage ? '(obligatoria)' : '(opcional)'}`}
              </label>
              <p className="field-hint">
                Desde +{pesos(catalog.printImagePrices.NON_EDIBLE)} por torta
                {maxImages > 1 ? ', sin importar cuántas imágenes subas' : ''}.
              </p>
              {design.requiresCustomImage && (
                <p className="field-hint">
                  No editamos ni diseñamos la imagen: súbela lista para imprimir tal como la quieres en la torta.
                </p>
              )}
              <input
                type="file"
                accept="image/*"
                multiple={maxImages > 1}
                onChange={handleImageChange}
                disabled={uploadingImage || images.length >= maxImages}
              />
              {maxImages > 1 && (
                <p className="field-hint">
                  {images.length}/{maxImages} imágenes.
                </p>
              )}
              {uploadingImage && <p className="muted">Subiendo imagen...</p>}
              {imageError && <p className="warning">{imageError}</p>}
              {images.length > 0 && (
                <div className={maxImages > 1 ? 'custom-images-grid' : 'custom-image-single'}>
                  {images.map((url, i) => (
                    <div key={url} className="custom-image-thumb">
                      <img src={url} alt={maxImages > 1 ? `Imagen ${i + 1}` : 'Imagen personalizada'} />
                      <button
                        type="button"
                        className="custom-image-remove"
                        aria-label="Quitar imagen"
                        onClick={() => setCustomImages(images.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {images.length > 0 && (
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
                        {PRINT_TYPE_LABELS[t]} (+{pesos(catalog.printImagePrices[t])})
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {price !== null && (
            <p className="cake-line-price">
              Precio de esta torta: <strong>{pesos(price)}</strong>
            </p>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddItem}
            disabled={price === null || uploadingImage || cartFull || needsImage}
          >
            Agregar al pedido
          </button>
          {needsImage && <p className="field-hint">Sube tu imagen para poder agregar este producto.</p>}
          {cartFull && (
            <p className="warning">
              Un pedido web admite hasta {MAX_ITEMS} productos. Para más, escríbenos por WhatsApp.
            </p>
          )}
          {justAdded && !cartFull && <p className="added-flash">Agregado a tu pedido ✓</p>}
        </section>

        <BookingCheckout catalogHref={CATALOG_HREF} />
      </main>

      <SiteFooter />
    </div>
  );
}
