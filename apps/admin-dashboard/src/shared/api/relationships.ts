import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  isRecord,
  nullableNumber,
  nullableString,
  requiredBoolean,
  requiredString,
  optionalBoolean,
  requiredInteger,
} from "./parse";

export const relationshipWriteIntents = ["observation", "request", "authorized_approval"] as const;
export type RelationshipWriteIntent = (typeof relationshipWriteIntents)[number];

export const relationshipQueryDirections = ["outgoing", "incoming"] as const;
export type RelationshipQueryDirection = (typeof relationshipQueryDirections)[number];

export interface RelationshipEndpoints {
  destination_entity_id: string;
  source_entity_id: string;
}

/**
 * Either identifier, or both. The service decides whether they agree; sending
 * both is how a caller says what it believes the id it read earlier refers to.
 */
export interface RelationshipWriteIdentity {
  handle?: string;
  subjectId?: string;
}

export interface RelationshipTargetRevision {
  bindingRevision?: string;
  profileRevision: string;
}

export interface RelationshipTemporalInput {
  validFrom: string;
  validTo?: string | null;
}

export interface RelationshipProvenanceInput {
  confidence?: number;
  derivationMethod?: string;
  derivationProfile?: string;
  eventTime?: string;
  expiresAt?: string;
  externalRecordId: string;
  externalRecordRevision?: string;
  observedTime: string;
  sourceNamespace: string;
  sourceSystem: string;
}

export interface RelationshipWriteInput {
  approvalReference?: string;
  endpoints: RelationshipEndpoints;
  identity: RelationshipWriteIdentity;
  idempotencyKey: string;
  intent: RelationshipWriteIntent;
  properties?: Readonly<Record<string, unknown>>;
  provenance: RelationshipProvenanceInput;
  subjectType: string;
  targetRevision: RelationshipTargetRevision;
  temporal: RelationshipTemporalInput;
}

export interface RelationshipValidationOutcome {
  mode: string;
  truncated: boolean;
  valid: boolean;
  violations: readonly string[];
}

export interface RelationshipProfileAttribution {
  binding_id: string | null;
  enforcement_mode: string;
  profile_revision_id: string | null;
}

export interface RelationshipProvenanceSummary {
  authority: string | null;
  confidence: number | null;
  external_record_id: string | null;
  external_revision: string | null;
  freshness_state: string | null;
  source_system: string | null;
}

export interface RelationshipTemporalState {
  effective_from: string | null;
  effective_to: string | null;
  recorded_at: string | null;
}

export interface RelationshipWriteResult {
  effect: string;
  intent: RelationshipWriteIntent;
  profile: RelationshipProfileAttribution;
  readiness_state: string | null;
  relationship_id: string | null;
  review_entry_id: string | null;
  staged_claim_id: string | null;
  validation: RelationshipValidationOutcome;
}

export interface GovernedRelationship {
  endpoints: RelationshipEndpoints;
  is_inverse: boolean;
  profile: RelationshipProfileAttribution;
  properties: Readonly<Record<string, unknown>>;
  provenance: RelationshipProvenanceSummary;
  readiness_state: string;
  relationship_id: string;
  relationship_type: string;
  temporal: RelationshipTemporalState;
  validation: RelationshipValidationOutcome;
}

export interface GovernedRelationshipPage {
  has_more: boolean;
  items: readonly GovernedRelationship[];
  limit: number;
  offset: number;
}

/** A relationship together with the validator its read carried. */
export interface GovernedRelationshipRead {
  etag: string | null;
  relationship: GovernedRelationship;
}

/** The refusal code a stale `If-Match` comes back with. */
export const PRECONDITION_FAILED = "precondition_failed";

