import type { ArcApprovalProof } from "./arcAuthoring";
import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";
import {
  nullableString,
  requiredBoolean,
  requiredRecord,
  requiredString,
  stringArray,
} from "./parse";

/**
 * Enrolling, challenging and revoking an approval verifier.
 *
 * Its own module rather than more of `arcAuthoring.ts`, which is already near
 * nine hundred lines: enrolment answers "who may approve", and every other
 * function there answers "what is being approved". Different question, different
 * reader.
 *
 * ## Where the directory is, and why it is not here
 *
 * This module holds the three *write* steps — create a challenge, complete it,
 * revoke one. Enumerating what is enrolled is `GET /v1/arc/admin/approval-
 * verifiers`, read through `arcGovernanceObjects.ts` along with the five other
 * ARC governance collections, because "list a governance collection" is one
 * shape answered once rather than six adapters.
 *
 * **This docstring used to say the directory did not exist**, and
 * `revokeApprovalVerifier`'s said the id it returns is shown exactly once. Both
 * were written before the read was wired and both survived it. That mattered
 * beyond tidiness: the case those sentences named — revoking a verifier
 * somebody else enrolled months ago — is the one the register answers, and the
 * copy sent an operator looking for a value they did not need.
 */

/** Whose trust root this is. `tenant` requires a `target_tenant_id`; `global` forbids one. */
export type ArcOwningScope = NonNullable<
  components["schemas"]["EnrollmentChallengeRequest"]["owning_scope"]
>;

/** How the principal is named: one exact subject, or anyone a provider vouches for. */
export type ArcPrincipalBindingKind = NonNullable<
  components["schemas"]["EnrollmentChallengeRequest"]["binding_kind"]
>;

/** The two kinds of approval evidence a verifier may be trusted for. */
export type ArcEvidenceType = components["schemas"]["EvidenceType"];

export interface ArcEnrollmentChallengeInput {
  binding_kind: ArcPrincipalBindingKind;
  evidence_types: readonly ArcEvidenceType[];
  owning_scope: ArcOwningScope;
  /** Base64. A **public** key — see `ArcEnrollmentChallenge`. */
  public_key_base64: string;
  principal_issuer?: string;
  principal_subject?: string;
  provider_allowed_principal_issuer?: string;
  provider_id?: string;
  signature_algorithm: "Ed25519";
  target_tenant_id?: string;
  valid_from: string;
  valid_to: string;
}

/**
 * The bytes to be signed, and where the signing happens.
 *
 * **Not in the browser.** The proof is a signature by the key being enrolled,
 * and that key lives wherever the verifier's key lives — an HSM, a KMS, an
 * operator's own machine. This adapter hands over `canonical_enrollment_bytes_base64`
 * and takes back a signature; it never sees, generates or transports a private
 * key, and nothing here should ever offer to.
 */
export interface ArcEnrollmentChallenge {
  canonical_enrollment_bytes_base64: string;
  enrollment_challenge_id: string;
  /** When the challenge stops being completable and enrolment must restart. */
  expires_at: string;
  /** Domain separation: the same bytes signed for another purpose will not verify here. */
  signing_domain: string;
}

export interface ArcApprovalVerifier {
  approval_verifier_id: string;
  binding_kind: ArcPrincipalBindingKind;
  credential_fingerprint: string;
  enrolled_at: string;
  evidence_types: readonly string[];
  owning_scope: ArcOwningScope;
  principal_issuer: string;
  principal_subject: string;
  provider_id: string | null;
  revoked_at: string | null;
  target_tenant_id: string | null;
  valid_from: string;
  valid_to: string;
}

/**
 * What this deployment can do, and whether the caller holds operator identity.
 *
 * Read before attempting a governance write rather than after one, which is the
 * service's own stated reason for the endpoint: the alternative is finding out
 * from a 403 halfway through.
 */
export interface ArcOperatorIdentity {
  /** A fingerprint of the allowlist, never the allowlist and never anyone else's membership. */
  allowlist_fingerprint: string;
  checked_at: string;
  /** `false` means no receipt can be signed, so resolution answers 503 rather than issuing one. */
  context_resolution_enabled: boolean;
  is_global_operator: boolean;
}

