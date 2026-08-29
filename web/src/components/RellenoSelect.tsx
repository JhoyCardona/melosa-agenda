import { RELLENOS_BASICOS, RELLENOS_PREMIUM, RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS } from '../config';

interface RellenoSelectProps {
  // Portion count of the currently-selected size (from ProductVariant.portions),
  // null when the size isn't sold by portions. Drives the premium surcharge
  // shown next to each premium option — changes the moment a different size
  // button is picked, since that swaps which variant (and portions) is active.
  portions: number | null;
  isPromo: boolean;
  value: string;
  onChange: (relleno: string) => void;
}

// A minicake (promo variant) is always Vainilla, no choice — locked in the UI so
// nobody accidentally picks a paid filling on a product that doesn't offer it.
// A torta por porciones gets a real choice, split into "sin costo" and "premium"
// (the premium surcharge depends on the size/portions currently selected).
export default function RellenoSelect({ portions, isPromo, value, onChange }: RellenoSelectProps) {
  if (isPromo) {
    return (
      <p className="field-hint">
        Relleno: <strong>Vainilla</strong>
      </p>
    );
  }

  const surchargeLabel = (relleno: string) => {
    const amount = portions !== null ? RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS[portions] : undefined;
    return amount ? `${relleno} (+$${amount.toLocaleString('es-CO')})` : relleno;
  };

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        Elige un relleno
      </option>
      <optgroup label="Rellenos">
        {RELLENOS_BASICOS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </optgroup>
      <optgroup label="Rellenos premium">
        {RELLENOS_PREMIUM.map((r) => (
          <option key={r} value={r}>
            {surchargeLabel(r)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
