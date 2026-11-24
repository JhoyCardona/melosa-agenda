import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CakeCartItem, PublicCakeCatalog, PublicCakeDesign } from '../types';
import { useOrderDraft } from '../context/OrderDraft';
import AddedToCart from './AddedToCart';
import EditBanner from './EditBanner';
import { CART_HREF } from './CartButton';
import { alfajorBoxPrice } from '../cartValidation';
import { MAX_ALFAJORES, MAX_ITEMS, alfajorCount, catalogPhotoUrl, manageHref, newKey, pesos } from '../bookingShared';
import { waLink, ALFAJOR_QUOTE_MESSAGE } from '../config';

// Product page of one small-alfajor FLAVOR (ALFAJOR_UNIT): the client picks
// how many (a box quantity), the alfajor size, the shape and the box
// decoration (with its small photo), and sees the price split as
// "N alfajores × price + the box". Nothing is personalized. The server
// re-validates and re-prices everything.
//
// Rendered by CakeBookingPage (same /tortas/:id address as every catalog v2
// product) once the catalog is loaded.

interface Props {
  catalog: PublicCakeCatalog;
  design: PublicCakeDesign;
  // The cart line being changed ("Cambiar"), if any.
  editingItem?: CakeCartItem;
  catalogHref: string;
  cartWasStale: boolean;
}

