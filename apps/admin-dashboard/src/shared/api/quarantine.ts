import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";
import { isRecord, requiredBoolean, requiredNumber, requiredString, stringArray } from "./parse";

/** The provenance dimensions a quarantine may select on, and the only ones. */
export type QuarantineSelector = NonNullable<
  components["schemas"]["QuarantineApplyRequest"]["selector"]
>;

/**
 * What a predicate reaches, and what depends on what it reaches.
 *
 * Two sets that mean different things, kept apart here because the service
 * keeps them apart: `matched` is exact and is what applying would withhold;
 * `downstream` is **advisory and is withheld by nothing**. A screen that merged
 * them would tell an operator that applying makes the second list disappear.
 */
export interface QuarantinePreview {
  downstream: readonly string[];
  matched: readonly string[];
  /** Seeds actually traversed against seeds there were. */
  seeds_total: number;
  seeds_traversed: number;
  subjects: readonly string[];
  /** `downstream` is a floor rather than the answer. */
  truncated: boolean;
}

export interface AppliedQuarantine {
  matched: readonly string[];
  matched_count: number;
  quarantine_id: string;
  selector: string;
  value: string;
}

/**
 * What applying this predicate would reach, withholding nothing.
 *
 * A POST despite writing nothing, matching the service: the predicate is a
 * body, and a selector plus an operator-chosen value in a query string is a
 * selector plus that value in every access log between here and the service.
 */
export async function previewQuarantine(
  client: ContextplaneClient,
  input: { selector: QuarantineSelector; value: string },
  context: ContextplaneRequestOptions = {},
): Promise<QuarantinePreview> {
  const payload = await client.request("/v1/admin/claim-quarantines:preview", {
    ...context,
    body: { selector: input.selector, value: input.value },
    method: "POST",
  });
  if (!isRecord(payload)) throw new Error("Invalid API response: quarantine preview.");
  return {
    downstream: stringArray(payload.downstream, "downstream"),
    matched: stringArray(payload.matched, "matched"),
    seeds_total: requiredNumber(payload, "seeds_total"),
    seeds_traversed: requiredNumber(payload, "seeds_traversed"),
    subjects: stringArray(payload.subjects, "subjects"),
    truncated: requiredBoolean(payload, "truncated"),
  };
}

/** Withhold every claim the predicate matches, and record which ones. */
export async function applyQuarantine(
  client: ContextplaneClient,
  input: { reason: string; selector: QuarantineSelector; value: string },
  context: ContextplaneRequestOptions = {},
): Promise<AppliedQuarantine> {
  const payload = await client.request("/v1/admin/claim-quarantines", {
    ...context,
    body: { reason: input.reason, selector: input.selector, value: input.value },
    method: "POST",
  });
  if (!isRecord(payload)) throw new Error("Invalid API response: quarantine.");
  return {
    matched: stringArray(payload.matched, "matched"),
    matched_count: requiredNumber(payload, "matched_count"),
    quarantine_id: requiredString(payload, "quarantine_id"),
    selector: requiredString(payload, "selector"),
    value: requiredString(payload, "value"),
  };
}

/**
 * Put back exactly what one quarantine withheld. Returns how many.
 *
 * Posts to the item path with the action appended. The collection path takes an
 * apply, so a revert sent there would withhold rather than release — the
 * opposite operation, from one wrong URL.
 *
 * The count can be lower than `matched_count` without anything having failed: a
 * claim still held by a second, unreverted quarantine stays withheld.
 */
export async function revertQuarantine(
  client: ContextplaneClient,
  quarantineId: string,
  context: ContextplaneRequestOptions = {},
): Promise<number> {
  const payload = await client.request(
    `/v1/admin/claim-quarantines/${encodeURIComponent(quarantineId)}:revert`,
    { ...context, method: "POST" },
  );
  if (!isRecord(payload)) throw new Error("Invalid API response: quarantine revert.");
  return requiredNumber(payload, "restored_count");
}
