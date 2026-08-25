import { describe, expect, it } from "vitest";

import type {
  ContextEnvelope,
  DeterministicScore,
  Judgement,
  Simulation,
} from "../../shared/api";
import {
  anyCriterionFailed,
  canonicalEmptyWhileClaimsFull,
  criteriaStates,
  criterionImplicates,
  criterionJudge,
  deterministicCriteria,
  evaluationCriteria,
  instructionsAreEditable,
  modelJudgedCriteria,
  observationsFor,
} from "./simulationModel";

function score(overrides: Partial<DeterministicScore> = {}): DeterministicScore {
  return {
    blocks: [],
    is_safe: true,
    precision: 1,
    prompt_id: "prompt-1",
    recall: 1,
    required_found: 2,
    required_total: 2,
    rubric_version: "context-envelope-judge v2.0.0",
    served_total: 2,
    unassertable: null,
    unchecked: [],
    violations: [],
    ...overrides,
  };
}

function judgement(overrides: Partial<Judgement> = {}): Judgement {
  return {
    confidence: 0.8,
    confidence_is_calibrated: false,
    created_at: "2026-08-25T10:00:00Z",
    criterion: "groundedness",
    evidence: ["the runbook drains it"],
    is_disputed: false,
    judge_model_id: "gpt-judge",
    judge_provider_id: "openai",
    judgement_id: "j1",
    panel_position: 0,
    prompt_template_hash: "a".repeat(64),
    reasoning: "step by step",
    reviews: [],
    rubric_version: "agent-response-judge v1.0.0",
    simulation_id: "sim-1",
    verdict: "pass",
    ...overrides,
  };
}

function envelope(overrides: Partial<ContextEnvelope> = {}): ContextEnvelope {
  return {
    arc_block_note: null,
    blocks: [
      { items: [], name: "canonical", reason: null, state: "empty" },
      { items: [], name: "arc", reason: null, state: "empty" },
      { items: [], name: "observed_claims", reason: null, state: "empty" },
      { items: [], name: "workspace", reason: null, state: "empty" },
      { items: [], name: "instructions", reason: null, state: "empty" },
    ],
    instruction_block_note: null,
    instruction_disposition: "declared_known",
    quality: { cacheable: true, degraded_blocks: [], reasons: [] },
    receipt_id: "receipt-1",
    state: "complete",
    ...overrides,
  } as ContextEnvelope;
}

function simulation(overrides: Partial<Simulation> = {}): Simulation {
  return {
    answer: "Through the runbook.",
    assertions: [],
    created_at: "2026-08-25T10:00:00Z",
    duration_ms: 40,
    envelope_state: "complete",
    instruction_disposition: "declared_known",
    model_id: "claude-test",
    prompt: "how?",
    provider_id: "anthropic",
    receipt_id: "receipt-1",
    run_item_id: null,
    simulated_actor_id: "actor-1",
    simulation_id: "sim-1",
    uncited_served_ids: [],
    usage: {
      cached_prompt_tokens: null,
      completion_tokens: null,
      prompt_tokens: null,
      served_item_count: 0,
      source: "unknown",
    },
    ...overrides,
  };
}

describe("five criteria", () => {
  it("is five, always, in one order", () => {
    expect(evaluationCriteria).toHaveLength(5);
    expect(criteriaStates(null, []).map((state) => state.criterion)).toEqual([...evaluationCriteria]);
  });

  it("renders all five even when only one has anything to say", () => {
    // A pane rendering only the criteria it had results for would let a reader
    // believe the run was assessed on one — and the four absent include all
    // three that implicate what was served.
    const states = criteriaStates(null, [judgement()]);
    expect(states).toHaveLength(5);
    expect(states.filter((state) => state.outcome === "unjudged").map((state) => state.criterion)).toEqual([
      "required_fact_recall",
      "boundary_violations",
      "precision",
      "answer_relevance",
    ]);
  });

  it("splits the criteria by judge type without letting a model near the first three", () => {
    expect(deterministicCriteria).toEqual([
      "required_fact_recall",
      "boundary_violations",
      "precision",
    ]);
    expect(modelJudgedCriteria).toEqual(["groundedness", "answer_relevance"]);
    expect(criterionJudge("precision")).toBe("deterministic");
    expect(criterionJudge("groundedness")).toBe("LLM, with human override");
  });

  it("attributes memory and governance to what was served, and the rest to the agent", () => {
    expect(criterionImplicates.required_fact_recall).toBe("memory");
    expect(criterionImplicates.precision).toBe("memory");
    expect(criterionImplicates.boundary_violations).toBe("governance");
    expect(criterionImplicates.groundedness).toBe("the agent");
    expect(criterionImplicates.answer_relevance).toBe("the agent");
  });
});

