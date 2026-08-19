import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import { parseArcProposalVersion, type ArcProposalVersion } from "./contextplane";

export type ArcVerificationMethod = "detached_signature" | "verifier_attestation";
export type ArcSignatureAlgorithm = "Ed25519";
export type ArcSourceAdmissionMethod = "authorized_upload" | "connector_fetch";
export type ArcSourceEvidenceStatus = "current" | "expired" | "overdue" | "revoked" | "unknown";

export interface ArcDetachedSignatureProof {
  signature_algorithm: ArcSignatureAlgorithm;
  signature_base64: string;
  verification_method: "detached_signature";
}

export interface ArcVerifierAttestationProof {
  assertion_base64: string;
  assertion_format: string;
  provider_id: string;
  verification_method: "verifier_attestation";
}

export type ArcApprovalProof = ArcDetachedSignatureProof | ArcVerifierAttestationProof;

export interface ArcSourceApprovalClaim {
  approval_locator: string;
  approval_scope: string;
  approved_at: string;
  approving_authority_issuer: string;
  approving_authority_subject: string;
  expires_at: string;
  profile: "arc_source_approval_claim_v1";
  source_content_digest: string;
  source_content_digest_algorithm: "sha256";
  source_content_type: string;
  source_revision_locator: string;
  source_system: string;
}

export interface ArcSourceEvidence {
  admission_method: ArcSourceAdmissionMethod;
  admitted_at: string;
  connector_id: string | null;
  expires_at: string;
  next_check_at: string | null;
  policy_id: string;
  source_content_bytes: number;
  source_content_digest: string;
  source_content_type: string;
  source_evidence_id: string;
  source_revision_locator: string;
  source_system: string;
  status: ArcSourceEvidenceStatus;
  status_checked_at: string;
  verification_method: ArcVerificationMethod;
  verified_at: string;
  verifier_id: string;
}

interface ArcSourceAdmissionBase {
  claim: ArcSourceApprovalClaim;
  idempotencyKey: string;
  proof: ArcApprovalProof;
  verifierId: string;
}

export interface AdmitArcSourceUploadInput extends ArcSourceAdmissionBase {
  body: File;
  policyId: string;
  sourceContentType: string;
  sourceRevisionLocator: string;
  sourceSystem: string;
}

export interface AdmitArcConnectorFetchInput extends ArcSourceAdmissionBase {
  connectorId: string;
  sourceRevisionLocator: string;
}

export interface ArcSemanticTest {
  manifest: Readonly<Record<string, unknown>>;
  test_id: string;
}

export interface ArcSemanticTestResult {
  actual: Readonly<Record<string, unknown>>;
  expected: Readonly<Record<string, unknown>>;
  passed: boolean;
  test_id: string;
}

export interface ArcBaselineDiffChange {
  after: Readonly<Record<string, unknown>> | null;
  before: Readonly<Record<string, unknown>> | null;
  change_kind: "added" | "changed" | "removed";
  field_path: string;
}

export interface ArcBaselineDiff {
  baseline_revision_id: string | null;
  changes: ArcBaselineDiffChange[];
}

export interface ArcReviewCitation {
  excerpt_digest: string;
  field_path: string;
  source_anchor: string;
  source_evidence_id: string;
}

export interface ArcReviewPackageSummary {
  artifact_revision_digest: string;
  artifact_semantics_digest: string;
  baseline_diff: ArcBaselineDiff;
  citation_count: number;
  citations: ArcReviewCitation[];
  expected_impact_count: number;
  field_provenance_count: number;
  judgment_author_count: number;
  prose_readback: string;
  reach_confirmation_count: number;
  review_package_digest: string;
  risk_algorithm_version: string;
  risk_classification: string;
  semantic_test_pass_count: number;
  semantic_test_total_count: number;
  submission_identity: {
    issuer: string;
    subject: string;
  };
}

export interface ArcReasonInput {
  note?: string | null;
  reasonCode: string;
}

export interface ArcImpactEnvelopeItem {
  class_predicate: Readonly<Record<string, unknown>>;
  delta_code: string;
  item_id: string;
  maximum_count: number | null;
  minimum_count: number;
  rationale_code: string;
}

export interface ArcSubmitInput {
  expectedImpactEnvelope: {
    author_issuer: string;
    author_subject: string;
    created_at: string;
    envelope_id: string;
    items: readonly ArcImpactEnvelopeItem[];
    profile: "arc_expected_impact_envelope_v2";
    proposal_id: string;
    proposal_version: number;
  };
}

