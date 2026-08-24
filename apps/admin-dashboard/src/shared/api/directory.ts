import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredInteger,
  requiredRecord,
  requiredString,
  stringArray,
} from "./parse";

/**
 * The three listings that did not exist until E23-T1.
 *
 * Twelve fields on this dashboard asked for an intent, a tenant or a receipt by
 * UUID, and every one of them was a text box because there was nothing to call.
 *
 * ## Each narrows itself, and none of them takes a scope
 *
 * An intent listing is the caller's participation grants; a tenant listing is
 * their credential's memberships; a receipt listing is what the detail read
 * would serve them. None of these functions has a parameter that could widen
 * that, which is deliberate — a client that could ask for a broader set would be
 * a client somebody eventually asks with.
 */

export interface Intent {
  intent_id: string;
  /** The latest checkpoint's goal, or absent when the intent has none yet. */
  goal: string | null;
  /** This caller's role on it. What they may do, not what exists. */
  role: string;
  checkpoint_count: number;
  latest_checkpoint_at: string | null;
  granted_at: string;
  expires_at: string | null;
}

export interface ReachableTenant {
  tenant_id: string;
  tenant_slug: string;
  /** Absent when this deployment has not materialised the tenant row yet. */
  display_name: string | null;
  roles: readonly string[];
  is_provisioned: boolean;
  is_current: boolean;
}

export interface ReceiptSummary {
  receipt_id: string;
  intent_id: string | null;
  state: string;
  item_count: number;
  /**
   * How much this resolution withheld. Zero means nothing was, which the
   * listing may say because a receipt whose exclusions are not recorded yet is
   * absent from it entirely.
   */
  exclusion_count: number;
  resolved_at: string;
  requested_by: string;
}

export interface ReceiptPage {
  items: readonly ReceiptSummary[];
  /**
   * Send as `before` for the next page. A keyset cursor, carried unchanged and
   * never decoded — it happens to be a timestamp, and treating it as one is how
   * a client starts depending on an ordering nobody promised it.
   */
  next_before: string | null;
}

export interface ReceiptQuery {
  before?: string;
  limit?: number;
}

/** Intents this caller participates in, most recently touched first. */
export async function listIntents(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
): Promise<readonly Intent[]> {
  const payload = await client.request("/v1/intents", { ...context, method: "GET" });
  const body = requiredRecord(payload, "Intent list");
  return requiredArray(body.items, "Intent list items").map((item, index) => {
    const row = requiredRecord(item, `Intent[${index}]`);
    return {
      checkpoint_count: requiredInteger(row, "checkpoint_count"),
      expires_at: nullableString(row, "expires_at", `Intent[${index}] expires_at`),
      goal: nullableString(row, "goal", `Intent[${index}] goal`),
      granted_at: requiredString(row, "granted_at", `Intent[${index}] granted_at`),
      intent_id: requiredString(row, "intent_id", `Intent[${index}] intent_id`),
      latest_checkpoint_at: nullableString(row, "latest_checkpoint_at", `Intent[${index}] latest_checkpoint_at`),
      role: requiredString(row, "role", `Intent[${index}] role`),
    };
  });
}

/** The tenants this credential reaches, the current one first. */
export async function listTenants(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
): Promise<readonly ReachableTenant[]> {
  const payload = await client.request("/v1/tenants", { ...context, method: "GET" });
  const body = requiredRecord(payload, "Tenant list");
  return requiredArray(body.items, "Tenant list items").map((item, index) => {
    const row = requiredRecord(item, `Tenant[${index}]`);
    return {
      display_name: nullableString(row, "display_name", `Tenant[${index}] display_name`),
      is_current: requiredBoolean(row, "is_current", `Tenant[${index}] is_current`),
      is_provisioned: requiredBoolean(row, "is_provisioned", `Tenant[${index}] is_provisioned`),
      roles: stringArray(row.roles, `Tenant[${index}] roles`),
      tenant_id: requiredString(row, "tenant_id", `Tenant[${index}] tenant_id`),
      tenant_slug: requiredString(row, "tenant_slug", `Tenant[${index}] tenant_slug`),
    };
  });
}

/**
 * Recent resolutions this caller may open, newest first.
 *
 * A withheld or unhydrated receipt is absent rather than present-and-empty, and
 * that is the service's decision rather than this adapter's: the detail reads
 * refuse both, and a list that showed them would disclose that a resolution
 * happened from the one surface allowed to say it exists.
 */
export async function listReceipts(
  client: ContextplaneClient,
  query: ReceiptQuery = {},
  context: ContextplaneRequestOptions = {},
): Promise<ReceiptPage> {
  const search = new URLSearchParams();
  if (query.before) search.set("before", query.before);
  if (query.limit) search.set("limit", String(query.limit));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";

  const payload = await client.request(`/v1/receipts${suffix}`, { ...context, method: "GET" });
  const body = requiredRecord(payload, "Receipt list");
  return {
    items: requiredArray(body.items, "Receipt list items").map((item, index) => {
      const row = requiredRecord(item, `Receipt[${index}]`);
      return {
        exclusion_count: requiredInteger(row, "exclusion_count"),
        intent_id: nullableString(row, "intent_id", `Receipt[${index}] intent_id`),
        item_count: requiredInteger(row, "item_count"),
        receipt_id: requiredString(row, "receipt_id", `Receipt[${index}] receipt_id`),
        requested_by: requiredString(row, "requested_by", `Receipt[${index}] requested_by`),
        resolved_at: requiredString(row, "resolved_at", `Receipt[${index}] resolved_at`),
        state: requiredString(row, "state", `Receipt[${index}] state`),
      };
    }),
    next_before: nullableString(body, "next_before", "Receipt list next_before"),
  };
}
