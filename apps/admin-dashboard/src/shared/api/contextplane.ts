import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";
import {
  isRecord,
  nullableNumber,
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredNumber,
  requiredString,
  requiredInteger,
} from "./parse";

export type SessionEvent = components["schemas"]["EventResponse"];
export type SessionSummary = components["schemas"]["SessionResponse"];
export type MemoryCitation = components["schemas"]["CitationResponse"];
export type MemoryClaim = components["schemas"]["ClaimResponse"];
export type MemoryClaimHistory = components["schemas"]["ClaimHistoryResponse"];
export type MemoryClaimHistoryItem = components["schemas"]["BelievedClaimResponse"];
export type MemoryCurationCounts = components["schemas"]["QueueCountsResponse"];
export type MemoryCurationItem = components["schemas"]["QueueItemResponse"];
export type MemoryCurationPage = components["schemas"]["QueueListResponse"];
export type ClaimAssertionReceipt = components["schemas"]["AssertClaimResponse"];
export type ClaimEvidenceItem = components["schemas"]["EvidenceItemRequest"];
export type ClaimEvidenceKind = ClaimEvidenceItem["kind"];
export type ClaimPredicate = components["schemas"]["PredicateResponse"];
export type ClaimVisibility = "private" | "public" | "tenant-shared";
export type RelationshipDependencyResult = components["schemas"]["DependencyResponse"];
export type RelationshipEdge = components["schemas"]["EdgeRefItem"];
export type RelationshipEntity = components["schemas"]["EntityRefItem"];
export type RelationshipProjectionResult = components["schemas"]["ProjectionResponse"];
export type RelationshipTraversalResult = components["schemas"]["TraversalResultResponse"];
export type ContextFeedback = components["schemas"]["ContextFeedbackResponse"];
export type ContextReference = components["schemas"]["ReferenceResponse"];
export interface PromotionProposal extends Omit<
  components["schemas"]["ProposalResponse"],
  "state"
> {
  state: PromotionProposalState;
}
export interface PromotionProposalDecision extends Omit<
  components["schemas"]["ProposalDecisionResponse"],
  "proposal"
> {
  proposal: PromotionProposal;
}
export interface PromotionProposalPage extends Omit<
  components["schemas"]["ProposalListResponse"],
  "items"
> {
  items: PromotionProposal[];
}
export type CapabilityUsage = components["schemas"]["CapabilityUsageOut"];
export type CapabilityUsageRanking = components["schemas"]["CapabilityRankingOut"];
export type DailyUsagePoint = components["schemas"]["DailyPointOut"];
export type DailyUsageSeries = components["schemas"]["DailySeriesOut"];
export type SurfaceUsageSummary = components["schemas"]["SurfaceSummaryOut"];
export type ToolUsage = components["schemas"]["ToolUsageOut"];
export type ToolUsageRanking = components["schemas"]["ToolRankingOut"];
export type UsageSummary = components["schemas"]["UsageSummaryOut"];
export type ArcArtifactFamily = components["schemas"]["ArtifactFamilyResponse"];
export type ArcArtifactFamilyPage = components["schemas"]["ArtifactFamilyListResponse"];
export type ArcArtifactKind = components["schemas"]["ArtifactKind"];
export type ArcOwningScope = components["schemas"]["OwningScope"];
export type ArcProposalThread = components["schemas"]["ProposalThreadResponse"];
export type ArcProposalPatchRequest = components["schemas"]["ProposalPatchRequest"];
export type ArcProposalVersion = components["schemas"]["ProposalVersionResponse"];
export interface ArcValidationResult {
  errors: { code: string; field_path: string; message: string }[];
  valid: boolean;
}
export type ArcStructuredResponse = Readonly<Record<string, unknown>>;
export type WhoAmI = components["schemas"]["WhoAmIResponse"];
export interface Workspace {
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  description: string | null;
  name: string;
  owner_actor_id: string | null;
  owner_kind: WorkspaceOwnerKind;
  t_invalidated_at: string | null;
  tenant_id: string;
  updated_at: string;
  workspace_id: string;
}
export interface WorkspaceWarning {
  categories: string[];
  field: string;
}
export interface WorkspaceEntry {
  body_md: string;
  created_at: string;
  created_by: string | null;
  entry_id: string;
  expires_at: string | null;
  kind: WorkspaceEntryKind;
  reference_ids: string[];
  references_jsonb: Record<string, unknown> | null;
  tenant_id: string;
  updated_at: string;
  warnings: WorkspaceWarning[];
  workspace_id: string;
}
export interface WorkspaceEntryPage {
  items: WorkspaceEntry[];
  next_cursor: string | null;
}
export interface WorkspaceEntrySearchPage extends WorkspaceEntryPage {
  total_count: number | null;
}
export interface WorkspacePage {
  items: Workspace[];
  next_cursor: string | null;
}

/**
 * Five, in the order the envelope returns them.
 *
 * `instructions` is last and is not context about the subject at all — it is
 * what the product says back about the caller's own declared instruction set.
 * It counts as a block because a block inherits provenance, trust class, the
 * receipt and suppression, and an instruction delivered outside all four would
 * be the highest-leverage input to what an agent does and the only one with no
 * record of having been given.
 *
 * **A reader that counts four reports a clean run over a wrong delta.** The
 * envelope parser asserts this list against what arrived, so a contract that
 * grows a sixth breaks here rather than silently dropping it.
 */
export const contextBlockNames = [
  "canonical",
  "arc",
  "observed_claims",
  "workspace",
  "instructions",
] as const;
export type ContextBlockName = (typeof contextBlockNames)[number];

/**
 * What was known about the caller's instruction set at resolve time.
 *
 * Three, and every surface renders all three. `declared_unknown` reported as
 * `not_declared` would make an integration that declares look identical to one
 * that never adopted the channel, which is the quiet degradation ADR 0020's
 * third assumption exists to prevent.
 */
export const instructionDispositions = [
  "not_declared",
  "declared_unknown",
  "declared_known",
] as const;
export type InstructionDisposition = (typeof instructionDispositions)[number];

export const contextBlockStates = ["success", "empty", "degraded", "failed"] as const;
export type ContextBlockState = (typeof contextBlockStates)[number];

export const contextEnvelopeStates = ["complete", "degraded", "blocked"] as const;
export type ContextEnvelopeState = (typeof contextEnvelopeStates)[number];

export const contextFeedbackRatings = [
  "relevant",
  "irrelevant",
  "missing",
  "stale",
  "incorrect",
  "contradicted",
  "unsafe",
  "selected",
  "ignored",
  "succeeded",
  "failed",
  "rolled_back",
  "needs_human_review",
] as const;
export type ContextFeedbackRating = (typeof contextFeedbackRatings)[number];

export interface ContextTrust extends Omit<
  components["schemas"]["TrustResponse"],
  "assertion_kind"
> {
  assertion_kind: string;
}

export interface ContextItem extends Omit<components["schemas"]["ContextItemResponse"], "trust"> {
  trust: ContextTrust | null;
}

export interface ContextBlock extends Omit<
  components["schemas"]["ContextBlockResponse"],
  "items" | "name" | "state"
> {
  items: readonly ContextItem[];
  name: ContextBlockName;
  state: ContextBlockState;
}

export interface ContextEnvelope extends Omit<
  components["schemas"]["ContextEnvelopeResponse"],
  "blocks" | "instruction_disposition" | "state"
> {
  arc_block_note: string | null;
  blocks: readonly ContextBlock[];
  /** Which of the three instruction states this resolution ran under. */
  instruction_disposition: InstructionDisposition;
  /** Why the instructions block is empty, when it is. Absent when it carries something. */
  instruction_block_note: string | null;
  state: ContextEnvelopeState;
}

export interface ContextReceipt extends Omit<components["schemas"]["ReceiptResponse"], "state"> {
  state: ContextEnvelopeState;
}

export interface ContextExclusion extends Omit<
  components["schemas"]["ExclusionResponse"],
  "block"
> {
  block: ContextBlockName;
}

export interface ResolveContextInput {
  arcReceiptId?: string;
  intentIds?: readonly string[];
  limit?: number;
  maxAgeSeconds?: number;
  query: string;
  subjectEntityId?: string;
  workspaceTerm?: string;
}

export interface RecordContextFeedbackInput {
  idempotencyKey: string;
  learningEligible?: boolean;
  note?: string | null;
  rating: ContextFeedbackRating;
  receiptId: string;
  receiptItemId: string;
  reporterId: string;
}

export const promotionProposalStates = ["open", "accepted", "amended", "rejected"] as const;
export type PromotionProposalState = (typeof promotionProposalStates)[number];

export const arcArtifactKinds = [
  "standard",
  "policy",
  "adr",
  "runbook",
  "capability_contract",
] as const satisfies readonly ArcArtifactKind[];
export const arcOwningScopes = ["tenant", "global"] as const satisfies readonly ArcOwningScope[];
const arcProposalStates = [
  "open",
  "submitted",
  "approved",
  "activated",
  "rejected",
  "stale",
  "superseded",
  "withdrawn",
] as const satisfies readonly components["schemas"]["ProposalState"][];
const arcAvailableActions = [
  "edit",
  "validate",
  "run_semantic_tests",
  "confirm_reach",
  "draft",
  "submit",
  "withdraw",
  "reject",
  "supersede",
  "request_approval",
  "qualify",
  "accept_qualification",
  "activate",
] as const satisfies readonly components["schemas"]["AvailableAction"][];
const arcIntegrityStates = [
  "pending",
  "verified",
  "failed",
  "unavailable",
] as const satisfies readonly components["schemas"]["OperationalIntegrityState"][];
const arcRiskClassifications = [
  "global_mandatory",
  "global_non_mandatory",
  "tenant_mandatory",
  "tenant_non_mandatory",
  "domain_mandatory",
  "domain_non_mandatory",
  "entity_mandatory",
  "entity_non_mandatory",
  "intent_mandatory",
  "intent_non_mandatory",
] as const satisfies readonly components["schemas"]["RiskClassification"][];