export interface ArcApprovalChallenge {
  approval_challenge_id: string;
  approval_nonce: string;
  canonical_evidence_bytes_base64: string;
  expires_at: string;
  signing_domain: string;
}

export interface ArcProjectionApprovalEvidence {
  approval_verifier_id: string;
  approved_payload_digest: string;
  approving_principal_issuer: string;
  approving_principal_subject: string;
  evidence_id: string;
  proposal_id: string;
  proposal_version: number;
  revision_id: string;
  revoked_at: string | null;
  verified_at: string;
}

export interface ArcObservationStatus {
  cohort_digest: string;
  cohort_id: string;
  computed_decision: "failed" | "insufficient" | "qualified";
  counters_by_delta_code: readonly Readonly<Record<string, unknown>>[];
  eligible_count: number;
  observed_count: number;
  out_of_envelope_count: number;
  reason_codes: readonly string[];
  unexplained_count: number;
  window_deadline: string;
  window_started_at: string;
}

export interface ArcQualification {
  accepted_at: string | null;
  accepted_by: { issuer: string; subject: string } | null;
  baseline_revision_id: string | null;
  candidate_review_package_digest: string;
  cohort_digest: string;
  computed_at: string;
  decision: "failed" | "insufficient" | "qualified";
  expected_impact_envelope_digest: string;
  expires_at: string | null;
  qualification_algorithm_version: string;
  qualification_id: string;
  replay_corpus_digest: string | null;
}

export interface ArcActivationPredicate {
  name: string;
  reason_code: string | null;
  satisfied: boolean;
}

export interface ArcActivationEligibility {
  eligible: boolean;
  predicates: readonly ArcActivationPredicate[];
}

export interface ArcRevision {
  activated_at: string | null;
  artifact_id: string;
  lifecycle_state: string;
  operational_integrity_state: string;
  revision_id: string;
  revoked_at: string | null;
}

export interface ArcReceiptDetailRequest {
  contextHandle: string;
  continuationToken?: string | null;
  idempotencyKey: string;
  maxResponseBytes?: number;
  requestKind: "directive" | "query" | "source_anchor";
  selector?: Readonly<Record<string, unknown>>;
}

export interface ArcReceiptDetail {
  complete: boolean;
  continuation_token: string | null;
  items: readonly Readonly<Record<string, unknown>>[];
  page_number: number;
  profile: string;
  reason_codes: readonly string[];
  receipt_id: string;
  request_digest: string;
  returned_bytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid API ${label}.`);
  return value;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Invalid API response: ${key} must be text.`);
  return value;
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Invalid API response: ${key} must be text.`);
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid API response: ${key} must be a number.`);
  }
  return value;
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean")
    throw new Error(`Invalid API response: ${key} must be true or false.`);
  return value;
}

