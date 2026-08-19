import type { AdminOperationMethod } from "../../shared/api";

export type AdminOperationGroupId =
  | "arc-trust"
  | "audit"
  | "graph-schema"
  | "integrations"
  | "lifecycle"
  | "memory"
  | "operations"
  | "privacy"
  | "usage";

export interface AdminQueryParameter {
  defaultValue?: string;
  name: string;
}

export interface AdminOperationDefinition {
  availability?: "available" | "service-pending";
  bodyExample?: Readonly<Record<string, unknown>>;
  destructive?: boolean;
  group: AdminOperationGroupId;
  id: string;
  idempotentCreate?: boolean;
  method: AdminOperationMethod;
  path: string;
  pathParameters?: readonly string[];
  queryParameters?: readonly AdminQueryParameter[];
  requestSchema?: string;
  scope: "operator" | "tenant";
  title: string;
}

export interface AdminOperationGroup {
  description: string;
  id: AdminOperationGroupId;
  scope: "Deployment operator" | "Tenant administrator";
  title: string;
}

export const ADMIN_OPERATION_GROUPS = [
  {
    id: "operations",
    title: "Service operations",
    description: "Inspect deployment health, sync sources, and evidence from synchronization runs.",
    scope: "Tenant administrator",
  },
  {
    id: "audit",
    title: "Audit evidence",
    description:
      "Query attributable administrative and data-plane events without exposing raw logs.",
    scope: "Tenant administrator",
  },
  {
    id: "usage",
    title: "Usage intelligence",
    description: "Review adoption, capability demand, tool rankings, and daily request volume.",
    scope: "Tenant administrator",
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Manage external-system links and memory extraction strategies.",
    scope: "Tenant administrator",
  },
  {
    id: "graph-schema",
    title: "Graph schema",
    description: "Govern entity types, controlled vocabularies, and relationship property schemas.",
    scope: "Tenant administrator",
  },
  {
    id: "memory",
    title: "Memory governance",
    description:
      "Control source admission, calibration, automatic promotion, and breaker recovery.",
    scope: "Tenant administrator",
  },
  {
    id: "privacy",
    title: "Privacy controls",
    description: "Configure PII detection and execute attributable personal-data erasure.",
    scope: "Tenant administrator",
  },
  {
    id: "lifecycle",
    title: "Entity lifecycle",
    description: "Version progression definitions and issue narrowly scoped progression overrides.",
    scope: "Tenant administrator",
  },
  {
    id: "arc-trust",
    title: "ARC trust operations",
    description:
      "Operate deployment-wide approval trust, exceptions, source admission, and revisions.",
    scope: "Deployment operator",
  },
] as const satisfies readonly AdminOperationGroup[];

const operation = (
  group: AdminOperationGroupId,
  scope: "operator" | "tenant",
  method: AdminOperationMethod,
  path: string,
  title: string,
  options: Omit<
    AdminOperationDefinition,
    "group" | "id" | "method" | "path" | "scope" | "title"
  > = {},
): AdminOperationDefinition => ({
  group,
  id: `${method} ${path}`,
  method,
  path,
  scope,
  title,
  ...options,
});

