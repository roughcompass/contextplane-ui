import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredRecord,
  requiredString,
} from "./parse";

/**
 * Reading back the five ARC governance objects a registration produces.
 *
 * ## One shape, five collections, and why that is the service's decision
 *
 * All five answer in the same envelope — `{ items: GovernanceObject[] }` — and
 * that is not a coincidence this adapter is exploiting. The service says so
 * plainly: the six ARC governance objects *"agree on intent and disagree on
 * schema — three spellings of scope, three of tenant, and three notions of 'in
 * force', one of which does not exist"*. The shared shape is the contract; the
 * tables behind it are deliberately not normalised, because normalising them
 * would mean inventing a state for an object that cannot be revoked.
 *
 * So there is one parser here and five thin callers, rather than five parsers
 * that would each have to be corrected when the shape moves.
 *
 * ## What `detail` is, and what this adapter does not do with it
 *
 * `detail` is the kind-specific remainder — a connector's allowed hosts, a
 * corpus's generator version — and it is carried through **unvalidated**, as
 * `Record<string, unknown>`. Narrowing it here would mean five type guards over
 * five schemas the shared endpoint is explicitly not promising, and a guard that
 * refused an unfamiliar key would turn a service that added a field into a
 * dashboard that shows nothing. Whoever renders a `detail` field narrows the
 * one field they render, at the point they render it.
 *
 * ## `in_force` is a state, not a filter
 *
 * Every list defaults to returning revoked objects too, with `in_force: false`.
 * A screen that showed only what is currently in force would answer *"nothing
 * was ever registered"* about a connector somebody revoked last week — and the
 * question an operator brings to these screens is usually about the one that is
 * no longer there. `inForceOnly` narrows it when a caller genuinely wants the
 * live set, and nothing here defaults to that.
 */

export interface ArcGovernanceObject {
  /** When it was registered. */
  created_at: string;
  /**
   * The kind-specific remainder, carried through unvalidated. See the module
   * note: narrowing it here would be five guards over five schemas the shared
   * endpoint does not promise.
   */
  detail: Record<string, unknown>;
  in_force: boolean;
  /** When it stops being in force, if that is known. Revocation sets it. */
  in_force_until: string | null;
  /** Which of the five collections this row is from, as the service names it. */
  kind: string;
  /** The identifier a form asks for. A digest for a corpus, a UUID elsewhere. */
  object_id: string;
  scope: string;
  target_tenant_id: string | null;
}

export interface ArcGovernanceObjectQuery {
  /**
   * Narrow to what is live. Off by default: see the module note on why a screen
   * that hides revoked objects answers the wrong question.
   */
  inForceOnly?: boolean;
  /** `approval-evidence` only: the revision the evidence was filed against. */
  revisionId?: string;
}

/** The five paths, named once so a caller cannot spell one of them differently. */
const PATHS = {
  approvalEvidence: "/v1/arc/admin/approval-evidence",
  approvalVerifiers: "/v1/arc/admin/approval-verifiers",
  replayCorpora: "/v1/arc/admin/observation-replay-corpora",
  sourceConnectors: "/v1/arc/admin/source-connectors",
  sourceUploadPolicies: "/v1/arc/admin/source-upload-policies",
} as const;

export type ArcGovernanceCollection = keyof typeof PATHS;

function parseObject(value: unknown, label: string): ArcGovernanceObject {
  const item = requiredRecord(value, label);
  return {
    created_at: requiredString(item, "created_at", `${label} created_at`),
    detail: requiredRecord(item.detail, `${label} detail`),
    in_force: requiredBoolean(item, "in_force", `${label} in_force`),
    in_force_until: nullableString(item, "in_force_until", `${label} in_force_until`),
    kind: requiredString(item, "kind", `${label} kind`),
    object_id: requiredString(item, "object_id", `${label} object_id`),
    scope: requiredString(item, "scope", `${label} scope`),
    target_tenant_id: nullableString(item, "target_tenant_id", `${label} target_tenant_id`),
  };
}

/**
 * One collection, read back.
 *
 * The path comes from `PATHS` rather than from the caller. E19-T7's defect is
 * the reason: the endpoint is part of the behaviour, and a call assembled from
 * a string a caller passed is one a test can assert the body of while the path
 * is wrong.
 */
export async function listArcGovernanceObjects(
  client: ContextplaneClient,
  collection: ArcGovernanceCollection,
  query: ArcGovernanceObjectQuery = {},
  context: ContextplaneRequestOptions = {},
): Promise<readonly ArcGovernanceObject[]> {
  const search = new URLSearchParams();
  if (query.inForceOnly) search.set("in_force_only", "true");
  if (query.revisionId) search.set("revision_id", query.revisionId);
  const suffix = search.size > 0 ? `?${search.toString()}` : "";

  const payload = await client.request(`${PATHS[collection]}${suffix}`, {
    ...context,
    method: "GET",
  });
  const body = requiredRecord(payload, `${collection} list`);
  return requiredArray(body.items, `${collection} items`).map((item, index) =>
    parseObject(item, `${collection}[${index}]`),
  );
}

/**
 * One collection as picker options.
 *
 * Revoked objects are excluded here and only here. A list is a record of what
 * happened; a picker is a set of things you may choose, and offering a revoked
 * verifier as a choice would let somebody grant approval authority to a
 * credential that no longer exists.
 */
export async function listArcGovernanceOptions(
  client: ContextplaneClient,
  collection: ArcGovernanceCollection,
  context: ContextplaneRequestOptions = {},
): Promise<readonly { description?: string; label: string; value: string }[]> {
  const objects = await listArcGovernanceObjects(
    client,
    collection,
    { inForceOnly: true },
    context,
  );
  return objects.map((object) => ({
    description: object.scope,
    label: object.object_id,
    value: object.object_id,
  }));
}