export type ReviewPromotionProposalInput =
  { amendedValue?: unknown; state: "accepted" } | { reason: string; state: "rejected" };

export const sessionEventKinds = ["user_message", "agent_action", "tool_invocation"] as const;
export type SessionEventKind = (typeof sessionEventKinds)[number];

export const memoryClaimPersonas = ["l1_responder", "l3_engineer", "architect", "agent"] as const;
export type MemoryClaimPersona = (typeof memoryClaimPersonas)[number];

export const claimEvidenceKinds = [
  "session_event",
  "document_revision",
  "commit",
  "work_item",
  "connector_run",
  "curator",
  "incident",
] as const;

export const claimVisibilities = ["public", "tenant-shared", "private"] as const;

export const relationshipDepths = [1, 2, 3, 4, 5] as const;
export type RelationshipDepth = (typeof relationshipDepths)[number];

export const relationshipDirections = ["forward", "reverse"] as const;
export type RelationshipDirection = (typeof relationshipDirections)[number];

export const workspaceOwnerKinds = ["actor", "tenant"] as const;
export type WorkspaceOwnerKind = (typeof workspaceOwnerKinds)[number];

export const workspaceEntryKinds = [
  "note",
  "decision",
  "open_question",
  "saved_query",
  "saved_view",
] as const;
export type WorkspaceEntryKind = (typeof workspaceEntryKinds)[number];

export interface ListSessionsParameters {
  limit?: number;
  since?: string;
}

export interface ListSessionEventsParameters {
  cursor?: number;
  kind?: SessionEventKind;
  limit?: number;
  order?: "asc" | "desc";
}

export interface ListMemoryClaimsParameters {
  asOf?: string;
  category?: string;
  limit?: number;
  minConfidence?: number;
  namespacePrefix?: string;
  persona?: MemoryClaimPersona;
  predicate?: string;
  subjectEntityId?: string;
}

export interface SearchMemoryClaimsParameters {
  category?: string;
  minConfidence?: number;
  namespacePrefix?: string;
  persona?: MemoryClaimPersona;
  query: string;
  topK?: number;
}

export interface ListMemoryCurationParameters {
  cursor?: string;
  pageSize?: number;
}

export interface AssertClaimInput {
  assertedValidFrom?: string | null;
  assertedValidTo?: string | null;
  evidence: readonly ClaimEvidenceItem[];
  idempotencyKey: string;
  namespace?: string | null;
  predicate: string;
  subjectReference: string;
  value: unknown;
  visibility?: ClaimVisibility | null;
}

export interface GetRelationshipDependenciesParameters {
  asOf?: string;
  depth?: RelationshipDepth;
}

export interface GetRelationshipTraversalParameters extends GetRelationshipDependenciesParameters {
  asOfVersion?: string;
  edgeTypes?: readonly string[];
}

export interface GetRelationshipBlastRadiusParameters extends GetRelationshipTraversalParameters {
  direction?: RelationshipDirection;
}

export interface GetRelationshipProjectionParameters {
  asOf?: string;
  cursor?: string;
  pageSize?: number;
}

export interface UsageWindowParameters {
  from: string;
  to: string;
}

export interface ListPromotionProposalsParameters {
  cursor?: string;
  pageSize?: number;
  state?: PromotionProposalState;
}

export interface ListWorkspacesParameters {
  cursor?: string;
  includeArchived?: boolean;
}

export interface ListWorkspaceEntriesParameters {
  cursor?: string;
  kind?: WorkspaceEntryKind;
}

export interface SearchWorkspaceEntriesParameters extends ListWorkspaceEntriesParameters {
  ownerActorId?: string;
  query?: string;
  referenceIds?: readonly string[];
}

export interface CreateWorkspaceInput {
  description?: string | null;
  name: string;
  ownerKind: WorkspaceOwnerKind;
}

export interface UpdateWorkspaceInput {
  archivedAt?: string | null;
  description?: string | null;
  name?: string | null;
}

export interface CreateWorkspaceEntryInput {
  bodyMarkdown: string;
  expiresAt?: string | null;
  kind: WorkspaceEntryKind;
  referenceIds?: readonly string[];
  references?: Record<string, unknown> | null;
}

export interface UpdateWorkspaceEntryInput {
  bodyMarkdown?: string | null;
  referenceIds?: readonly string[] | null;
  references?: Record<string, unknown> | null;
}

export interface CreateArcArtifactFamilyInput {
  idempotencyKey: string;
  kind: ArcArtifactKind;
  owningScope: ArcOwningScope;
  slug: string;
  targetTenantId?: string | null;
  title: string;
}

export interface ListArcArtifactFamiliesParameters {
  cursor?: string;
  kind?: ArcArtifactKind;
  owningScope?: ArcOwningScope;
  pageSize?: number;
  query?: string;
}

export interface OpenArcProposalInput {
  idempotencyKey: string;
  reviewedBaselineRevisionId?: string | null;
  sourceEvidenceId: string;
}

function optionalNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string")
    throw new Error(`Invalid API response: ${key} is not optional text.`);
  return value;
}

function requiredValue(record: Record<string, unknown>, key: string): unknown {
  if (!(key in record)) throw new Error(`Invalid API response: ${key} is missing.`);
  return record[key];
}

function parseStringArray(value: unknown, label: string): string[] {
  return requiredArray(value, label).map((item) => {
    if (typeof item !== "string") {
      throw new Error(`Invalid API response: ${label} contains a non-text value.`);
    }
    return item;
  });
}

function parseSessionSummary(value: unknown): SessionSummary {
  if (!isRecord(value)) throw new Error("Invalid API session summary.");
  return {
    event_count: requiredNumber(value, "event_count"),
    first_activity_at: requiredString(value, "first_activity_at"),
    last_activity_at: requiredString(value, "last_activity_at"),
    session_id: requiredString(value, "session_id"),
  };
}

function parseSessionEvent(value: unknown): SessionEvent {
  if (!isRecord(value)) throw new Error("Invalid API session event.");
  const metadata = value.metadata;
  if (!isRecord(metadata)) throw new Error("Invalid API response: metadata is not an object.");

  return {
    body: requiredString(value, "body"),
    created_at: requiredString(value, "created_at"),
    event_id: requiredString(value, "event_id"),
    kind: requiredString(value, "kind"),
    metadata: { ...metadata },
    seq: requiredNumber(value, "seq"),
    session_id: requiredString(value, "session_id"),
    tool_name: nullableString(value, "tool_name"),
  };
}

function parseMemoryCitation(value: unknown): MemoryCitation {
  if (!isRecord(value)) throw new Error("Invalid API memory citation.");
  return {
    excerpt: optionalNullableString(value, "excerpt"),
    kind: requiredString(value, "kind"),
    ref: requiredString(value, "ref"),
  };
}

function parseMemoryClaim(value: unknown): MemoryClaim {
  if (!isRecord(value)) throw new Error("Invalid API memory claim.");
  return {
    as_of: requiredString(value, "as_of"),
    authority: requiredString(value, "authority"),
    citations: requiredArray(value.citations, "claim citations").map(parseMemoryCitation),
    claim_category: requiredString(value, "claim_category"),
    claim_id: requiredString(value, "claim_id"),
    confidence: requiredNumber(value, "confidence"),
    human_confirmed: requiredBoolean(value, "human_confirmed"),
    label: requiredString(value, "label"),
    predicate: requiredString(value, "predicate"),
    subject_entity_id: requiredString(value, "subject_entity_id"),
    trust: requiredString(value, "trust"),
    trust_note: requiredString(value, "trust_note"),
    valid_from: requiredString(value, "valid_from"),
    valid_to: nullableString(value, "valid_to"),
    value: requiredValue(value, "value"),
  };
}

function parseMemoryClaimHistoryItem(value: unknown): MemoryClaimHistoryItem {
  if (!isRecord(value)) throw new Error("Invalid API memory claim history item.");
  return {
    bucket: nullableString(value, "bucket"),
    claim_id: requiredString(value, "claim_id"),
    confidence: nullableNumber(value, "confidence"),
    created_at: requiredString(value, "created_at"),
    is_contested: requiredBoolean(value, "is_contested"),
    predicate: requiredString(value, "predicate"),
    source_authority: requiredString(value, "source_authority"),
    status: requiredString(value, "status"),
    superseded_by: nullableString(value, "superseded_by"),
    superseded_reason: nullableString(value, "superseded_reason"),
    t_invalidated_at: nullableString(value, "t_invalidated_at"),
    value: requiredValue(value, "value"),
    was_current: requiredBoolean(value, "was_current"),
  };
}

function parseMemoryClaimHistory(value: unknown): MemoryClaimHistory {
  if (!isRecord(value)) throw new Error("Invalid API memory claim history.");
  return {
    items: requiredArray(value.items, "claim history items").map(parseMemoryClaimHistoryItem),
  };
}

