import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ArcSourceEvidence } from "../../shared/api/arcAuthoring";
import type { ArcArtifactFamily, ArcProposalVersion } from "../../shared/api/contextplane";
import { ArcAuthoringContext } from "./ArcAuthoringContext";

const artifact: ArcArtifactFamily = {
  active_revision_id: null,
  artifact_id: "aa000000-0000-4000-8000-000000000001",
  created_at: "2026-08-12T10:00:00Z",
  created_by: { issuer: "contextplane", subject: "actor-1" },
  kind: "policy",
  owning_scope: "tenant",
  slug: "production-safeguards",
  target_tenant_id: "b0000000-0000-4000-8000-000000000001",
  title: "Production safeguards",
};

const source: ArcSourceEvidence = {
  admission_method: "connector_fetch",
  admitted_at: "2026-08-12T10:02:00Z",
  connector_id: "policy-repository",
  expires_at: "2027-08-12T10:02:00Z",
  next_check_at: null,
  policy_id: "policy-admission-v1",
  source_content_bytes: 2048,
  source_content_digest: "b".repeat(64),
  source_content_type: "text/markdown",
  source_evidence_id: "ac000000-0000-4000-8000-000000000001",
  source_revision_locator: "commit:abc123",
  source_system: "policy-repository",
  status: "overdue",
  status_checked_at: "2026-08-12T10:02:00Z",
  verification_method: "detached_signature",
  verified_at: "2026-08-12T10:02:00Z",
  verifier_id: "ad000000-0000-4000-8000-000000000001",
};

const proposal: ArcProposalVersion = {
  allowed_transitions: ["submitted"],
  artifact_id: artifact.artifact_id,
  available_actions: ["edit"],
  created_at: "2026-08-12T10:05:00Z",
  frozen_at: null,
  operational_integrity_state: "verified",
  proposal_id: "ab000000-0000-4000-8000-000000000001",
  proposal_version: 1,
  reason_codes: [],
  reviewed_baseline_revision_id: null,
  revision_id: null,
  risk_algorithm_version: null,
  risk_classification: null,
  source_evidence_id: source.source_evidence_id,
  state: "open",
};

describe("ArcAuthoringContext", () => {
  it("keeps the selected policy and missing prerequisites visible", () => {
    const onChangePolicy = vi.fn();
    render(
      <ArcAuthoringContext
        artifact={artifact}
        onChangePolicy={onChangePolicy}
        proposal={null}
        source={null}
      />,
    );

    expect(screen.getByRole("heading", { name: artifact.title })).toBeVisible();
    expect(screen.getByText("Source needed")).toBeVisible();
    expect(screen.getByText("Draft not opened")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Change policy" }));
    expect(onChangePolicy).toHaveBeenCalledOnce();
  });

  it("summarizes evidence health and draft state without hiding the policy", () => {
    const { rerender } = render(
      <ArcAuthoringContext
        artifact={{ ...artifact, active_revision_id: "revision-1" }}
        onChangePolicy={vi.fn()}
        proposal={proposal}
        source={source}
      />,
    );

    expect(screen.getByText("Active revision")).toBeVisible();
    expect(screen.getByText("Source Overdue")).toBeVisible();
    expect(screen.getByText("Draft Open")).toBeVisible();

    rerender(
      <ArcAuthoringContext
        artifact={artifact}
        onChangePolicy={vi.fn()}
        proposal={proposal}
        source={{ ...source, status: "expired" }}
      />,
    );
    expect(screen.getByText("Source Expired")).toBeVisible();
  });
});
