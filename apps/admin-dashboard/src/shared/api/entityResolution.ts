import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "./client";
import {
  isRecord,
  nullableString,
  requiredString,
} from "./parse";

/** The refusal code a bare name matching more than one type comes back with. */
export const IDENTITY_AMBIGUOUS = "identity_ambiguous";

export interface EntityIdentity {
  entity_id: string;
  entity_type: string;
  external_id: string | null;
  name: string;
}

/**
 * What the service said about a handle, as three outcomes rather than a value
 * plus a thrown error.
 *
 * `ambiguous` is a first-class result because it is not a failure the caller
 * should retry or surface as one — it is the service declining to guess, with
 * the information needed to ask again properly. Modelling it as an exception
 * would leave the candidate types reachable only from a catch block, which is
 * where a UI stops offering them as choices.
 */
export type EntityResolution =
  | { candidates: readonly string[]; handle: string; outcome: "ambiguous" }
  | { identity: EntityIdentity; outcome: "resolved" }
  | { handle: string; outcome: "unknown" };

function parseIdentity(value: unknown): EntityIdentity {
  if (!isRecord(value)) throw new Error("Invalid API response: resolution is not an object.");
  const identity = value.identity;
  if (!isRecord(identity)) throw new Error("Invalid API response: identity is not an object.");
  return {
    entity_id: requiredString(identity, "entity_id"),
    entity_type: requiredString(identity, "entity_type"),
    external_id: nullableString(identity, "external_id"),
    name: requiredString(identity, "name"),
  };
}

/**
 * The qualifying types the refusal names, in the order the service sorted them.
 *
 * Read from `entity_types` on the error item and never parsed out of `message`:
 * branching on display text is what the repo's contract rules forbid, and a
 * message is free to change wording without changing meaning. An older service
 * that sends no `entity_types` yields an empty list, which the caller presents
 * as "qualify the handle" rather than as a choice between nothing.
 */
function candidatesOf(error: ContextplaneApiError): readonly string[] {
  const types = error.errors[0]?.entity_types;
  if (!Array.isArray(types)) return [];
  return types.filter((value): value is string => typeof value === "string");
}

/**
 * Resolve a `namespace:type/name` handle, or a bare name, to one entity.
 *
 * Never throws for the two answers a caller acts on. A `404` is `unknown` and a
 * `409 identity_ambiguous` is `ambiguous`; everything else is still an error,
 * because a `403` or a timeout is not an answer about the handle.
 */
export async function resolveEntity(
  client: ContextplaneClient,
  handle: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<EntityResolution> {
  try {
    const payload = await client.request(
      `/v1/entities:resolve?handle=${encodeURIComponent(handle)}`,
      {
        ...(signal ? { signal } : {}),
        ...(context.tenantId ? { tenantId: context.tenantId } : {}),
      },
    );
    return { identity: parseIdentity(payload), outcome: "resolved" };
  } catch (error) {
    if (error instanceof ContextplaneApiError) {
      if (error.code === IDENTITY_AMBIGUOUS) {
        return { candidates: candidatesOf(error), handle, outcome: "ambiguous" };
      }
      if (error.status === 404) return { handle, outcome: "unknown" };
    }
    throw error;
  }
}

/**
 * The handle to retry with once the operator picks a type.
 *
 * The service asks for `namespace:type/name`. A handle already qualified keeps
 * its namespace; a bare name gets `core`, which is the namespace the platform
 * profile declares its own types in.
 */
export function qualifiedHandle(handle: string, entityType: string): string {
  const separator = handle.indexOf(":");
  const namespace = separator > 0 ? handle.slice(0, separator) : "core";
  const remainder = separator > 0 ? handle.slice(separator + 1) : handle;
  const name = remainder.includes("/") ? remainder.slice(remainder.indexOf("/") + 1) : remainder;
  return `${namespace}:${entityType}/${name}`;
}
