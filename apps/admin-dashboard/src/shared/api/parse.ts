/**
 * The validators every API adapter needs to narrow an `unknown` response.
 *
 * **Extracted rather than copied a fifth time.** `tenantWork.ts`, `admin.ts`,
 * `arcAuthoring.ts` and `entityResolution.ts` each carry their own `isRecord`,
 * `requiredString` and `nullableString`, and they have already drifted: the same
 * failure reads `"… is not text."`, `"… must be text."` or `"… is not a
 * string."` depending on which module happened to parse it. Splitting
 * `tenantWork.ts` three ways without this would have made that four copies into
 * six.
 *
 * Converting the remaining modules is deliberately not done here — it changes
 * message text some tests assert on, which is a separate change from moving a
 * module. Filed as E10-T11.
 *
 * Every function takes the field name so a refusal says which field, not just
 * that something was wrong. A parse failure a reader cannot locate is the same
 * as no validation at all: both end in someone reading the network tab.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid API response: ${label} is not an object.`);
  return value;
}

export function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid API response: ${label} is not an array.`);
  return value;
}

export function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Invalid API response: ${key} is not text.`);
  return value;
}

/**
 * `null` and absent are the same answer here.
 *
 * A field the service omits and one it sends as `null` both mean "no value",
 * and a caller that had to tell them apart would be branching on which of two
 * serializers produced the payload.
 */
export function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  // "or null", where `requiredString` says only "is not text": the refusal says
  // what was allowed, so a reader can tell a field that may be absent from one
  // that may not without going to the source.
  if (typeof value !== "string") {
    throw new Error(`Invalid API response: ${key} is not text or null.`);
  }
  return value;
}

export function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`Invalid API response: ${key} is not boolean.`);
  return value;
}

/**
 * Finite numbers only. `NaN` and `Infinity` are what a division or a bad cast
 * produces upstream, and both render as text no reader can act on.
 */
export function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid API response: ${key} is not a number.`);
  }
  return value;
}

/**
 * A whole number. Delegates to `requiredNumber`, so a non-finite value is
 * refused as "not a number" before integrality is asked about — the two
 * copies this replaced disagreed on that ordering and produced different
 * messages for `Infinity`.
 */
export function requiredInteger(record: Record<string, unknown>, key: string): number {
  const value = requiredNumber(record, key);
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid API response: ${key} is not an integer.`);
  }
  return value;
}

export function nullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid API response: ${key} is not a number or null.`);
  }
  return value;
}

export function stringArray(value: unknown, label: string): readonly string[] {
  return requiredArray(value, label).map((item) => {
    if (typeof item !== "string") throw new Error(`Invalid API response: ${label} contains data.`);
    return item;
  });
}

/**
 * A boolean the service may omit, with the value to assume when it does.
 *
 * Separate from `requiredBoolean` because the fallback is a decision the caller
 * owns: an absent flag means different things per field, and defaulting it here
 * would hide that choice inside a validator.
 */
export function optionalBoolean(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = record[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new Error(`Invalid API response: ${key} is not boolean.`);
  return value;
}