function stringArray(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid API response: ${key} must contain text values.`);
  }
  return value;
}

function enumValue<const Values extends readonly string[]>(
  record: Record<string, unknown>,
  key: string,
  values: Values,
): Values[number] {
  const value = record[key];
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`Invalid API response: unknown ${key}.`);
  }
  return value;
}

function requestOptions(
  context: ContextplaneRequestOptions,
  signal: AbortSignal | undefined,
): ContextplaneRequestOptions {
  return {
    ...(signal ? { signal } : {}),
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
  };
}

function proposalVersionPath(proposalId: string, proposalVersion: number): string {
  return `/v1/arc/proposals/${encodeURIComponent(proposalId)}/versions/${proposalVersion}`;
}

function parseSourceEvidence(value: unknown): ArcSourceEvidence {
  const record = requiredRecord(value, "ARC source evidence");
  return {
    admission_method: enumValue(record, "admission_method", [
      "authorized_upload",
      "connector_fetch",
    ]),
    admitted_at: requiredString(record, "admitted_at"),
    connector_id: nullableString(record, "connector_id"),
    expires_at: requiredString(record, "expires_at"),
    next_check_at: nullableString(record, "next_check_at"),
    policy_id: requiredString(record, "policy_id"),
    source_content_bytes: requiredNumber(record, "source_content_bytes"),
    source_content_digest: requiredString(record, "source_content_digest"),
    source_content_type: requiredString(record, "source_content_type"),
    source_evidence_id: requiredString(record, "source_evidence_id"),
    source_revision_locator: requiredString(record, "source_revision_locator"),
    source_system: requiredString(record, "source_system"),
    status: enumValue(record, "status", ["current", "expired", "overdue", "revoked", "unknown"]),
    status_checked_at: requiredString(record, "status_checked_at"),
    verification_method: enumValue(record, "verification_method", [
      "detached_signature",
      "verifier_attestation",
    ]),
    verified_at: requiredString(record, "verified_at"),
    verifier_id: requiredString(record, "verifier_id"),
  };
}

function parseSemanticTestResults(value: unknown): readonly ArcSemanticTestResult[] {
  const record = requiredRecord(value, "ARC semantic test result");
  if (!Array.isArray(record.results)) throw new Error("Invalid API ARC semantic test results.");
  return record.results.map((candidate) => {
    const result = requiredRecord(candidate, "ARC semantic test item");
    return {
      actual: requiredRecord(result.actual, "ARC semantic test actual result"),
      expected: requiredRecord(result.expected, "ARC semantic test expected result"),
      passed: requiredBoolean(result, "passed"),
      test_id: requiredString(result, "test_id"),
    };
  });
}

function nullableRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  return requiredRecord(value, key);
}

function recordArray(
  record: Record<string, unknown>,
  key: string,
): readonly Record<string, unknown>[] {
  const value = record[key];
  if (!Array.isArray(value)) throw new Error(`Invalid API response: ${key} must be a list.`);
  return value.map((item, index) => requiredRecord(item, `${key}[${index}]`));
}

function nestedRecordArray(record: Record<string, unknown>, objectKey: string, arrayKey: string) {
  return recordArray(requiredRecord(record[objectKey], objectKey), arrayKey);
}

function parseBaselineDiffChange(value: unknown): ArcBaselineDiffChange {
  const record = requiredRecord(value, "ARC baseline diff change");
  return {
    after: nullableRecord(record, "after"),
    before: nullableRecord(record, "before"),
    change_kind: enumValue(record, "change_kind", ["added", "changed", "removed"]),
    field_path: requiredString(record, "field_path"),
  };
}

function parseBaselineDiff(value: unknown): ArcBaselineDiff {
  const record = requiredRecord(value, "ARC baseline diff");
  return {
    baseline_revision_id: nullableString(record, "baseline_revision_id"),
    changes: recordArray(record, "changes").map(parseBaselineDiffChange),
  };
}

function parseReviewCitation(value: unknown): ArcReviewCitation {
  const record = requiredRecord(value, "ARC review citation");
  return {
    excerpt_digest: requiredString(record, "excerpt_digest"),
    field_path: requiredString(record, "field_path"),
    source_anchor: requiredString(record, "source_anchor"),
    source_evidence_id: requiredString(record, "source_evidence_id"),
  };
}

function parseReviewPackageSummary(value: unknown): ArcReviewPackageSummary {
  const record = requiredRecord(value, "ARC review package");
  const semanticTests = nestedRecordArray(record, "semantic_tests", "results");
  const submissionIdentity = requiredRecord(record.submission_identity, "ARC submission identity");
  const citations = recordArray(record, "citations").map(parseReviewCitation);
  return {
    artifact_revision_digest: requiredString(record, "artifact_revision_digest"),
    artifact_semantics_digest: requiredString(record, "artifact_semantics_digest"),
    baseline_diff: parseBaselineDiff(record.baseline_diff),
    citation_count: citations.length,
    citations,
    expected_impact_count: nestedRecordArray(record, "expected_impact_envelope", "items").length,
    field_provenance_count: recordArray(record, "field_provenance").length,
    judgment_author_count: recordArray(record, "judgment_authors").length,
    prose_readback: requiredString(record, "prose_readback"),
    reach_confirmation_count: nestedRecordArray(record, "reach_confirmations", "confirmations")
      .length,
    review_package_digest: requiredString(record, "review_package_digest"),
    risk_algorithm_version: requiredString(record, "risk_algorithm_version"),
    risk_classification: requiredString(record, "risk_classification"),
    semantic_test_pass_count: semanticTests.filter((test) => requiredBoolean(test, "passed"))
      .length,
    semantic_test_total_count: semanticTests.length,
    submission_identity: {
      issuer: requiredString(submissionIdentity, "issuer"),
      subject: requiredString(submissionIdentity, "subject"),
    },
  };
}

function parseApprovalChallenge(value: unknown): ArcApprovalChallenge {
  const record = requiredRecord(value, "ARC approval challenge");
  return {
    approval_challenge_id: requiredString(record, "approval_challenge_id"),
    approval_nonce: requiredString(record, "approval_nonce"),
    canonical_evidence_bytes_base64: requiredString(record, "canonical_evidence_bytes_base64"),
    expires_at: requiredString(record, "expires_at"),
    signing_domain: requiredString(record, "signing_domain"),
  };
}

function parseApprovalEvidence(value: unknown): ArcProjectionApprovalEvidence {
  const record = requiredRecord(value, "ARC approval evidence");
  return {
    approval_verifier_id: requiredString(record, "approval_verifier_id"),
    approved_payload_digest: requiredString(record, "approved_payload_digest"),
    approving_principal_issuer: requiredString(record, "approving_principal_issuer"),
    approving_principal_subject: requiredString(record, "approving_principal_subject"),
    evidence_id: requiredString(record, "evidence_id"),
    proposal_id: requiredString(record, "proposal_id"),
    proposal_version: requiredNumber(record, "proposal_version"),
    revision_id: requiredString(record, "revision_id"),
    revoked_at: nullableString(record, "revoked_at"),
    verified_at: requiredString(record, "verified_at"),
  };
}

function parseObservationStatus(value: unknown): ArcObservationStatus {
  const record = requiredRecord(value, "ARC observation status");
  const counters = record.counters_by_delta_code;
  if (!Array.isArray(counters) || !counters.every(isRecord)) {
    throw new Error("Invalid API ARC observation counters.");
  }
  return {
    cohort_digest: requiredString(record, "cohort_digest"),
    cohort_id: requiredString(record, "cohort_id"),
    computed_decision: enumValue(record, "computed_decision", [
      "failed",
      "insufficient",
      "qualified",
    ]),
    counters_by_delta_code: counters,
    eligible_count: requiredNumber(record, "eligible_count"),
    observed_count: requiredNumber(record, "observed_count"),
    out_of_envelope_count: requiredNumber(record, "out_of_envelope_count"),
    reason_codes: stringArray(record, "reason_codes"),
    unexplained_count: requiredNumber(record, "unexplained_count"),
    window_deadline: requiredString(record, "window_deadline"),
    window_started_at: requiredString(record, "window_started_at"),
  };
}

function parseQualification(value: unknown): ArcQualification {
  const record = requiredRecord(value, "ARC qualification");
  const acceptedBy = record.accepted_by;
  if (acceptedBy !== null && acceptedBy !== undefined && !isRecord(acceptedBy)) {
    throw new Error("Invalid API ARC qualification accepting actor.");
  }
  return {
    accepted_at: nullableString(record, "accepted_at"),
    accepted_by: acceptedBy
      ? {
          issuer: requiredString(acceptedBy, "issuer"),
          subject: requiredString(acceptedBy, "subject"),
        }
      : null,
    baseline_revision_id: nullableString(record, "baseline_revision_id"),
    candidate_review_package_digest: requiredString(record, "candidate_review_package_digest"),
    cohort_digest: requiredString(record, "cohort_digest"),
    computed_at: requiredString(record, "computed_at"),
    decision: enumValue(record, "decision", ["failed", "insufficient", "qualified"]),
    expected_impact_envelope_digest: requiredString(record, "expected_impact_envelope_digest"),
    expires_at: nullableString(record, "expires_at"),
    qualification_algorithm_version: requiredString(record, "qualification_algorithm_version"),
    qualification_id: requiredString(record, "qualification_id"),
    replay_corpus_digest: nullableString(record, "replay_corpus_digest"),
  };
}

function parseActivationEligibility(value: unknown): ArcActivationEligibility {
  const record = requiredRecord(value, "ARC activation eligibility");
  if (!Array.isArray(record.predicates)) throw new Error("Invalid API ARC activation predicates.");
  return {
    eligible: requiredBoolean(record, "eligible"),
    predicates: record.predicates.map((candidate) => {
      const predicate = requiredRecord(candidate, "ARC activation predicate");
      return {
        name: requiredString(predicate, "name"),
        reason_code: nullableString(predicate, "reason_code"),
        satisfied: requiredBoolean(predicate, "satisfied"),
      };
    }),
  };
}

function parseRevision(value: unknown): ArcRevision {
  const record = requiredRecord(value, "ARC revision");
  return {
    activated_at: nullableString(record, "activated_at"),
    artifact_id: requiredString(record, "artifact_id"),
    lifecycle_state: requiredString(record, "lifecycle_state"),
    operational_integrity_state: requiredString(record, "operational_integrity_state"),
    revision_id: requiredString(record, "revision_id"),
    revoked_at: nullableString(record, "revoked_at"),
  };
}

export async function getArcSourceEvidence(
  client: ContextplaneClient,
  sourceEvidenceId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcSourceEvidence> {
  const payload = await client.request(
    `/v1/arc/sources/${encodeURIComponent(sourceEvidenceId)}`,
    requestOptions(context, signal),
  );
  return parseSourceEvidence(payload);
}

export async function admitArcSourceUpload(
  client: ContextplaneClient,
  input: AdmitArcSourceUploadInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcSourceEvidence> {
  const metadata = {
    claim: input.claim,
    policy_id: input.policyId,
    proof: input.proof,
    source_content_type: input.sourceContentType,
    source_revision_locator: input.sourceRevisionLocator,
    source_system: input.sourceSystem,
    verifier_id: input.verifierId,
  };
  const body = new FormData();
  body.set("metadata", JSON.stringify(metadata));
  body.set("body", input.body);
  const payload = await client.request("/v1/arc/sources/uploads", {
    ...requestOptions(context, signal),
    body,
    headers: { "Idempotency-Key": input.idempotencyKey },
    method: "POST",
  });
  return parseSourceEvidence(payload);
}

export async function admitArcConnectorFetch(
  client: ContextplaneClient,
  input: AdmitArcConnectorFetchInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcSourceEvidence> {
  const payload = await client.request("/v1/arc/sources/connector-fetches", {
    ...requestOptions(context, signal),
    body: {
      claim: input.claim,
      connector_id: input.connectorId,
      proof: input.proof,
      source_revision_locator: input.sourceRevisionLocator,
      verifier_id: input.verifierId,
    },
    headers: { "Idempotency-Key": input.idempotencyKey },
    method: "POST",
  });
  return parseSourceEvidence(payload);
}

export async function runArcSemanticTests(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  tests: readonly ArcSemanticTest[],
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly ArcSemanticTestResult[]> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/semantic-tests`,
    {
      ...requestOptions(context, signal),
      body: { tests },
      method: "POST",
    },
  );
  return parseSemanticTestResults(payload);
}

