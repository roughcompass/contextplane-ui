import type {
  ArcArtifactFamily,
  ArcProposalPatchRequest,
  ArcProposalVersion,
} from "../../shared/api/contextplane";
import type { ArcSourceEvidence } from "../../shared/api/arcAuthoring";

export interface ArcDirectiveFormValue {
  acceptedVerifierClasses: string;
  acceptedVerifierIds: string;
  conflictActionClass: string;
  conflictConstraintOperator: string;
  conflictConstraintValue: string;
  conflictModality: string;
  conflictNamespace: string;
  conflictOperation: string;
  conflictSubjectSelector: string;
  conflictTargetSelector: string;
  delegableException: boolean;
  directiveId: string;
  directiveType: "citation_only" | "verify_before_action";
  requiredEvidenceType: string;
  satisfactionMode: "authorized_retrieval" | "signed_result";
  sourceAnchor: string;
  statement: string;
  verificationMaxAgeSeconds: number;
}

export interface ArcApplicabilityFormValue {
  actionClasses: string;
  capabilityIds: string;
  capabilityLabels: string;
  dataSensitivityTiers: string;
  domainIds: string;
  effectiveFrom: string;
  effectiveUntil: string;
  environments: string;
  intentKinds: string;
  isMandatory: boolean;
  ruleId: string;
  scope: "capability" | "domain" | "global" | "intent" | "tenant";
  targetTenantId: string;
}

export interface ArcSemanticsFormValues {
  applicability: ArcApplicabilityFormValue[];
  approvedRetentionFloorDays: number;
  contentClassification: "confidential" | "internal" | "public";
  detailAudience: "agent_and_human" | "agent_only" | "human_only";
  directives: ArcDirectiveFormValue[];
  freshnessBasis: "connector_verified" | "revision_pinned_only";
  reviewExpiresAt: string;
  revisionId: string;
  sourceApprovalEvidenceDigest: string;
  visibility: "restricted" | "standard";
}

export function createDirectiveFormValue(): ArcDirectiveFormValue {
  return {
    acceptedVerifierClasses: "",
    acceptedVerifierIds: "",
    conflictActionClass: "",
    conflictConstraintOperator: "equals",
    conflictConstraintValue: "",
    conflictModality: "must",
    conflictNamespace: "policy",
    conflictOperation: "execute",
    conflictSubjectSelector: "",
    conflictTargetSelector: "",
    delegableException: false,
    directiveId: crypto.randomUUID(),
    directiveType: "citation_only",
    requiredEvidenceType: "",
    satisfactionMode: "authorized_retrieval",
    sourceAnchor: "",
    statement: "",
    verificationMaxAgeSeconds: 3600,
  };
}

export function createApplicabilityFormValue(tenantId: string): ArcApplicabilityFormValue {
  return {
    actionClasses: "",
    capabilityIds: "",
    capabilityLabels: "",
    dataSensitivityTiers: "",
    domainIds: "",
    effectiveFrom: "",
    effectiveUntil: "",
    environments: "",
    intentKinds: "",
    isMandatory: true,
    ruleId: crypto.randomUUID(),
    scope: "tenant",
    targetTenantId: tenantId,
  };
}

export function createArcSemanticsDefaults(tenantId: string): ArcSemanticsFormValues {
  const reviewDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  return {
    applicability: [createApplicabilityFormValue(tenantId)],
    approvedRetentionFloorDays: 30,
    contentClassification: "internal",
    detailAudience: "agent_and_human",
    directives: [createDirectiveFormValue()],
    freshnessBasis: "revision_pinned_only",
    reviewExpiresAt: reviewDate.toISOString().slice(0, 16),
    revisionId: crypto.randomUUID(),
    sourceApprovalEvidenceDigest: "",
    visibility: "standard",
  };
}

