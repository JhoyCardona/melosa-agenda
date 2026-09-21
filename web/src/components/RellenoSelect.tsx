import {
  RELLENOS_BASICOS,
  RELLENOS_MINICAKE,
  RELLENOS_PREMIUM,
  RELLENO_PREMIUM_SURCHARGE_BY_PORTIONS,
} from '../config';

interface RellenoSelectProps {
  // Portion count of the currently-selected size (from ProductVariant.portions),
  // null when the size isn't sold by portions. Drives the premium surcharge
  // shown next to each premium option — changes the moment a different size
  // button is picked, since that swaps which variant (and portions) is active.
  portions: number | null;
  isPromo: boolean;
  // The alfajor minicake is promo-priced too but its filling never changes.
  locked?: boolean;
  value: string;
  onChange: (relleno: string) => void;
}

// A minicake (promo variant) chooses from RELLENOS_MINICAKE, all free. The
// alfajor minicake is locked to Arequipe. A torta por porciones gets the full
// choice, split into "sin costo" and "premium" (the premium surcharge depends
// on the size/portions currently selected).
export default function RellenoSelect({ portions, isPromo, locked, value, onChange }: RellenoSelectProps) {
  if (locked) {
    return (
      <p className="field-hint">
        Relleno: <strong>Arequipe</strong>
      </p>
    );
  }

  if (isPromo) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {RELLENOS_MINICAKE.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
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
