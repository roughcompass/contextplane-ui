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

/**
 * The two kinds a person may declare, and the reason there are only two.
 *
 * `sync_worker` and `system_curator` are the service's own provisioning and
 * `unknown` is what a principal is before anybody speaks about it — none of the
 * three is a thing a person declares, so none is offered. The service refuses
 * them; this list is what stops a user reaching a refusal at all.
 */
export const declarableKinds = ["agent", "human"] as const;

export type DeclarableKind = (typeof declarableKinds)[number];

/** Bounds copied from the contract, so the form refuses before the request does. */
export const OWNER_PRINCIPAL_MIN = 3;
export const OWNER_PRINCIPAL_MAX = 200;

export interface DeclarePrincipalInput {
  actorId: string;
  actorKind: DeclarableKind;
  /** Who to talk to about this principal. Unrecorded means nobody is accountable. */
  ownerPrincipal: string;
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


/**
 * Say what a principal is, and who is accountable for it.
 *
 * **The dashboard could not do this at all, and one screen depended on it.**
 * Context Lab refuses to simulate a principal nobody has declared — correctly,
 * because ADR 0019 holds that an agent is declared and never inferred — and the
 * service's refusal ends *"declare it through POST
 * /v1/admin/actors/{actor_id}/declare with actor_kind='agent' first"*. That
 * sentence was rendered verbatim to somebody sitting in a dashboard, and there
 * was no declare action anywhere in this application, so the task could not be
 * finished without leaving for a terminal.
 *
 * Re-declaring is permitted and overwrites, which the service states plainly: a
 * principal that was a person's session and is now an unattended agent is a real
 * change, and refusing it would leave the roster wrong in the direction that
 * matters. So callers may treat this as an edit, not only a create.
 *
 * No idempotency key: this is not a create. The route is keyed by `actor_id` and
 * declaring twice with the same body is the same row, so a retried request
 * cannot mint a second principal.
 */
export async function declarePrincipal(
  client: ContextplaneClient,
  input: DeclarePrincipalInput,
  context: ContextplaneRequestOptions = {},
): Promise<Principal> {
  const payload = await client.request(`/v1/admin/actors/${input.actorId}/declare`, {
    ...context,
    body: { actor_kind: input.actorKind, owner_principal: input.ownerPrincipal.trim() },
    method: "POST",
  });
  const row = requiredRecord(payload, "Declared principal");
  return {
    actor_id: requiredString(row, "actor_id", "Declared principal actor_id"),
    actor_kind: requiredString(row, "actor_kind", "Declared principal actor_kind"),
    created_at: requiredString(row, "created_at", "Declared principal created_at"),
    declared_at: nullableString(row, "declared_at", "Declared principal declared_at"),
    declared_by: nullableString(row, "declared_by", "Declared principal declared_by"),
    display_name: requiredString(row, "display_name", "Declared principal display_name"),
    is_declared: requiredBoolean(row, "is_declared", "Declared principal is_declared"),
    oidc_subject: nullableString(row, "oidc_subject", "Declared principal oidc_subject"),
    owner_principal: nullableString(row, "owner_principal", "Declared principal owner_principal"),
  };
}
