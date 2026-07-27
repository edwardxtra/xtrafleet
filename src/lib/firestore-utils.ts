/**
 * Firestore write helpers.
 *
 * Firestore rejects `undefined` field values ("Unsupported field value:
 * undefined") on the client SDK — and unlike the Admin SDK, the client SDK has
 * no `ignoreUndefinedProperties` setting. Optional user-input fields (blank form
 * inputs, optional entity fields) routinely produce `undefined`, so client-side
 * writes that build in-memory payloads should be passed through `stripUndefined`.
 */

/**
 * Deep-remove keys whose value is `undefined`.
 *
 * Recurses only into PLAIN objects and arrays, leaving every other value —
 * including class instances such as FieldValue sentinels (serverTimestamp,
 * arrayUnion, …), Timestamp, and Date — untouched. This makes it safe to apply
 * to any client payload, even ones that carry FieldValue sentinels.
 *
 * `null` is preserved (Firestore accepts it); only `undefined` is dropped.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((v) => v !== undefined)
      .map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && (value as object).constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === undefined) continue;
      out[key] = stripUndefined(val);
    }
    return out as T;
  }
  return value;
}
