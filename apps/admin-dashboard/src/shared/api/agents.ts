import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";

export type ProposeInstructionInput = components["schemas"]["ProposeInstructionRequest"];

/** One slice of an author's adjudicated record: overall, or one breakdown group. */
export interface AccuracyGroup {
  label: string;
  n_adjudicated: number;
  n_correct: number;
  n_decided: number;
  n_incorrect: number;
  n_undecidable: number;
  /**
   * Correct over decided, or `null` when nothing was decided.
   *
   * `null` rather than zero, and the distinction is the point: an author whose
   * claims nobody adjudicated has no accuracy, which is not the same as an
   * author who was wrong every time. A screen that renders `null` as `0%`
   * reports the second when the service said the first.
   */
  rate: number | null;
}

export interface AgentAccuracy {
  author_actor_id: string;
  breakdown: string;
  groups: readonly AccuracyGroup[];
  overall: AccuracyGroup;
  window_end: string;
  window_start: string;
}

export interface AgentAutonomy {
  author_actor_id: string;
  /** Sessions the author finished without a mid-session correction. `null` with no sessions. */
  autonomy_rate: number | null;
  intervention_rate: number | null;
  n_autonomous: number;
  n_intervened: number;
  n_sessions: number;
  window_end: string;
  window_start: string;
}

export interface FailureExample {
  claim_id: string;
  note: string | null;
  value: unknown;
}

export interface FailureGroup {
  claim_category: string;
  examples: readonly FailureExample[];
  /** How often this group appears among the failures. */
  incorrect_count: number;
  predicate: string;
  /**
   * Incorrect over judged. The figure to act on — a predicate used constantly
   * and mostly got right leads on `incorrect_count` by volume alone, which is
   * why both counts are carried and the rate is what the table sorts on.
   */
  rate: number | null;
  /** How often this group was judged at all. */
  total_count: number;
}

export interface FailurePatternReport {
  author_actor_id: string;
  groups: readonly FailureGroup[];
  n_adjudicated: number;
  n_incorrect: number;
  n_intervention_sessions: number;
  n_sessions: number;
  report_id: string;
  window_end: string;
  window_start: string;
}

export interface AgentInstruction {
  activated_at: string | null;
  author_actor_id: string;
  content: string;
  instruction_id: string;
  motivated_by_report_id: string | null;
  status: string;
  superseded_at: string | null;
  version: number;
}

export interface AgentWindowParameters {
  windowEnd: string;
  windowStart: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Invalid agent response: ${field}`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid agent response: ${field}`);
  }
  return value;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  return requiredNumber(value, field);
}

function requiredArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid agent response: ${field}`);
  return value;
}

function accuracyGroup(value: unknown): AccuracyGroup {
  if (!isRecord(value)) throw new Error("Invalid agent response: accuracy group");
  return {
    label: requiredString(value.label, "label"),
    n_adjudicated: requiredNumber(value.n_adjudicated, "n_adjudicated"),
    n_correct: requiredNumber(value.n_correct, "n_correct"),
    n_decided: requiredNumber(value.n_decided, "n_decided"),
    n_incorrect: requiredNumber(value.n_incorrect, "n_incorrect"),
    n_undecidable: requiredNumber(value.n_undecidable, "n_undecidable"),
    rate: nullableNumber(value.rate, "rate"),
  };
}

function failureExample(value: unknown): FailureExample {
  if (!isRecord(value)) throw new Error("Invalid agent response: failure example");
  return {
    claim_id: requiredString(value.claim_id, "claim_id"),
    note: nullableString(value.note, "note"),
    // Deliberately unnarrowed: a claim value is whatever the claim carried, and
    // the contract types it as unconstrained. Asserting a shape here would
    // refuse a claim the service is perfectly willing to serve.
    value: value.value,
  };
}

function failureGroup(value: unknown): FailureGroup {
  if (!isRecord(value)) throw new Error("Invalid agent response: failure group");
  return {
    claim_category: requiredString(value.claim_category, "claim_category"),
    examples: requiredArray(value.examples, "examples").map(failureExample),
    incorrect_count: requiredNumber(value.incorrect_count, "incorrect_count"),
    predicate: requiredString(value.predicate, "predicate"),
    rate: nullableNumber(value.rate, "rate"),
    total_count: requiredNumber(value.total_count, "total_count"),
  };
}

function agentInstruction(value: unknown): AgentInstruction {
  if (!isRecord(value)) throw new Error("Invalid agent response: instruction");
  return {
    activated_at: nullableString(value.activated_at, "activated_at"),
    author_actor_id: requiredString(value.author_actor_id, "author_actor_id"),
    content: requiredString(value.content, "content"),
    instruction_id: requiredString(value.instruction_id, "instruction_id"),
    motivated_by_report_id: nullableString(
      value.motivated_by_report_id,
      "motivated_by_report_id",
    ),
    status: requiredString(value.status, "status"),
    superseded_at: nullableString(value.superseded_at, "superseded_at"),
    version: requiredNumber(value.version, "version"),
  };
}

function windowQuery(parameters: AgentWindowParameters): string {
  const query = new URLSearchParams();
  query.set("window_start", parameters.windowStart);
  query.set("window_end", parameters.windowEnd);
  return query.toString();
}

export async function getAgentAccuracy(
  client: ContextplaneClient,
  actorId: string,
  parameters: AgentWindowParameters & { breakdown?: string },
  context: ContextplaneRequestOptions = {},
): Promise<AgentAccuracy> {
  const query = new URLSearchParams(windowQuery(parameters));
  if (parameters.breakdown) query.set("breakdown", parameters.breakdown);
  const value = await client.request(
    `/v1/agents/${encodeURIComponent(actorId)}/accuracy?${query.toString()}`,
    { ...context, method: "GET" },
  );
  if (!isRecord(value)) throw new Error("Invalid agent response: accuracy");
  return {
    author_actor_id: requiredString(value.author_actor_id, "author_actor_id"),
    breakdown: requiredString(value.breakdown, "breakdown"),
    groups: requiredArray(value.groups, "groups").map(accuracyGroup),
    overall: accuracyGroup(value.overall),
    window_end: requiredString(value.window_end, "window_end"),
    window_start: requiredString(value.window_start, "window_start"),
  };
}

export async function getAgentAutonomy(
  client: ContextplaneClient,
  actorId: string,
  parameters: AgentWindowParameters,
  context: ContextplaneRequestOptions = {},
): Promise<AgentAutonomy> {
  const value = await client.request(
    `/v1/agents/${encodeURIComponent(actorId)}/autonomy?${windowQuery(parameters)}`,
    { ...context, method: "GET" },
  );
  if (!isRecord(value)) throw new Error("Invalid agent response: autonomy");
  return {
    author_actor_id: requiredString(value.author_actor_id, "author_actor_id"),
    autonomy_rate: nullableNumber(value.autonomy_rate, "autonomy_rate"),
    intervention_rate: nullableNumber(value.intervention_rate, "intervention_rate"),
    n_autonomous: requiredNumber(value.n_autonomous, "n_autonomous"),
    n_intervened: requiredNumber(value.n_intervened, "n_intervened"),
    n_sessions: requiredNumber(value.n_sessions, "n_sessions"),
    window_end: requiredString(value.window_end, "window_end"),
    window_start: requiredString(value.window_start, "window_start"),
  };
}

export async function getAgentFailurePatterns(
  client: ContextplaneClient,
  actorId: string,
  parameters: AgentWindowParameters,
  context: ContextplaneRequestOptions = {},
): Promise<FailurePatternReport> {
  const value = await client.request(
    `/v1/agents/${encodeURIComponent(actorId)}/failure-patterns?${windowQuery(parameters)}`,
    { ...context, method: "GET" },
  );
  if (!isRecord(value)) throw new Error("Invalid agent response: failure patterns");
  return {
    author_actor_id: requiredString(value.author_actor_id, "author_actor_id"),
    groups: requiredArray(value.groups, "groups").map(failureGroup),
    n_adjudicated: requiredNumber(value.n_adjudicated, "n_adjudicated"),
    n_incorrect: requiredNumber(value.n_incorrect, "n_incorrect"),
    n_intervention_sessions: requiredNumber(
      value.n_intervention_sessions,
      "n_intervention_sessions",
    ),
    n_sessions: requiredNumber(value.n_sessions, "n_sessions"),
    report_id: requiredString(value.report_id, "report_id"),
    window_end: requiredString(value.window_end, "window_end"),
    window_start: requiredString(value.window_start, "window_start"),
  };
}

export async function listAgentInstructions(
  client: ContextplaneClient,
  actorId: string,
  context: ContextplaneRequestOptions = {},
): Promise<readonly AgentInstruction[]> {
  const value = await client.request(
    `/v1/agents/${encodeURIComponent(actorId)}/instructions`,
    { ...context, method: "GET" },
  );
  return requiredArray(value, "instructions").map(agentInstruction);
}

export async function proposeAgentInstruction(
  client: ContextplaneClient,
  actorId: string,
  input: ProposeInstructionInput,
  context: ContextplaneRequestOptions = {},
): Promise<string> {
  const value = await client.request(
    `/v1/agents/${encodeURIComponent(actorId)}/instructions`,
    { ...context, body: input, method: "POST" },
  );
  if (!isRecord(value)) throw new Error("Invalid agent response: proposal");
  return requiredString(value.instruction_id, "instruction_id");
}

/**
 * Activation posts to the item path with the action appended, not to the
 * collection. The two are different operations on the server and a request that
 * reaches the wrong one is not a slower version of the right one.
 */
export async function activateAgentInstruction(
  client: ContextplaneClient,
  actorId: string,
  instructionId: string,
  context: ContextplaneRequestOptions = {},
): Promise<AgentInstruction> {
  const value = await client.request(
    `/v1/agents/${encodeURIComponent(actorId)}/instructions/${encodeURIComponent(instructionId)}:activate`,
    { ...context, method: "POST" },
  );
  return agentInstruction(value);
}

export async function rollbackAgentInstruction(
  client: ContextplaneClient,
  actorId: string,
  context: ContextplaneRequestOptions = {},
): Promise<string | null> {
  const value = await client.request(
    `/v1/agents/${encodeURIComponent(actorId)}/instructions:rollback`,
    { ...context, method: "POST" },
  );
  if (!isRecord(value)) throw new Error("Invalid agent response: rollback");
  return nullableString(value.restored_instruction_id, "restored_instruction_id");
}
