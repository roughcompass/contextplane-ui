import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import { isRecord, requiredString } from "./parse";

/**
 * Granting and withdrawing an ARC exception.
 *
 * ## The write half only, and one thing this adapter cannot do
 *
 * **The register is in `arcGovernanceObjects.ts`.** This module grants and
 * revokes; `GET /v1/arc/admin/exceptions` lists. The sentence that used to be
 * here — that the contract has no read path, so an exception is invisible from
 * the moment it is granted — was true when E14-T1 counted thirteen of fourteen
 * ARC admin paths as write-only, and stopped being true when the service built
 * the register. Nothing called it, so three files went on asserting an absence
 * for as long as it took somebody to look.
 *
 * **It cannot produce an approval.** `ArcExceptionApproval` is a completed
 * approval envelope — evidence id, verifier, digest, audit reference, timestamp
 * — which is assembled by the approval that actually happened, elsewhere.
 * Granting through this adapter is transcription, not authorisation, and a
 * caller that treats it as the latter has skipped the step that matters.
 */

/** A completed approval, transcribed. Every field names something that already exists. */
export interface ArcExceptionApproval {
  approval_timestamp: string;
  approval_verifier_id: string;
  approved_payload_digest: string;
  approving_principal: string;
  approving_role: string;
  audit_log_reference: string;
  evidence_id: string;
}

export interface ArcExceptionInput {
  approval: ArcExceptionApproval;
  effective_from: string;
  /** Absent means the exception never expires — see `ArcExceptionGrant`. */
  effective_until?: string;
  exception_statement: string;
  higher_scope_directive_id: string;
  higher_scope_revision_id: string;
  justification: string;
  lower_scope_kind: string;
  replacement_conflict_descriptor: Readonly<Record<string, unknown>>;
}

export interface ArcExceptionGrant {
  exception_id: string;
  status: string;
}

/**
 * Record a governed deviation from a higher-scope directive.
 *
 * `effective_until` is optional in the contract, so an exception with no end is
 * grantable. That is a policy change wearing a smaller word, and the caller —
 * not this function — decides whether to make one; what this adapter will not do
 * is invent a default expiry, which would silently convert a permanent
 * deviation into one that lapses.
 */
export async function grantArcException(
  client: ContextplaneClient,
  input: ArcExceptionInput,
  context: ContextplaneRequestOptions = {},
): Promise<ArcExceptionGrant> {
  const payload = await client.request("/v1/arc/admin/exceptions", {
    ...context,
    body: input,
    method: "POST",
  });
  if (!isRecord(payload)) throw new Error("Invalid API response: exception grant.");
  return {
    exception_id: requiredString(payload, "exception_id", "Exception grant exception_id"),
    status: requiredString(payload, "status", "Exception grant status"),
  };
}

/**
 * Withdraw an exception, restoring the directive it narrowed.
 *
 * Posts to the item path with the action appended. The collection path *grants*,
 * so a revoke sent there would attempt to create an exception from a revocation
 * body — the E19-T7 defect, which a test asserting only the body would miss.
 */
export async function revokeArcException(
  client: ContextplaneClient,
  exceptionId: string,
  reason: { note?: string; reason_code: string },
  context: ContextplaneRequestOptions = {},
): Promise<ArcExceptionGrant> {
  const payload = await client.request(
    `/v1/arc/admin/exceptions/${encodeURIComponent(exceptionId)}/revoke`,
    { ...context, body: reason, method: "POST" },
  );
  if (!isRecord(payload)) throw new Error("Invalid API response: exception revoke.");
  return {
    exception_id: requiredString(payload, "exception_id", "Exception revoke exception_id"),
    status: requiredString(payload, "status", "Exception revoke status"),
  };
}
