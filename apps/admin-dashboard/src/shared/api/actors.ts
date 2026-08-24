import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredRecord,
  requiredString,
} from "./parse";

/**
 * Who is consuming this tenant's context, and which of them anybody has declared.
 *
 * ## `unknown` rows are returned, not filtered
 *
 * A roster that hid what it did not know would answer *"we have no agents"* to a
 * deployment with eleven nobody has declared. `is_declared` is on every row,
 * because `actor_kind` alone cannot tell a declared human from a principal
 * nobody has spoken about — and under the old schema default both read as
 * `human`.
 *
 * That distinction is why a picker over this list shows the kind alongside the
 * name: choosing an owner is a decision about accountability, and "nobody has
 * said what this is" is a fact the chooser needs.
 */

export interface Principal {
  actor_id: string;
  actor_kind: string;
  created_at: string;
  declared_at: string | null;
  declared_by: string | null;
  display_name: string;
  /** Whether anybody has said what this principal is. Not whether it is a human. */
  is_declared: boolean;
  oidc_subject: string | null;
  owner_principal: string | null;
}

export interface PrincipalPage {
  items: readonly Principal[];
  /** Returned to the service unchanged and never decoded. */
  next_cursor: string | null;
}

export interface PrincipalQuery {
  actorKind?: string;
  cursor?: string | null;
  pageSize?: number;
}

export async function listPrincipals(
  client: ContextplaneClient,
  query: PrincipalQuery = {},
  context: ContextplaneRequestOptions = {},
): Promise<PrincipalPage> {
  const search = new URLSearchParams();
  if (query.actorKind) search.set("actor_kind", query.actorKind);
  if (query.cursor) search.set("cursor", query.cursor);
  if (query.pageSize) search.set("page_size", String(query.pageSize));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";

  const payload = await client.request(`/v1/admin/actors${suffix}`, { ...context, method: "GET" });
  const body = requiredRecord(payload, "Principal page");
  return {
    items: requiredArray(body.items, "Principal page items").map((item, index) => {
      const row = requiredRecord(item, `Principal[${index}]`);
      return {
        actor_id: requiredString(row, "actor_id", `Principal[${index}] actor_id`),
        actor_kind: requiredString(row, "actor_kind", `Principal[${index}] actor_kind`),
        created_at: requiredString(row, "created_at", `Principal[${index}] created_at`),
        declared_at: nullableString(row, "declared_at", `Principal[${index}] declared_at`),
        declared_by: nullableString(row, "declared_by", `Principal[${index}] declared_by`),
        display_name: requiredString(row, "display_name", `Principal[${index}] display_name`),
        is_declared: requiredBoolean(row, "is_declared", `Principal[${index}] is_declared`),
        oidc_subject: nullableString(row, "oidc_subject", `Principal[${index}] oidc_subject`),
        owner_principal: nullableString(row, "owner_principal", `Principal[${index}] owner_principal`),
      };
    }),
    next_cursor: nullableString(body, "next_cursor", "Principal page next_cursor"),
  };
}
