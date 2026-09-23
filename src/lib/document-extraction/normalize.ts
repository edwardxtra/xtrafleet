/**
 * Normalisation and comparison helpers for extracted document fields.
 *
 * Pure functions, no AI, no I/O — these are what the eval scores against and
 * what the review UI would use to decide whether an extracted value actually
 * differs from what is already on record.
 */

/** Entity suffixes that carry no identity. "ABC Trucking LLC" is "ABC Trucking". */
const ENTITY_SUFFIXES = [
  'llc', 'l l c', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'lp', 'llp', 'pllc', 'trucking', 'transport', 'transportation',
  'logistics', 'carriers', 'carrier', 'enterprises', 'holdings', 'group',
];

/**
 * Coerce a model-supplied date to YYYY-MM-DD, or null.
 *
 * The prompt asks for ISO, but a model under pressure will occasionally emit
 * "03/14/2027" or "March 14, 2027". Rather than trust it, anything that is not
 * unambiguous is rejected: a wrong expiry date silently written to a driver
 * record is the worst failure this feature can produce, and a null costs only
 * a manual entry.
 *
 * US-format m/d/Y is accepted because that is what appears on US compliance
 * documents; d/m/Y is NOT inferred, because the two are indistinguishable
 * below the 13th and guessing would produce exactly the silent error above.
 */
export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  let y: number, m: number, d: number;

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (iso) {
    [, y, m, d] = iso.map(Number) as unknown as [never, number, number, number];
  } else if (us) {
    const [, mm, dd, yyyy] = us.map(Number) as unknown as [never, number, number, number];
    // Only safe when the first component cannot be a day-of-month.
    if (mm > 12) return null;
    y = yyyy; m = mm; d = dd;
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  // Reject dates that do not exist (e.g. 2027-02-30) via round-trip.
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return null;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Uppercase, strip punctuation, drop entity suffixes, collapse whitespace. */
export function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toUpperCase()
    .replace(/[.,'"&]/g, ' ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  const tokens = cleaned.split(' ').filter((t) => !ENTITY_SUFFIXES.includes(t.toLowerCase()));
  const result = (tokens.length ? tokens : cleaned.split(' ')).join(' ');
  return result || null;
}

/** Identifiers compare on alphanumerics only — dashes and spacing vary by printer. */
export function normalizeIdentifier(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned || null;
}

/** DOT/MC numbers are digits; strip any "USDOT"/"MC" prefix the model left on. */
export function normalizeRegistrationNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+/, '');
  return digits || null;
}

/** Sørensen–Dice over token sets: 1 = identical, 0 = nothing shared. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const sa = new Set(na.split(' '));
  const sb = new Set(nb.split(' '));
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return (2 * shared) / (sa.size + sb.size);
}

/**
 * Above this, two names are treated as the same party for review purposes.
 * Chosen to accept "ABC Trucking LLC" vs "ABC Trucking Co" while still
 * separating "ABC Trucking" from "ABD Transport". Tune it with real data —
 * the eval reports the distribution so this is not left to taste.
 */
export const NAME_MATCH_THRESHOLD = 0.8;

export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  return nameSimilarity(a, b) >= NAME_MATCH_THRESHOLD;
}

export function datesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeDate(a);
  const nb = normalizeDate(b);
  return na !== null && na === nb;
}

export function identifiersMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeIdentifier(a);
  const nb = normalizeIdentifier(b);
  return na !== null && na === nb;
}
