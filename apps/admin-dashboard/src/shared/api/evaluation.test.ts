import { describe, expect, it, vi } from "vitest";

import { clientFromRequest } from "./client";
import {
  getRun,
  getSimulation,
  getSimulationAvailability,
  judgeSimulation,
  judgeWithPanel,
  listExpectationPresets,
  listJudgeCalibration,
  listJudgements,
  listPromptSets,
  listRuns,
  recordJudgementReview,
  recordRunVerdict,
  runSimulation,
  startRun,
} from "./evaluation";

/**
 * The evaluation adapters, and what they refuse.
 *
 * The refusals are the point. A closed vocabulary the service could widen is one
 * this dashboard would render as though it understood — so an unknown verdict, an
 * unknown criterion and an unknown instruction disposition all raise rather than
 * pass through. That is the rule the repository states as *validate network data
 * before it enters feature models*, and these are the fields where getting it
 * wrong is a screen reporting something nobody defined.
 */

function stub(value: unknown) {
  return clientFromRequest(vi.fn(async () => value));
}

const simulationBody = {
  answer: "Through the runbook.",
  assertions: [
    { citations: [{ receipt_item_id: "rid-1", was_served: true }], position: 0, text: "It drains." },
  ],
  created_at: "2026-08-25T10:00:00Z",
  duration_ms: 42,
  envelope_state: "complete",
  instruction_disposition: "declared_known",
  model_id: "claude-test",
  prompt: "how?",
  provider_id: "anthropic",
  receipt_id: "receipt-1",
  run_item_id: null,
  simulated_actor_id: "actor-1",
  simulation_id: "sim-1",
  uncited_served_ids: ["rid-2"],
  usage: {
    cached_prompt_tokens: 5,
    completion_tokens: 20,
    prompt_tokens: 100,
    served_item_count: 2,
    source: "provider_reported",
  },
};

const judgementBody = {
  confidence: 0.7,
  confidence_is_calibrated: false,
  created_at: "2026-08-25T10:00:00Z",
  criterion: "groundedness",
  evidence: ["a span"],
  is_disputed: false,
  judge_model_id: "gpt-judge",
  judge_provider_id: "openai",
  judgement_id: "judgement-1",
  panel_position: 0,
  prompt_template_hash: "a".repeat(64),
  reasoning: "step by step",
  reviews: [],
  rubric_version: "agent-response-judge v1.0.0",
  simulation_id: "sim-1",
  verdict: "pass",
};