function parseMemoryCurationItem(value: unknown): MemoryCurationItem {
  if (!isRecord(value)) throw new Error("Invalid API memory curation item.");
  return {
    available_actions: parseStringArray(value.available_actions, "curation actions"),
    claim_id: requiredString(value, "claim_id"),
    confidence: nullableNumber(value, "confidence"),
    created_at: requiredString(value, "created_at"),
    human_backed: requiredBoolean(value, "human_backed"),
    predicate: requiredString(value, "predicate"),
    proposal_id: nullableString(value, "proposal_id"),
    reason: requiredString(value, "reason"),
    subject_entity_id: nullableString(value, "subject_entity_id"),
    subject_reference: requiredString(value, "subject_reference"),
    value: requiredValue(value, "value"),
    // Why the row sits where it does. Parsed as required rather than defaulted:
    // a missing rank term silently reading as zero would render "no dependants"
    // for a subject the service ranked highly, which is worse than an error.
    escalated: requiredBoolean(value, "escalated"),
    dependant_count: requiredInteger(value, "dependant_count"),
    sampling_priority: requiredInteger(value, "sampling_priority"),
  };
}

export type DispositionPolicy = components["schemas"]["DispositionPolicyResponse"];
export type DispositionPolicyList = components["schemas"]["DispositionPolicyListResponse"];

function parseDispositionPolicy(value: unknown): DispositionPolicy {
  if (!isRecord(value)) throw new Error("Invalid API disposition policy.");
  return {
    disposition: requiredString(value, "disposition"),
    approval_authority: requiredString(value, "approval_authority"),
    evidence_threshold: requiredString(value, "evidence_threshold"),
    scope: requiredString(value, "scope"),
    supersession: requiredString(value, "supersession"),
    rollback: requiredString(value, "rollback"),
    target_kind: nullableString(value, "target_kind"),
  };
}

/**
 * What each disposition commits to, before anybody takes one.
 *
 * Read from the service rather than restated here. A client copy of these five
 * dimensions would be a second copy of a governance rule, diverging silently the
 * first time a policy changed — and the design standard is explicit that the UI
 * must not invent client-only governance gates.
 *
 * The service returns them in declaration order and that order carries meaning:
 * the first three settle a disagreement on the curator's own authority, the last
 * three ask an approver outside curation. Preserved, not sorted.
 */
export async function listDispositionPolicies(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<DispositionPolicyList> {
  const payload = await client.request(
    "/v1/memory/disposition-policies",
    requestOptions(context, signal),
  );
  if (!isRecord(payload)) throw new Error("Invalid API disposition policies.");
  return {
    items: requiredArray(payload.items, "disposition policies").map(parseDispositionPolicy),
  };
}

function parseMemoryCurationPage(value: unknown): MemoryCurationPage {
  if (!isRecord(value)) throw new Error("Invalid API memory curation page.");
  return {
    items: requiredArray(value.items, "curation items").map(parseMemoryCurationItem),
    next_cursor: nullableString(value, "next_cursor"),
  };
}

function parseMemoryCurationCounts(value: unknown): MemoryCurationCounts {
  if (!isRecord(value) || !isRecord(value.counts)) {
    throw new Error("Invalid API memory curation counts.");
  }
  const counts = Object.fromEntries(
    Object.entries(value.counts).map(([reason, count]) => {
      if (typeof count !== "number" || !Number.isInteger(count)) {
        throw new Error(`Invalid API response: count for ${reason} is not an integer.`);
      }
      return [reason, count];
    }),
  );
  return { counts };
}

function parseClaimAssertionReceipt(value: unknown): ClaimAssertionReceipt {
  if (!isRecord(value)) throw new Error("Invalid API claim assertion receipt.");
  return {
    claim_id: requiredString(value, "claim_id"),
    is_contested: requiredBoolean(value, "is_contested"),
    owning_tenant_id: nullableString(value, "owning_tenant_id"),
    predicate: requiredString(value, "predicate"),
    source_authority: requiredString(value, "source_authority"),
    status: requiredString(value, "status"),
    subject_entity_id: nullableString(value, "subject_entity_id"),
    value: requiredValue(value, "value"),
    visibility: requiredString(value, "visibility"),
  };
}

function parseClaimPredicate(value: unknown): ClaimPredicate {
  if (!isRecord(value)) throw new Error("Invalid API claim predicate.");
  return {
    claim_category: requiredString(value, "claim_category"),
    definition: requiredString(value, "definition"),
    deprecated_at: nullableString(value, "deprecated_at"),
    scope: requiredString(value, "scope"),
    value: requiredString(value, "value"),
    value_type: requiredString(value, "value_type"),
  };
}

function parseRelationshipDepth(record: Record<string, unknown>): RelationshipDepth {
  const depth = requiredInteger(record, "depth");
  if (depth !== 1 && depth !== 2 && depth !== 3 && depth !== 4 && depth !== 5) {
    throw new Error("Invalid API response: relationship depth is outside 1–5.");
  }
  return depth;
}

function parseRelationshipEdge(value: unknown): RelationshipEdge {
  if (!isRecord(value)) throw new Error("Invalid API relationship edge.");
  const properties = value.properties;
  if (properties !== null && !isRecord(properties)) {
    throw new Error("Invalid API response: edge properties are not an object or null.");
  }
  return {
    dst_entity_id: requiredString(value, "dst_entity_id"),
    edge_id: requiredString(value, "edge_id"),
    properties: properties === null ? null : { ...properties },
    rel: requiredString(value, "rel"),
    src_entity_id: requiredString(value, "src_entity_id"),
  };
}

function parseRelationshipEntity(value: unknown): RelationshipEntity {
  if (!isRecord(value)) throw new Error("Invalid API relationship entity.");
  return {
    created_at: requiredString(value, "created_at"),
    entity_id: requiredString(value, "entity_id"),
    entity_type: requiredString(value, "entity_type"),
    external_id: nullableString(value, "external_id"),
    name: requiredString(value, "name"),
  };
}

function parseVersionSatisfaction(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) {
    throw new Error("Invalid API response: version_satisfied is not an object.");
  }
  return Object.fromEntries(
    Object.entries(value).map(([edgeId, satisfied]) => {
      if (typeof satisfied !== "boolean") {
        throw new Error(`Invalid API response: version agreement for ${edgeId} is not boolean.`);
      }
      return [edgeId, satisfied];
    }),
  );
}

function parseRelationshipDependencyResult(value: unknown): RelationshipDependencyResult {
  if (!isRecord(value)) throw new Error("Invalid API dependency traversal.");
  return {
    as_of: nullableString(value, "as_of"),
    depth: parseRelationshipDepth(value),
    edges: requiredArray(value.edges, "relationship edges").map(parseRelationshipEdge),
    root_entity_id: requiredString(value, "root_entity_id"),
  };
}

function parseRelationshipTraversalResult(value: unknown): RelationshipTraversalResult {
  if (!isRecord(value)) throw new Error("Invalid API relationship traversal.");
  const direction = requiredString(value, "direction");
  if (direction !== "forward" && direction !== "reverse") {
    throw new Error("Invalid API response: unknown relationship direction.");
  }
  return {
    as_of: nullableString(value, "as_of"),
    cache_hit: requiredBoolean(value, "cache_hit"),
    depth: parseRelationshipDepth(value),
    direction,
    edges: requiredArray(value.edges, "relationship edges").map(parseRelationshipEdge),
    nodes: requiredArray(value.nodes, "relationship nodes").map(parseRelationshipEntity),
    root_entity_id: requiredString(value, "root_entity_id"),
    version_satisfied: parseVersionSatisfaction(value.version_satisfied),
  };
}

function parseRelationshipProjectionResult(value: unknown): RelationshipProjectionResult {
  if (!isRecord(value)) throw new Error("Invalid API relationship projection.");
  return {
    edges: requiredArray(value.edges, "relationship edges").map(parseRelationshipEdge),
    next_cursor: nullableString(value, "next_cursor"),
    nodes: requiredArray(value.nodes, "relationship nodes").map(parseRelationshipEntity),
  };
}

function parseWhoAmI(value: unknown): WhoAmI {
  if (!isRecord(value)) throw new Error("Invalid API identity response.");
  const roles = requiredArray(value.roles, "roles").map((role) => {
    if (typeof role !== "string") throw new Error("Invalid API response: role is not text.");
    return role;
  });

  return {
    actor_display_name: nullableString(value, "actor_display_name"),
    actor_email: nullableString(value, "actor_email"),
    actor_id: requiredString(value, "actor_id"),
    roles,
    tenant_display_name: requiredString(value, "tenant_display_name"),
    tenant_id: requiredString(value, "tenant_id"),
    tenant_slug: requiredString(value, "tenant_slug"),
  };
}

/**
 * A block name, checked against the list rather than against a hand-written
 * chain of comparisons.
 *
 * It was a chain, and the chain is how this came to know four blocks while the
 * envelope served five: adding a name to `contextBlockNames` did not add it
 * here, and nothing connected the two. Reading the list is what makes the
 * vocabulary have one definition.
 */
function parseContextBlockName(value: unknown): ContextBlockName {
  if (typeof value !== "string" || !(contextBlockNames as readonly string[]).includes(value)) {
    throw new Error(
      `Invalid API response: unknown context block ${String(value)}; the blocks are ${contextBlockNames.join(", ")}.`,
    );
  }
  return value as ContextBlockName;
}

