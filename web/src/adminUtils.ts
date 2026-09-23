// Small helpers shared by the catalog v2 admin screens.

export function errorText(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
}

// Digits-only number handling: an input shows "12.500" but state keeps "12500",
// so a typed thousands separator can never be read as a decimal point (the
// mobile app once saved "20.000" as $20 that way).
export function onlyDigits(v: string): string {
  return v.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
}

export function formatPesos(digits: string): string {
  return digits === '' ? '' : Number(digits).toLocaleString('es-CO');
}