describe("evaluation adapters: prompt sets, runs and verdicts", () => {
  it("reads a set list", async () => {
    const client = stub({
      items: [
        {
          created_at: "2026-08-25T09:00:00Z",
          description: null,
          name: "Support triage",
          prompt_count: 3,
          retired_at: null,
          set_id: "set-1",
        },
      ],
    });

    await expect(listPromptSets(client)).resolves.toEqual([
      {
        created_at: "2026-08-25T09:00:00Z",
        description: null,
        name: "Support triage",
        prompt_count: 3,
        retired_at: null,
        set_id: "set-1",
      },
    ]);
  });

  it("reads run headers without items and does not invent an empty items array as content", async () => {
    const client = stub({
      items: [
        {
          finished_at: null,
          prompt_count: 4,
          resolver_fingerprint: `sha256:${"a".repeat(64)}`,
          run_id: "run-1",
          set_id: "set-1",
          started_at: "2026-08-25T10:00:00Z",
        },
      ],
    });

    const runs = await listRuns(client, "set-1");
    expect(runs[0]?.items).toEqual([]);
    expect(runs[0]?.finished_at).toBeNull();
  });

  it("keeps an errored run item with its failure and no receipt", async () => {
    const client = stub({
      finished_at: "2026-08-25T10:05:00Z",
      items: [
        {
          duration_ms: 40,
          envelope_state: null,
          failure: "RuntimeError: the arm is unavailable",
          item_id: "item-1",
          position: 0,
          prompt_id: "prompt-1",
          receipt_id: null,
          verdicts: [],
        },
      ],
      prompt_count: 1,
      resolver_fingerprint: `sha256:${"a".repeat(64)}`,
      run_id: "run-1",
      set_id: "set-1",
      started_at: "2026-08-25T10:00:00Z",
    });

    const run = await getRun(client, "run-1");
    expect(run.items[0]?.failure).toBe("RuntimeError: the arm is unavailable");
    expect(run.items[0]?.receipt_id).toBeNull();
  });

  it("refuses a verdict outside the closed set", async () => {
    const client = stub({
      finished_at: null,
      items: [
        {
          duration_ms: 1,
          envelope_state: "complete",
          failure: null,
          item_id: "item-1",
          position: 0,
          prompt_id: "prompt-1",
          receipt_id: "receipt-1",
          verdicts: [
            { note: null, recorded_at: "2026-08-25T10:00:00Z", recorded_by: "r1", verdict: "excellent" },
          ],
        },
      ],
      prompt_count: 1,
      resolver_fingerprint: `sha256:${"a".repeat(64)}`,
      run_id: "run-1",
      set_id: "set-1",
      started_at: "2026-08-25T10:00:00Z",
    });

    await expect(getRun(client, "run-1")).rejects.toThrow(/right, wrong, unusable/);
  });

  it("posts a run against the set and a verdict against the item", async () => {
    const request = vi.fn(async () => ({
      finished_at: null,
      items: [],
      prompt_count: 0,
      resolver_fingerprint: `sha256:${"a".repeat(64)}`,
      run_id: "run-1",
      set_id: "set-1",
      started_at: "2026-08-25T10:00:00Z",
    }));
    await startRun(clientFromRequest(request), "set-1", { tenantId: "t" });
    expect(request).toHaveBeenCalledWith("/v1/evaluation/prompt-sets/set-1/runs", {
      method: "POST",
      tenantId: "t",
    });

    const verdictRequest = vi.fn(async () => ({
      note: "missed it",
      recorded_at: "2026-08-25T11:00:00Z",
      recorded_by: "r1",
      verdict: "wrong",
    }));
    await recordRunVerdict(clientFromRequest(verdictRequest), {
      itemId: "item-1",
      note: "missed it",
      verdict: "wrong",
    });
    expect(verdictRequest).toHaveBeenCalledWith("/v1/evaluation/runs/items/item-1/verdict", {
      body: { note: "missed it", verdict: "wrong" },
      method: "POST",
    });
  });

  it("reads a prompt's expectations as absent when it asserts nothing", async () => {
    const client = stub({
      items: [
        {
          expectations: null,
          intent_note: null,
          position: 0,
          prompt_id: "prompt-1",
          request: { query: "q" },
        },
      ],
    });
    const { listPrompts } = await import("./evaluation");
    const prompts = await listPrompts(client, "set-1");
    expect(prompts[0]?.expectations).toBeNull();
  });

  it("reads the seeded personas with the rubric versions they parameterize", async () => {
    const client = stub({
      items: [
        {
          description: "The standing default.",
          envelope_rubric_version: "context-envelope-judge v2.0.0",
          expectations: { require_groundedness: true, require_relevance: true },
          judge_rubric_version: "agent-response-judge v1.0.0",
          name: "balanced",
        },
      ],
    });

    const presets = await listExpectationPresets(client);
    expect(presets[0]?.envelope_rubric_version).toBe("context-envelope-judge v2.0.0");
    expect(presets[0]?.judge_rubric_version).toBe("agent-response-judge v1.0.0");
  });
});

