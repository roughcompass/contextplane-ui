import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";

export type AssignOwnershipInput = components["schemas"]["AssignOwnershipRequestV1"];
export type OwnershipTransitionInput = components["schemas"]["TransitionRequestV1"];
export type PlanProfileBindingInput = components["schemas"]["PlanBindingRequest"];
export type ProfileBindingTransitionInput = components["schemas"]["BindingTransitionRequest"];
export type PublishProfileExtensionInput = components["schemas"]["PublishExtensionRequest"];
export type PublishProfileRevisionInput = components["schemas"]["PublishRevisionRequest"];
export type SignalIngestInput = components["schemas"]["SignalIngestRequest"];
export type AppendCheckpointInput = components["schemas"]["CheckpointAppend"];
export type AddParticipantInput = components["schemas"]["GrantCreate"];
export type StructuredServiceResult = Readonly<Record<string, unknown>> | readonly unknown[];

export interface TenantNotification {
  capabilityId: string;
  capabilitySlug: string;
  changeClassification: string | null;
  eventKind: string;
  fetchUrl: string;
  notificationId: string;
  occurredAt: string;
  subscriptionId: string | null;
  tenantId: string;
  versionAfter: string | null;
  versionBefore: string | null;
}

export interface TenantNotificationPage {
  items: readonly TenantNotification[];
  nextCursor: string | null;
}

export interface OwnershipAssignment {
  confidence: number | null;
  derivationMethod: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isPending: boolean;
  ownedTargetId: string;
  ownedTargetKind: string;
  ownerPrincipal: string;
  ownershipAssignmentId: string;
  provenanceId: string;
  recordedAt: string;
  recordedBy: string;
  replacedByAssignmentId: string | null;
  revocationReason: string | null;
  role: string;
  scope: string;
  source: string;
  validationState: string;
}

export interface IntentParticipant {
  actorId: string;
  expiresAt: string | null;
  grantedAt: string;
  grantedBy: string;
  intentId: string;
  resolverVersion: string;
  role: string;
}

export interface IntentCheckpoint {
  assumptions: readonly string[];
  author: string;
  checkpointId: string;
  completedChecks: readonly string[];
  decisions: readonly string[];
  digest: string;
  goal: string;
  intentId: string;
  nextAction: string | null;
  openQuestions: readonly string[];
  predecessorId: string | null;
  recordedAt: string;
  retentionPolicy: string;
  sequence: number;
}

export interface SignalIngestReceipt {
  authority: string;
  contentDigest: string;
  ingestedAt: string;
  replayed: boolean;
  signalId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`Invalid API response: ${label} is not an object.`);
  return value;
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid API response: ${label} is not an array.`);
  return value;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Invalid API response: ${key} is not text.`);
  return value;
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Invalid API response: ${key} is not text.`);
  return value;
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") throw new Error(`Invalid API response: ${key} is not boolean.`);
  return value;
}

function requiredNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid API response: ${key} is not a number.`);
  }
  return value;
}

function nullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid API response: ${key} is not a number.`);
  }
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  return requiredArray(value, label).map((item) => {
    if (typeof item !== "string") throw new Error(`Invalid API response: ${label} contains data.`);
    return item;
  });
}

function contextOptions(
  context: ContextplaneRequestOptions,
  signal?: AbortSignal,
): ContextplaneRequestOptions {
  return {
    ...(signal ? { signal } : {}),
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
  };
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function structured(value: unknown, label: string): StructuredServiceResult {
  if (Array.isArray(value)) return value;
  return requiredRecord(value, label);
}

function parseNotification(value: unknown): TenantNotification {
  const item = requiredRecord(value, "notification");
  return {
    capabilityId: requiredString(item, "capability_id"),
    capabilitySlug: requiredString(item, "capability_slug"),
    changeClassification: nullableString(item, "change_classification"),
    eventKind: requiredString(item, "event_kind"),
    fetchUrl: requiredString(item, "fetch_url"),
    notificationId: requiredString(item, "notification_id"),
    occurredAt: requiredString(item, "occurred_at"),
    subscriptionId: nullableString(item, "subscription_id"),
    tenantId: requiredString(item, "tenant_id"),
    versionAfter: nullableString(item, "version_after"),
    versionBefore: nullableString(item, "version_before"),
  };
}

function parseOwnership(value: unknown): OwnershipAssignment {
  const item = requiredRecord(value, "ownership assignment");
  return {
    confidence: nullableNumber(item, "confidence"),
    derivationMethod: nullableString(item, "derivation_method"),
    effectiveFrom: requiredString(item, "effective_from"),
    effectiveTo: nullableString(item, "effective_to"),
    isPending: requiredBoolean(item, "is_pending"),
    ownedTargetId: requiredString(item, "owned_target_id"),
    ownedTargetKind: requiredString(item, "owned_target_kind"),
    ownerPrincipal: requiredString(item, "owner_principal"),
    ownershipAssignmentId: requiredString(item, "ownership_assignment_id"),
    provenanceId: requiredString(item, "provenance_id"),
    recordedAt: requiredString(item, "recorded_at"),
    recordedBy: requiredString(item, "recorded_by"),
    replacedByAssignmentId: nullableString(item, "replaced_by_assignment_id"),
    revocationReason: nullableString(item, "revocation_reason"),
    role: requiredString(item, "role"),
    scope: requiredString(item, "scope"),
    source: requiredString(item, "source"),
    validationState: requiredString(item, "validation_state"),
  };
}

function parseParticipant(value: unknown): IntentParticipant {
  const item = requiredRecord(value, "intent participant");
  return {
    actorId: requiredString(item, "actor_id"),
    expiresAt: nullableString(item, "expires_at"),
    grantedAt: requiredString(item, "granted_at"),
    grantedBy: requiredString(item, "granted_by"),
    intentId: requiredString(item, "intent_id"),
    resolverVersion: requiredString(item, "resolver_version"),
    role: requiredString(item, "role"),
  };
}

function parseCheckpoint(value: unknown): IntentCheckpoint {
  const item = requiredRecord(value, "checkpoint");
  return {
    assumptions: stringArray(item.assumptions, "checkpoint assumptions"),
    author: requiredString(item, "author"),
    checkpointId: requiredString(item, "checkpoint_id"),
    completedChecks: stringArray(item.completed_checks, "checkpoint completed checks"),
    decisions: stringArray(item.decisions, "checkpoint decisions"),
    digest: requiredString(item, "digest"),
    goal: requiredString(item, "goal"),
    intentId: requiredString(item, "intent_id"),
    nextAction: nullableString(item, "next_action"),
    openQuestions: stringArray(item.open_questions, "checkpoint open questions"),
    predecessorId: nullableString(item, "predecessor_id"),
    recordedAt: requiredString(item, "recorded_at"),
    retentionPolicy: requiredString(item, "retention_policy"),
    sequence: requiredNumber(item, "sequence"),
  };
}

export async function listTenantNotifications(
  client: ContextplaneClient,
  parameters: { cursor?: string; pageSize?: number; status?: "all" | "read" | "unread" } = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<TenantNotificationPage> {
  const search = new URLSearchParams({
    page_size: String(parameters.pageSize ?? 50),
    status: parameters.status ?? "unread",
    view: "default",
  });
  if (parameters.cursor) search.set("cursor", parameters.cursor);
  const value = requiredRecord(
    await client.request(`/v1/notifications?${search.toString()}`, contextOptions(context, signal)),
    "notification page",
  );
  return {
    items: requiredArray(value.items, "notifications").map(parseNotification),
    nextCursor: nullableString(value, "next_cursor"),
  };
}

export async function markTenantNotificationRead(
  client: ContextplaneClient,
  notificationId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/notifications/${encode(notificationId)}:mark-read`, {
    ...contextOptions(context, signal),
    method: "POST",
  });
}

export async function getTenantLearningAggregates(
  client: ContextplaneClient,
  windowDays = 30,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request(
      `/v1/learning/aggregates?window_days=${encode(String(windowDays))}`,
      contextOptions(context, signal),
    ),
    "learning aggregates",
  );
}

export async function listTenantLearningMetrics(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/learning/metrics", contextOptions(context, signal)),
    "learning metrics",
  );
}

