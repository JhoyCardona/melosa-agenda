import { formatPesos, onlyDigits } from '../adminUtils';

// Peso amount input: displays "12.500", reports digits only ("12500").
export default function MoneyInput({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="cs-money">
      <span aria-hidden="true">$</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={formatPesos(value)}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => onChange(onlyDigits(e.target.value))}
      />
    </span>
  );
}