describe("evaluation adapters: simulation", () => {
  it("reads availability without asking for a credential", async () => {
    const client = stub({
      available: false,
      judge_model: "",
      judge_provider: "noop",
      simulation_model: "",
      simulation_provider: "noop",
    });

    await expect(getSimulationAvailability(client)).resolves.toEqual({
      available: false,
      judge_model: "",
      judge_provider: "noop",
      simulation_model: "",
      simulation_provider: "noop",
    });
  });

  it("keeps an unreported token count as null rather than zero", async () => {
    const client = stub({
      ...simulationBody,
      usage: {
        cached_prompt_tokens: null,
        completion_tokens: null,
        prompt_tokens: null,
        served_item_count: 2,
        source: "unknown",
      },
    });

    const simulation = await getSimulation(client, "sim-1");
    expect(simulation.usage.prompt_tokens).toBeNull();
    expect(simulation.usage.source).toBe("unknown");
    expect(simulation.usage.served_item_count).toBe(2);
  });

  it("keeps a citation that was never served, as declared", async () => {
    const client = stub({
      ...simulationBody,
      assertions: [
        {
          citations: [{ receipt_item_id: "ghost", was_served: false }],
          position: 0,
          text: "invented",
        },
      ],
    });

    const simulation = await getSimulation(client, "sim-1");
    expect(simulation.assertions[0]?.citations[0]).toEqual({
      receipt_item_id: "ghost",
      was_served: false,
    });
  });

  it("keeps an assertion that cited nothing", async () => {
    const client = stub({
      ...simulationBody,
      assertions: [{ citations: [], position: 0, text: "invented" }],
    });

    const simulation = await getSimulation(client, "sim-1");
    expect(simulation.assertions[0]?.citations).toEqual([]);
  });

  it("refuses an instruction disposition outside the three states", async () => {
    const client = stub({ ...simulationBody, instruction_disposition: "sort_of_declared" });
    await expect(getSimulation(client, "sim-1")).rejects.toThrow(
      /not_declared, declared_unknown, declared_known/,
    );
  });

  it("posts a simulation naming the principal it models", async () => {
    const request = vi.fn(async () => simulationBody);
    await runSimulation(clientFromRequest(request), {
      prompt: "how?",
      request: { limit: 10 },
      simulatedActorId: "actor-1",
    });
    expect(request).toHaveBeenCalledWith("/v1/evaluation/simulations", {
      body: {
        prompt: "how?",
        request: { limit: 10 },
        run_item_id: null,
        simulated_actor_id: "actor-1",
      },
      method: "POST",
    });
  });
});

