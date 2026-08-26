import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  isRecord,
  nullableNumber,
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredInteger,
  requiredNumber,
  requiredRecord,
  requiredString,
  stringArray,
} from "./parse";

/**
 * The evaluation surface: prompt sets, runs over them, simulated answers, and
 * the judged criteria a person may overrule.
 *
 * The service shipped prompt sets, runs and verdicts in `contextplane#136` and
 * simulation and judging in E24; this dashboard consumed none of it, which is
 * why the **Served** surface could ask *"what did the machines actually get, and
 * was it right?"* and answer only the first half.
 *
 * ## Hand-written parsing, deliberately, and it is not a gap
 *
 * `openapi-typescript` generates *types*, not runtime validators. A network body
 * is untrusted input, and the repository's own rule is that it is validated
 * before it enters a feature model — so the parsers below do a job the generated
 * client cannot do. What the generated client contributes is the compile-time
 * anchor: the interfaces here are declared against `components["schemas"]`, so a
 * contract change that removes a field breaks the build rather than surfacing as
 * a runtime parse failure on somebody's screen.
 *
 * ## Three vocabularies are closed here rather than trusted
 *
 * A verdict, a judged criterion and a review verdict are all small closed sets,
 * and each is checked. A server that returned a fourth would be a server this
 * dashboard does not yet understand, and rendering the unknown value as though
 * it were known is how a screen quietly reports something nobody defined.
 */

export const evaluationVerdicts = ["right", "wrong", "unusable"] as const;
export type EvaluationVerdict = (typeof evaluationVerdicts)[number];

export const judgedCriteria = ["groundedness", "answer_relevance"] as const;
export type JudgedCriterion = (typeof judgedCriteria)[number];

export const judgeVerdicts = ["pass", "fail"] as const;
export type JudgeVerdict = (typeof judgeVerdicts)[number];

export const reviewVerdicts = ["confirmed", "overruled", "unsure"] as const;
export type ReviewVerdict = (typeof reviewVerdicts)[number];

/**
 * The three instruction states ADR 0020's third assumption requires be kept
 * apart. An agent that declared no instructions and one that declared an empty
 * set are different experiments, and a surface that rendered them identically
 * would make partial adoption of the channel invisible.
 */
export const instructionDispositions = [
  "not_declared",
  "declared_unknown",
  "declared_known",
] as const;
export type InstructionDisposition = (typeof instructionDispositions)[number];

export interface PromptSet {
  set_id: string;
  name: string;
  description: string | null;
  created_at: string;
  retired_at: string | null;
  prompt_count: number;
}

export interface EvaluationPrompt {
  prompt_id: string;
  position: number;
  request: Record<string, unknown>;
  intent_note: string | null;
  /** Absent when the prompt asserts nothing, which is a real state. */
  expectations: Record<string, unknown> | null;
}

export interface ExpectationPreset {
  name: string;
  description: string;
  envelope_rubric_version: string;
  judge_rubric_version: string;
  expectations: Record<string, unknown>;
}

export interface RunVerdict {
  verdict: EvaluationVerdict;
  note: string | null;
  recorded_by: string;
  recorded_at: string;
}

export interface RunItem {
  item_id: string;
  prompt_id: string;
  position: number;
  /** Absent alongside `failure`: an errored prompt stays in the run. */
  receipt_id: string | null;
  envelope_state: string | null;
  failure: string | null;
  duration_ms: number;
  verdicts: readonly RunVerdict[];
}

export interface EvaluationRun {
  run_id: string;
  set_id: string;
  /**
   * The deployment that produced this run. Two runs with different fingerprints
   * are not comparable — a difference between them is evidence the configuration
   * changed, not evidence about retrieval.
   */
  resolver_fingerprint: string;
  prompt_count: number;
  started_at: string;
  finished_at: string | null;
  items: readonly RunItem[];
}

export interface SimulationCitation {
  receipt_item_id: string;
  /**
   * Whether the cited id was in the envelope. `false` is a finding rather than a
   * bug: a model citing what was never served is what a groundedness check is
   * for.
   */
  was_served: boolean;
}

