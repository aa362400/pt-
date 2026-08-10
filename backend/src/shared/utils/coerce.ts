/**
 * Safe coercion helpers for untyped JSON payloads (agent inputs/outputs).
 * Unlike a bare String(x), objects/arrays never become "[object Object]" —
 * they fall back to the provided default instead.
 */

export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}

export function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = asString(value, '');
  return str === '' ? undefined : str;
}
