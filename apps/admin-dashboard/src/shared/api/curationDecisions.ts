import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import { requiredRecord, requiredString } from "./parse";

/**
 * The decisions a curator takes on a queued claim.
 *
 * ## The queue could be read and never worked
 *
 * `GET /v1/memory/curation-queue` shipped, and Curation review rendered it —
 * ranked, with the service's own reason on every row and the disposition
 * policies beside it. Nothing on that page did anything. There was no action, no
 * link out, and none of these four endpoints was called anywhere in the
 * application, so a curator could see exactly what was waiting for them and had
 * nowhere to go with it.
 *
 * ## The service already says which decisions a row supports
 *
 * Every queue row carries `available_actions`, and it is not decoration: an
 * `unlinked` claim offers `link` and `discard`, a `contested` one offers
 * `confirm`, `discard` and `escalate`. Which decision answers which reason is a
 * service judgement, and a screen that re-derived it from `reason` would be a
 * second copy of that judgement — drifting the first time a reason is added.
 * So the actions are rendered from that field and nothing here maps reasons to
 * actions.
 *
 * ## Rationale is the service's, not this layer's
 *
 * `discard` requires a reason because `ClaimService` requires one; `confirm`
 * takes no body because confirming *is* the whole statement. DESIGN.md is
 * explicit — *"Require the service-defined rationale and confirmation; do not
 * invent client-only governance gates"* — so no extra field is asked for and no
 * extra confirmation step is imposed on top of the one the contract defines.
 */

export interface ConfirmClaimInput {
  claimId: string;
}

export interface DiscardClaimInput {
  claimId: string;
  /** Required by the service. A discard nobody explained is one nobody can review. */
  reason: string;
}

export interface LinkClaimSubjectInput {
  claimId: string;
  /**
   * Must *resolve* to an entity — `link_subject` re-derives ownership,
   * visibility and authority from the subject it finds, and refuses one it
   * cannot. Callers pass a chosen entity id rather than prose for that reason;
   * see ADR 0018 on identifiers being chosen and not typed.
   */
  subjectReference: string;
}

export interface OpenCurationCaseInput {
  predicate: string;
  subjectReference: string;
}

export interface CurationCase {
  case_id: string;
  /** What settling it commits to, published by the service rather than chosen here. */
  disposition: string;
  predicate: string;
  status: string;
  subject_reference: string;
}

/** Somebody stands behind this claim. The whole statement, so there is no body. */
export async function confirmClaim(
  client: ContextplaneClient,
  input: ConfirmClaimInput,
  context: ContextplaneRequestOptions = {},
): Promise<void> {
  await client.request(`/v1/memory/claims/${input.claimId}:confirm`, {
    ...context,
    method: "POST",
  });
}

/** Take the claim out of serving, with the reason the service requires. */
export async function discardClaim(
  client: ContextplaneClient,
  input: DiscardClaimInput,
  context: ContextplaneRequestOptions = {},
): Promise<void> {
  await client.request(`/v1/memory/claims/${input.claimId}:discard`, {
    ...context,
    body: { reason: input.reason.trim() },
    method: "POST",
  });
}

/**
 * Give a subjectless claim a home.
 *
 * The unlinked-to-staged transition. Everything that follows from having a
 * subject — owner, visibility, authority tier, whether it contradicts something
 * already stored — was undecidable while the reference did not resolve, and the
 * service re-derives all of it here.
 */
export async function linkClaimSubject(
  client: ContextplaneClient,
  input: LinkClaimSubjectInput,
  context: ContextplaneRequestOptions = {},
): Promise<void> {
  await client.request(`/v1/memory/claims/${input.claimId}:link`, {
    ...context,
    body: { subject_reference: input.subjectReference },
    method: "POST",
  });
}

/**
 * Escalate: open a case for a disagreement a curator will not settle alone.
 *
 * Keyed by subject and predicate rather than by claim, which is the shape of the
 * thing being escalated — a contested claim is contested *with* another claim
 * about the same subject and predicate, and a case about one of them would name
 * half the disagreement.
 *
 * Opening is the escalation. Routing it to an owner is a separate act with its
 * own endpoint, and is not folded in here: choosing who should settle something
 * is a decision, and doing it silently on the escalator's behalf would attribute
 * that decision to whoever clicked.
 */
export async function openCurationCase(
  client: ContextplaneClient,
  input: OpenCurationCaseInput,
  context: ContextplaneRequestOptions = {},
): Promise<CurationCase> {
  const payload = await client.request("/v1/memory/curation-cases", {
    ...context,
    body: { predicate: input.predicate, subject_reference: input.subjectReference },
    method: "POST",
  });
  const row = requiredRecord(payload, "Curation case");
  return {
    case_id: requiredString(row, "case_id", "Curation case case_id"),
    disposition: requiredString(row, "disposition", "Curation case disposition"),
    predicate: requiredString(row, "predicate", "Curation case predicate"),
    status: requiredString(row, "status", "Curation case status"),
    subject_reference: requiredString(row, "subject_reference", "Curation case subject_reference"),
  };
}
