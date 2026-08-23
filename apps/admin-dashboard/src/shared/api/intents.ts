/**
 * Task participants and the append-only checkpoint chain — who is working a
 * task, and what a second agent resumes from.
 *
 * Split out of `tenantWork.ts`; see `activity.ts` for why.
 */
import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";
import {
  nullableString,
  requiredArray,
  requiredNumber,
  requiredRecord,
  requiredString,
  stringArray,
} from "./parse";

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

export type AppendCheckpointInput = components["schemas"]["CheckpointAppend"];
export type AddParticipantInput = components["schemas"]["GrantCreate"];

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

/**
 * The binding governing this tenant, as the fields a writer needs.
 *
 * `getProfileConformance` returns the whole envelope untyped, which is right for
 * a settings page displaying it and wrong for a write path that has to name a
 * revision. This parses only what a caller must send or show.
 */