function parseVerifier(payload: unknown): ArcApprovalVerifier {
  const item = requiredRecord(payload, "Approval verifier");
  return {
    approval_verifier_id: requiredString(
      item,
      "approval_verifier_id",
      "Approval verifier approval_verifier_id",
    ),
    binding_kind: requiredString(
      item,
      "binding_kind",
      "Approval verifier binding_kind",
    ) as ArcPrincipalBindingKind,
    credential_fingerprint: requiredString(
      item,
      "credential_fingerprint",
      "Approval verifier credential_fingerprint",
    ),
    enrolled_at: requiredString(item, "enrolled_at", "Approval verifier enrolled_at"),
    evidence_types: stringArray(item.evidence_types, "Approval verifier evidence_types"),
    owning_scope: requiredString(
      item,
      "owning_scope",
      "Approval verifier owning_scope",
    ) as ArcOwningScope,
    principal_issuer: requiredString(item, "principal_issuer", "Approval verifier principal_issuer"),
    principal_subject: requiredString(
      item,
      "principal_subject",
      "Approval verifier principal_subject",
    ),
    provider_id: nullableString(item, "provider_id", "Approval verifier provider_id"),
    revoked_at: nullableString(item, "revoked_at", "Approval verifier revoked_at"),
    target_tenant_id: nullableString(item, "target_tenant_id", "Approval verifier target_tenant_id"),
    valid_from: requiredString(item, "valid_from", "Approval verifier valid_from"),
    valid_to: requiredString(item, "valid_to", "Approval verifier valid_to"),
  };
}

/**
 * Step one of two: ask for the bytes this enrolment must sign.
 *
 * Creating a challenge enrols nothing. It is a separate call because the
 * signature has to be produced somewhere this browser is not, and a single-call
 * enrolment would have had to accept the private key to manage that.
 */
export async function createArcEnrollmentChallenge(
  client: ContextplaneClient,
  input: ArcEnrollmentChallengeInput,
  context: ContextplaneRequestOptions = {},
): Promise<ArcEnrollmentChallenge> {
  const payload = await client.request("/v1/arc/admin/approval-verifiers/enrollment-challenges", {
    ...context,
    body: input,
    method: "POST",
  });
  const item = requiredRecord(payload, "Enrollment challenge");
  return {
    canonical_enrollment_bytes_base64: requiredString(
      item,
      "canonical_enrollment_bytes_base64",
      "Enrollment challenge canonical_enrollment_bytes_base64",
    ),
    enrollment_challenge_id: requiredString(
      item,
      "enrollment_challenge_id",
      "Enrollment challenge enrollment_challenge_id",
    ),
    expires_at: requiredString(item, "expires_at", "Enrollment challenge expires_at"),
    signing_domain: requiredString(item, "signing_domain", "Enrollment challenge signing_domain"),
  };
}

/**
 * Step two: complete the challenge with proof of possession.
 *
 * The returned `approval_verifier_id` is convenience rather than the only copy:
 * the verifier joins the register the moment this succeeds, and `/verifiers`
 * shows it there.
 */
export async function enrolArcApprovalVerifier(
  client: ContextplaneClient,
  input: { enrollment_challenge_id: string; proof: ArcApprovalProof },
  context: ContextplaneRequestOptions = {},
): Promise<ArcApprovalVerifier> {
  const payload = await client.request("/v1/arc/admin/approval-verifiers", {
    ...context,
    body: input,
    method: "POST",
  });
  return parseVerifier(payload);
}

/**
 * End a verifier's authority, by id.
 *
 * Posts to the item path with the action appended. The collection path *enrols*,
 * so a revoke sent there would attempt the opposite operation from one wrong URL
 * — the E19-T7 defect, and the reason the path is asserted in this module's
 * tests and not just the body.
 */
export async function revokeArcApprovalVerifier(
  client: ContextplaneClient,
  approvalVerifierId: string,
  reason: { note?: string; reason_code: string },
  context: ContextplaneRequestOptions = {},
): Promise<ArcApprovalVerifier> {
  const payload = await client.request(
    `/v1/arc/admin/approval-verifiers/${encodeURIComponent(approvalVerifierId)}/revoke`,
    { ...context, body: reason, method: "POST" },
  );
  return parseVerifier(payload);
}

/** Whether the caller may perform deployment-scoped governance writes at all. */
export async function getArcOperatorIdentity(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
): Promise<ArcOperatorIdentity> {
  const payload = await client.request("/v1/arc/admin/operator-identity", { ...context });
  const item = requiredRecord(payload, "Operator identity");
  return {
    allowlist_fingerprint: requiredString(
      item,
      "allowlist_fingerprint",
      "Operator identity allowlist_fingerprint",
    ),
    checked_at: requiredString(item, "checked_at", "Operator identity checked_at"),
    context_resolution_enabled: requiredBoolean(
      item,
      "context_resolution_enabled",
      "Operator identity context_resolution_enabled",
    ),
    is_global_operator: requiredBoolean(
      item,
      "is_global_operator",
      "Operator identity is_global_operator",
    ),
  };
}