export interface SimulationAssertion {
  position: number;
  text: string;
  /** Empty when the assertion rested on nothing served — a real state. */
  citations: readonly SimulationCitation[];
}

export interface SimulationUsage {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cached_prompt_tokens: number | null;
  /** `provider_reported`, `estimated` or `unknown`. Never spelled as zero. */
  source: string;
  /** Paired with the token figure, because `limit` is the only lever offered. */
  served_item_count: number;
}

export interface Simulation {
  simulation_id: string;
  /** The resolution's own receipt, referenced rather than embedded. */
  receipt_id: string;
  simulated_actor_id: string;
  prompt: string;
  answer: string;
  provider_id: string;
  model_id: string;
  instruction_disposition: InstructionDisposition;
  envelope_state: string;
  usage: SimulationUsage;
  assertions: readonly SimulationAssertion[];
  /** Served items no assertion cited. An observation, never a diagnosis. */
  uncited_served_ids: readonly string[];
  duration_ms: number | null;
  created_at: string;
  run_item_id: string | null;
}

export interface SimulationAvailability {
  available: boolean;
  simulation_provider: string;
  simulation_model: string;
  judge_provider: string;
  judge_model: string;
}

export interface JudgementReview {
  verdict: ReviewVerdict;
  note: string | null;
  observed_confidence: number | null;
  reviewed_by: string;
  reviewed_at: string;
}

export interface Judgement {
  judgement_id: string;
  simulation_id: string;
  criterion: JudgedCriterion;
  verdict: JudgeVerdict;
  /** Required. A verdict with no trace is one a reviewer can only accept. */
  reasoning: string;
  evidence: readonly string[];
  confidence: number;
  /**
   * Whether a bin fit exists for this result's pinned tuple. `false` means the
   * verdict is unproven and must be rendered as such — a confident-looking score
   * on the screen whose job is calibrating trust is a confident label on a guess.
   */
  confidence_is_calibrated: boolean;
  judge_provider_id: string;
  judge_model_id: string;
  rubric_version: string;
  prompt_template_hash: string;
  panel_position: number;
  /** Whether any reviewer overruled the judge. Visible, never a silent overwrite. */
  is_disputed: boolean;
  created_at: string;
  reviews: readonly JudgementReview[];
}

export interface PanelOutcome {
  criterion: JudgedCriterion;
  /** How the panel split. A 2–1 is reported as 2–1, never averaged. */
  votes: Readonly<Record<string, number>>;
  /** Absent on a tie: a panel that split evenly has not decided. */
  majority: JudgeVerdict | null;
  is_split: boolean;
  judgements: readonly Judgement[];
}

export interface ScoreViolation {
  item_key: string;
  /** Which arm served it. "Something leaked" without the arm is unactionable. */
  block: string;
  kind: string;
  detail: string;
}

export interface ScoreUnchecked {
  item_key: string;
  block: string;
  dimension: string;
  /**
   * Why the check could not run. Neither a pass nor a failure: a surface showing
   * only violations would render an absent check as a clean one, which is the
   * shape of every defence that turns out to have been unreachable.
   */
  reason: string;
}

export interface ScoreBlockTally {
  block: string;
  state: string;
  served: number;
  relevant: number;
  required_found: number;
}

export interface DeterministicScore {
  rubric_version: string;
  prompt_id: string | null;
  /**
   * Present *instead of* a score when nothing was declared in advance to check.
   * Not a zero-filled score with a flag beside it: zeros render as three failed
   * criteria and ones as three passes nobody checked.
   */
  unassertable: string | null;
  recall: number | null;
  precision: number | null;
  required_total: number | null;
  required_found: number | null;
  served_total: number | null;
  is_safe: boolean | null;
  violations: readonly ScoreViolation[];
  unchecked: readonly ScoreUnchecked[];
  blocks: readonly ScoreBlockTally[];
}