describe("the deterministic three", () => {
  it("treats an unassertable score as unassertable, never as zero", () => {
    const states = criteriaStates(score({ unassertable: "nothing was declared in advance" }), []);
    const recall = states.find((state) => state.criterion === "required_fact_recall");
    expect(recall?.outcome).toBe("unassertable");
    expect(recall?.unassertableReason).toBe("nothing was declared in advance");
  });

  it("gives no partial credit on recall", () => {
    const states = criteriaStates(score({ required_found: 1, required_total: 2 }), []);
    const recall = states.find((state) => state.criterion === "required_fact_recall");
    expect(recall?.outcome).toBe("fail");
    expect(recall?.evidence).toEqual(["1 of 2 required facts present"]);
  });

  it("passes recall only when every required fact is present", () => {
    const states = criteriaStates(score({ required_found: 2, required_total: 2 }), []);
    expect(states.find((state) => state.criterion === "required_fact_recall")?.outcome).toBe("pass");
  });

  it("says a prompt declared no required facts rather than passing it", () => {
    const states = criteriaStates(score({ required_found: 0, required_total: 0 }), []);
    const recall = states.find((state) => state.criterion === "required_fact_recall");
    expect(recall?.outcome).toBe("unassertable");
  });

  it("fails the boundary criterion on one violation and carries it as evidence", () => {
    const states = criteriaStates(
      score({
        is_safe: false,
        violations: [
          { block: "workspace", detail: "served from another task", item_key: "c1", kind: "audience" },
        ],
      }),
      [],
    );
    const boundary = states.find((state) => state.criterion === "boundary_violations");
    expect(boundary?.outcome).toBe("fail");
    expect(boundary?.evidence).toEqual(["workspace/c1: served from another task"]);
  });

  it("never marks a deterministic criterion unproven — there is no model to calibrate", () => {
    const states = criteriaStates(score(), []);
    for (const state of states.filter((entry) => entry.judge === "deterministic")) {
      expect(state.isProven).toBe(true);
    }
  });
});

describe("the two judged criteria", () => {
  it("carries the judge's reasoning and evidence rather than a bare verdict", () => {
    const states = criteriaStates(null, [judgement()]);
    const grounded = states.find((state) => state.criterion === "groundedness");
    expect(grounded?.outcome).toBe("pass");
    expect(grounded?.reasoning).toBe("step by step");
    expect(grounded?.evidence).toEqual(["the runbook drains it"]);
  });

  it("renders evidence on a pass as well as a fail", () => {
    // Evidence only on failures teaches a reader that passes are not checkable.
    const passing = criteriaStates(null, [judgement({ verdict: "pass" })]);
    expect(passing.find((state) => state.criterion === "groundedness")?.evidence).toHaveLength(1);
  });

  it("marks an unfitted judge as unproven", () => {
    const states = criteriaStates(null, [judgement({ confidence_is_calibrated: false })]);
    expect(states.find((state) => state.criterion === "groundedness")?.isProven).toBe(false);
  });

  it("marks a fitted judge as proven", () => {
    const states = criteriaStates(null, [judgement({ confidence_is_calibrated: true })]);
    expect(states.find((state) => state.criterion === "groundedness")?.isProven).toBe(true);
  });

  it("shows a reviewer disagreement as a state rather than overwriting the verdict", () => {
    const states = criteriaStates(null, [judgement({ is_disputed: true, verdict: "pass" })]);
    const grounded = states.find((state) => state.criterion === "groundedness");
    expect(grounded?.outcome).toBe("pass");
    expect(grounded?.isDisputed).toBe(true);
  });

  it("shows panel position zero rather than blending a split", () => {
    const states = criteriaStates(null, [
      judgement({ judgement_id: "j2", panel_position: 1, verdict: "fail" }),
      judgement({ judgement_id: "j1", panel_position: 0, verdict: "pass" }),
    ]);
    const grounded = states.find((state) => state.criterion === "groundedness");
    expect(grounded?.outcome).toBe("pass");
    expect(grounded?.judgementId).toBe("j1");
  });

  it("reports a failure without averaging it into the others", () => {
    const states = criteriaStates(score(), [judgement({ verdict: "fail" })]);
    expect(anyCriterionFailed(states)).toBe(true);
    expect(states.find((state) => state.criterion === "precision")?.outcome).toBe("pass");
  });
});

