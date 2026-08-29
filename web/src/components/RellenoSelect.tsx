import {
  RELLENOS_BASICOS,
  RELLENOS_PREMIUM,
  RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS,
  extractPortionsFromLabel,
} from '../config';

interface RellenoSelectProps {
  variantLabel: string;
  isPromo: boolean;
  value: string;
  onChange: (relleno: string) => void;
}

// A minicake (promo variant) is always Vainilla, no choice — locked in the UI so
// nobody accidentally picks a paid filling on a product that doesn't offer it.
// A torta por porciones gets a real choice, split into "sin costo" and "premium"
// (the premium surcharge depends on the variant's portion count).
export default function RellenoSelect({ variantLabel, isPromo, value, onChange }: RellenoSelectProps) {
  if (isPromo) {
    return (
      <p className="field-hint">
        Relleno: <strong>Vainilla</strong>
      </p>
    );
  }

  const portions = extractPortionsFromLabel(variantLabel);
  const surchargeLabel = (relleno: string) => {
    const amount = portions !== null ? RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS[portions] : undefined;
    return amount ? `${relleno} (+$${amount.toLocaleString('es-CO')})` : relleno;
  };

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>
        Elige un relleno
      </option>
      <optgroup label="Sin costo adicional">
        {RELLENOS_BASICOS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </optgroup>
      <optgroup label="Premium">
        {RELLENOS_PREMIUM.map((r) => (
          <option key={r} value={r}>
            {surchargeLabel(r)}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
