import { describe, expect, it, vi } from "vitest";

import { clientFromRequest } from "./client";
import {
  acceptArcQualification,
  activateArcRevision,
  admitArcSourceUpload,
  completeArcApprovalChallenge,
  confirmArcProposalReach,
  createArcApprovalChallenge,
  getArcBaselineDiff,
  getArcObservation,
  getArcReceiptDetail,
  getArcReviewPackageSummary,
  getArcRevisionActivationEligibility,
  getArcSourceEvidence,
  qualifyArcProposal,
  runArcSemanticTests,
  submitArcProposal,
} from "./arcAuthoring";

function stubClient(payload: unknown) {
  return clientFromRequest(vi.fn().mockResolvedValue(payload));
}

const sourceEvidence = {
  admission_method: "authorized_upload",
  admitted_at: "2026-08-12T10:00:00Z",
  connector_id: null,
  expires_at: "2027-08-12T10:00:00Z",
  next_check_at: null,
  policy_id: "policy-v1",
  source_content_bytes: 24,
  source_content_digest: "a".repeat(64),
  source_content_type: "text/plain",
  source_evidence_id: "10000000-0000-4000-8000-000000000001",
  source_revision_locator: "commit:abc123",
  source_system: "policy-repository",
  status: "current",
  status_checked_at: "2026-08-12T10:00:00Z",
  verification_method: "detached_signature",
  verified_at: "2026-08-12T10:00:00Z",
  verifier_id: "20000000-0000-4000-8000-000000000001",
};

const proposalVersion = {
  allowed_transitions: ["submitted"],
  artifact_id: "30000000-0000-4000-8000-000000000001",
  available_actions: ["request_approval"],
  created_at: "2026-08-12T10:05:00Z",
  frozen_at: "2026-08-12T10:06:00Z",
  operational_integrity_state: "verified",
  proposal_id: "40000000-0000-4000-8000-000000000001",
  proposal_version: 1,
  reason_codes: [],
  reviewed_baseline_revision_id: null,
  revision_id: "50000000-0000-4000-8000-000000000001",
  risk_algorithm_version: "risk-v1",
  risk_classification: "tenant_mandatory",
  source_evidence_id: sourceEvidence.source_evidence_id,
  state: "submitted",
};