function parseContextBlockState(value: unknown): ContextBlockState {
  if (value !== "success" && value !== "empty" && value !== "degraded" && value !== "failed") {
    throw new Error("Invalid API response: unknown context block state.");
  }
  return value;
}

function parseContextEnvelopeState(value: unknown): ContextEnvelopeState {
  if (value !== "complete" && value !== "degraded" && value !== "blocked") {
    throw new Error("Invalid API response: unknown context envelope state.");
  }
  return value;
}

function parseContextTrust(value: unknown): ContextTrust {
  if (!isRecord(value)) throw new Error("Invalid API context trust metadata.");
  return {
    assertion_kind: requiredString(value, "assertion_kind"),
    attribution: nullableString(value, "attribution"),
    authority: requiredString(value, "authority"),
    classification: requiredString(value, "classification"),
    freshness: nullableString(value, "freshness"),
    mutability: requiredString(value, "mutability"),
    source: requiredString(value, "source"),
    trust: requiredString(value, "trust"),
  };
}

function parseReceiptItemId(value: unknown): components["schemas"]["ReceiptItemIdResponse"] {
  if (!isRecord(value)) throw new Error("Invalid API receipt item identity.");
  return {
    block: requiredString(value, "block"),
    item_key: requiredString(value, "item_key"),
    source: requiredString(value, "source"),
    value: requiredString(value, "value"),
  };
}

function parseContextItem(value: unknown): ContextItem {
  if (!isRecord(value)) throw new Error("Invalid API context item.");
  if (!isRecord(value.payload)) {
    throw new Error("Invalid API response: context payload is not an object.");
  }
  return {
    payload: { ...value.payload },
    receipt_item_id: parseReceiptItemId(value.receipt_item_id),
    trust:
      value.trust === undefined || value.trust === null ? null : parseContextTrust(value.trust),
  };
}

function parseContextBlock(value: unknown): ContextBlock {
  if (!isRecord(value)) throw new Error("Invalid API context block.");
  return {
    items: requiredArray(value.items ?? [], "context block items").map(parseContextItem),
    name: parseContextBlockName(value.name),
    reason: optionalNullableString(value, "reason"),
    state: parseContextBlockState(value.state),
  };
}

/**
 * The disposition, refused rather than defaulted when unknown.
 *
 * A fourth value read as `not_declared` would report "nobody declared
 * instructions" about a resolution the service said something else about, on the
 * one field whose whole purpose is telling three near-identical states apart.
 */
function parseInstructionDisposition(value: unknown): InstructionDisposition {
  if (typeof value === "string" && (instructionDispositions as readonly string[]).includes(value)) {
    return value as InstructionDisposition;
  }
  throw new Error(
    `Invalid API response: instruction disposition ${String(value)} is not one of ${instructionDispositions.join(", ")}.`,
  );
}

function parseContextEnvelope(value: unknown): ContextEnvelope {
  if (!isRecord(value)) throw new Error("Invalid API context envelope.");
  const blocks = requiredArray(value.blocks, "context blocks").map(parseContextBlock);
  if (
    blocks.length !== contextBlockNames.length ||
    blocks.some((block, index) => block.name !== contextBlockNames[index])
  ) {
    throw new Error("Invalid API response: context blocks are not in contract order.");
  }
  if (!isRecord(value.quality)) {
    throw new Error("Invalid API response: context quality is not an object.");
  }
  return {
    arc_block_note: optionalNullableString(value, "arc_block_note"),
    blocks,
    instruction_block_note: optionalNullableString(value, "instruction_block_note"),
    instruction_disposition: parseInstructionDisposition(value.instruction_disposition),
    quality: {
      cacheable: requiredBoolean(value.quality, "cacheable"),
      degraded_blocks: parseStringArray(value.quality.degraded_blocks, "degraded context blocks"),
      reasons: parseStringArray(value.quality.reasons, "context quality reasons"),
    },
    receipt_id: requiredString(value, "receipt_id"),
    state: parseContextEnvelopeState(value.state),
  };
}

function parseContextReceipt(value: unknown): ContextReceipt {
  if (!isRecord(value)) throw new Error("Invalid API context receipt.");
  return {
    cacheable: requiredBoolean(value, "cacheable"),
    exclusion_count: requiredNumber(value, "exclusion_count"),
    // What the receipt says about its own completeness, separate from `state`.
    // A `string` in the contract rather than an enum, so it is carried through
    // rather than narrowed here — narrowing a vocabulary the contract leaves
    // open is how a value the server started sending becomes a parse failure.
    hydration_state: requiredString(value, "hydration_state"),
    intent_id: nullableString(value, "intent_id"),
    item_count: requiredNumber(value, "item_count"),
    receipt_id: requiredString(value, "receipt_id"),
    request_digest: nullableString(value, "request_digest"),
    requested_by: requiredString(value, "requested_by"),
    resolved_at: requiredString(value, "resolved_at"),
    state: parseContextEnvelopeState(value.state),
  };
}

function parseContextExclusion(value: unknown): ContextExclusion {
  if (!isRecord(value)) throw new Error("Invalid API context exclusion.");
  return {
    block: parseContextBlockName(value.block),
    item_key: requiredString(value, "item_key"),
    reason: requiredString(value, "reason"),
  };
}

function parseContextReference(value: unknown): ContextReference {
  if (!isRecord(value)) throw new Error("Invalid API context reference.");
  return {
    classification: requiredString(value, "classification"),
    external_id: requiredString(value, "external_id"),
    kind: requiredString(value, "kind"),
    source_namespace: requiredString(value, "source_namespace"),
    source_system: requiredString(value, "source_system"),
  };
}

function parseContextFeedback(value: unknown): ContextFeedback {
  if (!isRecord(value)) throw new Error("Invalid API context feedback response.");
  return {
    content_digest: requiredString(value, "content_digest"),
    created_at: requiredString(value, "created_at"),
    feedback_id: requiredString(value, "feedback_id"),
    kind: requiredString(value, "kind"),
    learning_eligible: requiredBoolean(value, "learning_eligible"),
    rating: requiredString(value, "rating"),
    receipt_id: nullableString(value, "receipt_id"),
    receipt_item_id: nullableString(value, "receipt_item_id"),
    replayed: requiredBoolean(value, "replayed"),
  };
}

function parsePromotionProposalState(value: unknown): PromotionProposalState {
  if (value !== "open" && value !== "accepted" && value !== "amended" && value !== "rejected") {
    throw new Error("Invalid API response: unknown proposal state.");
  }
  return value;
}

function parsePromotionProposal(value: unknown): PromotionProposal {
  if (!isRecord(value)) throw new Error("Invalid API promotion proposal.");
  const reasons = requiredArray(value.high_impact_reasons, "high-impact reasons").map((reason) => {
    if (typeof reason !== "string") {
      throw new Error("Invalid API response: high-impact reason is not text.");
    }
    return reason;
  });

  return {
    author_tenant_id: requiredString(value, "author_tenant_id"),
    claim_id: requiredString(value, "claim_id"),
    created_at: nullableString(value, "created_at"),
    current_value: requiredValue(value, "current_value"),
    high_impact: requiredBoolean(value, "high_impact"),
    high_impact_reasons: reasons,
    owner_tenant_id: requiredString(value, "owner_tenant_id"),
    predicate: requiredString(value, "predicate"),
    proposal_id: requiredString(value, "proposal_id"),
    proposed_value: requiredValue(value, "proposed_value"),
    state: parsePromotionProposalState(value.state),
    subject_entity_id: requiredString(value, "subject_entity_id"),
    target_key: requiredString(value, "target_key"),
    target_kind: requiredString(value, "target_kind"),
    valid_from: requiredString(value, "valid_from"),
    valid_to: nullableString(value, "valid_to"),
  };
}

function parsePromotionProposalPage(value: unknown): PromotionProposalPage {
  if (!isRecord(value)) throw new Error("Invalid API promotion proposal page.");
  return {
    items: requiredArray(value.items, "promotion proposals").map(parsePromotionProposal),
    next_cursor: nullableString(value, "next_cursor"),
  };
}

function parsePromotionProposalDecision(value: unknown): PromotionProposalDecision {
  if (!isRecord(value)) throw new Error("Invalid API promotion decision.");
  return {
    promotion_id: nullableString(value, "promotion_id"),
    proposal: parsePromotionProposal(value.proposal),
  };
}

function parseWorkspaceOwnerKind(value: unknown): WorkspaceOwnerKind {
  if (value !== "actor" && value !== "tenant") {
    throw new Error("Invalid API response: unknown workspace owner kind.");
  }
  return value;
}

function parseWorkspaceEntryKind(value: unknown): WorkspaceEntryKind {
  if (
    value !== "note" &&
    value !== "decision" &&
    value !== "open_question" &&
    value !== "saved_query" &&
    value !== "saved_view"
  ) {
    throw new Error("Invalid API response: unknown workspace entry kind.");
  }
  return value;
}

function parseWorkspace(value: unknown): Workspace {
  if (!isRecord(value)) throw new Error("Invalid API workspace response.");
  return {
    archived_at: optionalNullableString(value, "archived_at"),
    created_at: requiredString(value, "created_at"),
    created_by: optionalNullableString(value, "created_by"),
    description: optionalNullableString(value, "description"),
    name: requiredString(value, "name"),
    owner_actor_id: optionalNullableString(value, "owner_actor_id"),
    owner_kind: parseWorkspaceOwnerKind(value.owner_kind),
    t_invalidated_at: optionalNullableString(value, "t_invalidated_at"),
    tenant_id: requiredString(value, "tenant_id"),
    updated_at: requiredString(value, "updated_at"),
    workspace_id: requiredString(value, "workspace_id"),
  };
}