export async function ingestTenantSignal(
  client: ContextplaneClient,
  input: SignalIngestInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<SignalIngestReceipt> {
  const value = requiredRecord(
    await client.request("/v1/signals", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "signal receipt",
  );
  return {
    authority: requiredString(value, "authority"),
    contentDigest: requiredString(value, "content_digest"),
    ingestedAt: requiredString(value, "ingested_at"),
    replayed: requiredBoolean(value, "replayed"),
    signalId: requiredString(value, "signal_id"),
  };
}

export async function findTargetOwners(
  client: ContextplaneClient,
  targetKind: string,
  targetId: string,
  includePending: boolean,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly OwnershipAssignment[]> {
  const search = new URLSearchParams({
    include_pending: String(includePending),
    owned_target_id: targetId,
    owned_target_kind: targetKind,
  });
  const value = requiredRecord(
    await client.request(
      `/v1/ownership:owned-by?${search.toString()}`,
      contextOptions(context, signal),
    ),
    "ownership list",
  );
  return requiredArray(value.items, "ownership assignments").map(parseOwnership);
}

export async function listPrincipalOwnership(
  client: ContextplaneClient,
  ownerPrincipal: string,
  includePending: boolean,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly OwnershipAssignment[]> {
  const search = new URLSearchParams({
    include_pending: String(includePending),
    owner_principal: ownerPrincipal,
  });
  const value = requiredRecord(
    await client.request(
      `/v1/ownership:owns?${search.toString()}`,
      contextOptions(context, signal),
    ),
    "ownership list",
  );
  return requiredArray(value.items, "ownership assignments").map(parseOwnership);
}

export async function assignTenantOwnership(
  client: ContextplaneClient,
  input: AssignOwnershipInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<OwnershipAssignment> {
  return parseOwnership(
    await client.request("/v1/ownership/assignments", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
  );
}

export async function getTenantOwnershipAssignment(
  client: ContextplaneClient,
  assignmentId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<OwnershipAssignment> {
  return parseOwnership(
    await client.request(
      `/v1/ownership/assignments/${encode(assignmentId)}`,
      contextOptions(context, signal),
    ),
  );
}

export async function transitionTenantOwnership(
  client: ContextplaneClient,
  assignmentId: string,
  input: OwnershipTransitionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<OwnershipAssignment> {
  return parseOwnership(
    await client.request(`/v1/ownership/assignments/${encode(assignmentId)}:transition`, {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
  );
}

export async function getProfileConformance(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/profiles/conformance", contextOptions(context, signal)),
    "profile conformance",
  );
}

export async function planProfileBinding(
  client: ContextplaneClient,
  input: PlanProfileBindingInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/profiles/bindings", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "profile binding",
  );
}

export async function transitionProfileBinding(
  client: ContextplaneClient,
  bindingId: string,
  action: "activate" | "rollback" | "rollback/complete" | "validate",
  input: ProfileBindingTransitionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request(`/v1/profiles/bindings/${encode(bindingId)}/${action}`, {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "profile binding transition",
  );
}

export async function publishProfileExtension(
  client: ContextplaneClient,
  input: PublishProfileExtensionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/profiles/extensions", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "profile extension",
  );
}

export async function publishProfileRevision(
  client: ContextplaneClient,
  input: PublishProfileRevisionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/profiles/revisions", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "profile revision",
  );
}

export async function listIntentParticipants(
  client: ContextplaneClient,
  intentId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly IntentParticipant[]> {
  const value = requiredRecord(
    await client.request(
      `/v1/intents/${encode(intentId)}/participants`,
      contextOptions(context, signal),
    ),
    "participant list",
  );
  return requiredArray(value.grants, "intent participants").map(parseParticipant);
}

export async function addIntentParticipant(
  client: ContextplaneClient,
  intentId: string,
  input: AddParticipantInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<IntentParticipant> {
  return parseParticipant(
    await client.request(`/v1/intents/${encode(intentId)}/participants`, {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
  );
}

export async function removeIntentParticipant(
  client: ContextplaneClient,
  intentId: string,
  actorId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/intents/${encode(intentId)}/participants/${encode(actorId)}`, {
    ...contextOptions(context, signal),
    method: "DELETE",
  });
}

export async function appendIntentCheckpoint(
  client: ContextplaneClient,
  intentId: string,
  input: AppendCheckpointInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<IntentCheckpoint> {
  return parseCheckpoint(
    await client.request(`/v1/intents/${encode(intentId)}/checkpoints`, {
      ...contextOptions(context, signal),
      body: input,
      headers: { "Idempotency-Key": crypto.randomUUID() },
      method: "POST",
    }),
  );
}

export async function getIntentCheckpoint(
  client: ContextplaneClient,
  intentId: string,
  checkpointId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<IntentCheckpoint> {
  return parseCheckpoint(
    await client.request(
      `/v1/intents/${encode(intentId)}/checkpoints/${encode(checkpointId)}`,
      contextOptions(context, signal),
    ),
  );
}

export async function getIntentCheckpointByDigest(
  client: ContextplaneClient,
  digest: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<IntentCheckpoint> {
  return parseCheckpoint(
    await client.request(
      `/v1/checkpoints/by-digest/${encode(digest)}`,
      contextOptions(context, signal),
    ),
  );
}
