import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  relationshipWriteIntents,
  type RelationshipProfileAttribution,
  type RelationshipValidationOutcome,
  type RelationshipWriteIntent,
} from "./relationships";

/**
 * The generic, profile-governed entity write.
 *
 * Not the same surface as `POST /v1/concepts` and `POST /v1/operations`, which
 * take a name and mint a row. This one routes by `intent`: an ordinary agent's
 * observation stages a claim, a request opens an owner review entry, and only an
 * authorized approval writes canon. The two surfaces write the same table and
 * mean different things, so which one a caller wants depends on whether the
 * write should be reviewed.
 *
 * The intent vocabulary and the governance shapes are shared with the
 * relationship surface rather than restated: they are the same envelope, and two
 * copies would be two things to keep in step.
 */
export const entityWriteIntents = relationshipWriteIntents;
export type EntityWriteIntent = RelationshipWriteIntent;

export interface EntityWriteIdentity {
  handle?: string;
  subjectId?: string;
}

/**
 * What the caller attests it composed against.
 *
 * Both halves, because a revision id alone is silent about a rebind that changed
 * only the extension set — the case the field exists for. Both are optional at
 * this boundary in the sense that a caller supplies what it can read; the
 * contract requires `profileRevision`.
 */
export interface EntityTargetRevision {
  bindingRevision?: string;
  profileRevision: string;
}

export interface EntityProvenanceInput {
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

export interface EntityWriteInput {
  approvalReference?: string;
  identity: EntityWriteIdentity;
  idempotencyKey: string;
  intent: EntityWriteIntent;
  properties?: Readonly<Record<string, unknown>>;
  provenance: EntityProvenanceInput;
  subjectType: string;
  targetRevision: EntityTargetRevision;
  validFrom: string;
  validTo?: string | null;
}

export interface EntityWriteResult {
  effect: string;
  entity_id: string | null;
  intent: EntityWriteIntent;
  profile: RelationshipProfileAttribution;
  review_entry_id: string | null;
  staged_claim_id: string | null;
  validation: RelationshipValidationOutcome;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid API response: ${label} is not an object.`);
  return value;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Invalid API response: ${key} is not a string.`);
  return value;
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`Invalid API response: ${key} is not a string or null.`);
  }
  return value;
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`Invalid API response: ${key} is not a boolean.`);
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = record[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new Error(`Invalid API response: ${key} is not a boolean.`);
  return value;
}

function parseIntent(value: unknown): EntityWriteIntent {
  const found = entityWriteIntents.find((intent) => intent === value);
  if (!found) throw new Error("Invalid API response: unknown entity write intent.");
  return found;
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

function parseAttribution(value: unknown): RelationshipProfileAttribution {
  const record = requireRecord(value, "profile attribution");
  return {
    binding_id: nullableString(record, "binding_id"),
    enforcement_mode: requiredString(record, "enforcement_mode"),
    profile_revision_id: nullableString(record, "profile_revision_id"),
  };
}

function parseResult(value: unknown): EntityWriteResult {
  const record = requireRecord(value, "entity write result");
  return {
    effect: requiredString(record, "effect"),
    entity_id: nullableString(record, "entity_id"),
    intent: parseIntent(record.intent),
    profile: parseAttribution(record.profile),
    review_entry_id: nullableString(record, "review_entry_id"),
    staged_claim_id: nullableString(record, "staged_claim_id"),
    validation: parseValidation(record.validation),
  };
}

function writeBody(input: EntityWriteInput): Record<string, unknown> {
  return {
    ...(input.approvalReference === undefined
      ? {}
      : { approval_reference: input.approvalReference }),
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
    subject_kind: "entity",
    subject_type: input.subjectType,
    target_revision: {
      ...(input.targetRevision.bindingRevision === undefined
        ? {}
        : { binding_revision: input.targetRevision.bindingRevision }),
      profile_revision: input.targetRevision.profileRevision,
    },
    temporal: {
      valid_from: input.validFrom,
      ...(input.validTo === undefined ? {} : { valid_to: input.validTo }),
    },
  };
}

/**
 * Supersede an entity's properties through the governed surface.
 *
 * The subject is in the path, and that is the whole difference from
 * `assertEntity`: the service reads the write target from the route, never from
 * `identity.subject_id`, so posting to the create surface with a subject id in
 * the body does not update anything -- on the approval route it mints a second
 * entity. The contract calls this handler "the same three routes a create takes,
 * adding nothing to it but the subject", and the subject is exactly what a
 * caller cannot supply any other way.
 *
 * Removed once for having no caller and restored here with one.
 */
export async function updateEntity(
  client: ContextplaneClient,
  entityId: string,
  input: EntityWriteInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<EntityWriteResult> {
  const payload = await client.request(`/v1/entities/${encodeURIComponent(entityId)}`, {
    ...(signal ? { signal } : {}),
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
    body: writeBody(input),
    method: "PATCH",
  });
  return parseResult(payload);
}

/**
 * Assert an entity through the governed surface.
 *
 * The caller owns `idempotencyKey`: a fresh one per user-initiated write, the
 * same one only when retrying the identical body.
 */
export async function assertEntity(
  client: ContextplaneClient,
  input: EntityWriteInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<EntityWriteResult> {
  const payload = await client.request("/v1/entities", {
    ...(signal ? { signal } : {}),
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
    body: writeBody(input),
    method: "POST",
  });
  return parseResult(payload);
}