function parseWorkspaceWarning(value: unknown): WorkspaceWarning {
  if (!isRecord(value)) throw new Error("Invalid API workspace warning.");
  return {
    categories: parseStringArray(value.categories, "workspace warning categories"),
    field: requiredString(value, "field"),
  };
}

function parseWorkspaceEntry(value: unknown): WorkspaceEntry {
  if (!isRecord(value)) throw new Error("Invalid API workspace entry response.");
  const references = value.references_jsonb;
  if (references !== undefined && references !== null && !isRecord(references)) {
    throw new Error("Invalid API response: references_jsonb is not an object.");
  }
  const warnings = value.warnings;
  if (warnings !== undefined && !Array.isArray(warnings)) {
    throw new Error("Invalid API response: warnings is not an array.");
  }

  return {
    body_md: requiredString(value, "body_md"),
    created_at: requiredString(value, "created_at"),
    created_by: optionalNullableString(value, "created_by"),
    entry_id: requiredString(value, "entry_id"),
    expires_at: optionalNullableString(value, "expires_at"),
    kind: parseWorkspaceEntryKind(value.kind),
    reference_ids: parseStringArray(value.reference_ids, "workspace reference IDs"),
    references_jsonb: references ? { ...references } : null,
    tenant_id: requiredString(value, "tenant_id"),
    updated_at: requiredString(value, "updated_at"),
    warnings: warnings?.map(parseWorkspaceWarning) ?? [],
    workspace_id: requiredString(value, "workspace_id"),
  };
}

function parseWorkspacePage(value: unknown): WorkspacePage {
  if (!isRecord(value)) throw new Error("Invalid API workspace page.");
  return {
    items: requiredArray(value.items, "workspaces").map(parseWorkspace),
    next_cursor: nullableString(value, "next_cursor"),
  };
}

function parseWorkspaceEntryPage(value: unknown): WorkspaceEntryPage {
  if (!isRecord(value)) throw new Error("Invalid API workspace entry page.");
  return {
    items: requiredArray(value.items, "workspace entries").map(parseWorkspaceEntry),
    next_cursor: nullableString(value, "next_cursor"),
  };
}

function parseWorkspaceEntrySearchPage(value: unknown): WorkspaceEntrySearchPage {
  if (!isRecord(value)) throw new Error("Invalid API workspace entry search page.");
  return {
    items: requiredArray(value.items, "workspace entry search results").map(parseWorkspaceEntry),
    next_cursor: nullableString(value, "next_cursor"),
    total_count: nullableNumber(value, "total_count"),
  };
}

function parseSurfaceUsage(value: unknown): SurfaceUsageSummary {
  if (!isRecord(value)) throw new Error("Invalid API surface usage response.");
  const surface = requiredString(value, "surface");
  if (surface !== "mcp" && surface !== "rest") {
    throw new Error("Invalid API response: unknown usage surface.");
  }
  const reason = value.distinct_actors_unavailable_reason;
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    throw new Error("Invalid API response: distinct actor reason is not text.");
  }

  return {
    actor_days: requiredNumber(value, "actor_days"),
    calls: requiredNumber(value, "calls"),
    distinct_actors: nullableNumber(value, "distinct_actors"),
    ...(reason === undefined ? {} : { distinct_actors_unavailable_reason: reason }),
    error_calls: requiredNumber(value, "error_calls"),
    ok_calls: requiredNumber(value, "ok_calls"),
    payload_bytes: nullableNumber(value, "payload_bytes"),
    payload_tokens: nullableNumber(value, "payload_tokens"),
    surface,
    worst_daily_p95_ms: nullableNumber(value, "worst_daily_p95_ms"),
  };
}

function parseUsageSummary(value: unknown): UsageSummary {
  if (!isRecord(value)) throw new Error("Invalid API usage summary.");
  return {
    days: requiredNumber(value, "days"),
    end: requiredString(value, "end"),
    start: requiredString(value, "start"),
    surfaces: requiredArray(value.surfaces, "surfaces").map(parseSurfaceUsage),
  };
}

function parseToolUsage(value: unknown): ToolUsage {
  if (!isRecord(value)) throw new Error("Invalid API tool usage response.");
  return {
    actor_days: requiredNumber(value, "actor_days"),
    calls: requiredNumber(value, "calls"),
    error_calls: requiredNumber(value, "error_calls"),
    ok_calls: requiredNumber(value, "ok_calls"),
    tool: requiredString(value, "tool"),
    worst_daily_p95_ms: nullableNumber(value, "worst_daily_p95_ms"),
  };
}

function parseToolUsageRanking(value: unknown): ToolUsageRanking {
  if (!isRecord(value)) throw new Error("Invalid API tool ranking.");
  return {
    end: requiredString(value, "end"),
    start: requiredString(value, "start"),
    tools: requiredArray(value.tools, "tools").map(parseToolUsage),
  };
}

function parseCapabilityUsage(value: unknown): CapabilityUsage {
  if (!isRecord(value)) throw new Error("Invalid API capability usage response.");
  return {
    actor_days: requiredNumber(value, "actor_days"),
    calls: requiredNumber(value, "calls"),
    capability_id: requiredString(value, "capability_id"),
  };
}

function parseCapabilityUsageRanking(value: unknown): CapabilityUsageRanking {
  if (!isRecord(value)) throw new Error("Invalid API capability usage ranking.");
  return {
    capabilities: requiredArray(value.capabilities, "capabilities").map(parseCapabilityUsage),
    end: requiredString(value, "end"),
    start: requiredString(value, "start"),
  };
}

function parseDailyUsagePoint(value: unknown): DailyUsagePoint {
  if (!isRecord(value)) throw new Error("Invalid API daily usage point.");
  const surface = requiredString(value, "surface");
  if (surface !== "mcp" && surface !== "rest") {
    throw new Error("Invalid API response: unknown daily usage surface.");
  }
  return {
    calls: requiredNumber(value, "calls"),
    day: requiredString(value, "day"),
    distinct_actors: requiredNumber(value, "distinct_actors"),
    error_calls: requiredNumber(value, "error_calls"),
    ok_calls: requiredNumber(value, "ok_calls"),
    p50_ms: nullableNumber(value, "p50_ms"),
    p95_ms: nullableNumber(value, "p95_ms"),
    p99_ms: nullableNumber(value, "p99_ms"),
    surface,
  };
}

function parseDailyUsageSeries(value: unknown): DailyUsageSeries {
  if (!isRecord(value)) throw new Error("Invalid API daily usage series.");
  return {
    end: requiredString(value, "end"),
    points: requiredArray(value.points, "points").map(parseDailyUsagePoint),
    start: requiredString(value, "start"),
  };
}

function valueFrom<const Values extends readonly string[]>(
  value: unknown,
  values: Values,
  label: string,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`Invalid API response: unknown ${label}.`);
  }
  return value;
}

function parseArcActor(value: unknown): components["schemas"]["ActorRef"] {
  if (!isRecord(value)) throw new Error("Invalid API ARC actor reference.");
  return {
    issuer: requiredString(value, "issuer"),
    subject: requiredString(value, "subject"),
  };
}

function parseArcArtifactFamily(value: unknown): ArcArtifactFamily {
  if (!isRecord(value)) throw new Error("Invalid API ARC artifact family.");
  return {
    active_revision_id: optionalNullableString(value, "active_revision_id"),
    artifact_id: requiredString(value, "artifact_id"),
    created_at: requiredString(value, "created_at"),
    created_by: parseArcActor(requiredValue(value, "created_by")),
    kind: valueFrom(value.kind, arcArtifactKinds, "ARC artifact kind"),
    owning_scope: valueFrom(value.owning_scope, arcOwningScopes, "ARC owning scope"),
    slug: requiredString(value, "slug"),
    target_tenant_id: optionalNullableString(value, "target_tenant_id"),
    title: requiredString(value, "title"),
  };
}

function parseArcArtifactFamilyPage(value: unknown): ArcArtifactFamilyPage {
  if (!isRecord(value)) throw new Error("Invalid API ARC artifact family page.");
  return {
    items: requiredArray(value.items, "ARC artifact families").map(parseArcArtifactFamily),
    next_cursor: optionalNullableString(value, "next_cursor"),
  };
}

function parseArcRiskClassification(
  value: unknown,
): components["schemas"]["RiskClassification"] | null {
  if (value === null || value === undefined) return null;
  return valueFrom(value, arcRiskClassifications, "ARC risk classification");
}

function parseArcProposalSummary(value: unknown): components["schemas"]["ProposalSummary"] {
  if (!isRecord(value)) throw new Error("Invalid API ARC proposal summary.");
  return {
    artifact_id: requiredString(value, "artifact_id"),
    created_at: requiredString(value, "created_at"),
    proposal_id: requiredString(value, "proposal_id"),
    proposal_version: requiredInteger(value, "proposal_version"),
    risk_classification: parseArcRiskClassification(value.risk_classification),
    state: valueFrom(value.state, arcProposalStates, "ARC proposal state"),
  };
}

