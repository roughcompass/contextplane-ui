import type { AdminOperationMethod } from "../../shared/api";

export type TenantOperationGroupId =
  | "activity"
  | "arc"
  | "catalog"
  | "context"
  | "coordination"
  | "identity"
  | "memory"
  | "relationships"
  | "workspaces";

export interface TenantQueryParameter {
  defaultValue?: string;
  name: string;
}

export interface TenantOperationDefinition {
  availability?: "available" | "guided-only";
  bodyExample?: Readonly<Record<string, unknown>>;
  confirmationRequired?: boolean;
  group: TenantOperationGroupId;
  id: string;
  idempotentCreate?: boolean;
  method: AdminOperationMethod;
  path: string;
  pathParameters?: readonly string[];
  queryParameters?: readonly TenantQueryParameter[];
  requestSchema?: string;
  title: string;
}

export interface TenantOperationGroup {
  description: string;
  guidedHref: string;
  id: TenantOperationGroupId;
  title: string;
}

export const TENANT_OPERATION_GROUPS = [
  {
    id: "catalog",
    title: "Catalog records",
    description:
      "Discover, create, and maintain capabilities, interfaces, artifacts, entity types, and external identifiers.",
    guidedHref: "/catalog",
  },
  {
    id: "relationships",
    title: "Relationships and impact",
    description:
      "Trace dependencies, maintain governed relationships, manage adoptions and subscriptions, and preview consequential changes.",
    guidedHref: "/relationships",
  },
  {
    id: "context",
    title: "Context and receipts",
    description:
      "Resolve context, resume bounded retrieval, record feedback, and inspect durable receipts.",
    guidedHref: "/context-lab",
  },
  {
    id: "memory",
    title: "Living memory",
    description:
      "Search observations, review evidence, curate contradictions, and govern promotion into canonical records.",
    guidedHref: "/memory",
  },
  {
    id: "workspaces",
    title: "Workspaces",
    description:
      "Create scoped working areas and maintain notes, decisions, questions, and saved views.",
    guidedHref: "/workspaces",
  },
  {
    id: "arc",
    title: "Governed policies",
    description:
      "Author, validate, approve, activate, explain, and revoke Agent Readiness Context artifacts.",
    guidedHref: "/arc",
  },
  {
    id: "identity",
    title: "Identity and ownership",
    description:
      "Inspect caller identity, publish profiles, bind revisions, and maintain ownership assignments.",
    guidedHref: "/tenant-work?task=ownership",
  },
  {
    id: "activity",
    title: "Activity and signals",
    description:
      "Review notifications and learning evidence, record signals, and inspect owned-capability usage.",
    guidedHref: "/tenant-work?task=activity",
  },
  {
    id: "coordination",
    title: "Task coordination",
    description: "Maintain intent participants and append or retrieve chained checkpoints.",
    guidedHref: "/tenant-work?task=coordination",
  },
] as const satisfies readonly TenantOperationGroup[];

const operation = (
  group: TenantOperationGroupId,
  method: AdminOperationMethod,
  path: string,
  title: string,
  options: Omit<TenantOperationDefinition, "group" | "id" | "method" | "path" | "title"> = {},
): TenantOperationDefinition => ({
  group,
  id: `${method} ${path}`,
  method,
  path,
  title,
  ...options,
});