const example = {
  allowlistPredicate: { predicate: "source.authority_tier == 'authoritative'" },
  calibrationRefit: {
    model_id: "text-embedding-3-small",
    provider_id: "openai",
    strategy_id: "default",
  },
  entityTypePatch: { is_advisory: false },
  entityTypeSchema: {
    entity_type: "capability",
    is_advisory: true,
    json_schema: { type: "object" },
  },
  externalSystem: {
    description: "Issue tracker",
    display_name: "Example tracker",
    slug: "tracker",
    url_template: "https://tracker.example/items/{external_id}",
  },
  piiFieldPolicy: { field_type: "email", policy: "redact" },
  piiPattern: {
    category: "identifier",
    is_enabled: true,
    name: "Internal identifier",
    regex: "ID-[0-9]+",
  },
  piiPatternPatch: { is_enabled: false },
  progressionDefinition: {
    definition: { initial_state: "draft", states: ["draft", "active"] },
    entity_type: "service",
    is_advisory: true,
  },
  progressionDefinitionUpdate: {
    definition: { initial_state: "draft", states: ["draft", "active"] },
    dry_run: true,
  },
  progressionOverride: {
    bypass_skip_rules: false,
    from_state: "draft",
    gate_id: "manual-review",
    reason: "Approved exception",
    to_state: "active",
  },
  promotionPolicy: {
    always_review: ["security"],
    blast_radius_threshold: 10,
    confidence_floor: 0.9,
  },
  sourceDeclare: {
    authority_tier: "authoritative",
    ingest_ceiling: 1000,
    may_provision_entities: false,
    source_id: "",
    window_seconds: 3600,
  },
  sourcePatch: { ingest_ceiling: 1000, may_provision_entities: false, window_seconds: 3600 },
  strategyUpdate: { confidence_floor: 0.85, is_enabled: true },
  syncSource: { config: {}, display_name: "Example source", source_type: "github" },
  syncSourcePatch: { display_name: "Updated source", is_active: true },
  vocabularyValue: { value: "production" },
  vocabularyValuePatch: { deprecated_at: "2026-01-01T00:00:00Z" },
} as const;

const arcExample = {
  activate: {},
  approveException: {
    approval: {
      approval_timestamp: "2026-01-01T00:00:00Z",
      approval_verifier_id: "",
      approved_payload_digest: "0000000000000000000000000000000000000000000000000000000000000000",
      approving_principal: "",
      approving_role: "",
      audit_log_reference: "",
      evidence_id: "",
    },
    effective_from: "2026-01-01T00:00:00Z",
    exception_statement: "Narrowly scoped exception",
    higher_scope_directive_id: "",
    higher_scope_revision_id: "",
    justification: "Reviewed operational need",
    lower_scope_kind: "tenant",
    replacement_conflict_descriptor: {},
  },
  attachEvidence: { evidence_id: "" },
  enrollmentChallenge: {
    binding_kind: "exact_principal",
    evidence_types: ["artifact_activation"],
    owning_scope: "global",
    public_key_base64: "",
    signature_algorithm: "Ed25519",
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: "2027-01-01T00:00:00Z",
  },
  reason: { reason: "No longer approved" },
  reasonCode: { note: "Trust withdrawn after review", reason_code: "operator_revoked" },
  replayCorpus: { corpus_digest: "sha256:", generator_version: "1.0.0", owning_scope: "global" },
  revokeVerifier: { reason: "Approval was entered in error" },
  sourceConnector: {
    allowed_hosts: ["docs.example.com"],
    allowed_media_types: ["text/markdown"],
    allowed_schemes: ["https"],
    allowed_verifier_ids: [],
    connector_id: "documentation",
    max_bytes: 10485760,
    owning_scope: "global",
  },
  uploadPolicy: {
    allowed_media_types: ["text/markdown"],
    allowed_verifier_ids: [],
    max_bytes: 10485760,
    owning_scope: "global",
    policy_id: "trusted-documents",
  },
  verifierRegistration: { enrollment_challenge_id: "", proof: {} },
} as const;