function parseArcProposalThread(value: unknown): ArcProposalThread {
  if (!isRecord(value)) throw new Error("Invalid API ARC proposal thread.");
  return {
    artifact_id: requiredString(value, "artifact_id"),
    latest_version: requiredInteger(value, "latest_version"),
    proposal_id: requiredString(value, "proposal_id"),
    versions: requiredArray(value.versions, "ARC proposal versions").map(parseArcProposalSummary),
  };
}

export function parseArcProposalVersion(value: unknown): ArcProposalVersion {
  if (!isRecord(value)) throw new Error("Invalid API ARC proposal version.");
  return {
    allowed_transitions: requiredArray(value.allowed_transitions, "ARC allowed transitions").map(
      (transition) => valueFrom(transition, arcProposalStates, "ARC proposal transition"),
    ),
    artifact_id: requiredString(value, "artifact_id"),
    available_actions: requiredArray(value.available_actions, "ARC available actions").map(
      (action) => valueFrom(action, arcAvailableActions, "ARC available action"),
    ),
    created_at: requiredString(value, "created_at"),
    frozen_at: optionalNullableString(value, "frozen_at"),
    operational_integrity_state: valueFrom(
      value.operational_integrity_state,
      arcIntegrityStates,
      "ARC operational integrity state",
    ),
    proposal_id: requiredString(value, "proposal_id"),
    proposal_version: requiredInteger(value, "proposal_version"),
    reason_codes: parseStringArray(value.reason_codes, "ARC reason codes"),
    reviewed_baseline_revision_id: optionalNullableString(value, "reviewed_baseline_revision_id"),
    revision_id: optionalNullableString(value, "revision_id"),
    risk_algorithm_version: optionalNullableString(value, "risk_algorithm_version"),
    risk_classification: parseArcRiskClassification(value.risk_classification),
    source_evidence_id: requiredString(value, "source_evidence_id"),
    state: valueFrom(value.state, arcProposalStates, "ARC proposal state"),
  };
}

function parseArcValidationResult(value: unknown): ArcValidationResult {
  if (!isRecord(value)) throw new Error("Invalid API ARC validation result.");
  return {
    errors: requiredArray(value.errors, "ARC validation errors").map((error) => {
      if (!isRecord(error)) throw new Error("Invalid API ARC validation error.");
      return {
        code: requiredString(error, "code"),
        field_path: requiredString(error, "field_path"),
        message: requiredString(error, "message"),
      };
    }),
    valid: requiredBoolean(value, "valid"),
  };
}

function parseArcStructuredResponse(value: unknown, label: string): ArcStructuredResponse {
  if (!isRecord(value)) throw new Error(`Invalid API ${label}.`);
  return value;
}