export async function getArcBaselineDiff(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcBaselineDiff> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/baseline-diff`,
    {
      ...requestOptions(context, signal),
    },
  );
  return parseBaselineDiff(payload);
}

export async function getArcReviewPackageSummary(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcReviewPackageSummary> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/review-package`,
    {
      ...requestOptions(context, signal),
    },
  );
  return parseReviewPackageSummary(payload);
}

export async function confirmArcProposalReach(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  fieldPaths: readonly string[],
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<Readonly<Record<string, unknown>>> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/reach-confirmations`,
    { ...requestOptions(context, signal), body: { field_paths: fieldPaths }, method: "POST" },
  );
  return requiredRecord(payload, "ARC reach confirmation");
}

export async function submitArcProposal(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  input: ArcSubmitInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProposalVersion> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/submit`,
    {
      ...requestOptions(context, signal),
      body: { expected_impact_envelope: input.expectedImpactEnvelope },
      method: "POST",
    },
  );
  return parseArcProposalVersion(payload);
}

async function transitionArcProposal(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  action: "reject" | "supersede" | "withdraw",
  input: ArcReasonInput,
  context: ContextplaneRequestOptions,
  signal: AbortSignal | undefined,
): Promise<ArcProposalVersion> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/${action}`,
    {
      ...requestOptions(context, signal),
      body: { note: input.note ?? null, reason_code: input.reasonCode },
      method: "POST",
    },
  );
  return parseArcProposalVersion(payload);
}

export function withdrawArcProposal(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  input: ArcReasonInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProposalVersion> {
  return transitionArcProposal(
    client,
    proposalId,
    proposalVersion,
    "withdraw",
    input,
    context,
    signal,
  );
}

export function rejectArcProposal(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  input: ArcReasonInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProposalVersion> {
  return transitionArcProposal(
    client,
    proposalId,
    proposalVersion,
    "reject",
    input,
    context,
    signal,
  );
}

export function supersedeArcProposal(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  input: ArcReasonInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProposalVersion> {
  return transitionArcProposal(
    client,
    proposalId,
    proposalVersion,
    "supersede",
    input,
    context,
    signal,
  );
}

export async function createArcApprovalChallenge(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  approvalVerifierId: string,
  idempotencyKey: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcApprovalChallenge> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/approval-challenges`,
    {
      ...requestOptions(context, signal),
      body: { approval_verifier_id: approvalVerifierId },
      headers: { "Idempotency-Key": idempotencyKey },
      method: "POST",
    },
  );
  return parseApprovalChallenge(payload);
}