describe("ARC authoring endpoint adapters", () => {
  it("loads and admits immutable source evidence using the exact multipart contract", async () => {
    const detailClient = stubClient(sourceEvidence);
    await expect(getArcSourceEvidence(detailClient, "source/one")).resolves.toEqual(sourceEvidence);
    expect(detailClient.request).toHaveBeenCalledWith("/v1/arc/sources/source%2Fone", {});

    const uploadClient = stubClient(sourceEvidence);
    const body = new File(["approved policy"], "policy.txt", { type: "text/plain" });
    await expect(
      admitArcSourceUpload(
        uploadClient,
        {
          body,
          claim: {
            approval_locator: "approval:123",
            approval_scope: "tenant-policy",
            approved_at: "2026-08-12T09:00:00Z",
            approving_authority_issuer: "https://issuer.example",
            approving_authority_subject: "policy-board",
            expires_at: "2027-08-12T09:00:00Z",
            profile: "arc_source_approval_claim_v1",
            source_content_digest: sourceEvidence.source_content_digest,
            source_content_digest_algorithm: "sha256",
            source_content_type: "text/plain",
            source_revision_locator: sourceEvidence.source_revision_locator,
            source_system: sourceEvidence.source_system,
          },
          idempotencyKey: "admission-1",
          policyId: sourceEvidence.policy_id,
          proof: {
            signature_algorithm: "Ed25519",
            signature_base64: "c2lnbmF0dXJl",
            verification_method: "detached_signature",
          },
          sourceContentType: "text/plain",
          sourceRevisionLocator: sourceEvidence.source_revision_locator,
          sourceSystem: sourceEvidence.source_system,
          verifierId: sourceEvidence.verifier_id,
        },
        { tenantId: "tenant-a" },
      ),
    ).resolves.toEqual(sourceEvidence);

    const options = uploadClient.request.mock.calls[0]?.[1];
    expect(uploadClient.request).toHaveBeenCalledWith(
      "/v1/arc/sources/uploads",
      expect.objectContaining({
        headers: { "Idempotency-Key": "admission-1" },
        method: "POST",
        tenantId: "tenant-a",
      }),
    );
    expect(options?.body).toBeInstanceOf(FormData);
    if (!(options?.body instanceof FormData)) throw new Error("Expected a multipart body.");
    const formData = options.body;
    expect(formData.get("body")).toBe(body);
    expect(JSON.parse(String(formData.get("metadata")))).toMatchObject({
      policy_id: sourceEvidence.policy_id,
      proof: { verification_method: "detached_signature" },
      verifier_id: sourceEvidence.verifier_id,
    });
  });

  it("runs candidate tests, records reach, and submits a closed impact envelope", async () => {
    const testsClient = stubClient({
      results: [
        {
          actual: { selected: true },
          expected: { selected: true },
          passed: true,
          test_id: "test-1",
        },
      ],
    });
    await expect(
      runArcSemanticTests(testsClient, proposalVersion.proposal_id, 1, [
        { manifest: { profile: "arc_observation_class_predicate_v2" }, test_id: "test-1" },
      ]),
    ).resolves.toEqual([
      { actual: { selected: true }, expected: { selected: true }, passed: true, test_id: "test-1" },
    ]);

    const reachClient = stubClient({ confirmations: [] });
    await confirmArcProposalReach(reachClient, proposalVersion.proposal_id, 1, ["directives"]);
    expect(reachClient.request).toHaveBeenCalledWith(
      `/v1/arc/proposals/${proposalVersion.proposal_id}/versions/1/reach-confirmations`,
      { body: { field_paths: ["directives"] }, method: "POST" },
    );

    const submitClient = stubClient(proposalVersion);
    const envelope = {
      author_issuer: "https://issuer.example",
      author_subject: "actor-a",
      created_at: "2026-08-12T10:06:00Z",
      envelope_id: "60000000-0000-4000-8000-000000000001",
      items: [
        {
          class_predicate: { profile: "arc_observation_class_predicate_v2" },
          delta_code: "newly_selected",
          item_id: "impact-1",
          maximum_count: null,
          minimum_count: 0,
          rationale_code: "expected-policy-effect",
        },
      ],
      profile: "arc_expected_impact_envelope_v2" as const,
      proposal_id: proposalVersion.proposal_id,
      proposal_version: 1,
    };
    await expect(
      submitArcProposal(submitClient, proposalVersion.proposal_id, 1, {
        expectedImpactEnvelope: envelope,
      }),
    ).resolves.toEqual(proposalVersion);
    expect(submitClient.request).toHaveBeenCalledWith(
      `/v1/arc/proposals/${proposalVersion.proposal_id}/versions/1/submit`,
      { body: { expected_impact_envelope: envelope }, method: "POST" },
    );
  });

  it("loads the baseline and the authoritative review package a signature binds", async () => {
    const baselineDiff = {
      baseline_revision_id: "61000000-0000-4000-8000-000000000001",
      changes: [
        {
          after: { compact_statement_plaintext: "Require approval." },
          before: null,
          change_kind: "added",
          field_path: "directives[0]",
        },
      ],
    };
    const baselineClient = stubClient(baselineDiff);
    await expect(
      getArcBaselineDiff(baselineClient, proposalVersion.proposal_id, 1),
    ).resolves.toEqual(baselineDiff);
    expect(baselineClient.request).toHaveBeenCalledWith(
      `/v1/arc/proposals/${proposalVersion.proposal_id}/versions/1/baseline-diff`,
      {},
    );

    const reviewPackage = {
      artifact_revision_digest: "1".repeat(64),
      artifact_semantics_digest: "2".repeat(64),
      baseline_diff: baselineDiff,
      citations: [
        {
          excerpt_digest: "4".repeat(64),
          field_path: "directives[0]",
          source_anchor: "section-4.2",
          source_evidence_id: sourceEvidence.source_evidence_id,
        },
      ],
      expected_impact_envelope: { items: [{ item_id: "impact-1" }] },
      field_provenance: [{ field_path: "directives[0]" }],
      judgment_authors: [{ actor: "author-a" }],
      prose_readback: "Require approval before a production change.",
      reach_confirmations: { confirmations: [{ field_path: "directives" }] },
      review_package_digest: "3".repeat(64),
      risk_algorithm_version: "risk-v1",
      risk_classification: "tenant_mandatory",
      semantic_tests: {
        results: [
          { actual: {}, expected: {}, passed: true, test_id: "test-1" },
          { actual: {}, expected: {}, passed: false, test_id: "test-2" },
        ],
      },
      submission_identity: { issuer: "https://issuer.example", subject: "author-a" },
    };
    const reviewClient = stubClient(reviewPackage);
    await expect(
      getArcReviewPackageSummary(reviewClient, proposalVersion.proposal_id, 1),
    ).resolves.toMatchObject({
      baseline_diff: baselineDiff,
      citation_count: 1,
      expected_impact_count: 1,
      field_provenance_count: 1,
      judgment_author_count: 1,
      prose_readback: reviewPackage.prose_readback,
      reach_confirmation_count: 1,
      review_package_digest: reviewPackage.review_package_digest,
      semantic_test_pass_count: 1,
      semantic_test_total_count: 2,
      submission_identity: reviewPackage.submission_identity,
    });
    expect(reviewClient.request).toHaveBeenCalledWith(
      `/v1/arc/proposals/${proposalVersion.proposal_id}/versions/1/review-package`,
      {},
    );
  });

  it("keeps approval proof external and parses observation, qualification, and activation evidence", async () => {
    const challenge = {
      approval_challenge_id: "70000000-0000-4000-8000-000000000001",
      approval_nonce: "nonce",
      canonical_evidence_bytes_base64: "ZXZpZGVuY2U=",
      expires_at: "2026-08-12T10:15:00Z",
      signing_domain: "arc-projection-approval-v1",
    };
    await expect(
      createArcApprovalChallenge(
        stubClient(challenge),
        proposalVersion.proposal_id,
        1,
        "80000000-0000-4000-8000-000000000001",
        "challenge-1",
      ),
    ).resolves.toEqual(challenge);

    const approvalEvidence = {
      approval_verifier_id: "80000000-0000-4000-8000-000000000001",
      approved_payload_digest: "b".repeat(64),
      approving_principal_issuer: "https://issuer.example",
      approving_principal_subject: "approver-a",
      evidence_id: "90000000-0000-4000-8000-000000000001",
      proposal_id: proposalVersion.proposal_id,
      proposal_version: 1,
      revision_id: proposalVersion.revision_id,
      revoked_at: null,
      verified_at: "2026-08-12T10:10:00Z",
    };
    await expect(
      completeArcApprovalChallenge(stubClient(approvalEvidence), challenge.approval_challenge_id, {
        signature_algorithm: "Ed25519",
        signature_base64: "c2lnbmF0dXJl",
        verification_method: "detached_signature",
      }),
    ).resolves.toEqual(approvalEvidence);

    const observation = {
      cohort_digest: "c".repeat(64),
      cohort_id: "a1000000-0000-4000-8000-000000000001",
      computed_decision: "qualified",
      counters_by_delta_code: [],
      eligible_count: 10,
      observed_count: 10,
      out_of_envelope_count: 0,
      reason_codes: [],
      unexplained_count: 0,
      window_deadline: "2026-08-13T10:00:00Z",
      window_started_at: "2026-08-12T10:00:00Z",
    };
    await expect(
      getArcObservation(stubClient(observation), proposalVersion.proposal_id, 1),
    ).resolves.toEqual(observation);

    const qualification = {
      accepted_at: null,
      accepted_by: null,
      baseline_revision_id: null,
      candidate_review_package_digest: "d".repeat(64),
      cohort_digest: observation.cohort_digest,
      computed_at: "2026-08-13T10:00:00Z",
      decision: "qualified",
      expected_impact_envelope_digest: "e".repeat(64),
      expires_at: "2026-08-20T10:00:00Z",
      qualification_algorithm_version: "qualification-v1",
      qualification_id: "a2000000-0000-4000-8000-000000000001",
      replay_corpus_digest: null,
    };
    await expect(
      qualifyArcProposal(stubClient(qualification), proposalVersion.proposal_id, 1),
    ).resolves.toEqual(qualification);
    await expect(
      acceptArcQualification(
        stubClient({
          ...qualification,
          accepted_at: "2026-08-13T10:05:00Z",
          accepted_by: { issuer: "https://issuer.example", subject: "acceptor-a" },
        }),
        proposalVersion.proposal_id,
        1,
        qualification.qualification_id,
        [],
      ),
    ).resolves.toMatchObject({ accepted_by: { subject: "acceptor-a" } });

    const eligibility = {
      eligible: false,
      predicates: [
        { name: "proposal_approved", reason_code: "arc_proposal_not_approved", satisfied: false },
      ],
    };
    await expect(
      getArcRevisionActivationEligibility(stubClient(eligibility), proposalVersion.revision_id),
    ).resolves.toEqual(eligibility);

    const revision = {
      activated_at: "2026-08-13T10:10:00Z",
      artifact_id: proposalVersion.artifact_id,
      lifecycle_state: "active",
      operational_integrity_state: "verified",
      revision_id: proposalVersion.revision_id,
      revoked_at: null,
    };
    await expect(
      activateArcRevision(
        stubClient(revision),
        proposalVersion.revision_id,
        proposalVersion.proposal_id,
        1,
        qualification.qualification_id,
      ),
    ).resolves.toEqual(revision);
  });

  it("sends receipt detail idempotency inside the closed request body", async () => {
    const detail = {
      complete: true,
      continuation_token: null,
      items: [{ source_anchor: "section-4.2" }],
      page_number: 1,
      profile: "arc_detail_page_v1",
      reason_codes: ["audience_redacted"],
      receipt_id: "b1000000-0000-4000-8000-000000000001",
      request_digest: "f".repeat(64),
      returned_bytes: 42,
    };
    const client = stubClient(detail);
    await expect(
      getArcReceiptDetail(client, detail.receipt_id, {
        contextHandle: "runtime-handle",
        idempotencyKey: "detail-1",
        requestKind: "source_anchor",
        selector: { directive_id: "directive-a" },
      }),
    ).resolves.toEqual(detail);
    expect(client.request).toHaveBeenCalledWith(`/v1/arc/receipts/${detail.receipt_id}/detail`, {
      body: {
        context_handle: "runtime-handle",
        continuation_token: null,
        idempotency_key: "detail-1",
        max_response_bytes: 16_384,
        request_kind: "source_anchor",
        selector: { directive_id: "directive-a" },
      },
      method: "POST",
    });
  });
});