function appendIfDefined(
  parameters: URLSearchParams,
  key: string,
  value: string | number | undefined,
) {
  if (value !== undefined) parameters.set(key, String(value));
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

export async function getWhoAmI(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<WhoAmI> {
  return parseWhoAmI(await client.request("/v1/whoami", requestOptions(context, signal)));
}

export async function resolveContext(
  client: ContextplaneClient,
  input: ResolveContextInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ContextEnvelope> {
  const payload = await client.request("/v1/context/resolve", {
    ...requestOptions(context, signal),
    body: {
      ...(input.arcReceiptId ? { arc_receipt_id: input.arcReceiptId } : {}),
      ...(input.intentIds && input.intentIds.length > 0
        ? { intent_ids: [...input.intentIds] }
        : {}),
      limit: input.limit ?? 25,
      ...(input.maxAgeSeconds === undefined ? {} : { max_age_s: input.maxAgeSeconds }),
      query: input.query,
      ...(input.subjectEntityId ? { subject_entity_id: input.subjectEntityId } : {}),
      ...(input.workspaceTerm ? { workspace_term: input.workspaceTerm } : {}),
    } satisfies components["schemas"]["ContextResolveRequest"],
    method: "POST",
  });
  return parseContextEnvelope(payload);
}

/**
 * Every receipt that cited one external reference.
 *
 * The only way to *find* a receipt without already holding its id. All four
 * coordinates are required by the contract, and deliberately: a partial
 * reference would match across source systems and return receipts about a
 * different thing that happens to share a name.
 */
export async function findReceiptsByReference(
  client: ContextplaneClient,
  reference: {
    external_id: string;
    kind: string;
    source_namespace: string;
    source_system: string;
  },
  limit?: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly ContextReceipt[]> {
  const query = new URLSearchParams({
    external_id: reference.external_id,
    kind: reference.kind,
    source_namespace: reference.source_namespace,
    source_system: reference.source_system,
  });
  if (limit !== undefined) query.set("limit", String(limit));
  const payload = await client.request(
    `/v1/receipts/by-reference?${query.toString()}`,
    requestOptions(context, signal),
  );
  if (!isRecord(payload)) throw new Error("Invalid API receipt list.");
  return requiredArray(payload.receipts, "receipts").map(parseContextReceipt);
}

export async function getContextReceipt(
  client: ContextplaneClient,
  receiptId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ContextReceipt> {
  const payload = await client.request(
    `/v1/receipts/${encodeURIComponent(receiptId)}`,
    requestOptions(context, signal),
  );
  return parseContextReceipt(payload);
}

export async function getContextReceiptExclusions(
  client: ContextplaneClient,
  receiptId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly ContextExclusion[]> {
  const payload = await client.request(
    `/v1/receipts/${encodeURIComponent(receiptId)}/exclusions`,
    requestOptions(context, signal),
  );
  if (!isRecord(payload)) throw new Error("Invalid API context exclusion list.");
  return requiredArray(payload.exclusions, "context exclusions").map(parseContextExclusion);
}

export async function getContextReceiptReferences(
  client: ContextplaneClient,
  receiptId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly ContextReference[]> {
  const payload = await client.request(
    `/v1/receipts/${encodeURIComponent(receiptId)}/references`,
    requestOptions(context, signal),
  );
  if (!isRecord(payload)) throw new Error("Invalid API context reference list.");
  return requiredArray(payload.references, "context references").map(parseContextReference);
}

export async function recordContextFeedback(
  client: ContextplaneClient,
  input: RecordContextFeedbackInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ContextFeedback> {
  const payload = await client.request("/v1/context/feedback", {
    ...requestOptions(context, signal),
    body: {
      idempotency_key: input.idempotencyKey,
      kind: "item_specific",
      learning_eligible: input.learningEligible ?? true,
      ...(input.note === undefined ? {} : { note: input.note }),
      rating: input.rating,
      receipt_id: input.receiptId,
      receipt_item_id: input.receiptItemId,
      reporter_id: input.reporterId,
      reporter_type: "human",
    } satisfies components["schemas"]["ContextFeedbackRequest"],
    method: "POST",
  });
  return parseContextFeedback(payload);
}

export async function listMemoryClaims(
  client: ContextplaneClient,
  parameters: ListMemoryClaimsParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly MemoryClaim[]> {
  const search = new URLSearchParams();
  appendIfDefined(search, "subject_entity_id", parameters.subjectEntityId);
  appendIfDefined(search, "predicate", parameters.predicate);
  appendIfDefined(search, "category", parameters.category);
  appendIfDefined(search, "namespace_prefix", parameters.namespacePrefix);
  appendIfDefined(search, "min_confidence", parameters.minConfidence);
  appendIfDefined(search, "as_of", parameters.asOf);
  appendIfDefined(search, "persona", parameters.persona);
  appendIfDefined(search, "limit", parameters.limit);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/memory/claims${query}`,
    requestOptions(context, signal),
  );
  return requiredArray(payload, "memory claims").map(parseMemoryClaim);
}

export async function searchMemoryClaims(
  client: ContextplaneClient,
  parameters: SearchMemoryClaimsParameters,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly MemoryClaim[]> {
  const search = new URLSearchParams({ q: parameters.query });
  appendIfDefined(search, "namespace_prefix", parameters.namespacePrefix);
  appendIfDefined(search, "category", parameters.category);
  appendIfDefined(search, "min_confidence", parameters.minConfidence);
  appendIfDefined(search, "persona", parameters.persona);
  appendIfDefined(search, "top_k", parameters.topK);
  const payload = await client.request(
    `/v1/memory/claims/search?${search.toString()}`,
    requestOptions(context, signal),
  );
  return requiredArray(payload, "memory claim search results").map(parseMemoryClaim);
}

export async function getMemoryClaim(
  client: ContextplaneClient,
  claimId: string,
  persona: MemoryClaimPersona = "agent",
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<MemoryClaim> {
  const search = new URLSearchParams({ persona });
  const payload = await client.request(
    `/v1/memory/claims/${encodeURIComponent(claimId)}?${search.toString()}`,
    requestOptions(context, signal),
  );
  return parseMemoryClaim(payload);
}

export async function getMemoryClaimHistory(
  client: ContextplaneClient,
  claimId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<MemoryClaimHistory> {
  const payload = await client.request(
    `/v1/memory/claims/${encodeURIComponent(claimId)}/history`,
    requestOptions(context, signal),
  );
  return parseMemoryClaimHistory(payload);
}

export async function assertMemoryClaim(
  client: ContextplaneClient,
  input: AssertClaimInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ClaimAssertionReceipt> {
  const payload = await client.request("/v1/memory/claims", {
    ...requestOptions(context, signal),
    body: {
      ...(input.assertedValidFrom === undefined
        ? {}
        : { asserted_valid_from: input.assertedValidFrom }),
      ...(input.assertedValidTo === undefined ? {} : { asserted_valid_to: input.assertedValidTo }),
      evidence: input.evidence.map((item) => ({
        ...(item.excerpt === undefined ? {} : { excerpt: item.excerpt }),
        kind: item.kind,
        ref: item.ref,
      })),
      ...(input.namespace === undefined ? {} : { namespace: input.namespace }),
      predicate: input.predicate,
      subject_reference: input.subjectReference,
      value: input.value,
      ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
    },
    headers: { "Idempotency-Key": input.idempotencyKey },
    method: "POST",
  });
  return parseClaimAssertionReceipt(payload);
}

export async function listClaimPredicates(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly ClaimPredicate[]> {
  const payload = await client.request(
    "/v1/operator/claim-predicates",
    requestOptions(context, signal),
  );
  return requiredArray(payload, "claim predicates").map(parseClaimPredicate);
}

export async function listMemoryCurationQueue(
  client: ContextplaneClient,
  parameters: ListMemoryCurationParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<MemoryCurationPage> {
  const search = new URLSearchParams();
  appendIfDefined(search, "cursor", parameters.cursor);
  appendIfDefined(search, "page_size", parameters.pageSize);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/memory/curation-queue${query}`,
    requestOptions(context, signal),
  );
  return parseMemoryCurationPage(payload);
}

export async function getMemoryCurationCounts(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<MemoryCurationCounts> {
  const payload = await client.request(
    "/v1/memory/curation-queue?counts=true",
    requestOptions(context, signal),
  );
  return parseMemoryCurationCounts(payload);
}

export async function getRelationshipDependencies(
  client: ContextplaneClient,
  entityId: string,
  parameters: GetRelationshipDependenciesParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<RelationshipDependencyResult> {
  const search = new URLSearchParams();
  appendIfDefined(search, "depth", parameters.depth);
  appendIfDefined(search, "as_of", parameters.asOf);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/capabilities/${encodeURIComponent(entityId)}/dependencies${query}`,
    requestOptions(context, signal),
  );
  return parseRelationshipDependencyResult(payload);
}

export async function getRelationshipDependents(
  client: ContextplaneClient,
  entityId: string,
  parameters: GetRelationshipTraversalParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<RelationshipTraversalResult> {
  const search = new URLSearchParams();
  appendIfDefined(search, "depth", parameters.depth);
  appendIfDefined(
    search,
    "edge_types",
    parameters.edgeTypes && parameters.edgeTypes.length > 0
      ? parameters.edgeTypes.join(",")
      : undefined,
  );
  appendIfDefined(search, "as_of", parameters.asOf);
  appendIfDefined(search, "as_of_version", parameters.asOfVersion);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/capabilities/${encodeURIComponent(entityId)}/dependents${query}`,
    requestOptions(context, signal),
  );
  return parseRelationshipTraversalResult(payload);
}

export async function getRelationshipBlastRadius(
  client: ContextplaneClient,
  entityId: string,
  parameters: GetRelationshipBlastRadiusParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<RelationshipTraversalResult> {
  const search = new URLSearchParams();
  appendIfDefined(search, "direction", parameters.direction);
  appendIfDefined(search, "depth", parameters.depth);
  appendIfDefined(
    search,
    "edge_types",
    parameters.edgeTypes && parameters.edgeTypes.length > 0
      ? parameters.edgeTypes.join(",")
      : undefined,
  );
  appendIfDefined(search, "as_of", parameters.asOf);
  appendIfDefined(search, "as_of_version", parameters.asOfVersion);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/capabilities/${encodeURIComponent(entityId)}/blast-radius${query}`,
    requestOptions(context, signal),
  );
  return parseRelationshipTraversalResult(payload);
}

async function getRelationshipProjection(
  client: ContextplaneClient,
  direction: "consumer" | "provider",
  parameters: GetRelationshipProjectionParameters,
  context: ContextplaneRequestOptions,
  signal?: AbortSignal,
): Promise<RelationshipProjectionResult> {
  const search = new URLSearchParams();
  appendIfDefined(search, "cursor", parameters.cursor);
  appendIfDefined(search, "page_size", parameters.pageSize);
  appendIfDefined(search, "as_of", parameters.asOf);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/graph/${direction}${query}`,
    requestOptions(context, signal),
  );
  return parseRelationshipProjectionResult(payload);
}

export async function getProviderRelationshipProjection(
  client: ContextplaneClient,
  parameters: GetRelationshipProjectionParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<RelationshipProjectionResult> {
  return getRelationshipProjection(client, "provider", parameters, context, signal);
}

export async function getConsumerRelationshipProjection(
  client: ContextplaneClient,
  parameters: GetRelationshipProjectionParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<RelationshipProjectionResult> {
  return getRelationshipProjection(client, "consumer", parameters, context, signal);
}

export async function listSessions(
  client: ContextplaneClient,
  parameters: ListSessionsParameters,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly SessionSummary[]> {
  const search = new URLSearchParams();
  appendIfDefined(search, "since", parameters.since);
  appendIfDefined(search, "limit", parameters.limit);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/memory/sessions${query}`,
    requestOptions(context, signal),
  );
  return requiredArray(payload, "sessions").map(parseSessionSummary);
}

export async function listSessionEvents(
  client: ContextplaneClient,
  sessionId: string,
  parameters: ListSessionEventsParameters,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly SessionEvent[]> {
  const search = new URLSearchParams();
  appendIfDefined(search, "cursor", parameters.cursor);
  appendIfDefined(search, "kind", parameters.kind);
  appendIfDefined(search, "limit", parameters.limit);
  appendIfDefined(search, "order", parameters.order);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const path = `/v1/memory/sessions/${encodeURIComponent(sessionId)}/events${query}`;
  const payload = await client.request(path, requestOptions(context, signal));
  return requiredArray(payload, "session events").map(parseSessionEvent);
}

export async function listPromotionProposals(
  client: ContextplaneClient,
  parameters: ListPromotionProposalsParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<PromotionProposalPage> {
  const search = new URLSearchParams();
  appendIfDefined(search, "state", parameters.state);
  appendIfDefined(search, "cursor", parameters.cursor);
  appendIfDefined(search, "page_size", parameters.pageSize);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/memory/promotion-proposals${query}`,
    requestOptions(context, signal),
  );
  return parsePromotionProposalPage(payload);
}

export async function getPromotionProposal(
  client: ContextplaneClient,
  proposalId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<PromotionProposal> {
  const payload = await client.request(
    `/v1/memory/promotion-proposals/${encodeURIComponent(proposalId)}`,
    requestOptions(context, signal),
  );
  return parsePromotionProposal(payload);
}

export async function reviewPromotionProposal(
  client: ContextplaneClient,
  proposalId: string,
  decision: ReviewPromotionProposalInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<PromotionProposalDecision> {
  const body =
    decision.state === "accepted"
      ? {
          ...(Object.hasOwn(decision, "amendedValue")
            ? { amended_value: decision.amendedValue }
            : {}),
          state: decision.state,
        }
      : { reason: decision.reason, state: decision.state };
  const payload = await client.request(
    `/v1/memory/promotion-proposals/${encodeURIComponent(proposalId)}`,
    {
      ...requestOptions(context, signal),
      body,
      method: "PATCH",
    },
  );
  return parsePromotionProposalDecision(payload);
}

export async function listWorkspaces(
  client: ContextplaneClient,
  parameters: ListWorkspacesParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<WorkspacePage> {
  const search = new URLSearchParams();
  if (parameters.includeArchived) search.set("include_archived", "true");
  appendIfDefined(search, "cursor", parameters.cursor);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(`/v1/workspaces${query}`, requestOptions(context, signal));
  return parseWorkspacePage(payload);
}

export async function getWorkspace(
  client: ContextplaneClient,
  workspaceId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<Workspace> {
  const payload = await client.request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
    requestOptions(context, signal),
  );
  return parseWorkspace(payload);
}

export async function createWorkspace(
  client: ContextplaneClient,
  input: CreateWorkspaceInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<Workspace> {
  const payload = await client.request("/v1/workspaces", {
    ...requestOptions(context, signal),
    body: {
      ...(input.description === undefined ? {} : { description: input.description }),
      name: input.name,
      owner_kind: input.ownerKind,
    },
    method: "POST",
  });
  return parseWorkspace(payload);
}

export async function updateWorkspace(
  client: ContextplaneClient,
  workspaceId: string,
  input: UpdateWorkspaceInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<Workspace> {
  const payload = await client.request(`/v1/workspaces/${encodeURIComponent(workspaceId)}`, {
    ...requestOptions(context, signal),
    body: {
      ...(input.archivedAt === undefined ? {} : { archived_at: input.archivedAt }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.name === undefined ? {} : { name: input.name }),
    },
    method: "PATCH",
  });
  return parseWorkspace(payload);
}

export async function deleteWorkspace(
  client: ContextplaneClient,
  workspaceId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/workspaces/${encodeURIComponent(workspaceId)}`, {
    ...requestOptions(context, signal),
    method: "DELETE",
  });
}

export async function listWorkspaceEntries(
  client: ContextplaneClient,
  workspaceId: string,
  parameters: ListWorkspaceEntriesParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<WorkspaceEntryPage> {
  const search = new URLSearchParams();
  appendIfDefined(search, "kind", parameters.kind);
  appendIfDefined(search, "cursor", parameters.cursor);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/entries${query}`,
    requestOptions(context, signal),
  );
  return parseWorkspaceEntryPage(payload);
}

export async function searchWorkspaceEntries(
  client: ContextplaneClient,
  parameters: SearchWorkspaceEntriesParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<WorkspaceEntrySearchPage> {
  const search = new URLSearchParams();
  appendIfDefined(search, "q", parameters.query);
  appendIfDefined(search, "kind", parameters.kind);
  appendIfDefined(search, "owner_actor_id", parameters.ownerActorId);
  if (parameters.referenceIds) search.set("reference_ids", parameters.referenceIds.join(","));
  appendIfDefined(search, "cursor", parameters.cursor);
  const query = search.size > 0 ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/workspaces/search${query}`,
    requestOptions(context, signal),
  );
  return parseWorkspaceEntrySearchPage(payload);
}

export async function createWorkspaceEntry(
  client: ContextplaneClient,
  workspaceId: string,
  input: CreateWorkspaceEntryInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<WorkspaceEntry> {
  const payload = await client.request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/entries`,
    {
      ...requestOptions(context, signal),
      body: {
        body_md: input.bodyMarkdown,
        ...(input.expiresAt === undefined ? {} : { expires_at: input.expiresAt }),
        kind: input.kind,
        ...(input.referenceIds === undefined ? {} : { reference_ids: [...input.referenceIds] }),
        ...(input.references === undefined ? {} : { references_jsonb: input.references }),
      },
      method: "POST",
    },
  );
  return parseWorkspaceEntry(payload);
}

export async function updateWorkspaceEntry(
  client: ContextplaneClient,
  workspaceId: string,
  entryId: string,
  input: UpdateWorkspaceEntryInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<WorkspaceEntry> {
  const payload = await client.request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/entries/${encodeURIComponent(entryId)}`,
    {
      ...requestOptions(context, signal),
      body: {
        ...(input.bodyMarkdown === undefined ? {} : { body_md: input.bodyMarkdown }),
        ...(input.referenceIds === undefined
          ? {}
          : { reference_ids: input.referenceIds ? [...input.referenceIds] : null }),
        ...(input.references === undefined ? {} : { references_jsonb: input.references }),
      },
      method: "PATCH",
    },
  );
  return parseWorkspaceEntry(payload);
}

export async function deleteWorkspaceEntry(
  client: ContextplaneClient,
  workspaceId: string,
  entryId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/entries/${encodeURIComponent(entryId)}`,
    {
      ...requestOptions(context, signal),
      method: "DELETE",
    },
  );
}

export async function createArcArtifactFamily(
  client: ContextplaneClient,
  input: CreateArcArtifactFamilyInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcArtifactFamily> {
  const body = {
    kind: input.kind,
    owning_scope: input.owningScope,
    slug: input.slug,
    ...(input.targetTenantId === undefined ? {} : { target_tenant_id: input.targetTenantId }),
    title: input.title,
  } satisfies components["schemas"]["ArtifactFamilyCreate"];
  const payload = await client.request("/v1/arc/artifacts", {
    ...requestOptions(context, signal),
    body,
    headers: { "Idempotency-Key": input.idempotencyKey },
    method: "POST",
  });
  return parseArcArtifactFamily(payload);
}

export async function listArcArtifactFamilies(
  client: ContextplaneClient,
  parameters: ListArcArtifactFamiliesParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcArtifactFamilyPage> {
  const search = new URLSearchParams();
  appendIfDefined(search, "cursor", parameters.cursor);
  appendIfDefined(search, "kind", parameters.kind);
  appendIfDefined(search, "owning_scope", parameters.owningScope);
  appendIfDefined(search, "page_size", parameters.pageSize);
  appendIfDefined(search, "q", parameters.query);
  const suffix = search.size ? `?${search.toString()}` : "";
  const payload = await client.request(
    `/v1/arc/artifacts${suffix}`,
    requestOptions(context, signal),
  );
  return parseArcArtifactFamilyPage(payload);
}

export async function getArcArtifactFamily(
  client: ContextplaneClient,
  artifactId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcArtifactFamily> {
  const payload = await client.request(
    `/v1/arc/artifacts/${encodeURIComponent(artifactId)}`,
    requestOptions(context, signal),
  );
  return parseArcArtifactFamily(payload);
}

export async function openArcProposal(
  client: ContextplaneClient,
  artifactId: string,
  input: OpenArcProposalInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProposalVersion> {
  const body = {
    ...(input.reviewedBaselineRevisionId === undefined
      ? {}
      : { reviewed_baseline_revision_id: input.reviewedBaselineRevisionId }),
    source_evidence_id: input.sourceEvidenceId,
  } satisfies components["schemas"]["ProposalOpenRequest"];
  const payload = await client.request(
    `/v1/arc/artifacts/${encodeURIComponent(artifactId)}/proposals`,
    {
      ...requestOptions(context, signal),
      body,
      headers: { "Idempotency-Key": input.idempotencyKey },
      method: "POST",
    },
  );
  return parseArcProposalVersion(payload);
}

export async function getArcProposalThread(
  client: ContextplaneClient,
  proposalId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProposalThread> {
  const payload = await client.request(
    `/v1/arc/proposals/${encodeURIComponent(proposalId)}`,
    requestOptions(context, signal),
  );
  return parseArcProposalThread(payload);
}

function arcProposalVersionPath(proposalId: string, proposalVersion: number): string {
  return `/v1/arc/proposals/${encodeURIComponent(proposalId)}/versions/${proposalVersion}`;
}

export async function getArcProposalVersion(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProposalVersion> {
  const payload = await client.request(
    arcProposalVersionPath(proposalId, proposalVersion),
    requestOptions(context, signal),
  );
  return parseArcProposalVersion(payload);
}

export async function editArcProposalVersion(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  input: ArcProposalPatchRequest,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcProposalVersion> {
  const payload = await client.request(arcProposalVersionPath(proposalId, proposalVersion), {
    ...requestOptions(context, signal),
    body: input,
    method: "PATCH",
  });
  return parseArcProposalVersion(payload);
}

export async function validateArcProposalVersion(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcValidationResult> {
  const payload = await client.request(
    `${arcProposalVersionPath(proposalId, proposalVersion)}/validate`,
    {
      ...requestOptions(context, signal),
      body: {},
      method: "POST",
    },
  );
  return parseArcValidationResult(payload);
}

export async function getArcReviewPackage(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcStructuredResponse> {
  const payload = await client.request(
    `${arcProposalVersionPath(proposalId, proposalVersion)}/review-package`,
    requestOptions(context, signal),
  );
  return parseArcStructuredResponse(payload, "ARC review package");
}

export async function getArcObservationStatus(
  client: ContextplaneClient,
  proposalId: string,
  proposalVersion: number,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcStructuredResponse> {
  const payload = await client.request(
    `${arcProposalVersionPath(proposalId, proposalVersion)}/observation`,
    requestOptions(context, signal),
  );
  return parseArcStructuredResponse(payload, "ARC observation status");
}

export async function getArcActivationEligibility(
  client: ContextplaneClient,
  revisionId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcStructuredResponse> {
  const payload = await client.request(
    `/v1/arc/revisions/${encodeURIComponent(revisionId)}/activation-eligibility`,
    requestOptions(context, signal),
  );
  return parseArcStructuredResponse(payload, "ARC activation eligibility");
}

export async function getArcResolutionReceipt(
  client: ContextplaneClient,
  receiptId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcStructuredResponse> {
  const payload = await client.request(
    `/v1/arc/receipts/${encodeURIComponent(receiptId)}`,
    requestOptions(context, signal),
  );
  return parseArcStructuredResponse(payload, "ARC resolution receipt");
}

export async function explainArcResolutionReceipt(
  client: ContextplaneClient,
  receiptId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ArcStructuredResponse> {
  const payload = await client.request(
    `/v1/arc/receipts/${encodeURIComponent(receiptId)}/explain`,
    requestOptions(context, signal),
  );
  return parseArcStructuredResponse(payload, "ARC receipt explanation");
}

export async function getUsageSummary(
  client: ContextplaneClient,
  parameters: UsageWindowParameters,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<UsageSummary> {
  const search = new URLSearchParams({ from: parameters.from, to: parameters.to });
  const payload = await client.request(
    `/v1/admin/usage/summary?${search.toString()}`,
    requestOptions(context, signal),
  );
  return parseUsageSummary(payload);
}

export async function getToolUsage(
  client: ContextplaneClient,
  parameters: UsageWindowParameters,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ToolUsageRanking> {
  const search = new URLSearchParams({ from: parameters.from, limit: "200", to: parameters.to });
  const payload = await client.request(
    `/v1/admin/usage/tools?${search.toString()}`,
    requestOptions(context, signal),
  );
  return parseToolUsageRanking(payload);
}

export async function getCapabilityUsage(
  client: ContextplaneClient,
  parameters: UsageWindowParameters,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CapabilityUsageRanking> {
  const search = new URLSearchParams({ from: parameters.from, limit: "200", to: parameters.to });
  const payload = await client.request(
    `/v1/admin/usage/capabilities?${search.toString()}`,
    requestOptions(context, signal),
  );
  return parseCapabilityUsageRanking(payload);
}

export async function getDailyUsageSeries(
  client: ContextplaneClient,
  parameters: UsageWindowParameters,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<DailyUsageSeries> {
  const search = new URLSearchParams({ from: parameters.from, to: parameters.to });
  const payload = await client.request(
    `/v1/admin/usage/series?${search.toString()}`,
    requestOptions(context, signal),
  );
  return parseDailyUsageSeries(payload);
}
