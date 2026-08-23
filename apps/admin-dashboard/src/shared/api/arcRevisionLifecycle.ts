import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import { nullableString, requiredRecord, requiredString } from "./parse";

/**
 * Approval evidence, and the two ways a revision stops being relied on.
 *
 * ## Revoke and invalidate take the same body and mean opposite things
 *
 * Both are `POST .../{revision_id}/<action>` with `{ reason }`, so **the path is
 * the entire difference**. A test asserting the body would pass for either, and
 * a caller that built the URL from a variable would swap them silently.
 *
 * Neither is reversible — both are terminal, and `revoke` is documented so.
 * What separates them is what the tombstone says to an auditor:
 *
 * - **Revoke** — the rule no longer applies. The revision was validly in force
 *   until now, and everything resolved under it stands.
 * - **Invalidate** — the content was wrong, or its upstream source is gone. That
 *   reaches *backwards*: every resolution made while it was active is now in
 *   question.
 *
 * The service keeps two obligation codes rather than one so the difference
 * survives to whoever reads the record later.
 */

export interface ArcRevisionAction {
  evidence_id: string | null;
  revision_id: string | null;
  status: string;
}

function parseAccepted(payload: unknown, label: string): ArcRevisionAction {
  const item = requiredRecord(payload, label);
  return {
    evidence_id: nullableString(item, "evidence_id", `${label} evidence_id`),
    revision_id: nullableString(item, "revision_id", `${label} revision_id`),
    status: requiredString(item, "status", `${label} status`),
  };
}

/**
 * Link a draft revision to the evidence approving it.
 *
 * A separate step from registering the revision because the ordering is forced:
 * the evidence must name the revision it approves, and that id does not exist
 * until the revision has been registered.
 */
export async function attachArcApprovalEvidence(
  client: ContextplaneClient,
  revisionId: string,
  evidenceId: string,
  context: ContextplaneRequestOptions = {},
): Promise<ArcRevisionAction> {
  const payload = await client.request(
    `/v1/arc/admin/revisions/${encodeURIComponent(revisionId)}/approval-evidence`,
    { ...context, body: { evidence_id: evidenceId }, method: "POST" },
  );
  return parseAccepted(payload, "Evidence attachment");
}

/** Withdraw an approval. Keyed by the evidence, not by the revision citing it. */
export async function revokeArcApprovalEvidence(
  client: ContextplaneClient,
  evidenceId: string,
  reason: string,
  context: ContextplaneRequestOptions = {},
): Promise<ArcRevisionAction> {
  const payload = await client.request(
    `/v1/arc/admin/approval-evidence/${encodeURIComponent(evidenceId)}/revoke`,
    { ...context, body: { reason }, method: "POST" },
  );
  return parseAccepted(payload, "Evidence revocation");
}

/**
 * The rule no longer applies. Terminal.
 *
 * A mandatory obligation this satisfied becomes a tombstone rather than
 * disappearing, so matching resolutions keep blocking until an approved
 * successor satisfies it.
 */
export async function revokeArcRevision(
  client: ContextplaneClient,
  revisionId: string,
  reason: string,
  context: ContextplaneRequestOptions = {},
): Promise<ArcRevisionAction> {
  const payload = await client.request(
    `/v1/arc/admin/revisions/${encodeURIComponent(revisionId)}/revoke`,
    { ...context, body: { reason }, method: "POST" },
  );
  return parseAccepted(payload, "Revision revocation");
}

/**
 * The content was wrong. Terminal, and retrospective.
 *
 * Separate from `revokeArcRevision` at the function level and not a flag on it,
 * because a boolean argument is exactly how the two get swapped: the bodies are
 * identical and only the path differs.
 */
export async function invalidateArcRevision(
  client: ContextplaneClient,
  revisionId: string,
  reason: string,
  context: ContextplaneRequestOptions = {},
): Promise<ArcRevisionAction> {
  const payload = await client.request(
    `/v1/arc/admin/revisions/${encodeURIComponent(revisionId)}/invalidate`,
    { ...context, body: { reason }, method: "POST" },
  );
  return parseAccepted(payload, "Revision invalidation");
}