export async function completeArcApprovalChallenge(
  client: ContextplaneClient,
  approvalChallengeId: string,
  proof: ArcApprovalProof,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProjectionApprovalEvidence> {
  const payload = await client.request(
    `/v1/arc/approval-challenges/${encodeURIComponent(approvalChallengeId)}/complete`,
    { ...requestOptions(context, signal), body: { proof }, method: "POST" },
  );
  return parseApprovalEvidence(payload);
}

export async function getArcObservation(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcObservationStatus> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/observation`,
    requestOptions(context, signal),
  );
  return parseObservationStatus(payload);
}

export async function qualifyArcProposal(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcQualification> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/observation/qualify`,
    { ...requestOptions(context, signal), body: {}, method: "POST" },
  );
  return parseQualification(payload);
}

export async function acceptArcQualification(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  qualificationId: string,
  acknowledgedReasonCodes: readonly string[],
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcQualification> {
  const payload = await client.request(
    `${proposalVersionPath(proposalId, proposalVersion)}/observation/accept`,
    {
      ...requestOptions(context, signal),
      body: {
        acknowledged_reason_codes: acknowledgedReasonCodes,
        qualification_id: qualificationId,
      },
      method: "POST",
    },
  );
  return parseQualification(payload);
}

export async function getArcRevisionActivationEligibility(
  client: ContextplaneClient,
  revisionId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcActivationEligibility> {
  const payload = await client.request(
    `/v1/arc/revisions/${encodeURIComponent(revisionId)}/activation-eligibility`,
    requestOptions(context, signal),
  );
  return parseActivationEligibility(payload);
}

export async function activateArcRevision(
  client: ContextplaneClient,
  revisionId: string,
  proposalId: string,
  proposalVersion: number,
  qualificationId: string | null,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcRevision> {
  const payload = await client.request(
    `/v1/arc/revisions/${encodeURIComponent(revisionId)}/activate`,
    {
      ...requestOptions(context, signal),
      body: {
        proposal_id: proposalId,
        proposal_version: proposalVersion,
        qualification_id: qualificationId,
      },
      method: "POST",
    },
  );
  return parseRevision(payload);
}

export async function revokeArcRevision(
  client: ContextplaneClient,
  revisionId: string,
  input: ArcReasonInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcRevision> {
  const payload = await client.request(
    `/v1/arc/revisions/${encodeURIComponent(revisionId)}/revoke`,
    {
      ...requestOptions(context, signal),
      body: { note: input.note ?? null, reason_code: input.reasonCode },
      method: "POST",
    },
  );
  return parseRevision(payload);
}

export async function getArcReceiptDetail(
  client: ContextplaneClient,
  receiptId: string,
  input: ArcReceiptDetailRequest,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcReceiptDetail> {
  const payload = await client.request(`/v1/arc/receipts/${encodeURIComponent(receiptId)}/detail`, {
    ...requestOptions(context, signal),
    body: {
      context_handle: input.contextHandle,
      continuation_token: input.continuationToken ?? null,
      idempotency_key: input.idempotencyKey,
      max_response_bytes: input.maxResponseBytes ?? 16_384,
      request_kind: input.requestKind,
      selector: input.selector ?? {},
    },
    method: "POST",
  });
  const record = requiredRecord(payload, "ARC receipt detail");
  if (!Array.isArray(record.items) || !record.items.every(isRecord)) {
    throw new Error("Invalid API ARC receipt detail items.");
  }
  return {
    complete: requiredBoolean(record, "complete"),
    continuation_token: nullableString(record, "continuation_token"),
    items: record.items,
    page_number: requiredNumber(record, "page_number"),
    profile: requiredString(record, "profile"),
    reason_codes: Array.isArray(record.reason_codes) ? stringArray(record, "reason_codes") : [],
    receipt_id: requiredString(record, "receipt_id"),
    request_digest: requiredString(record, "request_digest"),
    returned_bytes: requiredNumber(record, "returned_bytes"),
  };
}