export default function AlfajorBoxConfigurator({ catalog, design, editingItem, catalogHref, cartWasStale }: Props) {
  const navigate = useNavigate();
  const draft = useOrderDraft();
  // A flavor has a single photo/config row (its "color").
  const color = design.colors[0];
  const boxes = useMemo(() => catalog.alfajorBoxes?.boxes ?? [], [catalog]);

  const [quantityId, setQuantityId] = useState('');
  const [sizeId, setSizeId] = useState('');
  const [shapeId, setShapeId] = useState('');
  const [boxId, setBoxId] = useState('');
  const [justAdded, setJustAdded] = useState(false);

  // Quantities with at least one box for at least one of this flavor's sizes.
  const quantities = useMemo(
    () =>
      (catalog.alfajorBoxes?.quantities ?? []).filter((q) =>
        boxes.some((b) => color.sizes.some((s) => b.prices[q.id]?.[s.sizeId] !== undefined))
      ),
    [catalog, boxes, color]
  );

  // Load the line being changed, once. Kept lines (an order being modified)
  // only know names and the quantity, so match by either.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !editingItem) return;
    prefilled.current = true;
    const it = editingItem;
    setQuantityId(
      (quantities.find((q) => q.id === it.quantityId) ?? quantities.find((q) => q.units === it.unitsPerBox))?.id ?? ''
    );
    setSizeId(
      (color.sizes.find((s) => s.sizeId === it.sizeId) ?? color.sizes.find((s) => s.label === it.sizeLabel))
        ?.sizeId ?? ''
    );
    setShapeId((color.shapes.find((s) => s.id === it.shapeId) ?? color.shapes.find((s) => s.name === it.shapeName))?.id ?? '');
    setBoxId((boxes.find((b) => b.id === it.boxId) ?? boxes.find((b) => b.name === it.boxName))?.id ?? '');
  }, [editingItem, quantities, color, boxes]);

  // Effective picks: the client's when still offered, else the first option.
  const quantity = quantities.find((q) => q.id === quantityId) ?? quantities[0];
  // Sizes offered for this quantity (some box has a price for them).
  const sizes = quantity
    ? color.sizes.filter((s) => boxes.some((b) => b.prices[quantity.id]?.[s.sizeId] !== undefined))
    : [];
  const size = sizes.find((s) => s.sizeId === sizeId) ?? sizes[0];
  const shape = color.shapes.find((s) => s.id === shapeId) ?? color.shapes[0];
  // Boxes that come in this quantity and size.
  const offeredBoxes =
    quantity && size ? boxes.filter((b) => b.prices[quantity.id]?.[size.sizeId] !== undefined) : [];
  const box = offeredBoxes.find((b) => b.id === boxId) ?? offeredBoxes[0];

  const boxPrice = quantity && size && box ? alfajorBoxPrice(catalog, box.id, quantity.id, size.sizeId) : null;
  const alfajoresPrice = quantity && size ? size.price * quantity.units : null;
  const price = alfajoresPrice !== null && boxPrice !== null ? alfajoresPrice + boxPrice : null;

  // Replacing a line being changed never grows the cart.
  const cartFull = draft.items.length >= MAX_ITEMS && !editingItem;
  const alfajoresAfter =
    alfajorCount(draft.items.filter((i) => i.key !== editingItem?.key)) + (quantity?.units ?? 0);
  const tooManyAlfajores = alfajoresAfter > MAX_ALFAJORES;

  function handleAddItem() {
    if (!quantity || !size || !shape || !box || price === null || boxPrice === null) return;
    if (cartFull || tooManyAlfajores) return;
    const item: CakeCartItem = {
      kind: 'cake',
      key: newKey(),
      designId: design.id,
      designName: design.name,
      designImageUrl: color.imageUrl,
      colorId: color.id,
      color: box.name,
      sizeId: size.sizeId,
      sizeLabel: size.label,
      portions: size.portions,
      bizcochoId: '',
      bizcochoName: '',
      rellenoId: '',
      rellenoName: '',
      shapeId: shape.id,
      shapeName: shape.name,
      price,
      prepMinutes: quantity.prepMinutes,
      unitsPerBox: quantity.units,
      quantityId: quantity.id,
      boxId: box.id,
      boxName: box.name,
      boxImageUrl: box.imageUrl,
      boxPrice,
      line: design.category,
    };
    // Modifying an order: save into it and go back to the order page.
    if (draft.edit) {
      if (editingItem) draft.replaceItem(editingItem.key, { ...item, wasEdited: true });
      else draft.addItem(item);
      navigate(manageHref(draft.edit.token));
      return;
    }
    // "Cambiar" from the cart: replace the line and go back there.
    if (editingItem) {
      draft.replaceItem(editingItem.key, item);
      navigate(CART_HREF);
      return;
    }
    draft.addItem(item);
    setJustAdded(true);
  }

  return (
    <main className="booking-main product-main">
      <EditBanner />
      <Link to={editingItem && !draft.edit ? CART_HREF : catalogHref} className="booking-back">
        {editingItem && !draft.edit ? '← Volver a tu pedido' : '← Volver al catálogo'}
      </Link>

      {cartWasStale && (
        <p className="warning">
          Quitamos uno o más productos de tu pedido porque el catálogo cambió. Revísalo y vuelve a agregarlos si
          los necesitas.
        </p>
      )}

      <div className="product-layout">
        <div className="product-media">
          <img src={color.imageUrl} alt={design.name} />
        </div>

        <section className="booking-block product-config">
          <p className="eyebrow">{editingItem ? 'Cambia tu caja' : 'Arma tu caja de alfajores'}</p>
          <h1 className="product-name">{design.name}</h1>
          {price !== null && <p className="product-price">{pesos(price)}</p>}

          {quantities.length === 0 ? (
            <p className="warning">Por ahora este sabor no está disponible. Vuelve pronto.</p>
          ) : (
            <>
              <label className="field-label">¿Cuántos alfajores?</label>
              <div className="pills">
                {quantities.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    className={`pill ${q.id === quantity?.id ? 'pill-active' : ''}`}
                    onClick={() => setQuantityId(q.id)}
                  >
                    x{q.units}
                  </button>
                ))}
              </div>

              <label className="field-label">Tamaño de los alfajores</label>
              <div className="pills">
                {sizes.map((s) => (
                  <button
                    key={s.sizeId}
                    type="button"
                    className={`pill ${s.sizeId === size?.sizeId ? 'pill-active' : ''}`}
                    onClick={() => setSizeId(s.sizeId)}
                  >
                    {s.label} — {pesos(s.price)} c/u
                  </button>
                ))}
              </div>

              {color.shapes.length > 0 && (
                <>
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
                  <p className="field-hint">Todos los alfajores de la caja van con la misma forma y tamaño.</p>
                </>
              )}

              <label className="field-label">Caja</label>
              <div className="box-options">
                {offeredBoxes.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`box-option ${b.id === box?.id ? 'box-option-active' : ''}`}
                    aria-pressed={b.id === box?.id}
                    onClick={() => setBoxId(b.id)}
                  >
                    {b.imageUrl ? (
                      <img src={catalogPhotoUrl(b.imageUrl)} alt="" loading="lazy" />
                    ) : (
                      <span className="box-option-noimg" aria-hidden="true" />
                    )}
                    <span className="box-option-name">{b.name}</span>
                    {quantity && size && <span className="box-option-price">{pesos(b.prices[quantity.id][size.sizeId])}</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {price !== null && quantity && size && box && boxPrice !== null && (
            <div className="alfajor-price-breakdown">
              <p>
                {quantity.units} alfajores {size.label.toLowerCase()} × {pesos(size.price)}{' '}
                <span>{pesos(alfajoresPrice ?? 0)}</span>
              </p>
              <p>
                Caja {box.name} <span>{boxPrice === 0 ? 'Incluida' : pesos(boxPrice)}</span>
              </p>
              <p className="cake-line-price">
                Precio de esta caja: <strong>{pesos(price)}</strong>
              </p>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAddItem}
            disabled={price === null || !shape || cartFull || tooManyAlfajores}
          >
            {editingItem ? 'Guardar cambios de esta caja' : draft.edit ? 'Agregar a mi pedido' : 'Agregar al pedido'}
          </button>
          {tooManyAlfajores && (
            <div className="warning">
              <p>
                Con esta caja tu pedido tendría {alfajoresAfter} alfajores. Por la web puedes pedir hasta{' '}
                {MAX_ALFAJORES}; para más te cotizamos por WhatsApp.
              </p>
              <a className="btn btn-ghost" href={waLink(ALFAJOR_QUOTE_MESSAGE)} target="_blank" rel="noreferrer">
                Cotizar +{MAX_ALFAJORES} alfajores por WhatsApp
              </a>
            </div>
          )}
          {cartFull && (
            <p className="warning">Un pedido web admite hasta {MAX_ITEMS} productos. Para más, escríbenos por WhatsApp.</p>
          )}
          {justAdded && <AddedToCart catalogHref={catalogHref} noun="caja" />}
        </section>
      </div>
    </main>
  );
}