export const TENANT_OPERATIONS = [
  operation("catalog", "GET", "/v1/capabilities", "List capabilities", {
    queryParameters: [
      { name: "lifecycle" },
      { name: "entity_type" },
      { name: "cursor" },
      { name: "page_size", defaultValue: "20" },
      { name: "as_of" },
      { name: "view", defaultValue: "default" },
    ],
  }),
  operation("catalog", "POST", "/v1/capabilities", "Create capability", {
    bodyExample: { name: "" },
    requestSchema: "CreateCapabilityRequest",
    idempotentCreate: true,
    confirmationRequired: true,
  }),
  operation(
    "catalog",
    "GET",
    "/v1/capabilities/{capability_id}/interface",
    "Read capability interface",
    {
      pathParameters: ["capability_id"],
      queryParameters: [{ name: "as_of" }, { name: "view", defaultValue: "default" }],
    },
  ),
  operation(
    "catalog",
    "PUT",
    "/v1/capabilities/{capability_id}/interface",
    "Replace capability interface",
    {
      pathParameters: ["capability_id"],
      bodyExample: { interface_source: {}, interface_format: "" },
      requestSchema: "InterfacePutRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "catalog",
    "POST",
    "/v1/capabilities/{capability_id}/preview-version",
    "Preview version impact",
    {
      pathParameters: ["capability_id"],
      bodyExample: { proposed_version: "", proposed_interface: {}, interface_format: "" },
      requestSchema: "PreviewVersionRequest",
      confirmationRequired: true,
    },
  ),
  operation("catalog", "DELETE", "/v1/capabilities/{entity_id}", "Delete capability", {
    pathParameters: ["entity_id"],
    confirmationRequired: true,
  }),
  operation("catalog", "GET", "/v1/capabilities/{entity_id}", "Get capability", {
    pathParameters: ["entity_id"],
    queryParameters: [
      { name: "as_of" },
      { name: "include" },
      { name: "view", defaultValue: "default" },
      { name: "facts_categories" },
      { name: "facts_limit" },
    ],
  }),
  operation("catalog", "PATCH", "/v1/capabilities/{entity_id}", "Update capability", {
    pathParameters: ["entity_id"],
    bodyExample: { updates: {} },
    requestSchema: "UpdateEntityRequest",
    confirmationRequired: true,
  }),
  operation(
    "catalog",
    "GET",
    "/v1/capabilities/{entity_id}/artifacts",
    "List capability artifacts",
    {
      pathParameters: ["entity_id"],
      queryParameters: [
        { name: "view", defaultValue: "default" },
        { name: "category" },
        { name: "fields" },
        { name: "cursor" },
        { name: "page_size", defaultValue: "20" },
      ],
    },
  ),
  operation(
    "catalog",
    "POST",
    "/v1/capabilities/{entity_id}/artifacts",
    "Create capability artifact",
    {
      pathParameters: ["entity_id"],
      queryParameters: [{ name: "view", defaultValue: "default" }],
      bodyExample: { category: "", title: "", body: "" },
      requestSchema: "CreateArtifactRequest",
      idempotentCreate: true,
      confirmationRequired: true,
    },
  ),
  operation(
    "catalog",
    "DELETE",
    "/v1/capabilities/{entity_id}/artifacts/{fact_id}",
    "Delete capability artifact",
    { pathParameters: ["entity_id", "fact_id"], confirmationRequired: true },
  ),
  operation(
    "catalog",
    "GET",
    "/v1/capabilities/{entity_id}/artifacts/{fact_id}",
    "Get capability artifact",
    {
      pathParameters: ["entity_id", "fact_id"],
      queryParameters: [{ name: "view", defaultValue: "default" }, { name: "fields" }],
    },
  ),
  operation(
    "catalog",
    "GET",
    "/v1/capabilities/{entity_id}/dependencies",
    "Get capability dependencies",
    {
      pathParameters: ["entity_id"],
      queryParameters: [
        { name: "depth", defaultValue: "2" },
        { name: "as_of" },
        { name: "view", defaultValue: "default" },
      ],
    },
  ),
  operation(
    "catalog",
    "PATCH",
    "/v1/capabilities/{entity_id}/visibility",
    "Set capability visibility",
    {
      pathParameters: ["entity_id"],
      bodyExample: { visibility: "" },
      requestSchema: "SetVisibilityRequest",
      confirmationRequired: true,
    },
  ),
  operation("catalog", "POST", "/v1/concepts", "Create concept", {
    bodyExample: { name: "" },
    requestSchema: "CreateConceptRequest",
    idempotentCreate: true,
    confirmationRequired: true,
  }),
  operation("catalog", "DELETE", "/v1/concepts/{entity_id}", "Delete concept", {
    pathParameters: ["entity_id"],
    confirmationRequired: true,
  }),
  operation("catalog", "GET", "/v1/concepts/{entity_id}", "Get concept", {
    pathParameters: ["entity_id"],
    queryParameters: [{ name: "view", defaultValue: "default" }],
  }),
  operation("catalog", "PATCH", "/v1/concepts/{entity_id}", "Update concept", {
    pathParameters: ["entity_id"],
    bodyExample: { updates: {} },
    requestSchema: "UpdateEntityRequest",
    confirmationRequired: true,
  }),
  operation("catalog", "GET", "/v1/entities", "Look up entity by external identifier", {
    queryParameters: [{ name: "external_system" }, { name: "external_id" }],
  }),
  operation("catalog", "POST", "/v1/entities", "Assert governed entity", {
    bodyExample: {
      intent: "observation",
      subject_type: "",
      identity: {},
      target_revision: { profile_revision: "" },
      temporal: { valid_from: "2026-01-01T00:00:00Z" },
      idempotency_key: "",
      provenance: {
        source_system: "",
        source_namespace: "",
        external_record_id: "",
        observed_time: "2026-01-01T00:00:00Z",
      },
    },
    requestSchema: "EntityWriteRequestV1",
    confirmationRequired: true,
  }),
  operation("catalog", "GET", "/v1/entities:resolve", "Resolve entity handle", {
    queryParameters: [{ name: "handle" }],
  }),
  operation("catalog", "GET", "/v1/entities/{entity_id}", "Read governed entity", {
    pathParameters: ["entity_id"],
  }),
  operation("catalog", "PATCH", "/v1/entities/{entity_id}", "Supersede governed entity", {
    pathParameters: ["entity_id"],
    bodyExample: {
      intent: "observation",
      subject_type: "",
      identity: {},
      target_revision: { profile_revision: "" },
      temporal: { valid_from: "2026-01-01T00:00:00Z" },
      idempotency_key: "",
      provenance: {
        source_system: "",
        source_namespace: "",
        external_record_id: "",
        observed_time: "2026-01-01T00:00:00Z",
      },
    },
    requestSchema: "EntityWriteRequestV1",
    confirmationRequired: true,
  }),
  operation(
    "catalog",
    "POST",
    "/v1/entities/{entity_id}:validate-readiness",
    "Validate entity readiness",
    { pathParameters: ["entity_id"], confirmationRequired: true },
  ),
  operation(
    "catalog",
    "GET",
    "/v1/entities/{entity_id}/external-ids",
    "List external identifier mappings",
    { pathParameters: ["entity_id"] },
  ),
  operation(
    "catalog",
    "POST",
    "/v1/entities/{entity_id}/external-ids",
    "Add external identifier mapping",
    {
      pathParameters: ["entity_id"],
      bodyExample: { external_system_slug: "", external_id: "" },
      requestSchema: "ExternalIdCreate",
      idempotentCreate: true,
      confirmationRequired: true,
    },
  ),
  operation(
    "catalog",
    "DELETE",
    "/v1/entities/{entity_id}/external-ids/{external_id_pk}",
    "Delete external identifier mapping",
    { pathParameters: ["entity_id", "external_id_pk"], confirmationRequired: true },
  ),
  operation(
    "catalog",
    "PATCH",
    "/v1/entities/{entity_id}/external-ids/{external_id_pk}",
    "Update external identifier mapping",
    {
      pathParameters: ["entity_id", "external_id_pk"],
      bodyExample: {},
      requestSchema: "ExternalIdPatch",
      confirmationRequired: true,
    },
  ),
  operation("catalog", "POST", "/v1/operations", "Create operation", {
    bodyExample: { name: "" },
    requestSchema: "CreateOperationRequest",
    idempotentCreate: true,
    confirmationRequired: true,
  }),
  operation("catalog", "DELETE", "/v1/operations/{entity_id}", "Delete operation", {
    pathParameters: ["entity_id"],
    confirmationRequired: true,
  }),
  operation("catalog", "GET", "/v1/operations/{entity_id}", "Get operation", {
    pathParameters: ["entity_id"],
    queryParameters: [{ name: "view", defaultValue: "default" }],
  }),
  operation("catalog", "PATCH", "/v1/operations/{entity_id}", "Update operation", {
    pathParameters: ["entity_id"],
    bodyExample: { updates: {} },
    requestSchema: "UpdateEntityRequest",
    confirmationRequired: true,
  }),
  operation("catalog", "GET", "/v1/search", "Search catalog", {
    queryParameters: [
      { name: "q" },
      { name: "top_k", defaultValue: "10" },
      { name: "as_of" },
      { name: "entity_type" },
      { name: "lifecycle" },
      { name: "view", defaultValue: "default" },
    ],
  }),
  operation("catalog", "GET", "/v1/usage/owned-capabilities", "Read owned capability usage", {
    queryParameters: [{ name: "from" }, { name: "to" }, { name: "limit", defaultValue: "20" }],
  }),
  operation(
    "relationships",
    "GET",
    "/v1/capabilities/{capability_id}/subscriptions",
    "List capability subscriptions",
    {
      pathParameters: ["capability_id"],
      queryParameters: [{ name: "view", defaultValue: "default" }],
    },
  ),
  operation(
    "relationships",
    "POST",
    "/v1/capabilities/{capability_id}/subscriptions",
    "Create capability subscription",
    {
      pathParameters: ["capability_id"],
      bodyExample: { event_kinds: [] },
      requestSchema: "SubscriptionCreate",
      idempotentCreate: true,
      confirmationRequired: true,
    },
  ),
  operation(
    "relationships",
    "GET",
    "/v1/capabilities/{entity_id}/blast-radius",
    "Analyze capability blast radius",
    {
      pathParameters: ["entity_id"],
      queryParameters: [
        { name: "direction", defaultValue: "reverse" },
        { name: "depth", defaultValue: "5" },
        { name: "edge_types" },
        { name: "as_of" },
        { name: "as_of_version" },
        { name: "view", defaultValue: "default" },
      ],
    },
  ),
  operation(
    "relationships",
    "GET",
    "/v1/capabilities/{entity_id}/dependents",
    "List capability dependents",
    {
      pathParameters: ["entity_id"],
      queryParameters: [
        { name: "depth", defaultValue: "2" },
        { name: "edge_types" },
        { name: "as_of" },
        { name: "as_of_version" },
        { name: "view", defaultValue: "default" },
      ],
    },
  ),
  operation(
    "relationships",
    "PATCH",
    "/v1/capabilities/{entity_id}/lifecycle",
    "Change capability lifecycle",
    {
      pathParameters: ["entity_id"],
      bodyExample: { new_state: "", successor: "" },
      requestSchema: "LifecycleTransitionRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "relationships",
    "GET",
    "/v1/capabilities/{provider_cap_id}/adoptions",
    "List capability adoptions",
    {
      pathParameters: ["provider_cap_id"],
      queryParameters: [{ name: "view", defaultValue: "default" }],
    },
  ),
  operation(
    "relationships",
    "POST",
    "/v1/capabilities/{provider_cap_id}/adoptions",
    "Adopt provider capability",
    {
      pathParameters: ["provider_cap_id"],
      queryParameters: [{ name: "view", defaultValue: "default" }],
      bodyExample: {},
      requestSchema: "AdoptionCreate",
      idempotentCreate: true,
      confirmationRequired: true,
    },
  ),
  operation(
    "relationships",
    "DELETE",
    "/v1/capabilities/{provider_cap_id}/adoptions/{adoption_id}",
    "Remove capability adoption",
    { pathParameters: ["provider_cap_id", "adoption_id"], confirmationRequired: true },
  ),
  operation("relationships", "GET", "/v1/graph/consumer", "Read consumer projection", {
    queryParameters: [
      { name: "cursor" },
      { name: "page_size", defaultValue: "20" },
      { name: "as_of" },
      { name: "view", defaultValue: "default" },
    ],
  }),
  operation("relationships", "GET", "/v1/graph/provider", "Read provider projection", {
    queryParameters: [
      { name: "cursor" },
      { name: "page_size", defaultValue: "20" },
      { name: "as_of" },
      { name: "view", defaultValue: "default" },
    ],
  }),
  operation("relationships", "GET", "/v1/integrations", "Find capability integrations", {
    queryParameters: [
      { name: "capability_a" },
      { name: "capability_b" },
      { name: "view", defaultValue: "default" },
    ],
  }),
  operation("relationships", "POST", "/v1/relationships", "Assert governed relationship", {
    bodyExample: {
      intent: "observation",
      subject_type: "",
      identity: {},
      target_revision: { profile_revision: "" },
      temporal: { valid_from: "2026-01-01T00:00:00Z" },
      idempotency_key: "",
      provenance: {
        source_system: "",
        source_namespace: "",
        external_record_id: "",
        observed_time: "2026-01-01T00:00:00Z",
      },
      endpoints: { source_entity_id: "", destination_entity_id: "" },
    },
    requestSchema: "RelationshipWriteRequestV1",
    confirmationRequired: true,
  }),
  operation("relationships", "POST", "/v1/relationships:query", "Traverse relationships", {
    bodyExample: { entity_id: "" },
    requestSchema: "RelationshipQueryV1",
    confirmationRequired: true,
  }),
  operation(
    "relationships",
    "GET",
    "/v1/relationships/{relationship_id}",
    "Read governed relationship",
    { pathParameters: ["relationship_id"] },
  ),
  operation(
    "relationships",
    "PATCH",
    "/v1/relationships/{relationship_id}",
    "Supersede governed relationship",
    {
      pathParameters: ["relationship_id"],
      bodyExample: {
        intent: "observation",
        subject_type: "",
        identity: {},
        target_revision: { profile_revision: "" },
        temporal: { valid_from: "2026-01-01T00:00:00Z" },
        idempotency_key: "",
        provenance: {
          source_system: "",
          source_namespace: "",
          external_record_id: "",
          observed_time: "2026-01-01T00:00:00Z",
        },
        endpoints: { source_entity_id: "", destination_entity_id: "" },
      },
      requestSchema: "RelationshipWriteRequestV1",
      confirmationRequired: true,
    },
  ),
  operation(
    "relationships",
    "DELETE",
    "/v1/subscriptions/{subscription_id}",
    "Delete subscription",
    { pathParameters: ["subscription_id"], confirmationRequired: true },
  ),
  operation(
    "relationships",
    "PATCH",
    "/v1/subscriptions/{subscription_id}",
    "Update subscription",
    {
      pathParameters: ["subscription_id"],
      queryParameters: [{ name: "view", defaultValue: "default" }],
      bodyExample: {},
      requestSchema: "SubscriptionUpdate",
      confirmationRequired: true,
    },
  ),
  operation("context", "POST", "/v1/context/feedback", "Record context feedback", {
    bodyExample: { kind: "", rating: "", reporter_id: "", reporter_type: "", idempotency_key: "" },
    requestSchema: "ContextFeedbackRequest",
    confirmationRequired: true,
  }),
  operation("context", "POST", "/v1/context/resolve", "Resolve context", {
    bodyExample: { query: "" },
    requestSchema: "ContextResolveRequest",
    confirmationRequired: true,
  }),
  operation("context", "POST", "/v1/context/resume", "Resume context", {
    bodyExample: { references: [] },
    requestSchema: "ResumeRequestBody",
    confirmationRequired: true,
  }),
  operation("context", "GET", "/v1/receipts/{receipt_id}", "Get context receipt", {
    pathParameters: ["receipt_id"],
  }),
  operation(
    "context",
    "GET",
    "/v1/receipts/{receipt_id}/exclusions",
    "Get context receipt exclusions",
    { pathParameters: ["receipt_id"], queryParameters: [{ name: "block" }] },
  ),
  operation(
    "context",
    "GET",
    "/v1/receipts/{receipt_id}/references",
    "Get context receipt references",
    { pathParameters: ["receipt_id"] },
  ),
  operation("context", "GET", "/v1/receipts/by-reference", "Find receipts by reference", {
    queryParameters: [
      { name: "source_system" },
      { name: "source_namespace" },
      { name: "kind" },
      { name: "external_id" },
      { name: "limit", defaultValue: "50" },
    ],
  }),
  operation("memory", "GET", "/v1/memory/capability-requests", "List capability requests", {
    queryParameters: [
      { name: "role", defaultValue: "owner" },
      { name: "open_only", defaultValue: "true" },
      { name: "cursor" },
      { name: "page_size", defaultValue: "100" },
    ],
  }),
  operation("memory", "POST", "/v1/memory/capability-requests", "Raise capability request", {
    bodyExample: { subject_entity_id: "", request_category: "", title: "", body: "" },
    requestSchema: "RaiseCapabilityRequestRequest",
    confirmationRequired: true,
  }),
  operation(
    "memory",
    "GET",
    "/v1/memory/capability-requests/{request_id}",
    "Get capability request",
    { pathParameters: ["request_id"] },
  ),
  operation(
    "memory",
    "PATCH",
    "/v1/memory/capability-requests/{request_id}",
    "Transition capability request",
    {
      pathParameters: ["request_id"],
      bodyExample: { to_status: "acknowledged" },
      requestSchema: "TransitionRequestRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "memory",
    "POST",
    "/v1/memory/capability-requests/{request_id}:link-promotion",
    "Link capability request to promotion",
    {
      pathParameters: ["request_id"],
      bodyExample: { promotion_id: "" },
      requestSchema: "LinkRequestToPromotionRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "memory",
    "GET",
    "/v1/memory/capability-requests/{request_id}/history",
    "Get capability request history",
    { pathParameters: ["request_id"] },
  ),
  operation("memory", "GET", "/v1/memory/claims", "Query claims", {
    queryParameters: [
      { name: "subject_entity_id" },
      { name: "predicate" },
      { name: "category" },
      { name: "namespace_prefix" },
      { name: "min_confidence" },
      { name: "as_of" },
      { name: "persona", defaultValue: "agent" },
      { name: "limit", defaultValue: "10" },
    ],
  }),
  operation("memory", "POST", "/v1/memory/claims", "Assert claim", {
    bodyExample: { subject_reference: "", predicate: "", value: {}, evidence: [] },
    requestSchema: "AssertClaimRequest",
    idempotentCreate: true,
    confirmationRequired: true,
  }),
  operation("memory", "GET", "/v1/memory/claims/{claim_id}", "Get claim", {
    pathParameters: ["claim_id"],
    queryParameters: [{ name: "persona", defaultValue: "agent" }],
  }),
  operation("memory", "POST", "/v1/memory/claims/{claim_id}:adjudicate", "Adjudicate claim", {
    pathParameters: ["claim_id"],
    bodyExample: { verdict: "correct", observed_confidence: 0 },
    requestSchema: "AdjudicateClaimRequest",
    confirmationRequired: true,
  }),
  operation("memory", "POST", "/v1/memory/claims/{claim_id}:confirm", "Confirm claim", {
    pathParameters: ["claim_id"],
    confirmationRequired: true,
  }),
  operation("memory", "POST", "/v1/memory/claims/{claim_id}:discard", "Discard claim", {
    pathParameters: ["claim_id"],
    bodyExample: { reason: "" },
    requestSchema: "DiscardClaimRequest",
    confirmationRequired: true,
  }),
  operation("memory", "POST", "/v1/memory/claims/{claim_id}:link", "Link claim subject", {
    pathParameters: ["claim_id"],
    bodyExample: { subject_reference: "" },
    requestSchema: "LinkClaimRequest",
    confirmationRequired: true,
  }),
  operation("memory", "GET", "/v1/memory/claims/{claim_id}/history", "Get claim history", {
    pathParameters: ["claim_id"],
  }),
  operation("memory", "GET", "/v1/memory/claims/believed", "Get believed claims", {
    queryParameters: [{ name: "subject_entity_id" }, { name: "predicate" }, { name: "as_of" }],
  }),
  operation("memory", "GET", "/v1/memory/claims/search", "Search claims", {
    queryParameters: [
      { name: "q" },
      { name: "namespace_prefix" },
      { name: "category" },
      { name: "min_confidence" },
      { name: "persona", defaultValue: "agent" },
      { name: "top_k", defaultValue: "10" },
    ],
  }),
  operation("memory", "GET", "/v1/memory/contradiction-groups", "List contradiction groups", {
    queryParameters: [{ name: "predicate" }],
  }),
  operation("memory", "GET", "/v1/memory/curation-cases", "List curation cases", {
    queryParameters: [
      { name: "status" },
      { name: "cursor" },
      { name: "page_size", defaultValue: "100" },
    ],
  }),
  operation("memory", "POST", "/v1/memory/curation-cases", "Open curation case", {
    bodyExample: { subject_reference: "", predicate: "" },
    requestSchema: "OpenCurationCaseRequest",
    confirmationRequired: true,
  }),
  operation("memory", "GET", "/v1/memory/curation-cases/{case_id}", "Get curation case", {
    pathParameters: ["case_id"],
  }),
  operation(
    "memory",
    "POST",
    "/v1/memory/curation-cases/{case_id}:disposition",
    "Record curation case disposition",
    {
      pathParameters: ["case_id"],
      bodyExample: { disposition: "confirm" },
      requestSchema: "RecordDispositionRequest",
      confirmationRequired: true,
    },
  ),
  operation("memory", "POST", "/v1/memory/curation-cases/{case_id}:route", "Route curation case", {
    pathParameters: ["case_id"],
    bodyExample: { owner_id: "" },
    requestSchema: "RouteCurationCaseRequest",
    confirmationRequired: true,
  }),
  operation("memory", "GET", "/v1/memory/curation-queue", "Get curation queue", {
    queryParameters: [
      { name: "counts", defaultValue: "false" },
      { name: "cursor" },
      { name: "page_size", defaultValue: "100" },
    ],
  }),
  operation("memory", "GET", "/v1/memory/promotion-proposals", "List promotion proposals", {
    queryParameters: [
      { name: "state", defaultValue: "open" },
      { name: "cursor" },
      { name: "page_size", defaultValue: "100" },
    ],
  }),
  operation(
    "memory",
    "GET",
    "/v1/memory/promotion-proposals/{proposal_id}",
    "Get promotion proposal",
    { pathParameters: ["proposal_id"] },
  ),
  operation(
    "memory",
    "PATCH",
    "/v1/memory/promotion-proposals/{proposal_id}",
    "Review promotion proposal",
    {
      pathParameters: ["proposal_id"],
      bodyExample: { state: "accepted" },
      requestSchema: "ReviewProposalRequest",
      confirmationRequired: true,
    },
  ),
  operation("memory", "POST", "/v1/memory/promotions/{promotion_id}:reverse", "Reverse promotion", {
    pathParameters: ["promotion_id"],
    bodyExample: { reason: "" },
    requestSchema: "ReversePromotionRequest",
    confirmationRequired: true,
  }),
  operation("memory", "GET", "/v1/memory/sessions", "List sessions", {
    queryParameters: [{ name: "since" }, { name: "limit", defaultValue: "50" }],
  }),
  operation("memory", "GET", "/v1/memory/sessions/{session_id}/events", "List session events", {
    pathParameters: ["session_id"],
    queryParameters: [
      { name: "since_seq" },
      { name: "until_seq" },
      { name: "kind" },
      { name: "cursor" },
      { name: "limit", defaultValue: "100" },
      { name: "order", defaultValue: "asc" },
    ],
  }),
  operation("memory", "POST", "/v1/memory/sessions/{session_id}/events", "Record session event", {
    pathParameters: ["session_id"],
    bodyExample: { kind: "", body: "" },
    requestSchema: "RecordEventRequest",
    confirmationRequired: true,
  }),
  operation(
    "memory",
    "DELETE",
    "/v1/memory/sessions/{session_id}/events/{event_id}",
    "Delete session event",
    { pathParameters: ["session_id", "event_id"], confirmationRequired: true },
  ),
  operation(
    "memory",
    "GET",
    "/v1/memory/sessions/{session_id}/events/{event_id}",
    "Get session event",
    { pathParameters: ["session_id", "event_id"] },
  ),
  operation("workspaces", "GET", "/v1/workspaces", "List workspaces", {
    queryParameters: [{ name: "include_archived", defaultValue: "false" }, { name: "cursor" }],
  }),
  operation("workspaces", "POST", "/v1/workspaces", "Create workspace", {
    bodyExample: { name: "", owner_kind: "" },
    requestSchema: "WorkspaceCreateRequest",
    confirmationRequired: true,
  }),
  operation("workspaces", "DELETE", "/v1/workspaces/{workspace_id}", "Archive workspace", {
    pathParameters: ["workspace_id"],
    confirmationRequired: true,
  }),
  operation("workspaces", "GET", "/v1/workspaces/{workspace_id}", "Get workspace", {
    pathParameters: ["workspace_id"],
  }),
  operation("workspaces", "PATCH", "/v1/workspaces/{workspace_id}", "Update workspace", {
    pathParameters: ["workspace_id"],
    bodyExample: {},
    requestSchema: "WorkspaceUpdateRequest",
    confirmationRequired: true,
  }),
  operation(
    "workspaces",
    "GET",
    "/v1/workspaces/{workspace_id}/entries",
    "List workspace entries",
    {
      pathParameters: ["workspace_id"],
      queryParameters: [{ name: "kind" }, { name: "cursor" }],
    },
  ),
  operation(
    "workspaces",
    "POST",
    "/v1/workspaces/{workspace_id}/entries",
    "Create workspace entry",
    {
      pathParameters: ["workspace_id"],
      bodyExample: { kind: "", body_md: "" },
      requestSchema: "EntryCreateRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "workspaces",
    "DELETE",
    "/v1/workspaces/{workspace_id}/entries/{entry_id}",
    "Archive workspace entry",
    { pathParameters: ["workspace_id", "entry_id"], confirmationRequired: true },
  ),
  operation(
    "workspaces",
    "PATCH",
    "/v1/workspaces/{workspace_id}/entries/{entry_id}",
    "Update workspace entry",
    {
      pathParameters: ["workspace_id", "entry_id"],
      bodyExample: {},
      requestSchema: "EntryUpdateRequest",
      confirmationRequired: true,
    },
  ),
  operation("workspaces", "GET", "/v1/workspaces/search", "Search workspace entries", {
    queryParameters: [
      { name: "q" },
      { name: "kind" },
      { name: "owner_actor_id" },
      { name: "reference_ids" },
      { name: "cursor" },
    ],
  }),
  operation(
    "arc",
    "POST",
    "/v1/arc/approval-challenges/{approval_challenge_id}/complete",
    "Complete approval challenge",
    {
      pathParameters: ["approval_challenge_id"],
      bodyExample: { proof: { signature_algorithm: "Ed25519", signature_base64: "" } },
      requestSchema: "ApprovalCompletionRequest",
      confirmationRequired: true,
    },
  ),
  operation("arc", "GET", "/v1/arc/artifacts", "List ARC artifact families", {
    queryParameters: [
      { name: "cursor" },
      { name: "q" },
      { name: "kind" },
      { name: "owning_scope" },
      { name: "page_size", defaultValue: "25" },
    ],
  }),
  operation("arc", "POST", "/v1/arc/artifacts", "Create ARC artifact family", {
    bodyExample: { owning_scope: "global", slug: "", kind: "standard", title: "" },
    requestSchema: "ArtifactFamilyCreate",
    confirmationRequired: true,
  }),
  operation("arc", "GET", "/v1/arc/artifacts/{artifact_id}", "Get ARC artifact family", {
    pathParameters: ["artifact_id"],
  }),
  operation("arc", "POST", "/v1/arc/artifacts/{artifact_id}/proposals", "Open ARC proposal", {
    pathParameters: ["artifact_id"],
    bodyExample: { source_evidence_id: "" },
    requestSchema: "ProposalOpenRequest",
    confirmationRequired: true,
  }),
  operation("arc", "POST", "/v1/arc/challenges", "Issue context challenge", {
    bodyExample: { session_id: "", manifest_claims_digest: "", idempotency_key: "" },
    requestSchema: "ChallengeRequest",
    confirmationRequired: true,
  }),
  operation("arc", "GET", "/v1/arc/metadata", "Get ARC verification metadata"),
  operation("arc", "GET", "/v1/arc/proposals/{proposal_id}", "Get ARC proposal thread", {
    pathParameters: ["proposal_id"],
  }),
  operation(
    "arc",
    "GET",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}",
    "Get ARC proposal version",
    { pathParameters: ["proposal_id", "proposal_version"] },
  ),
  operation(
    "arc",
    "PATCH",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}",
    "Edit ARC proposal version",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: {
        semantics: {
          projection_schema_version: 0,
          materialiser_profile: "",
          materialiser_version: "",
          applicability_baseline_version: "",
          artifact_id: "",
          revision_id: "",
          kind: "directive_bundle",
          owning_scope: "global",
          visibility: "standard",
          source_system: "",
          source_revision_locator: "",
          source_content_digest: "",
          source_approval_evidence_digest: "",
          directives: [],
          applicability: [],
          detail_audience: "agent_only",
          review_expires_at: "2026-01-01T00:00:00Z",
          content_classification: "public",
          approved_retention_floor_days: 0,
          initial_freshness_basis: "connector_verified",
        },
        field_provenance: [],
      },
      requestSchema: "ProposalPatchRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/approval-challenges",
    "Create ARC approval challenge",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: { approval_verifier_id: "" },
      requestSchema: "ApprovalChallengeRequest",
      idempotentCreate: true,
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "GET",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/baseline-diff",
    "Get ARC baseline diff",
    { pathParameters: ["proposal_id", "proposal_version"] },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/draft",
    "Draft ARC proposal version",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: { source_evidence_id: "", target_field_paths: [] },
      requestSchema: "DraftRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "GET",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/observation",
    "Get ARC observation status",
    { pathParameters: ["proposal_id", "proposal_version"] },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/observation/accept",
    "Accept ARC qualification",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: { qualification_id: "", acknowledged_reason_codes: [] },
      requestSchema: "QualificationAcceptanceRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/observation/qualify",
    "Qualify ARC proposal version",
    { pathParameters: ["proposal_id", "proposal_version"], confirmationRequired: true },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/reach-confirmations",
    "Confirm ARC proposal reach",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: { field_paths: [] },
      requestSchema: "ReachConfirmationRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/reject",
    "Reject ARC proposal version",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: { reason_code: "" },
      requestSchema: "ReasonRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "GET",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/review-package",
    "Get ARC review package",
    { pathParameters: ["proposal_id", "proposal_version"] },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/semantic-tests",
    "Run ARC semantic tests",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: { tests: [] },
      requestSchema: "SemanticTestRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/submit",
    "Submit ARC proposal version",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: {
        expected_impact_envelope: {
          envelope_id: "",
          proposal_id: "",
          proposal_version: 0,
          items: [],
          author_issuer: "",
          author_subject: "",
          created_at: "2026-01-01T00:00:00Z",
        },
      },
      requestSchema: "SubmitRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/supersede",
    "Supersede ARC proposal version",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: { reason_code: "" },
      requestSchema: "ReasonRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/validate",
    "Validate ARC proposal version",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: {},
      requestSchema: "EmptyRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "arc",
    "POST",
    "/v1/arc/proposals/{proposal_id}/versions/{proposal_version}/withdraw",
    "Withdraw ARC proposal version",
    {
      pathParameters: ["proposal_id", "proposal_version"],
      bodyExample: { reason_code: "" },
      requestSchema: "ReasonRequest",
      confirmationRequired: true,
    },
  ),
  operation("arc", "GET", "/v1/arc/receipts/{receipt_id}", "Get ARC resolution receipt", {
    pathParameters: ["receipt_id"],
  }),
  operation("arc", "POST", "/v1/arc/receipts/{receipt_id}/detail", "Retrieve ARC context detail", {
    pathParameters: ["receipt_id"],
    bodyExample: { context_handle: "", request_kind: "", idempotency_key: "" },
    requestSchema: "DetailRequestBody",
    confirmationRequired: true,
  }),
  operation("arc", "GET", "/v1/arc/receipts/{receipt_id}/explain", "Explain ARC resolution", {
    pathParameters: ["receipt_id"],
  }),
  operation("arc", "POST", "/v1/arc/resolve", "Resolve ARC context", {
    bodyExample: {
      manifest: {
        session_id: "",
        intent_kind: "",
        environment: "",
        data_sensitivity: "",
        repository_identity: "",
      },
      attestation: {
        profile: "",
        signer_key_id: "",
        attestation_id: "",
        issued_at: "2026-01-01T00:00:00Z",
        expires_at: "2026-01-01T00:00:00Z",
        payload: {},
        signature: "",
      },
    },
    requestSchema: "ResolveContextRequest",
    confirmationRequired: true,
  }),
  operation("arc", "POST", "/v1/arc/revisions/{revision_id}/activate", "Activate ARC revision", {
    pathParameters: ["revision_id"],
    bodyExample: { proposal_id: "", proposal_version: 0 },
    requestSchema: "ActivateRequest",
    confirmationRequired: true,
  }),
  operation(
    "arc",
    "GET",
    "/v1/arc/revisions/{revision_id}/activation-eligibility",
    "Get ARC activation eligibility",
    { pathParameters: ["revision_id"] },
  ),
  operation("arc", "POST", "/v1/arc/revisions/{revision_id}/revoke", "Revoke ARC revision", {
    pathParameters: ["revision_id"],
    bodyExample: { reason_code: "" },
    requestSchema: "ReasonRequest",
    confirmationRequired: true,
  }),
  operation("arc", "GET", "/v1/arc/sources/{source_evidence_id}", "Get ARC source evidence", {
    pathParameters: ["source_evidence_id"],
  }),
  operation("arc", "GET", "/v1/arc/sources/{source_evidence_id}/body", "Get ARC source body", {
    pathParameters: ["source_evidence_id"],
  }),
  operation("arc", "POST", "/v1/arc/sources/connector-fetches", "Admit ARC connector source", {
    bodyExample: {
      connector_id: "",
      source_revision_locator: "",
      claim: {
        source_system: "",
        source_revision_locator: "",
        source_content_digest: "",
        source_content_type: "",
        approval_locator: "",
        approving_authority_issuer: "",
        approving_authority_subject: "",
        approval_scope: "",
        approved_at: "2026-01-01T00:00:00Z",
        expires_at: "2026-01-01T00:00:00Z",
      },
      verifier_id: "",
      proof: { signature_algorithm: "Ed25519", signature_base64: "" },
    },
    requestSchema: "ConnectorFetchRequest",
    idempotentCreate: true,
    confirmationRequired: true,
  }),
  operation("arc", "POST", "/v1/arc/sources/uploads", "Admit ARC source upload", {
    availability: "guided-only",
    requestSchema: "Body_admit_source_upload_v1_arc_sources_uploads_post",
    idempotentCreate: true,
    confirmationRequired: true,
  }),
  operation("identity", "GET", "/v1/ownership:owned-by", "Find target owners", {
    queryParameters: [
      { name: "owned_target_kind" },
      { name: "owned_target_id" },
      { name: "include_pending", defaultValue: "false" },
    ],
  }),
  operation("identity", "GET", "/v1/ownership:owns", "List principal ownership", {
    queryParameters: [
      { name: "owner_principal" },
      { name: "include_pending", defaultValue: "false" },
    ],
  }),
  operation("identity", "POST", "/v1/ownership/assignments", "Assign ownership", {
    bodyExample: {
      owner_principal: "",
      owned_target_kind: "",
      owned_target_id: "",
      role: "",
      scope: "",
      source: "",
      profile_revision_id: "",
    },
    requestSchema: "AssignOwnershipRequestV1",
    confirmationRequired: true,
  }),
  operation(
    "identity",
    "GET",
    "/v1/ownership/assignments/{assignment_id}",
    "Get ownership assignment",
    { pathParameters: ["assignment_id"] },
  ),
  operation(
    "identity",
    "POST",
    "/v1/ownership/assignments/{assignment_id}:transition",
    "Transition ownership assignment",
    {
      pathParameters: ["assignment_id"],
      bodyExample: { to_state: "", reason: "" },
      requestSchema: "TransitionRequestV1",
      confirmationRequired: true,
    },
  ),
  operation("identity", "POST", "/v1/profiles/bindings", "Plan profile binding", {
    bodyExample: {
      profile_revision_id: "",
      effective_from: "2026-01-01T00:00:00Z",
      reason: "",
    },
    requestSchema: "PlanBindingRequest",
    confirmationRequired: true,
  }),
  operation(
    "identity",
    "POST",
    "/v1/profiles/bindings/{binding_id}/activate",
    "Activate profile binding",
    {
      pathParameters: ["binding_id"],
      bodyExample: { reason: "" },
      requestSchema: "BindingTransitionRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "identity",
    "POST",
    "/v1/profiles/bindings/{binding_id}/rollback",
    "Begin profile rollback",
    {
      pathParameters: ["binding_id"],
      bodyExample: { reason: "" },
      requestSchema: "BindingTransitionRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "identity",
    "POST",
    "/v1/profiles/bindings/{binding_id}/rollback/complete",
    "Complete profile rollback",
    {
      pathParameters: ["binding_id"],
      bodyExample: { reason: "" },
      requestSchema: "BindingTransitionRequest",
      confirmationRequired: true,
    },
  ),
  operation(
    "identity",
    "POST",
    "/v1/profiles/bindings/{binding_id}/validate",
    "Validate profile binding",
    {
      pathParameters: ["binding_id"],
      bodyExample: { reason: "" },
      requestSchema: "BindingTransitionRequest",
      confirmationRequired: true,
    },
  ),
  operation("identity", "GET", "/v1/profiles/conformance", "Read profile conformance"),
  operation("identity", "POST", "/v1/profiles/extensions", "Publish profile extension", {
    bodyExample: { namespace: "", target_core_revision_id: "" },
    requestSchema: "PublishExtensionRequest",
    confirmationRequired: true,
  }),
  operation("identity", "POST", "/v1/profiles/revisions", "Publish profile revision", {
    bodyExample: {
      profile_family: "",
      profile_name: "",
      semantic_version: "",
      compatibility: "",
    },
    requestSchema: "PublishRevisionRequest",
    confirmationRequired: true,
  }),
  operation("identity", "GET", "/v1/whoami", "Inspect current identity"),
  operation("activity", "GET", "/v1/learning/aggregates", "Read tenant learning aggregates", {
    queryParameters: [{ name: "window_days", defaultValue: "30" }],
  }),
  operation("activity", "GET", "/v1/learning/metrics", "List learning metrics"),
  operation("activity", "GET", "/v1/notifications", "List notifications", {
    queryParameters: [
      { name: "status", defaultValue: "unread" },
      { name: "cursor" },
      { name: "page_size", defaultValue: "50" },
      { name: "view", defaultValue: "default" },
    ],
  }),
  operation(
    "activity",
    "POST",
    "/v1/notifications/{notification_id}:mark-read",
    "Mark notification read",
    { pathParameters: ["notification_id"], confirmationRequired: true },
  ),
  operation("activity", "POST", "/v1/signals", "Ingest signal", {
    bodyExample: {
      source_id: "",
      source_system: "",
      source_event_id: "",
      producer_id: "",
      producer_type: "human",
      idempotency_key: "",
      classification: "public",
      event_time: "2026-01-01T00:00:00Z",
      observed_time: "2026-01-01T00:00:00Z",
    },
    requestSchema: "SignalIngestRequest",
    confirmationRequired: true,
  }),
  operation(
    "coordination",
    "GET",
    "/v1/checkpoints/by-digest/{digest}",
    "Get checkpoint by digest",
    {
      pathParameters: ["digest"],
    },
  ),
  operation("coordination", "POST", "/v1/intents/{intent_id}/checkpoints", "Append checkpoint", {
    pathParameters: ["intent_id"],
    bodyExample: { goal: "" },
    requestSchema: "CheckpointAppend",
    idempotentCreate: true,
    confirmationRequired: true,
  }),
  operation(
    "coordination",
    "GET",
    "/v1/intents/{intent_id}/checkpoints/{checkpoint_id}",
    "Get checkpoint",
    { pathParameters: ["intent_id", "checkpoint_id"] },
  ),
  operation(
    "coordination",
    "GET",
    "/v1/intents/{intent_id}/participants",
    "List intent participants",
    { pathParameters: ["intent_id"] },
  ),
  operation(
    "coordination",
    "POST",
    "/v1/intents/{intent_id}/participants",
    "Add intent participant",
    {
      pathParameters: ["intent_id"],
      bodyExample: { actor_id: "", role: "" },
      requestSchema: "GrantCreate",
      confirmationRequired: true,
    },
  ),
  operation(
    "coordination",
    "DELETE",
    "/v1/intents/{intent_id}/participants/{actor_id}",
    "Remove intent participant",
    { pathParameters: ["intent_id", "actor_id"], confirmationRequired: true },
  ),
] as const satisfies readonly TenantOperationDefinition[];