export interface RelationshipQueryInput {
  at?: string;
  direction?: RelationshipQueryDirection;
  entityId: string;
  limit?: number;
  offset?: number;
  relationshipType?: string;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid API response: ${label} is not an object.`);
  return value;
}

function parseWriteIntent(value: unknown): RelationshipWriteIntent {
  const found = relationshipWriteIntents.find((intent) => intent === value);
  if (!found) throw new Error("Invalid API response: unknown relationship write intent.");
  return found;
}

function parseEndpoints(value: unknown): RelationshipEndpoints {
  const record = requireRecord(value, "relationship endpoints");
  return {
    destination_entity_id: requiredString(record, "destination_entity_id"),
    source_entity_id: requiredString(record, "source_entity_id"),
  };
}

function parseValidation(value: unknown): RelationshipValidationOutcome {
  const record = requireRecord(value, "validation outcome");
  const violations = record.violations ?? [];
  if (!Array.isArray(violations)) {
    throw new Error("Invalid API response: validation violations are not a list.");
  }
  return {
    mode: requiredString(record, "mode"),
    truncated: optionalBoolean(record, "truncated", false),
    valid: requiredBoolean(record, "valid"),
    violations: violations.map((entry, index) => {
      if (typeof entry !== "string") {
        throw new Error(`Invalid API response: violation ${index} is not a string.`);
      }
      return entry;
    }),
  };
}

function parseProfileAttribution(value: unknown): RelationshipProfileAttribution {
  const record = requireRecord(value, "profile attribution");
  return {
    binding_id: nullableString(record, "binding_id"),
    enforcement_mode: requiredString(record, "enforcement_mode"),
    profile_revision_id: nullableString(record, "profile_revision_id"),
  };
}

function parseProvenanceSummary(value: unknown): RelationshipProvenanceSummary {
  const record = requireRecord(value, "provenance summary");
  return {
    authority: nullableString(record, "authority"),
    confidence: nullableNumber(record, "confidence"),
    external_record_id: nullableString(record, "external_record_id"),
    external_revision: nullableString(record, "external_revision"),
    freshness_state: nullableString(record, "freshness_state"),
    source_system: nullableString(record, "source_system"),
  };
}

function parseTemporalState(value: unknown): RelationshipTemporalState {
  const record = requireRecord(value ?? {}, "relationship temporal state");
  return {
    effective_from: nullableString(record, "effective_from"),
    effective_to: nullableString(record, "effective_to"),
    recorded_at: nullableString(record, "recorded_at"),
  };
}

function parseWriteResult(value: unknown): RelationshipWriteResult {
  const record = requireRecord(value, "relationship write result");
  return {
    effect: requiredString(record, "effect"),
    intent: parseWriteIntent(record.intent),
    profile: parseProfileAttribution(record.profile),
    readiness_state: nullableString(record, "readiness_state"),
    relationship_id: nullableString(record, "relationship_id"),
    review_entry_id: nullableString(record, "review_entry_id"),
    staged_claim_id: nullableString(record, "staged_claim_id"),
    validation: parseValidation(record.validation),
  };
}

function parseGovernedRelationship(value: unknown): GovernedRelationship {
  const record = requireRecord(value, "relationship");
  const properties = record.properties ?? {};
  if (!isRecord(properties)) {
    throw new Error("Invalid API response: relationship properties are not an object.");
  }
  return {
    endpoints: parseEndpoints(record.endpoints),
    is_inverse: optionalBoolean(record, "is_inverse", false),
    profile: parseProfileAttribution(record.profile),
    properties: { ...properties },
    provenance: parseProvenanceSummary(record.provenance),
    readiness_state: requiredString(record, "readiness_state"),
    relationship_id: requiredString(record, "relationship_id"),
    relationship_type: requiredString(record, "relationship_type"),
    temporal: parseTemporalState(record.temporal),
    validation: parseValidation(record.validation),
  };
}

function parseRelationshipPage(value: unknown): GovernedRelationshipPage {
  const record = requireRecord(value, "relationship page");
  if (!Array.isArray(record.items)) {
    throw new Error("Invalid API response: relationship page items are not a list.");
  }
  return {
    has_more: requiredBoolean(record, "has_more"),
    items: record.items.map(parseGovernedRelationship),
    limit: requiredInteger(record, "limit"),
    offset: requiredInteger(record, "offset"),
  };
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

function writeBody(input: RelationshipWriteInput): Record<string, unknown> {
  return {
    ...(input.approvalReference === undefined
      ? {}
      : { approval_reference: input.approvalReference }),
    endpoints: {
      destination_entity_id: input.endpoints.destination_entity_id,
      source_entity_id: input.endpoints.source_entity_id,
    },
    idempotency_key: input.idempotencyKey,
    identity: {
      ...(input.identity.handle === undefined ? {} : { handle: input.identity.handle }),
      ...(input.identity.subjectId === undefined ? {} : { subject_id: input.identity.subjectId }),
    },
    intent: input.intent,
    ...(input.properties === undefined ? {} : { properties: { ...input.properties } }),
    provenance: {
      ...(input.provenance.confidence === undefined
        ? {}
        : { confidence: input.provenance.confidence }),
      ...(input.provenance.derivationMethod === undefined
        ? {}
        : { derivation_method: input.provenance.derivationMethod }),
      ...(input.provenance.derivationProfile === undefined
        ? {}
        : { derivation_profile: input.provenance.derivationProfile }),
      ...(input.provenance.eventTime === undefined
        ? {}
        : { event_time: input.provenance.eventTime }),
      ...(input.provenance.expiresAt === undefined
        ? {}
        : { expires_at: input.provenance.expiresAt }),
      external_record_id: input.provenance.externalRecordId,
      ...(input.provenance.externalRecordRevision === undefined
        ? {}
        : { external_record_revision: input.provenance.externalRecordRevision }),
      observed_time: input.provenance.observedTime,
      source_namespace: input.provenance.sourceNamespace,
      source_system: input.provenance.sourceSystem,
    },
    subject_kind: "relationship",
    subject_type: input.subjectType,
    target_revision: {
      ...(input.targetRevision.bindingRevision === undefined
        ? {}
        : { binding_revision: input.targetRevision.bindingRevision }),
      profile_revision: input.targetRevision.profileRevision,
    },
    temporal: {
      valid_from: input.temporal.validFrom,
      ...(input.temporal.validTo === undefined ? {} : { valid_to: input.temporal.validTo }),
    },
  };
}

/**
 * The caller owns `idempotencyKey`: a fresh one per user-initiated create, the
 * same one only when retrying the identical body.
 */
export async function createRelationship(
  client: ContextplaneClient,
  input: RelationshipWriteInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<RelationshipWriteResult> {
  const payload = await client.request("/v1/relationships", {
    ...requestOptions(context, signal),
    body: writeBody(input),
    method: "POST",
  });
  return parseWriteResult(payload);
}

/**
 * Read one relationship, keeping the `ETag` the response carried.
 *
 * The validator is returned rather than cached here, because whoever holds the
 * draft is who must send it back. A client that remembered the last ETag it saw
 * would send a precondition for a read some other part of the app had made.
 */
export async function getRelationship(
  client: ContextplaneClient,
  relationshipId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<GovernedRelationshipRead> {
  const { etag, value } = await client.requestWithEtag(
    `/v1/relationships/${encodeURIComponent(relationshipId)}`,
    requestOptions(context, signal),
  );
  return { etag, relationship: parseGovernedRelationship(value) };
}

/**
 * Supersede the named relationship.
 *
 * `ifMatch` is the `ETag` from the detail read the draft was composed against.
 * Sending it turns a row that moved underneath into a `412` the caller can act
 * on — keep the draft, refetch, show the newer state — instead of a
 * supersession landing on something the operator never saw.
 *
 * Optional rather than required, because the service accepts its absence: an
 * adapter that forced one would have callers inventing a value to satisfy it,
 * and a fabricated precondition is worse than none.
 */
export async function updateRelationship(
  client: ContextplaneClient,
  relationshipId: string,
  input: RelationshipWriteInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
  ifMatch?: string,
): Promise<RelationshipWriteResult> {
  const payload = await client.request(`/v1/relationships/${encodeURIComponent(relationshipId)}`, {
    ...requestOptions(context, signal),
    body: writeBody(input),
    ...(ifMatch ? { headers: { "If-Match": ifMatch } } : {}),
    method: "PATCH",
  });
  return parseWriteResult(payload);
}

export async function queryRelationships(
  client: ContextplaneClient,
  input: RelationshipQueryInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<GovernedRelationshipPage> {
  const payload = await client.request("/v1/relationships:query", {
    ...requestOptions(context, signal),
    body: {
      ...(input.at === undefined ? {} : { at: input.at }),
      ...(input.direction === undefined ? {} : { direction: input.direction }),
      entity_id: input.entityId,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.offset === undefined ? {} : { offset: input.offset }),
      ...(input.relationshipType === undefined
        ? {}
        : { relationship_type: input.relationshipType }),
    },
    method: "POST",
  });
  return parseRelationshipPage(payload);
}
