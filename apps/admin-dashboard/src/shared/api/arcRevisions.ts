import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  nullableNumber,
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredRecord,
  requiredString,
} from "./parse";

/**
 * The revision index: what exists, what state each is in, and what rests on it.
 *
 * ## Why a list changes what this screen is
 *
 * `/revisions` was four text boxes asking for a UUID. The two terminal acts it
 * offers are correct and well argued, and it gave the reader nothing to perform
 * them *on* — the fix is context, not copy. This read is that context.
 *
 * ## `resolutions_under_revision` is the number that changes a decision
 *
 * It counts the resolutions that selected this revision and were not omitted, so
 * it is how much is in question if the revision is invalidated. A screen offering
 * "everything decided under it is now in question" without saying how much that
 * is asks somebody to accept a consequence whose size the service knows and has
 * not said.
 *
 * ## Four fields rather than one activation verdict
 *
 * `is_draft`, `has_approval_evidence`, `review_expired` and `is_terminal` are
 * carried separately, and deliberately not collapsed into "can this be
 * activated". Activation eligibility is ARC's decision, taken by
 * `/activation-eligibility` against rules this dashboard does not hold, and a
 * client-side verdict would be a second authority that disagrees with the first
 * exactly when it matters.
 */

export interface ArcRevision {
  activated_at: string | null;
  approval_evidence_id: string | null;
  artifact_id: string;
  artifact_kind: string;
  artifact_slug: string | null;
  content_digest: string;
  created_at: string;
  effective_from: string | null;
  effective_until: string | null;
  /** Whether an approval has been filed against it. Not whether it may activate. */
  has_approval_evidence: boolean;
  is_draft: boolean;
  /** Revoked or invalidated. Either way, nothing further happens to it. */
  is_terminal: boolean;
  lifecycle_state: string;
  /**
   * Resolutions that selected this revision and did not omit it — how much is in
   * question if it is invalidated.
   */
  resolutions_under_revision: number | null;
  review_expired: boolean;
  review_expires_at: string | null;
  revision_id: string;
  revoked_at: string | null;
  source_revision_locator: string | null;
  source_system: string | null;
}

export interface ArcRevisionPage {
  items: readonly ArcRevision[];
  /**
   * Returned to the service unchanged and never decoded. A cursor is the
   * service's own bookmark; treating it as data is how a client starts
   * depending on an ordering nobody promised it.
   */
  next_cursor: string | null;
}

export interface ArcRevisionQuery {
  artifactId?: string;
  cursor?: string | null;
  lifecycleState?: string;
  pageSize?: number;
}

function parseRevision(value: unknown, label: string): ArcRevision {
  const row = requiredRecord(value, label);
  return {
    activated_at: nullableString(row, "activated_at", `${label} activated_at`),
    approval_evidence_id: nullableString(row, "approval_evidence_id", `${label} approval_evidence_id`),
    artifact_id: requiredString(row, "artifact_id", `${label} artifact_id`),
    artifact_kind: requiredString(row, "artifact_kind", `${label} artifact_kind`),
    artifact_slug: nullableString(row, "artifact_slug", `${label} artifact_slug`),
    content_digest: requiredString(row, "content_digest", `${label} content_digest`),
    created_at: requiredString(row, "created_at", `${label} created_at`),
    effective_from: nullableString(row, "effective_from", `${label} effective_from`),
    effective_until: nullableString(row, "effective_until", `${label} effective_until`),
    has_approval_evidence: requiredBoolean(row, "has_approval_evidence", `${label} has_approval_evidence`),
    is_draft: requiredBoolean(row, "is_draft", `${label} is_draft`),
    is_terminal: requiredBoolean(row, "is_terminal", `${label} is_terminal`),
    lifecycle_state: requiredString(row, "lifecycle_state", `${label} lifecycle_state`),
    resolutions_under_revision: nullableNumber(row, "resolutions_under_revision"),
    review_expired: requiredBoolean(row, "review_expired", `${label} review_expired`),
    review_expires_at: nullableString(row, "review_expires_at", `${label} review_expires_at`),
    revision_id: requiredString(row, "revision_id", `${label} revision_id`),
    revoked_at: nullableString(row, "revoked_at", `${label} revoked_at`),
    source_revision_locator: nullableString(row, "source_revision_locator", `${label} source_revision_locator`),
    source_system: nullableString(row, "source_system", `${label} source_system`),
  };
}

/** One page of revisions, newest first. */
export async function listArcRevisions(
  client: ContextplaneClient,
  query: ArcRevisionQuery = {},
  context: ContextplaneRequestOptions = {},
): Promise<ArcRevisionPage> {
  const search = new URLSearchParams();
  if (query.artifactId) search.set("artifact_id", query.artifactId);
  if (query.lifecycleState) search.set("lifecycle_state", query.lifecycleState);
  if (query.cursor) search.set("cursor", query.cursor);
  if (query.pageSize) search.set("page_size", String(query.pageSize));
  const suffix = search.size > 0 ? `?${search.toString()}` : "";

  const payload = await client.request(`/v1/arc/admin/revisions${suffix}`, {
    ...context,
    method: "GET",
  });
  const body = requiredRecord(payload, "Revision index");
  return {
    items: requiredArray(body.items, "Revision index items").map((item, index) =>
      parseRevision(item, `Revision[${index}]`),
    ),
    next_cursor: nullableString(body, "next_cursor", "Revision index next_cursor"),
  };
}
