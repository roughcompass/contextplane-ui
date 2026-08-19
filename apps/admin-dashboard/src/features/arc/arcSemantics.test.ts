import { describe, expect, it } from "vitest";

import type { ArcSourceEvidence } from "../../shared/api/arcAuthoring";
import type { ArcArtifactFamily, ArcProposalVersion } from "../../shared/api/contextplane";
import {
  buildArcProposalPatch,
  createApplicabilityFormValue,
  createArcSemanticsDefaults,
  createDirectiveFormValue,
  sha256Hex,
} from "./arcSemantics";

const artifact: ArcArtifactFamily = {
  active_revision_id: null,
  artifact_id: "10000000-0000-4000-8000-000000000001",
  created_at: "2026-08-12T10:00:00Z",
  created_by: { issuer: "https://issuer.example", subject: "actor-a" },
  kind: "policy",
  owning_scope: "tenant",
  slug: "production-safeguards",
  target_tenant_id: "20000000-0000-4000-8000-000000000001",
  title: "Production safeguards",
};

const source: ArcSourceEvidence = {
  admission_method: "connector_fetch",
  admitted_at: "2026-08-12T10:00:00Z",
  connector_id: "policy-repository",
  expires_at: "2027-08-12T10:00:00Z",
  next_check_at: null,
  policy_id: "policy-v1",
  source_content_bytes: 128,
  source_content_digest: "b".repeat(64),
  source_content_type: "text/markdown",
  source_evidence_id: "30000000-0000-4000-8000-000000000001",
  source_revision_locator: "commit:abc123",
  source_system: "policy-repository",
  status: "current",
  status_checked_at: "2026-08-12T10:00:00Z",
  verification_method: "detached_signature",
  verified_at: "2026-08-12T10:00:00Z",
  verifier_id: "40000000-0000-4000-8000-000000000001",
};

const proposal: ArcProposalVersion = {
  allowed_transitions: ["submitted"],
  artifact_id: artifact.artifact_id,
  available_actions: ["edit"],
  created_at: "2026-08-12T10:05:00Z",
  frozen_at: null,
  operational_integrity_state: "verified",
  proposal_id: "50000000-0000-4000-8000-000000000001",
  proposal_version: 1,
  reason_codes: [],
  reviewed_baseline_revision_id: null,
  revision_id: null,
  risk_algorithm_version: null,
  risk_classification: null,
  source_evidence_id: source.source_evidence_id,
  state: "open",
};

describe("ARC candidate semantics", () => {
  it("hashes normalized text with the service's SHA-256 representation", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    await expect(sha256Hex("e\u0301")).resolves.toBe(await sha256Hex("é"));
  });

  it("builds source-backed citation semantics and human-reviewed applicability", async () => {
    const values = createArcSemanticsDefaults(artifact.target_tenant_id ?? "");
    values.reviewExpiresAt = "2026-12-01T10:00";
    values.sourceApprovalEvidenceDigest = "a".repeat(64);
    values.directives[0] = {
      ...createDirectiveFormValue(),
      directiveId: "60000000-0000-4000-8000-000000000001",
      sourceAnchor: "section-4.2",
      statement: "Verify approval before deployment.",
    };
    values.applicability[0] = {
      ...createApplicabilityFormValue(artifact.target_tenant_id ?? ""),
      actionClasses: "production_change, data_write",
      environments: "production",
      ruleId: "70000000-0000-4000-8000-000000000001",
    };

    const patch = await buildArcProposalPatch(values, artifact, source, proposal);

    expect(patch.semantics).toMatchObject({
      artifact_id: artifact.artifact_id,
      source_content_digest: source.source_content_digest,
      source_revision_locator: source.source_revision_locator,
      source_system: source.source_system,
    });
    expect(patch.semantics.directives[0]).toMatchObject({
      compact_statement_plaintext: "Verify approval before deployment.",
      conflict_key_namespace: null,
      conflict_subject_digest: null,
      directive_type: "citation_only",
      source_anchor: "section-4.2",
    });
    expect(patch.semantics.applicability[0]).toMatchObject({
      action_classes: ["production_change", "data_write"],
      environments: ["production"],
      scope: "tenant",
      target_tenant_id: artifact.target_tenant_id,
    });
    expect(patch.field_provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          excerpt_digest: patch.semantics.directives[0]?.compact_statement_plaintext_digest,
          field_path: "directives[0].compact_statement_plaintext",
          provenance_class: "source_backed",
          source_evidence_id: source.source_evidence_id,
        }),
        expect.objectContaining({
          author_role: "policy_author",
          field_path: "applicability[0]",
          provenance_class: "human_judgment",
        }),
      ]),
    );
  });

  it("derives a complete conflict key for verify-before-action directives", async () => {
    const values = createArcSemanticsDefaults(artifact.target_tenant_id ?? "");
    values.reviewExpiresAt = "2026-12-01T10:00";
    values.sourceApprovalEvidenceDigest = "a".repeat(64);
    values.directives[0] = {
      ...createDirectiveFormValue(),
      acceptedVerifierClasses: "change-system, security-review",
      acceptedVerifierIds: "verifier-a",
      conflictActionClass: "production_change",
      conflictConstraintOperator: "equals",
      conflictConstraintValue: "approved",
      conflictModality: "must",
      conflictNamespace: "deployment",
      conflictOperation: "deploy",
      conflictSubjectSelector: "service:payments",
      conflictTargetSelector: "environment:production",
      delegableException: true,
      directiveId: "80000000-0000-4000-8000-000000000001",
      directiveType: "verify_before_action",
      requiredEvidenceType: "change_approval",
      satisfactionMode: "signed_result",
      sourceAnchor: "section-5",
      statement: "Require signed approval.",
      verificationMaxAgeSeconds: 900,
    };

    const patch = await buildArcProposalPatch(values, artifact, source, proposal);

    expect(patch.semantics.directives[0]).toMatchObject({
      accepted_verifier_classes: ["change-system", "security-review"],
      accepted_verifier_ids: ["verifier-a"],
      conflict_key_action_class: "production_change",
      conflict_key_namespace: "deployment",
      conflict_key_subject_selector: "service:payments",
      conflict_key_target_selector: "environment:production",
      delegable_exception: true,
      directive_type: "verify_before_action",
      required_evidence_type: "change_approval",
      satisfaction_mode: "signed_result",
      verification_max_age_seconds: 900,
    });
    expect(patch.semantics.directives[0]?.conflict_subject_digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