describe("evaluation adapters: judged criteria", () => {
  it("reads a judgement with its reasoning, evidence and pinned tuple", async () => {
    const client = stub({ items: [judgementBody] });
    const judgements = await listJudgements(client, "sim-1");
    expect(judgements[0]?.reasoning).toBe("step by step");
    expect(judgements[0]?.evidence).toEqual(["a span"]);
    expect(judgements[0]?.rubric_version).toBe("agent-response-judge v1.0.0");
    expect(judgements[0]?.prompt_template_hash).toHaveLength(64);
  });

  it("carries the calibration flag rather than inferring it", async () => {
    const client = stub({ items: [{ ...judgementBody, confidence_is_calibrated: true }] });
    const judgements = await listJudgements(client, "sim-1");
    expect(judgements[0]?.confidence_is_calibrated).toBe(true);
  });

  it("refuses a criterion the rubric does not define", async () => {
    const client = stub({ items: [{ ...judgementBody, criterion: "vibes" }] });
    await expect(listJudgements(client, "sim-1")).rejects.toThrow(
      /groundedness, answer_relevance/,
    );
  });

  it("refuses a judge verdict with a middle", async () => {
    const client = stub({ items: [{ ...judgementBody, verdict: "mostly" }] });
    await expect(listJudgements(client, "sim-1")).rejects.toThrow(/pass, fail/);
  });

  it("posts a single-judge run at panel position zero", async () => {
    const request = vi.fn(async () => ({ items: [judgementBody] }));
    await judgeSimulation(clientFromRequest(request), "sim-1");
    expect(request).toHaveBeenCalledWith("/v1/evaluation/simulations/sim-1/judgements", {
      body: { panel_position: 0 },
      method: "POST",
    });
  });

  it("reads a split panel without averaging it", async () => {
    const client = stub({
      items: [
        {
          criterion: "groundedness",
          is_split: true,
          judgements: [judgementBody, { ...judgementBody, judgement_id: "j2", verdict: "fail" }],
          majority: "pass",
          votes: { fail: 1, pass: 2 },
        },
      ],
    });

    const outcomes = await judgeWithPanel(client, "sim-1");
    expect(outcomes[0]?.votes).toEqual({ fail: 1, pass: 2 });
    expect(outcomes[0]?.majority).toBe("pass");
    expect(outcomes[0]?.is_split).toBe(true);
  });

  it("reads an evenly split panel as having no majority", async () => {
    const client = stub({
      items: [
        {
          criterion: "groundedness",
          is_split: true,
          judgements: [judgementBody],
          majority: null,
          votes: { fail: 1, pass: 1 },
        },
      ],
    });

    const outcomes = await judgeWithPanel(client, "sim-1");
    expect(outcomes[0]?.majority).toBeNull();
  });

  it("records a review with its reason and observed confidence", async () => {
    const request = vi.fn(async () => ({
      note: "the cited item says nothing of the kind",
      observed_confidence: 0.2,
      reviewed_at: "2026-08-25T12:00:00Z",
      reviewed_by: "r1",
      verdict: "overruled",
    }));

    await recordJudgementReview(clientFromRequest(request), {
      judgementId: "judgement-1",
      note: "the cited item says nothing of the kind",
      observedConfidence: 0.2,
      verdict: "overruled",
    });

    expect(request).toHaveBeenCalledWith("/v1/evaluation/judgements/judgement-1/review", {
      body: {
        note: "the cited item says nothing of the kind",
        observed_confidence: 0.2,
        verdict: "overruled",
      },
      method: "POST",
    });
  });

  it("refuses a review verdict outside the closed set", async () => {
    const client = stub({ items: [{ ...judgementBody, reviews: [{
      note: null,
      observed_confidence: null,
      reviewed_at: "2026-08-25T12:00:00Z",
      reviewed_by: "r1",
      verdict: "sort of",
    }] }] });

    await expect(listJudgements(client, "sim-1")).rejects.toThrow(
      /confirmed, overruled, unsure/,
    );
  });

  it("reads a tuple that has been fitted and missed its bound", async () => {
    const client = stub({
      items: [
        {
          fitted_at: "2026-08-25T12:00:00Z",
          is_calibrated: false,
          judge_model_id: "gpt-judge",
          measured_error: 0.25,
          n_adjudicated: 200,
          prompt_template_hash: "a".repeat(64),
          rubric_version: "agent-response-judge v1.0.0",
          status: "failed",
          version: "gpt-judge:agent-response-judge v1.0.0:aaaaaaaaaaaa:2026-08-25:200",
        },
      ],
    });

    const states = await listJudgeCalibration(client);
    expect(states[0]?.is_calibrated).toBe(false);
    expect(states[0]?.status).toBe("failed");
    expect(states[0]?.n_adjudicated).toBe(200);
  });
});