function commaSeparated(value: string): string[] | null {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function localDateTimeToIso(value: string): string {
  return new Date(value).toISOString();
}

function lengthPrefixed(values: readonly string[]): Uint8Array {
  const encoder = new TextEncoder();
  const encoded = values.map((value) => encoder.encode(value));
  const length = encoded.reduce((total, part) => total + 4 + part.byteLength, 0);
  const output = new Uint8Array(length);
  const view = new DataView(output.buffer);
  let offset = 0;
  for (const part of encoded) {
    view.setUint32(offset, part.byteLength, false);
    offset += 4;
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value.normalize("NFC")) : value;
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function conflictSubjectDigest(value: ArcDirectiveFormValue): Promise<string> {
  return sha256Hex(
    lengthPrefixed([
      "arc_conflict_v1",
      value.conflictNamespace,
      value.conflictSubjectSelector,
      value.conflictOperation,
      value.conflictActionClass,
      value.conflictTargetSelector,
    ]),
  );
}

export async function buildArcProposalPatch(
  values: ArcSemanticsFormValues,
  artifact: ArcArtifactFamily,
  source: ArcSourceEvidence,
  proposal: ArcProposalVersion,
): Promise<ArcProposalPatchRequest> {
  const createdAt = new Date().toISOString();
  const directives = await Promise.all(
    values.directives.map(async (directive) => {
      const actionProtecting = directive.directiveType === "verify_before_action";
      return {
        accepted_verifier_classes: actionProtecting
          ? commaSeparated(directive.acceptedVerifierClasses)
          : null,
        accepted_verifier_ids: actionProtecting
          ? commaSeparated(directive.acceptedVerifierIds)
          : null,
        compact_statement_plaintext: directive.statement.normalize("NFC"),
        compact_statement_plaintext_digest: await sha256Hex(directive.statement),
        conflict_key_action_class: actionProtecting ? directive.conflictActionClass : null,
        conflict_key_constraint_operator: actionProtecting
          ? directive.conflictConstraintOperator
          : null,
        conflict_key_constraint_value: actionProtecting ? directive.conflictConstraintValue : null,
        conflict_key_modality: actionProtecting ? directive.conflictModality : null,
        conflict_key_namespace: actionProtecting ? directive.conflictNamespace : null,
        conflict_key_operation: actionProtecting ? directive.conflictOperation : null,
        conflict_key_schema_version: 1,
        conflict_key_subject_selector: actionProtecting ? directive.conflictSubjectSelector : null,
        conflict_key_target_selector: actionProtecting ? directive.conflictTargetSelector : null,
        conflict_subject_digest: actionProtecting ? await conflictSubjectDigest(directive) : null,
        created_at: createdAt,
        delegable_exception: directive.delegableException,
        directive_id: directive.directiveId,
        directive_type: directive.directiveType,
        required_evidence_type: actionProtecting ? directive.requiredEvidenceType || null : null,
        satisfaction_mode: actionProtecting ? directive.satisfactionMode : null,
        source_anchor: directive.sourceAnchor.normalize("NFC"),
        verification_max_age_seconds: actionProtecting ? directive.verificationMaxAgeSeconds : null,
      };
    }),
  );

  const applicability = values.applicability.map((rule) => ({
    action_classes: commaSeparated(rule.actionClasses),
    capability_ids: commaSeparated(rule.capabilityIds),
    capability_labels: commaSeparated(rule.capabilityLabels),
    data_sensitivity_tiers: commaSeparated(rule.dataSensitivityTiers),
    domain_ids: commaSeparated(rule.domainIds),
    effective_from: rule.effectiveFrom ? localDateTimeToIso(rule.effectiveFrom) : null,
    effective_until: rule.effectiveUntil ? localDateTimeToIso(rule.effectiveUntil) : null,
    environments: commaSeparated(rule.environments),
    intent_kinds: commaSeparated(rule.intentKinds),
    is_mandatory: rule.isMandatory,
    rule_id: rule.ruleId,
    scope: rule.scope,
    target_tenant_id: rule.scope === "tenant" ? rule.targetTenantId : null,
  }));

  const fieldProvenance = await Promise.all([
    ...values.directives.map(async (directive, index) => ({
      excerpt_digest: await sha256Hex(directive.statement),
      field_path: `directives[${index}].compact_statement_plaintext`,
      provenance_class: "source_backed" as const,
      source_anchor: directive.sourceAnchor,
      source_evidence_id: source.source_evidence_id,
    })),
    ...values.applicability.map((_, index) => ({
      author_role: "policy_author",
      field_path: `applicability[${index}]`,
      provenance_class: "human_judgment" as const,
    })),
  ]);

  return {
    field_provenance: fieldProvenance,
    semantics: {
      applicability,
      applicability_baseline_version: "v1",
      approved_retention_floor_days: values.approvedRetentionFloorDays,
      artifact_id: artifact.artifact_id,
      content_classification: values.contentClassification,
      detail_audience: values.detailAudience,
      directives,
      initial_freshness_basis: values.freshnessBasis,
      kind: "directive_bundle",
      materialiser_profile: "arc-default",
      materialiser_version: "1",
      owning_scope: artifact.owning_scope,
      owning_tenant_id: artifact.target_tenant_id ?? null,
      profile: "arc_artifact_semantics_v2",
      projection_schema_version: 2,
      review_expires_at: localDateTimeToIso(values.reviewExpiresAt),
      reviewed_baseline_revision_id: proposal.reviewed_baseline_revision_id ?? null,
      revision_id: values.revisionId,
      source_approval_evidence_digest: values.sourceApprovalEvidenceDigest,
      source_content_digest: source.source_content_digest,
      source_revision_locator: source.source_revision_locator,
      source_system: source.source_system,
      visibility: values.visibility,
    },
  };
}