describe("improvement observations", () => {
  it("offers both readings of a served item nobody cited", () => {
    const observations = observationsFor({
      envelope: null,
      exclusions: [],
      judgements: [],
      score: null,
      simulation: simulation({ uncited_served_ids: ["rid-1"] }),
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]?.kind).toBe("served_but_uncited");
    // Plural on purpose: the user's instruction is that there is not one path.
    expect(observations[0]?.couldPointAt.length).toBeGreaterThan(1);
    expect(observations[0]?.rating).toBe("ignored");
  });

  it("offers both readings of an assertion citing nothing", () => {
    const observations = observationsFor({
      envelope: null,
      exclusions: [],
      judgements: [],
      score: null,
      simulation: simulation({
        assertions: [{ citations: [], position: 0, text: "invented" }],
      }),
    });

    expect(observations[0]?.kind).toBe("assertion_cites_nothing");
    expect(observations[0]?.rating).toBe("missing");
    expect(observations[0]?.couldPointAt).toHaveLength(2);
  });

  it("reports a citation naming something never served", () => {
    const observations = observationsFor({
      envelope: null,
      exclusions: [],
      judgements: [],
      score: null,
      simulation: simulation({
        assertions: [
          { citations: [{ receipt_item_id: "ghost", was_served: false }], position: 0, text: "x" },
        ],
      }),
    });

    expect(observations[0]?.kind).toBe("assertion_cites_unserved");
    expect(observations[0]?.rating).toBe("incorrect");
  });

  it("reports a degraded block with the reason it carried", () => {
    const observations = observationsFor({
      envelope: envelope({
        blocks: [
          { items: [], name: "canonical", reason: null, state: "empty" },
          { items: [], name: "arc", reason: null, state: "empty" },
          { items: [], name: "observed_claims", reason: "the breaker tripped", state: "degraded" },
          { items: [], name: "workspace", reason: null, state: "empty" },
          { items: [], name: "instructions", reason: null, state: "empty" },
        ],
      }),
      exclusions: [],
      judgements: [],
      score: null,
      simulation: null,
    });

    expect(observations[0]?.kind).toBe("block_degraded_or_failed");
    expect(observations[0]?.evidence).toContain("the breaker tripped");
  });

  it("reports a receipt exclusion as governance having withheld something", () => {
    const observations = observationsFor({
      envelope: null,
      exclusions: [{ block: "workspace", item_key: "c1", reason: "no active participant grant" }],
      judgements: [],
      score: null,
      simulation: null,
    });

    expect(observations[0]?.kind).toBe("receipt_exclusions");
    expect(observations[0]?.couldPointAt.some((entry) => entry.includes("PII"))).toBe(true);
  });

  it("reports canonical empty while claims is full", () => {
    const full = envelope({
      blocks: [
        { items: [], name: "canonical", reason: null, state: "empty" },
        { items: [], name: "arc", reason: null, state: "empty" },
        {
          items: [
            {
              payload: {},
              receipt_item_id: { block: "observed_claims", item_key: "c1", source: "claims", value: "v" },
              trust: null,
            },
          ],
          name: "observed_claims",
          reason: null,
          state: "success",
        },
        { items: [], name: "workspace", reason: null, state: "empty" },
        { items: [], name: "instructions", reason: null, state: "empty" },
      ],
    } as unknown as Partial<ContextEnvelope>);

    expect(canonicalEmptyWhileClaimsFull(full)).toBe(true);
    const observations = observationsFor({
      envelope: full,
      exclusions: [],
      judgements: [],
      score: null,
      simulation: null,
    });
    expect(observations.some((entry) => entry.kind === "canonical_empty_claims_full")).toBe(true);
  });

  it("does not report canonical empty when the canonical arm failed", () => {
    // A failed arm has no items either, and treating it as empty reads a broken
    // arm as a quiet one.
    const failed = envelope({
      blocks: [
        { items: [], name: "canonical", reason: "the arm timed out", state: "failed" },
        { items: [], name: "arc", reason: null, state: "empty" },
        {
          items: [
            {
              payload: {},
              receipt_item_id: { block: "observed_claims", item_key: "c1", source: "claims", value: "v" },
              trust: null,
            },
          ],
          name: "observed_claims",
          reason: null,
          state: "success",
        },
        { items: [], name: "workspace", reason: null, state: "empty" },
        { items: [], name: "instructions", reason: null, state: "empty" },
      ],
    } as unknown as Partial<ContextEnvelope>);

    expect(canonicalEmptyWhileClaimsFull(failed)).toBe(false);
  });

  it("reports an instruction contradiction as a Judgement event", () => {
    const contradicted = envelope({
      blocks: [
        { items: [], name: "canonical", reason: null, state: "empty" },
        { items: [], name: "arc", reason: null, state: "empty" },
        { items: [], name: "observed_claims", reason: null, state: "empty" },
        { items: [], name: "workspace", reason: null, state: "empty" },
        {
          items: [
            {
              payload: {
                body: "prefer the newer runbook",
                contradicts: true,
                contradiction_note: "the declared set says the older one",
                delta_id: "d1",
                scope: "principal",
              },
              receipt_item_id: { block: "instructions", item_key: "d1", source: "delta", value: "v1" },
              trust: null,
            },
          ],
          name: "instructions",
          reason: null,
          state: "success",
        },
      ],
    } as unknown as Partial<ContextEnvelope>);

    const observations = observationsFor({
      envelope: contradicted,
      exclusions: [],
      judgements: [],
      score: null,
      simulation: null,
    });
    const found = observations.find((entry) => entry.kind === "instruction_contradiction");
    expect(found?.rating).toBe("contradicted");
    expect(found?.evidence).toBe("the declared set says the older one");
  });

  it("reports declared-but-never-submitted instructions as its own observation", () => {
    const observations = observationsFor({
      envelope: envelope({ instruction_disposition: "declared_unknown" }),
      exclusions: [],
      judgements: [],
      score: null,
      simulation: null,
    });
    expect(observations.some((entry) => entry.kind === "instructions_declared_unknown")).toBe(true);
  });

  it("reports a boundary violation as unsafe", () => {
    const observations = observationsFor({
      envelope: null,
      exclusions: [],
      judgements: [],
      score: score({
        is_safe: false,
        violations: [
          { block: "workspace", detail: "above the ceiling", item_key: "c1", kind: "classification" },
        ],
      }),
      simulation: null,
    });
    const found = observations.find((entry) => entry.kind === "boundary_violation");
    expect(found?.rating).toBe("unsafe");
  });

  it("says whether the judge that failed a criterion has been calibrated", () => {
    const uncalibrated = observationsFor({
      envelope: null,
      exclusions: [],
      judgements: [judgement({ confidence_is_calibrated: false, verdict: "fail" })],
      score: null,
      simulation: null,
    });
    expect(uncalibrated[0]?.couldPointAt.some((entry) => entry.includes("unproven"))).toBe(true);

    const calibrated = observationsFor({
      envelope: null,
      exclusions: [],
      judgements: [judgement({ confidence_is_calibrated: true, verdict: "fail" })],
      score: null,
      simulation: null,
    });
    expect(calibrated[0]?.couldPointAt.some((entry) => entry.includes("fitted"))).toBe(true);
  });

  it("does not report a judge that passed", () => {
    const observations = observationsFor({
      envelope: null,
      exclusions: [],
      judgements: [judgement({ verdict: "pass" })],
      score: null,
      simulation: null,
    });
    expect(observations).toEqual([]);
  });

  it("returns nothing when the record supports nothing", () => {
    expect(
      observationsFor({
        envelope: envelope(),
        exclusions: [],
        judgements: [],
        score: score(),
        simulation: simulation(),
      }),
    ).toEqual([]);
  });

  it("offers several at once rather than one", () => {
    const observations = observationsFor({
      envelope: envelope({ instruction_disposition: "declared_unknown" }),
      exclusions: [{ block: "workspace", item_key: "c1", reason: "withheld" }],
      judgements: [judgement({ verdict: "fail" })],
      score: score({
        is_safe: false,
        violations: [{ block: "workspace", detail: "d", item_key: "c1", kind: "audience" }],
      }),
      simulation: simulation({ uncited_served_ids: ["rid-1"] }),
    });

    // The user's correction, asserted: a failing run does not have *a* cause.
    expect(observations.length).toBeGreaterThan(3);
    expect(new Set(observations.map((entry) => entry.kind)).size).toBeGreaterThan(3);
  });
});

describe("instruction states", () => {
  it("offers an editor only for a declared set the product has seen", () => {
    expect(instructionsAreEditable("declared_known")).toBe(true);
    expect(instructionsAreEditable("declared_unknown")).toBe(false);
    expect(instructionsAreEditable("not_declared")).toBe(false);
  });
});
