/** Decimal-safe money helpers — operate on string numerics, avoid float drift. */

export function parseDecimal(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(6);
}

export function addDecimal(...values: Array<string | number>): string {
  const sum = values.reduce<number>((acc, v) => acc + Number(v), 0);
  return sum.toFixed(6);
}

export function subDecimal(a: string | number, b: string | number): string {
  return (Number(a) - Number(b)).toFixed(6);
}

export function mulDecimal(a: string | number, b: string | number): string {
  return (Number(a) * Number(b)).toFixed(6);
}

export function roundMoney(value: string | number, scale = 2): string {
  const factor = 10 ** scale;
  return (Math.round(Number(value) * factor) / factor).toFixed(scale);
}

export function maxDecimal(a: string | number, b: string | number): string {
  return Number(a) >= Number(b) ? parseDecimal(a) : parseDecimal(b);
}

export function minDecimal(a: string | number, b: string | number): string {
  return Number(a) <= Number(b) ? parseDecimal(a) : parseDecimal(b);
}

export function compareDecimal(a: string | number, b: string | number): number {
  const diff = Number(a) - Number(b);
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

export function applyMinimumCharge(charge: string, minimum?: string | null): string {
  if (!minimum || Number(minimum) <= 0) return charge;
  return maxDecimal(charge, minimum);
}

export function applyBillingIncrement(quantity: string, increment?: string | null): string {
  if (!increment || Number(increment) <= 0) return quantity;
  const inc = Number(increment);
  const q = Number(quantity);
  return (Math.ceil(q / inc) * inc).toFixed(6);
}
