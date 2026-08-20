import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ContextplaneRequestOptions } from "../../shared/api/client";
import { clientFromRequest } from "../../shared/api/client";
import type { ArcProposalVersion } from "../../shared/api/contextplane";
import { ArcLifecyclePanel } from "./ArcLifecyclePanel";

const proposal: ArcProposalVersion = {
  allowed_transitions: ["rejected", "submitted", "superseded", "withdrawn"],
  artifact_id: "10000000-0000-4000-8000-000000000001",
  available_actions: [
    "activate",
    "accept_qualification",
    "confirm_reach",
    "qualify",
    "request_approval",
    "run_semantic_tests",
    "submit",
    "validate",
  ],
  created_at: "2026-08-12T10:00:00Z",
  frozen_at: null,
  operational_integrity_state: "verified",
  proposal_id: "20000000-0000-4000-8000-000000000001",
  proposal_version: 1,
  reason_codes: [],
  reviewed_baseline_revision_id: null,
  revision_id: "30000000-0000-4000-8000-000000000001",
  risk_algorithm_version: "risk-v1",
  risk_classification: "tenant_mandatory",
  source_evidence_id: "40000000-0000-4000-8000-000000000001",
  state: "open",
};

const versionPath = `/v1/arc/proposals/${proposal.proposal_id}/versions/1`;

function createClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path === `${versionPath}/validate`) return { errors: [], valid: true };
    if (path === `${versionPath}/semantic-tests`) {
      return {
        results: [
          {
            actual: { selected: true },
            expected: { selected: true },
            passed: true,
            test_id: "semantic-test",
          },
        ],
      };
    }
    if (path === `${versionPath}/reach-confirmations`) return { confirmations: [] };
    if (path === `${versionPath}/submit`) return { ...proposal, state: "submitted" };
    if (path === `${versionPath}/review-package`) {
      return {
        artifact_revision_digest: "1".repeat(64),
        artifact_semantics_digest: "2".repeat(64),
        baseline_diff: {
          baseline_revision_id: null,
          changes: [
            {
              after: { compact_statement_plaintext: "Require approval." },
              before: null,
              change_kind: "added",
              field_path: "directives[0]",
            },
          ],
        },
        citations: [
          {
            excerpt_digest: "4".repeat(64),
            field_path: "directives[0]",
            source_anchor: "section-4.2",
            source_evidence_id: "40000000-0000-4000-8000-000000000001",
          },
        ],
        expected_impact_envelope: { items: [{}] },
        field_provenance: [{}],
        judgment_authors: [{}],
        prose_readback: "Require approval before a production change.",
        reach_confirmations: { confirmations: [{}] },
        review_package_digest: "3".repeat(64),
        risk_algorithm_version: "risk-v1",
        risk_classification: "tenant_mandatory",
        semantic_tests: { results: [{ passed: true }] },
        submission_identity: { issuer: "https://issuer.example", subject: "author-a" },
      };
    }
    if (path === `${versionPath}/approval-challenges`) {
      return {
        approval_challenge_id: "50000000-0000-4000-8000-000000000001",
        approval_nonce: "nonce",
        canonical_evidence_bytes_base64: "ZXZpZGVuY2U=",
        expires_at: "2026-08-12T10:15:00Z",
        signing_domain: "arc-projection-approval-v1",
      };
    }
    if (path === "/v1/arc/approval-challenges/50000000-0000-4000-8000-000000000001/complete") {
      return {
        approval_verifier_id: "60000000-0000-4000-8000-000000000001",
        approved_payload_digest: "a".repeat(64),
        approving_principal_issuer: "https://issuer.example",
        approving_principal_subject: "approver-a",
        evidence_id: "70000000-0000-4000-8000-000000000001",
        proposal_id: proposal.proposal_id,
        proposal_version: 1,
        revision_id: proposal.revision_id,
        revoked_at: null,
        verified_at: "2026-08-12T10:10:00Z",
      };
    }
    if (path === versionPath && !options?.method) return proposal;
    if (path === `/v1/arc/revisions/${proposal.revision_id}/activation-eligibility`) {
      return {
        eligible: true,
        predicates: [
          { name: "proposal_approved", reason_code: null, satisfied: true },
          { name: "source_current", reason_code: null, satisfied: true },
        ],
      };
    }
    if (path === `/v1/arc/revisions/${proposal.revision_id}/activate`) {
      return {
        activated_at: "2026-08-12T10:20:00Z",
        artifact_id: proposal.artifact_id,
        lifecycle_state: "active",
        operational_integrity_state: "verified",
        revision_id: proposal.revision_id,
        revoked_at: null,
      };
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPanel(client = createClient()) {
  const onProposalChange = vi.fn();
  render(
    <ArcLifecyclePanel
      actorId="actor-a"
      client={client}
      onProposalChange={onProposalChange}
      proposal={proposal}
      tenantId="tenant-a"
    />,
  );
  return { client, onProposalChange };
}

describe("ArcLifecyclePanel", () => {
  it("validates, tests, confirms reach, and submits a declared impact envelope", async () => {
    const { client, onProposalChange } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("Candidate is valid")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Run test" }));
    expect(await screen.findByText("All semantic tests passed.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Confirm reach" }));
    expect(await screen.findByText(/reach confirmed/)).toBeVisible();

    fireEvent.change(screen.getByLabelText("Authenticated author issuer"), {
      target: { value: "https://issuer.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit for approval" }));

    await waitFor(() =>
      expect(onProposalChange).toHaveBeenCalledWith(
        expect.objectContaining({ state: "submitted" }),
      ),
    );
    expect(client.request).toHaveBeenCalledWith(
      `${versionPath}/submit`,
      expect.objectContaining({
        body: {
          expected_impact_envelope: expect.objectContaining({
            author_issuer: "https://issuer.example",
            author_subject: "actor-a",
            items: [expect.objectContaining({ delta_code: "newly_selected" })],
            profile: "arc_expected_impact_envelope_v2",
          }),
        },
        method: "POST",
        tenantId: "tenant-a",
      }),
    );
  });

  it("hands canonical bytes to an external signer and activates only after eligibility", async () => {
    const { client, onProposalChange } = renderPanel();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });

    expect(screen.getByRole("button", { name: "Request challenge" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Load review package" }));
    expect(await screen.findByText("Require approval before a production change.")).toBeVisible();
    expect(screen.getAllByText("directives[0]")).toHaveLength(2);
    expect(screen.getByText("section-4.2")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Approval verifier ID"), {
      target: { value: "60000000-0000-4000-8000-000000000001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request challenge" }));
    expect(await screen.findByText("Challenge ready for external signing")).toBeVisible();
    expect(screen.getByLabelText("Canonical evidence bytes")).toHaveValue("ZXZpZGVuY2U=");

    fireEvent.change(screen.getByLabelText("Signature (base64)"), {
      target: { value: "c2lnbmF0dXJl" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and record approval" }));
    expect(await screen.findByText("Approval recorded")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/arc/approval-challenges/50000000-0000-4000-8000-000000000001/complete",
      expect.objectContaining({
        body: {
          proof: {
            signature_algorithm: "Ed25519",
            signature_base64: "c2lnbmF0dXJl",
            verification_method: "detached_signature",
          },
        },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Check activation eligibility" }));
    expect(await screen.findByText("Eligible")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Activate revision" }));

    await waitFor(() => expect(onProposalChange).toHaveBeenCalledWith(proposal));
    expect(client.request).toHaveBeenCalledWith(
      `/v1/arc/revisions/${proposal.revision_id}/activate`,
      expect.objectContaining({
        body: {
          proposal_id: proposal.proposal_id,
          proposal_version: 1,
          qualification_id: null,
        },
        method: "POST",
      }),
    );
  });
});