export interface JudgeCalibrationState {
  judge_model_id: string;
  rubric_version: string;
  prompt_template_hash: string;
  is_calibrated: boolean;
  status: string;
  version: string;
  n_adjudicated: number;
  measured_error: number;
  fitted_at: string | null;
}

function closed<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string,
): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${label} is one of ${allowed.join(", ")}; the service returned ${value}.`);
}

function parseRecord(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label);
}

function parsePromptSet(value: unknown, index: number): PromptSet {
  const row = parseRecord(value, `Prompt set[${index}]`);
  return {
    created_at: requiredString(row, "created_at", `Prompt set[${index}] created_at`),
    description: nullableString(row, "description", `Prompt set[${index}] description`),
    name: requiredString(row, "name", `Prompt set[${index}] name`),
    prompt_count: requiredInteger(row, "prompt_count"),
    retired_at: nullableString(row, "retired_at", `Prompt set[${index}] retired_at`),
    set_id: requiredString(row, "set_id", `Prompt set[${index}] set_id`),
  };
}

function parsePrompt(value: unknown, index: number): EvaluationPrompt {
  const row = parseRecord(value, `Prompt[${index}]`);
  return {
    expectations: isRecord(row.expectations) ? row.expectations : null,
    intent_note: nullableString(row, "intent_note", `Prompt[${index}] intent_note`),
    position: requiredInteger(row, "position"),
    prompt_id: requiredString(row, "prompt_id", `Prompt[${index}] prompt_id`),
    request: parseRecord(row.request, `Prompt[${index}] request`),
  };
}

function parseVerdict(value: unknown, index: number): RunVerdict {
  const row = parseRecord(value, `Verdict[${index}]`);
  return {
    note: nullableString(row, "note", `Verdict[${index}] note`),
    recorded_at: requiredString(row, "recorded_at", `Verdict[${index}] recorded_at`),
    recorded_by: requiredString(row, "recorded_by", `Verdict[${index}] recorded_by`),
    verdict: closed(
      requiredString(row, "verdict", `Verdict[${index}] verdict`),
      evaluationVerdicts,
      `Verdict[${index}] verdict`,
    ),
  };
}

function parseRunItem(value: unknown, index: number): RunItem {
  const row = parseRecord(value, `Run item[${index}]`);
  return {
    duration_ms: requiredInteger(row, "duration_ms"),
    envelope_state: nullableString(row, "envelope_state", `Run item[${index}] envelope_state`),
    failure: nullableString(row, "failure", `Run item[${index}] failure`),
    item_id: requiredString(row, "item_id", `Run item[${index}] item_id`),
    position: requiredInteger(row, "position"),
    prompt_id: requiredString(row, "prompt_id", `Run item[${index}] prompt_id`),
    receipt_id: nullableString(row, "receipt_id", `Run item[${index}] receipt_id`),
    verdicts: requiredArray(row.verdicts ?? [], `Run item[${index}] verdicts`).map(parseVerdict),
  };
}

function parseRun(value: unknown, index = 0): EvaluationRun {
  const row = parseRecord(value, `Run[${index}]`);
  return {
    finished_at: nullableString(row, "finished_at", `Run[${index}] finished_at`),
    items: requiredArray(row.items ?? [], `Run[${index}] items`).map(parseRunItem),
    prompt_count: requiredInteger(row, "prompt_count"),
    resolver_fingerprint: requiredString(
      row,
      "resolver_fingerprint",
      `Run[${index}] resolver_fingerprint`,
    ),
    run_id: requiredString(row, "run_id", `Run[${index}] run_id`),
    set_id: requiredString(row, "set_id", `Run[${index}] set_id`),
    started_at: requiredString(row, "started_at", `Run[${index}] started_at`),
  };
}

function parseCitation(value: unknown, index: number): SimulationCitation {
  const row = parseRecord(value, `Citation[${index}]`);
  return {
    receipt_item_id: requiredString(row, "receipt_item_id", `Citation[${index}] receipt_item_id`),
    was_served: requiredBoolean(row, "was_served", `Citation[${index}] was_served`),
  };
}

function parseAssertion(value: unknown, index: number): SimulationAssertion {
  const row = parseRecord(value, `Assertion[${index}]`);
  return {
    citations: requiredArray(row.citations ?? [], `Assertion[${index}] citations`).map(
      parseCitation,
    ),
    position: requiredInteger(row, "position"),
    text: requiredString(row, "text", `Assertion[${index}] text`),
  };
}

function parseSimulation(value: unknown): Simulation {
  const row = parseRecord(value, "Simulation");
  const usage = parseRecord(row.usage, "Simulation usage");
  return {
    answer: requiredString(row, "answer", "Simulation answer"),
    assertions: requiredArray(row.assertions ?? [], "Simulation assertions").map(parseAssertion),
    created_at: requiredString(row, "created_at", "Simulation created_at"),
    duration_ms: nullableNumber(row, "duration_ms"),
    envelope_state: requiredString(row, "envelope_state", "Simulation envelope_state"),
    instruction_disposition: closed(
      requiredString(row, "instruction_disposition", "Simulation instruction_disposition"),
      instructionDispositions,
      "Simulation instruction_disposition",
    ),
    model_id: requiredString(row, "model_id", "Simulation model_id"),
    prompt: requiredString(row, "prompt", "Simulation prompt"),
    provider_id: requiredString(row, "provider_id", "Simulation provider_id"),
    receipt_id: requiredString(row, "receipt_id", "Simulation receipt_id"),
    run_item_id: nullableString(row, "run_item_id", "Simulation run_item_id"),
    simulated_actor_id: requiredString(row, "simulated_actor_id", "Simulation simulated_actor_id"),
    simulation_id: requiredString(row, "simulation_id", "Simulation simulation_id"),
    uncited_served_ids: stringArray(row.uncited_served_ids ?? [], "Simulation uncited_served_ids"),
    usage: {
      cached_prompt_tokens: nullableNumber(usage, "cached_prompt_tokens"),
      completion_tokens: nullableNumber(usage, "completion_tokens"),
      prompt_tokens: nullableNumber(usage, "prompt_tokens"),
      served_item_count: requiredInteger(usage, "served_item_count"),
      source: requiredString(usage, "source", "Simulation usage source"),
    },
  };
}

function parseReview(value: unknown, index: number): JudgementReview {
  const row = parseRecord(value, `Review[${index}]`);
  return {
    note: nullableString(row, "note", `Review[${index}] note`),
    observed_confidence: nullableNumber(row, "observed_confidence"),
    reviewed_at: requiredString(row, "reviewed_at", `Review[${index}] reviewed_at`),
    reviewed_by: requiredString(row, "reviewed_by", `Review[${index}] reviewed_by`),
    verdict: closed(
      requiredString(row, "verdict", `Review[${index}] verdict`),
      reviewVerdicts,
      `Review[${index}] verdict`,
    ),
  };
}

function parseJudgement(value: unknown, index: number): Judgement {
  const row = parseRecord(value, `Judgement[${index}]`);
  return {
    confidence: requiredNumber(row, "confidence"),
    confidence_is_calibrated: requiredBoolean(
      row,
      "confidence_is_calibrated",
      `Judgement[${index}] confidence_is_calibrated`,
    ),
    created_at: requiredString(row, "created_at", `Judgement[${index}] created_at`),
    criterion: closed(
      requiredString(row, "criterion", `Judgement[${index}] criterion`),
      judgedCriteria,
      `Judgement[${index}] criterion`,
    ),
    evidence: stringArray(row.evidence ?? [], `Judgement[${index}] evidence`),
    is_disputed: requiredBoolean(row, "is_disputed", `Judgement[${index}] is_disputed`),
    judge_model_id: requiredString(row, "judge_model_id", `Judgement[${index}] judge_model_id`),
    judge_provider_id: requiredString(
      row,
      "judge_provider_id",
      `Judgement[${index}] judge_provider_id`,
    ),
    judgement_id: requiredString(row, "judgement_id", `Judgement[${index}] judgement_id`),
    panel_position: requiredInteger(row, "panel_position"),
    prompt_template_hash: requiredString(
      row,
      "prompt_template_hash",
      `Judgement[${index}] prompt_template_hash`,
    ),
    reasoning: requiredString(row, "reasoning", `Judgement[${index}] reasoning`),
    reviews: requiredArray(row.reviews ?? [], `Judgement[${index}] reviews`).map(parseReview),
    rubric_version: requiredString(row, "rubric_version", `Judgement[${index}] rubric_version`),
    simulation_id: requiredString(row, "simulation_id", `Judgement[${index}] simulation_id`),
    verdict: closed(
      requiredString(row, "verdict", `Judgement[${index}] verdict`),
      judgeVerdicts,
      `Judgement[${index}] verdict`,
    ),
  };
}

function parsePanelOutcome(value: unknown, index: number): PanelOutcome {
  const row = parseRecord(value, `Panel outcome[${index}]`);
  const votes = parseRecord(row.votes, `Panel outcome[${index}] votes`);
  const majority = nullableString(row, "majority", `Panel outcome[${index}] majority`);
  return {
    criterion: closed(
      requiredString(row, "criterion", `Panel outcome[${index}] criterion`),
      judgedCriteria,
      `Panel outcome[${index}] criterion`,
    ),
    is_split: requiredBoolean(row, "is_split", `Panel outcome[${index}] is_split`),
    judgements: requiredArray(row.judgements ?? [], `Panel outcome[${index}] judgements`).map(
      parseJudgement,
    ),
    majority: majority === null ? null : closed(majority, judgeVerdicts, "Panel majority"),
    votes: Object.fromEntries(
      Object.entries(votes).map(([key, count]) => [key, Number(count)]),
    ),
  };
}

/** This tenant's prompt sets, newest first. */
export async function listPromptSets(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
): Promise<readonly PromptSet[]> {
  const payload = await client.request("/v1/evaluation/prompt-sets", { ...context, method: "GET" });
  const body = requiredRecord(payload, "Prompt set list");
  return requiredArray(body.items, "Prompt set list items").map(parsePromptSet);
}

export async function createPromptSet(
  client: ContextplaneClient,
  input: { description?: string; name: string },
  context: ContextplaneRequestOptions = {},
): Promise<PromptSet> {
  const payload = await client.request("/v1/evaluation/prompt-sets", {
    ...context,
    body: { description: input.description ?? null, name: input.name },
    method: "POST",
  });
  return parsePromptSet(payload, 0);
}

export async function addPrompt(
  client: ContextplaneClient,
  input: {
    expectations?: Record<string, unknown> | null;
    intentNote?: string;
    request: Record<string, unknown>;
    setId: string;
  },
  context: ContextplaneRequestOptions = {},
): Promise<EvaluationPrompt> {
  const payload = await client.request(
    `/v1/evaluation/prompt-sets/${encodeURIComponent(input.setId)}/prompts`,
    {
      ...context,
      body: {
        expectations: input.expectations ?? null,
        intent_note: input.intentNote ?? null,
        request: input.request,
      },
      method: "POST",
    },
  );
  return parsePrompt(payload, 0);
}

/** The seeded personas a prompt's expectations can be started from. */
export async function listExpectationPresets(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
): Promise<readonly ExpectationPreset[]> {
  const payload = await client.request("/v1/evaluation/expectation-presets", {
    ...context,
    method: "GET",
  });
  const body = requiredRecord(payload, "Preset list");
  return requiredArray(body.items, "Preset list items").map((item, index) => {
    const row = parseRecord(item, `Preset[${index}]`);
    return {
      description: requiredString(row, "description", `Preset[${index}] description`),
      envelope_rubric_version: requiredString(
        row,
        "envelope_rubric_version",
        `Preset[${index}] envelope_rubric_version`,
      ),
      expectations: parseRecord(row.expectations, `Preset[${index}] expectations`),
      judge_rubric_version: requiredString(
        row,
        "judge_rubric_version",
        `Preset[${index}] judge_rubric_version`,
      ),
      name: requiredString(row, "name", `Preset[${index}] name`),
    };
  });
}

/**
 * One set's runs, newest first, **without their items**.
 *
 * Headers only, which is the shape the endpoint returns and the reason it
 * returns it: a comparison starts by choosing two runs, and loading every item
 * of every run to render that choice would read the whole history to answer a
 * question about two rows of it.
 */
export async function listRuns(
  client: ContextplaneClient,
  setId: string,
  context: ContextplaneRequestOptions = {},
): Promise<readonly EvaluationRun[]> {
  const payload = await client.request(
    `/v1/evaluation/prompt-sets/${encodeURIComponent(setId)}/runs`,
    { ...context, method: "GET" },
  );
  const body = requiredRecord(payload, "Run list");
  return requiredArray(body.items, "Run list items").map(parseRun);
}

export async function listPrompts(
  client: ContextplaneClient,
  setId: string,
  context: ContextplaneRequestOptions = {},
): Promise<readonly EvaluationPrompt[]> {
  const payload = await client.request(
    `/v1/evaluation/prompt-sets/${encodeURIComponent(setId)}/prompts`,
    { ...context, method: "GET" },
  );
  const body = requiredRecord(payload, "Prompt list");
  return requiredArray(body.items, "Prompt list items").map(parsePrompt);
}

export async function startRun(
  client: ContextplaneClient,
  setId: string,
  context: ContextplaneRequestOptions = {},
): Promise<EvaluationRun> {
  const payload = await client.request(
    `/v1/evaluation/prompt-sets/${encodeURIComponent(setId)}/runs`,
    { ...context, method: "POST" },
  );
  return parseRun(payload);
}

/** One run with its items in the set's order, and every verdict on them. */
export async function getRun(
  client: ContextplaneClient,
  runId: string,
  context: ContextplaneRequestOptions = {},
): Promise<EvaluationRun> {
  const payload = await client.request(`/v1/evaluation/runs/${encodeURIComponent(runId)}`, {
    ...context,
    method: "GET",
  });
  return parseRun(payload);
}

export async function recordRunVerdict(
  client: ContextplaneClient,
  input: { itemId: string; note?: string; verdict: EvaluationVerdict },
  context: ContextplaneRequestOptions = {},
): Promise<RunVerdict> {
  const payload = await client.request(
    `/v1/evaluation/runs/items/${encodeURIComponent(input.itemId)}/verdict`,
    { ...context, body: { note: input.note ?? null, verdict: input.verdict }, method: "POST" },
  );
  return parseVerdict(payload, 0);
}

/**
 * Whether this deployment can simulate, and under which selectors.
 *
 * Called before the action is offered, so an operator sees a switched-off
 * feature rather than a button that always fails.
 */
export async function getSimulationAvailability(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
): Promise<SimulationAvailability> {
  const payload = await client.request("/v1/evaluation/simulations/availability", {
    ...context,
    method: "GET",
  });
  const row = requiredRecord(payload, "Simulation availability");
  return {
    available: requiredBoolean(row, "available", "Simulation availability available"),
    judge_model: requiredString(row, "judge_model", "Simulation availability judge_model"),
    judge_provider: requiredString(row, "judge_provider", "Simulation availability judge_provider"),
    simulation_model: requiredString(
      row,
      "simulation_model",
      "Simulation availability simulation_model",
    ),
    simulation_provider: requiredString(
      row,
      "simulation_provider",
      "Simulation availability simulation_provider",
    ),
  };
}

/**
 * How long a call is given when a language model is in the loop.
 *
 * The client's default is ten seconds, which is right for a read: a service that
 * has not answered a query in ten seconds is one something is wrong with. It is
 * the wrong bound for generation, and applying it there made the feature
 * unusable rather than slow — measured against the running service, a
 * simulation took **12.3 s** and so failed every time, reporting *"the service
 * did not respond before the request deadline"* about a service that was
 * working and about to answer.
 *
 * Two minutes rather than a number just above what was measured. The bound
 * exists to catch a request that will never return, not to police how long a
 * model may think; sizing it to today's latency would make it a limit somebody
 * hits the first time a prompt is longer or a provider is busy, and the failure
 * would look identical to a broken service.
 */
export const MODEL_CALL_TIMEOUT_MS = 120_000;

/**
 * A panel runs every configured judge over the same answer, which the service
 * describes as three times the cost of one. Its deadline is scaled to match, so
 * the operation that is expected to take longest is not the one most likely to
 * be cut off.
 */
export const PANEL_CALL_TIMEOUT_MS = 300_000;

export async function runSimulation(
  client: ContextplaneClient,
  input: {
    prompt: string;
    request?: Record<string, unknown>;
    runItemId?: string;
    simulatedActorId: string;
  },
  context: ContextplaneRequestOptions = {},
): Promise<Simulation> {
  const payload = await client.request("/v1/evaluation/simulations", {
    ...context,
    body: {
      prompt: input.prompt,
      request: input.request ?? {},
      run_item_id: input.runItemId ?? null,
      simulated_actor_id: input.simulatedActorId,
    },
    method: "POST",
    timeoutMs: context.timeoutMs ?? MODEL_CALL_TIMEOUT_MS,
  });
  return parseSimulation(payload);
}

export async function getSimulation(
  client: ContextplaneClient,
  simulationId: string,
  context: ContextplaneRequestOptions = {},
): Promise<Simulation> {
  const payload = await client.request(
    `/v1/evaluation/simulations/${encodeURIComponent(simulationId)}`,
    { ...context, method: "GET" },
  );
  return parseSimulation(payload);
}

export async function judgeSimulation(
  client: ContextplaneClient,
  simulationId: string,
  context: ContextplaneRequestOptions = {},
): Promise<readonly Judgement[]> {
  const payload = await client.request(
    `/v1/evaluation/simulations/${encodeURIComponent(simulationId)}/judgements`,
    {
      ...context,
      body: { panel_position: 0 },
      method: "POST",
      timeoutMs: context.timeoutMs ?? MODEL_CALL_TIMEOUT_MS,
    },
  );
  const body = requiredRecord(payload, "Judgement list");
  return requiredArray(body.items, "Judgement list items").map(parseJudgement);
}

export async function listJudgements(
  client: ContextplaneClient,
  simulationId: string,
  context: ContextplaneRequestOptions = {},
): Promise<readonly Judgement[]> {
  const payload = await client.request(
    `/v1/evaluation/simulations/${encodeURIComponent(simulationId)}/judgements`,
    { ...context, method: "GET" },
  );
  const body = requiredRecord(payload, "Judgement list");
  return requiredArray(body.items, "Judgement list items").map(parseJudgement);
}

/** The opt-in panel. 3× the cost, for a run that is gating a decision. */
export async function judgeWithPanel(
  client: ContextplaneClient,
  simulationId: string,
  context: ContextplaneRequestOptions = {},
): Promise<readonly PanelOutcome[]> {
  const payload = await client.request(
    `/v1/evaluation/simulations/${encodeURIComponent(simulationId)}/judgements/panel`,
    { ...context, method: "POST", timeoutMs: context.timeoutMs ?? PANEL_CALL_TIMEOUT_MS },
  );
  const body = requiredRecord(payload, "Panel list");
  return requiredArray(body.items, "Panel list items").map(parsePanelOutcome);
}

export async function recordJudgementReview(
  client: ContextplaneClient,
  input: {
    judgementId: string;
    note?: string;
    observedConfidence?: number;
    verdict: ReviewVerdict;
  },
  context: ContextplaneRequestOptions = {},
): Promise<JudgementReview> {
  const payload = await client.request(
    `/v1/evaluation/judgements/${encodeURIComponent(input.judgementId)}/review`,
    {
      ...context,
      body: {
        note: input.note ?? null,
        observed_confidence: input.observedConfidence ?? null,
        verdict: input.verdict,
      },
      method: "POST",
    },
  );
  return parseReview(payload, 0);
}

/**
 * The deterministic three for one simulation, or the reason they cannot be computed.
 *
 * No model in the loop. That absence is the property rather than a limitation: it
 * is what keeps a failure of these three attributable to what was *served*
 * rather than to what graded it.
 */
export async function scoreSimulation(
  client: ContextplaneClient,
  simulationId: string,
  context: ContextplaneRequestOptions = {},
): Promise<DeterministicScore> {
  const payload = await client.request(
    `/v1/evaluation/simulations/${encodeURIComponent(simulationId)}/score`,
    { ...context, method: "GET" },
  );
  const row = requiredRecord(payload, "Deterministic score");
  return {
    blocks: requiredArray(row.blocks ?? [], "Score blocks").map((entry, index) => {
      const block = parseRecord(entry, `Score block[${index}]`);
      return {
        block: requiredString(block, "block", `Score block[${index}] block`),
        relevant: requiredInteger(block, "relevant"),
        required_found: requiredInteger(block, "required_found"),
        served: requiredInteger(block, "served"),
        state: requiredString(block, "state", `Score block[${index}] state`),
      };
    }),
    is_safe: typeof row.is_safe === "boolean" ? row.is_safe : null,
    precision: nullableNumber(row, "precision"),
    prompt_id: nullableString(row, "prompt_id", "Score prompt_id"),
    recall: nullableNumber(row, "recall"),
    required_found: nullableNumber(row, "required_found"),
    required_total: nullableNumber(row, "required_total"),
    rubric_version: requiredString(row, "rubric_version", "Score rubric_version"),
    served_total: nullableNumber(row, "served_total"),
    unassertable: nullableString(row, "unassertable", "Score unassertable"),
    unchecked: requiredArray(row.unchecked ?? [], "Score unchecked").map((entry, index) => {
      const item = parseRecord(entry, `Score unchecked[${index}]`);
      return {
        block: requiredString(item, "block", `Score unchecked[${index}] block`),
        dimension: requiredString(item, "dimension", `Score unchecked[${index}] dimension`),
        item_key: requiredString(item, "item_key", `Score unchecked[${index}] item_key`),
        reason: requiredString(item, "reason", `Score unchecked[${index}] reason`),
      };
    }),
    violations: requiredArray(row.violations ?? [], "Score violations").map((entry, index) => {
      const item = parseRecord(entry, `Score violation[${index}]`);
      return {
        block: requiredString(item, "block", `Score violation[${index}] block`),
        detail: requiredString(item, "detail", `Score violation[${index}] detail`),
        item_key: requiredString(item, "item_key", `Score violation[${index}] item_key`),
        kind: requiredString(item, "kind", `Score violation[${index}] kind`),
      };
    }),
  };
}

/** Every judge tuple that has ever been fitted, at its most recent attempt. */
export async function listJudgeCalibration(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
): Promise<readonly JudgeCalibrationState[]> {
  const payload = await client.request("/v1/evaluation/judge-calibration", {
    ...context,
    method: "GET",
  });
  const body = requiredRecord(payload, "Calibration list");
  return requiredArray(body.items, "Calibration list items").map((item, index) => {
    const row = parseRecord(item, `Calibration[${index}]`);
    return {
      fitted_at: nullableString(row, "fitted_at", `Calibration[${index}] fitted_at`),
      is_calibrated: requiredBoolean(
        row,
        "is_calibrated",
        `Calibration[${index}] is_calibrated`,
      ),
      judge_model_id: requiredString(row, "judge_model_id", `Calibration[${index}] judge_model_id`),
      measured_error: requiredNumber(row, "measured_error"),
      n_adjudicated: requiredInteger(row, "n_adjudicated"),
      prompt_template_hash: requiredString(
        row,
        "prompt_template_hash",
        `Calibration[${index}] prompt_template_hash`,
      ),
      rubric_version: requiredString(row, "rubric_version", `Calibration[${index}] rubric_version`),
      status: requiredString(row, "status", `Calibration[${index}] status`),
      version: requiredString(row, "version", `Calibration[${index}] version`),
    };
  });
}