describe("evaluation adapters: prompt writes and the score read", () => {
  it("posts a prompt with its expectations, and null when it asserts nothing", async () => {
    const request = vi.fn(async () => ({
      expectations: null,
      intent_note: null,
      position: 0,
      prompt_id: "prompt-1",
      request: { query: "q" },
    }));
    const { addPrompt } = await import("./evaluation");

    await addPrompt(clientFromRequest(request), { request: { query: "q" }, setId: "set-1" });
    expect(request).toHaveBeenCalledWith("/v1/evaluation/prompt-sets/set-1/prompts", {
      body: { expectations: null, intent_note: null, request: { query: "q" } },
      method: "POST",
    });

    await addPrompt(clientFromRequest(request), {
      expectations: { min_recall: 0.9 },
      intentNote: "whether the runbook is reachable",
      request: { query: "q" },
      setId: "set-1",
    });
    expect(request).toHaveBeenLastCalledWith("/v1/evaluation/prompt-sets/set-1/prompts", {
      body: {
        expectations: { min_recall: 0.9 },
        intent_note: "whether the runbook is reachable",
        request: { query: "q" },
      },
      method: "POST",
    });
  });

  it("posts a prompt set with a null description rather than omitting the field", async () => {
    const request = vi.fn(async () => ({
      created_at: "2026-08-25T09:00:00Z",
      description: null,
      name: "s",
      prompt_count: 0,
      retired_at: null,
      set_id: "set-1",
    }));
    const { createPromptSet } = await import("./evaluation");
    await createPromptSet(clientFromRequest(request), { name: "s" });
    expect(request).toHaveBeenCalledWith("/v1/evaluation/prompt-sets", {
      body: { description: null, name: "s" },
      method: "POST",
    });
  });

  it("reads an unassertable score as a reason rather than as zeros", async () => {
    const { scoreSimulation } = await import("./evaluation");
    const client = stub({
      blocks: [],
      prompt_id: null,
      rubric_version: "context-envelope-judge v2.0.0",
      unassertable: "nothing was declared in advance",
    });

    const result = await scoreSimulation(client, "sim-1");
    expect(result.unassertable).toBe("nothing was declared in advance");
    expect(result.recall).toBeNull();
    expect(result.is_safe).toBeNull();
    expect(result.violations).toEqual([]);
  });

  it("reads a computed score with its violations, unchecked dimensions and per-block tally", async () => {
    const { scoreSimulation } = await import("./evaluation");
    const client = stub({
      blocks: [{ block: "workspace", relevant: 1, required_found: 1, served: 2, state: "success" }],
      is_safe: false,
      precision: 0.5,
      prompt_id: "prompt-1",
      recall: 1,
      required_found: 1,
      required_total: 1,
      rubric_version: "context-envelope-judge v2.0.0",
      served_total: 2,
      unassertable: null,
      unchecked: [
        {
          block: "canonical",
          dimension: "classification",
          item_key: "e1",
          reason: "canonical items carry no trust metadata by construction",
        },
      ],
      violations: [
        { block: "workspace", detail: "served from another task", item_key: "c1", kind: "audience" },
      ],
    });

    const result = await scoreSimulation(client, "sim-1");
    expect(result.is_safe).toBe(false);
    expect(result.violations[0]?.kind).toBe("audience");
    // An unchecked dimension is neither a pass nor a failure, and it travels.
    expect(result.unchecked[0]?.reason).toContain("by construction");
    expect(result.blocks[0]?.served).toBe(2);
  });

  it("reads prompts for a set", async () => {
    const { listPrompts } = await import("./evaluation");
    const client = stub({
      items: [
        {
          expectations: { min_recall: 0.5 },
          intent_note: "note",
          position: 0,
          prompt_id: "prompt-1",
          request: { query: "q" },
        },
      ],
    });
    const prompts = await listPrompts(client, "set-1");
    expect(prompts[0]?.expectations).toEqual({ min_recall: 0.5 });
    expect(prompts[0]?.intent_note).toBe("note");
  });

  it("reads one simulation by id", async () => {
    const { getSimulation } = await import("./evaluation");
    const client = stub(simulationBody);
    await expect(getSimulation(client, "sim-1")).resolves.toMatchObject({ simulation_id: "sim-1" });
  });

  it("posts a simulation belonging to a run item when one is named", async () => {
    const request = vi.fn(async () => ({ ...simulationBody, run_item_id: "item-1" }));
    const { runSimulation: run } = await import("./evaluation");
    await run(clientFromRequest(request), {
      prompt: "how?",
      runItemId: "item-1",
      simulatedActorId: "actor-1",
    });
    expect(request).toHaveBeenCalledWith("/v1/evaluation/simulations", {
      body: { prompt: "how?", request: {}, run_item_id: "item-1", simulated_actor_id: "actor-1" },
      method: "POST",
    });
  });

  it("posts a review with no note and no confidence as explicit nulls", async () => {
    const request = vi.fn(async () => ({
      note: null,
      observed_confidence: null,
      reviewed_at: "2026-08-25T12:00:00Z",
      reviewed_by: "r1",
      verdict: "confirmed",
    }));
    const { recordJudgementReview: review } = await import("./evaluation");
    await review(clientFromRequest(request), { judgementId: "j1", verdict: "confirmed" });
    expect(request).toHaveBeenCalledWith("/v1/evaluation/judgements/j1/review", {
      body: { note: null, observed_confidence: null, verdict: "confirmed" },
      method: "POST",
    });
  });
});