export const ADMIN_OPERATIONS: readonly AdminOperationDefinition[] = [
  operation(
    "privacy",
    "tenant",
    "DELETE",
    "/v1/admin/actors/{actor_id}/personal-data",
    "Erase an actor's personal data",
    { destructive: true, pathParameters: ["actor_id"] },
  ),
  operation("audit", "tenant", "GET", "/v1/admin/audit", "Query audit evidence", {
    queryParameters: [
      { name: "actor_id" },
      { name: "action" },
      { name: "target_type" },
      { name: "target_id" },
      { name: "from" },
      { name: "to" },
      { name: "cursor" },
      { name: "page_size", defaultValue: "50" },
    ],
  }),

  operation("graph-schema", "tenant", "GET", "/v1/admin/entity-types", "List entity type schemas"),
  operation(
    "graph-schema",
    "tenant",
    "POST",
    "/v1/admin/entity-types",
    "Register an entity type schema",
    {
      bodyExample: example.entityTypeSchema,
      idempotentCreate: true,
      requestSchema: "EntityTypeSchemaCreate",
    },
  ),
  operation(
    "graph-schema",
    "tenant",
    "GET",
    "/v1/admin/entity-types/{entity_type}",
    "Inspect an entity type schema",
    { pathParameters: ["entity_type"] },
  ),
  operation(
    "graph-schema",
    "tenant",
    "PATCH",
    "/v1/admin/entity-types/{entity_type}",
    "Change entity type schema enforcement",
    {
      bodyExample: example.entityTypePatch,
      pathParameters: ["entity_type"],
      requestSchema: "EntityTypeSchemaPatch",
    },
  ),
  operation(
    "graph-schema",
    "tenant",
    "GET",
    "/v1/admin/edge-property-schemas",
    "List relationship property schemas",
    { availability: "service-pending" },
  ),
  operation(
    "graph-schema",
    "tenant",
    "POST",
    "/v1/admin/edge-property-schemas",
    "Register a relationship property schema",
    { availability: "service-pending" },
  ),
  operation(
    "graph-schema",
    "tenant",
    "PATCH",
    "/v1/admin/edge-property-schemas/{schema_id}",
    "Supersede a relationship property schema",
    { availability: "service-pending", pathParameters: ["schema_id"] },
  ),

  operation("integrations", "tenant", "GET", "/v1/admin/external-systems", "List external systems"),
  operation(
    "integrations",
    "tenant",
    "POST",
    "/v1/admin/external-systems",
    "Register an external system",
    {
      bodyExample: example.externalSystem,
      idempotentCreate: true,
      requestSchema: "ExternalSystemCreate",
    },
  ),
  operation(
    "integrations",
    "tenant",
    "DELETE",
    "/v1/admin/external-systems/{slug}",
    "Remove an external system",
    { destructive: true, pathParameters: ["slug"] },
  ),
  operation(
    "integrations",
    "tenant",
    "GET",
    "/v1/admin/extraction-strategies",
    "List extraction strategies",
  ),
  operation(
    "integrations",
    "tenant",
    "GET",
    "/v1/admin/extraction-strategies/conformance-policy",
    "Inspect extraction conformance policy",
  ),
  operation(
    "integrations",
    "tenant",
    "PATCH",
    "/v1/admin/extraction-strategies/{strategy_id}",
    "Update an extraction strategy",
    {
      bodyExample: example.strategyUpdate,
      pathParameters: ["strategy_id"],
      requestSchema: "StrategyUpdate",
    },
  ),

  operation(
    "memory",
    "tenant",
    "GET",
    "/v1/admin/memory-autopromote-allowlist",
    "Inspect automatic-promotion allowlist",
  ),
  operation(
    "memory",
    "tenant",
    "POST",
    "/v1/admin/memory-autopromote-allowlist:allow",
    "Allow an automatic-promotion predicate",
    { bodyExample: example.allowlistPredicate, requestSchema: "AllowlistPredicateRequest" },
  ),
  operation(
    "memory",
    "tenant",
    "POST",
    "/v1/admin/memory-autopromote-allowlist:revoke",
    "Revoke an automatic-promotion predicate",
    {
      bodyExample: example.allowlistPredicate,
      destructive: true,
      requestSchema: "AllowlistPredicateRequest",
    },
  ),
  operation("memory", "tenant", "GET", "/v1/admin/memory-calibration", "List calibration mappings"),
  operation(
    "memory",
    "tenant",
    "POST",
    "/v1/admin/memory-calibration:refit",
    "Refit a calibration mapping",
    { bodyExample: example.calibrationRefit, requestSchema: "CalibrationRefitRequest" },
  ),
  operation(
    "memory",
    "tenant",
    "GET",
    "/v1/admin/memory-promotion-policy",
    "Inspect memory promotion policy",
  ),
  operation(
    "memory",
    "tenant",
    "PUT",
    "/v1/admin/memory-promotion-policy",
    "Replace memory promotion policy",
    { bodyExample: example.promotionPolicy, requestSchema: "PromotionPolicyRequest" },
  ),
  operation("memory", "tenant", "GET", "/v1/admin/memory-sources", "List memory source policies"),
  operation("memory", "tenant", "POST", "/v1/admin/memory-sources", "Declare a memory source", {
    bodyExample: example.sourceDeclare,
    requestSchema: "SourceDeclareRequest",
  }),
  operation(
    "memory",
    "tenant",
    "PATCH",
    "/v1/admin/memory-sources/{source_id}",
    "Update a memory source policy",
    {
      bodyExample: example.sourcePatch,
      pathParameters: ["source_id"],
      requestSchema: "SourcePolicyPatch",
    },
  ),
  operation(
    "memory",
    "tenant",
    "POST",
    "/v1/admin/memory-sources/{source_id}:reset-breaker",
    "Reset a memory source breaker",
    { pathParameters: ["source_id"] },
  ),

  operation(
    "operations",
    "tenant",
    "GET",
    "/v1/admin/operational-health",
    "Inspect operational health",
  ),
  operation("privacy", "tenant", "GET", "/v1/admin/pii-field-policies", "List PII field policies"),
  operation(
    "privacy",
    "tenant",
    "POST",
    "/v1/admin/pii-field-policies",
    "Create a PII field policy",
    {
      bodyExample: example.piiFieldPolicy,
      idempotentCreate: true,
      requestSchema: "PiiFieldPolicyCreate",
    },
  ),
  operation(
    "privacy",
    "tenant",
    "DELETE",
    "/v1/admin/pii-field-policies/{policy_id}",
    "Delete a PII field policy",
    { destructive: true, pathParameters: ["policy_id"] },
  ),
  operation("privacy", "tenant", "GET", "/v1/admin/pii-patterns", "List PII detection patterns"),
  operation(
    "privacy",
    "tenant",
    "POST",
    "/v1/admin/pii-patterns",
    "Create a PII detection pattern",
    { bodyExample: example.piiPattern, idempotentCreate: true, requestSchema: "PiiPatternCreate" },
  ),
  operation(
    "privacy",
    "tenant",
    "DELETE",
    "/v1/admin/pii-patterns/{pattern_id}",
    "Delete a PII detection pattern",
    { destructive: true, pathParameters: ["pattern_id"] },
  ),
  operation(
    "privacy",
    "tenant",
    "PATCH",
    "/v1/admin/pii-patterns/{pattern_id}",
    "Update a PII detection pattern",
    {
      bodyExample: example.piiPatternPatch,
      pathParameters: ["pattern_id"],
      requestSchema: "PiiPatternPatch",
    },
  ),

  operation("operations", "tenant", "GET", "/v1/admin/sync-runs", "List synchronization runs", {
    queryParameters: [{ name: "source_id" }, { name: "status" }, { name: "from" }, { name: "to" }],
  }),
  operation(
    "operations",
    "tenant",
    "GET",
    "/v1/admin/sync-runs/{sync_run_id}",
    "Inspect a synchronization run",
    { pathParameters: ["sync_run_id"] },
  ),
  operation(
    "operations",
    "tenant",
    "GET",
    "/v1/admin/sync-runs/{sync_run_id}/superseded",
    "Inspect superseded facts",
    { pathParameters: ["sync_run_id"] },
  ),
  operation(
    "operations",
    "tenant",
    "GET",
    "/v1/admin/sync-sources",
    "List synchronization sources",
    { queryParameters: [{ name: "active_only", defaultValue: "true" }] },
  ),
  operation(
    "operations",
    "tenant",
    "POST",
    "/v1/admin/sync-sources",
    "Create a synchronization source",
    { bodyExample: example.syncSource, idempotentCreate: true, requestSchema: "SyncSourceCreate" },
  ),
  operation(
    "operations",
    "tenant",
    "DELETE",
    "/v1/admin/sync-sources/{source_id}",
    "Delete a synchronization source",
    { destructive: true, pathParameters: ["source_id"] },
  ),
  operation(
    "operations",
    "tenant",
    "GET",
    "/v1/admin/sync-sources/{source_id}",
    "Inspect a synchronization source",
    { pathParameters: ["source_id"] },
  ),
  operation(
    "operations",
    "tenant",
    "PATCH",
    "/v1/admin/sync-sources/{source_id}",
    "Update a synchronization source",
    {
      bodyExample: example.syncSourcePatch,
      pathParameters: ["source_id"],
      requestSchema: "SyncSourcePatch",
    },
  ),
  operation(
    "operations",
    "tenant",
    "POST",
    "/v1/admin/sync-sources/{source_id}/trigger",
    "Trigger synchronization",
    { idempotentCreate: true, pathParameters: ["source_id"] },
  ),

  operation(
    "lifecycle",
    "tenant",
    "GET",
    "/v1/admin/tenants/{tenant_id}/entities/{entity_id}/progression-overrides",
    "List progression overrides",
    {
      pathParameters: ["tenant_id", "entity_id"],
      queryParameters: [
        { name: "consumed" },
        { name: "expired" },
        { name: "from_state" },
        { name: "to_state" },
      ],
    },
  ),
  operation(
    "lifecycle",
    "tenant",
    "POST",
    "/v1/admin/tenants/{tenant_id}/entities/{entity_id}/progression-overrides",
    "Create a progression override",
    {
      bodyExample: example.progressionOverride,
      pathParameters: ["tenant_id", "entity_id"],
      requestSchema: "ProgressionOverrideCreate",
    },
  ),
  operation(
    "lifecycle",
    "tenant",
    "GET",
    "/v1/admin/tenants/{tenant_id}/progression-definitions",
    "List progression definitions",
    { pathParameters: ["tenant_id"] },
  ),
  operation(
    "lifecycle",
    "tenant",
    "POST",
    "/v1/admin/tenants/{tenant_id}/progression-definitions",
    "Create a progression definition",
    {
      bodyExample: example.progressionDefinition,
      pathParameters: ["tenant_id"],
      requestSchema: "ProgressionDefinitionCreate",
    },
  ),
  operation(
    "lifecycle",
    "tenant",
    "DELETE",
    "/v1/admin/tenants/{tenant_id}/progression-definitions/{progression_id}",
    "Retire a progression definition",
    { destructive: true, pathParameters: ["tenant_id", "progression_id"] },
  ),
  operation(
    "lifecycle",
    "tenant",
    "GET",
    "/v1/admin/tenants/{tenant_id}/progression-definitions/{progression_id}",
    "Inspect a progression definition",
    { pathParameters: ["tenant_id", "progression_id"] },
  ),
  operation(
    "lifecycle",
    "tenant",
    "PUT",
    "/v1/admin/tenants/{tenant_id}/progression-definitions/{progression_id}",
    "Supersede a progression definition",
    {
      bodyExample: example.progressionDefinitionUpdate,
      pathParameters: ["tenant_id", "progression_id"],
      requestSchema: "ProgressionDefinitionUpdate",
    },
  ),

  operation("usage", "tenant", "GET", "/v1/admin/usage/capabilities", "Rank capability usage", {
    queryParameters: [{ name: "from" }, { name: "to" }, { name: "limit", defaultValue: "20" }],
  }),
  operation("usage", "tenant", "GET", "/v1/admin/usage/series", "Inspect daily usage series", {
    queryParameters: [{ name: "from" }, { name: "to" }, { name: "surface" }],
  }),
  operation("usage", "tenant", "GET", "/v1/admin/usage/summary", "Inspect usage summary", {
    queryParameters: [{ name: "from" }, { name: "to" }],
  }),
  operation("usage", "tenant", "GET", "/v1/admin/usage/tools", "Rank tool usage", {
    queryParameters: [{ name: "from" }, { name: "to" }, { name: "limit", defaultValue: "20" }],
  }),

  operation(
    "graph-schema",
    "tenant",
    "GET",
    "/v1/admin/vocabularies/{kind}",
    "List controlled vocabulary values",
    { pathParameters: ["kind"] },
  ),
  operation(
    "graph-schema",
    "tenant",
    "POST",
    "/v1/admin/vocabularies/{kind}",
    "Add a controlled vocabulary value",
    {
      bodyExample: example.vocabularyValue,
      idempotentCreate: true,
      pathParameters: ["kind"],
      requestSchema: "VocabularyValueCreate",
    },
  ),
  operation(
    "graph-schema",
    "tenant",
    "DELETE",
    "/v1/admin/vocabularies/{kind}/{value}",
    "Delete a controlled vocabulary value",
    { destructive: true, pathParameters: ["kind", "value"] },
  ),
  operation(
    "graph-schema",
    "tenant",
    "PATCH",
    "/v1/admin/vocabularies/{kind}/{value}",
    "Deprecate a controlled vocabulary value",
    {
      bodyExample: example.vocabularyValuePatch,
      pathParameters: ["kind", "value"],
      requestSchema: "VocabularyValuePatch",
    },
  ),

  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/approval-evidence/{evidence_id}/revoke",
    "Revoke approval evidence",
    {
      bodyExample: arcExample.revokeVerifier,
      destructive: true,
      pathParameters: ["evidence_id"],
      requestSchema: "RevokeVerifierRequest",
    },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/approval-verifiers",
    "Register an approval verifier",
    { bodyExample: arcExample.verifierRegistration, requestSchema: "VerifierRegistrationRequest" },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/approval-verifiers/enrollment-challenges",
    "Create a verifier enrollment challenge",
    { bodyExample: arcExample.enrollmentChallenge, requestSchema: "EnrollmentChallengeRequest" },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/approval-verifiers/{approval_verifier_id}/revoke",
    "Revoke an approval verifier",
    {
      bodyExample: arcExample.reasonCode,
      destructive: true,
      pathParameters: ["approval_verifier_id"],
      requestSchema: "ReasonRequest",
    },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/exceptions",
    "Approve a context exception",
    { bodyExample: arcExample.approveException, requestSchema: "ApproveExceptionRequest" },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/exceptions/{exception_id}/revoke",
    "Revoke a context exception",
    {
      bodyExample: arcExample.reason,
      destructive: true,
      pathParameters: ["exception_id"],
      requestSchema: "RevokeRequest",
    },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/observation-replay-corpora",
    "Approve an observation replay corpus",
    { bodyExample: arcExample.replayCorpus, requestSchema: "ReplayCorpusApprovalRequest" },
  ),
  operation(
    "arc-trust",
    "operator",
    "GET",
    "/v1/arc/admin/operator-identity",
    "Verify deployment operator identity",
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/revisions/{revision_id}/activate",
    "Activate an ARC revision",
    {
      bodyExample: arcExample.activate,
      pathParameters: ["revision_id"],
      requestSchema: "AdminActivateRequest",
    },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/revisions/{revision_id}/approval-evidence",
    "Attach approval evidence",
    {
      bodyExample: arcExample.attachEvidence,
      pathParameters: ["revision_id"],
      requestSchema: "AttachEvidenceRequest",
    },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/revisions/{revision_id}/invalidate",
    "Invalidate an ARC revision",
    {
      bodyExample: arcExample.reason,
      destructive: true,
      pathParameters: ["revision_id"],
      requestSchema: "RevokeRequest",
    },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/revisions/{revision_id}/revoke",
    "Revoke an ARC revision",
    {
      bodyExample: arcExample.reason,
      destructive: true,
      pathParameters: ["revision_id"],
      requestSchema: "RevokeRequest",
    },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/source-connectors",
    "Register an ARC source connector",
    { bodyExample: arcExample.sourceConnector, requestSchema: "SourceConnectorRegistration" },
  ),
  operation(
    "arc-trust",
    "operator",
    "POST",
    "/v1/arc/admin/source-upload-policies",
    "Register an ARC upload policy",
    { bodyExample: arcExample.uploadPolicy, requestSchema: "SourceUploadPolicyRegistration" },
  ),
];
