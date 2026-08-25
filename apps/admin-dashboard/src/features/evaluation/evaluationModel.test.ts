import { describe, expect, it } from "vitest";

import type { EvaluationRun, Judgement, RunItem, RunVerdict } from "../../shared/api";
import {
  compareRuns,
  formatFingerprint,
  formatTokens,
  isWritableSet,
  judgeVerdictTone,
  judgedCriterionImplicates,
  runChangeDirection,
  runVerdictLabel,
  runVerdictOptions,
  runVerdictTone,
  runsAreComparable,
  spansRubricVersions,
  tallyRun,
} from "./evaluationModel";

const fingerprint = `sha256:${"a".repeat(64)}`;
const otherFingerprint = `sha256:${"b".repeat(64)}`;

function verdict(value: RunVerdict["verdict"], recordedAt = "2026-08-25T10:00:00Z"): RunVerdict {
  return { note: null, recorded_at: recordedAt, recorded_by: "reviewer-1", verdict: value };
}

function item(overrides: Partial<RunItem> = {}): RunItem {
  return {
    duration_ms: 120,
    envelope_state: "complete",
    failure: null,
    item_id: "item-1",
    position: 0,
    prompt_id: "prompt-1",
    receipt_id: "receipt-1",
    verdicts: [],
    ...overrides,
  };
}

function run(items: readonly RunItem[], overrides: Partial<EvaluationRun> = {}): EvaluationRun {
  return {
    finished_at: "2026-08-25T10:05:00Z",
    items,
    prompt_count: items.length,
    resolver_fingerprint: fingerprint,
    run_id: "run-1",
    set_id: "set-1",
    started_at: "2026-08-25T10:00:00Z",
    ...overrides,
  };
}

function judgement(overrides: Partial<Judgement> = {}): Judgement {
  return {
    confidence: 0.8,
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
    ...overrides,
  };
}

describe("run tallies", () => {
  it("counts an errored item rather than excluding it", () => {
    const tally = tallyRun(
      run([
        item({ failure: "boom", item_id: "a", prompt_id: "a", receipt_id: null, envelope_state: null }),
        item({ item_id: "b", prompt_id: "b", verdicts: [verdict("right")] }),
      ]),
    );

    expect(tally.errored).toBe(1);
    expect(tally.total).toBe(2);
  });

  it("reports judged and unjudged separately", () => {
    const tally = tallyRun(
      run([
        item({ item_id: "a", prompt_id: "a", verdicts: [verdict("right")] }),
        item({ item_id: "b", prompt_id: "b" }),
        item({ item_id: "c", prompt_id: "c" }),
      ]),
    );

    expect(tally.judged).toBe(1);
    expect(tally.unjudged).toBe(2);
    expect(tally.right).toBe(1);
  });

  it("counts two reviewers on one item as two opinions", () => {
    const tally = tallyRun(
      run([item({ verdicts: [verdict("right"), verdict("wrong", "2026-08-25T11:00:00Z")] })]),
    );

    expect(tally.judged).toBe(1);
    expect(tally.right).toBe(1);
    expect(tally.wrong).toBe(1);
  });

  it("counts an empty run as nothing rather than as clean", () => {
    const tally = tallyRun(run([]));
    expect(tally).toEqual({
      errored: 0,
      judged: 0,
      right: 0,
      total: 0,
      unjudged: 0,
      unusable: 0,
      wrong: 0,
    });
  });
});

describe("comparability", () => {
  it("refuses two runs from different deployments", () => {
    expect(
      runsAreComparable(run([]), run([], { resolver_fingerprint: otherFingerprint, run_id: "run-2" })),
    ).toBe(false);
  });

  it("refuses two runs of different sets", () => {
    expect(runsAreComparable(run([]), run([], { run_id: "run-2", set_id: "set-2" }))).toBe(false);
  });

  it("accepts two runs of one set under one deployment", () => {
    expect(runsAreComparable(run([]), run([], { run_id: "run-2" }))).toBe(true);
  });
});

describe("named change kinds", () => {
  it("names an improved verdict and gives it a direction", () => {
    const before = run([item({ verdicts: [verdict("wrong")] })]);
    const after = run(
      [item({ item_id: "item-2", verdicts: [verdict("right", "2026-08-25T12:00:00Z")] })],
      { run_id: "run-2" },
    );

    const changes = compareRuns(before, after);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.kind).toBe("verdict_improved");
    expect(runChangeDirection("verdict_improved")).toBe("better");
  });

  it("names a regressed verdict", () => {
    const before = run([item({ verdicts: [verdict("right")] })]);
    const after = run([item({ verdicts: [verdict("unusable", "2026-08-25T12:00:00Z")] })], {
      run_id: "run-2",
    });

    expect(compareRuns(before, after)[0]?.kind).toBe("verdict_regressed");
    expect(runChangeDirection("verdict_regressed")).toBe("worse");
  });

  it("reports a resolution that started failing, with the failure", () => {
    const before = run([item()]);
    const after = run([item({ envelope_state: null, failure: "the arm timed out", receipt_id: null })], {
      run_id: "run-2",
    });

    const changes = compareRuns(before, after);
    expect(changes[0]?.kind).toBe("resolution_started_failing");
    expect(changes[0]?.detail).toBe("the arm timed out");
  });

  it("reports a resolution that started succeeding", () => {
    const before = run([item({ envelope_state: null, failure: "boom", receipt_id: null })]);
    const after = run([item()], { run_id: "run-2" });

    expect(compareRuns(before, after)[0]?.kind).toBe("resolution_started_succeeding");
  });

  it("reports an envelope state change without calling it better or worse", () => {
    const before = run([item({ envelope_state: "complete" })]);
    const after = run([item({ envelope_state: "degraded" })], { run_id: "run-2" });

    const changes = compareRuns(before, after);
    expect(changes[0]?.kind).toBe("envelope_state_changed");
    expect(changes[0]?.detail).toBe("complete → degraded");
    expect(runChangeDirection("envelope_state_changed")).toBeNull();
  });

  it("reports a prompt that only one run holds rather than narrowing to the intersection", () => {
    const before = run([item({ prompt_id: "shared" })]);
    const after = run(
      [item({ prompt_id: "shared" }), item({ item_id: "item-2", prompt_id: "added" })],
      { run_id: "run-2" },
    );

    const kinds = compareRuns(before, after).map((change) => change.kind);
    expect(kinds).toContain("prompt_absent_from_baseline");
    expect(runChangeDirection("prompt_absent_from_baseline")).toBeNull();
  });

  it("reports a prompt dropped from the candidate", () => {
    const before = run([item({ prompt_id: "dropped" })]);
    const after = run([], { run_id: "run-2" });

    expect(compareRuns(before, after)[0]?.kind).toBe("prompt_absent_from_candidate");
  });

  it("names a verdict recorded where there was none", () => {
    const before = run([item()]);
    const after = run([item({ verdicts: [verdict("right")] })], { run_id: "run-2" });

    expect(compareRuns(before, after)[0]?.kind).toBe("verdict_added");
  });

  it("names a verdict withdrawn", () => {
    const before = run([item({ verdicts: [verdict("right")] })]);
    const after = run([item()], { run_id: "run-2" });

    expect(compareRuns(before, after)[0]?.kind).toBe("verdict_withdrawn");
  });

  it("reports nothing when nothing moved", () => {
    const before = run([item({ verdicts: [verdict("right")] })]);
    const after = run([item({ verdicts: [verdict("right")] })], { run_id: "run-2" });

    expect(compareRuns(before, after)).toEqual([]);
  });

  it("follows the latest verdict when a reviewer changed their mind", () => {
    const before = run([item({ verdicts: [verdict("right")] })]);
    const after = run(
      [
        item({
          verdicts: [verdict("right"), verdict("wrong", "2026-08-25T13:00:00Z")],
        }),
      ],
      { run_id: "run-2" },
    );

    expect(compareRuns(before, after)[0]?.kind).toBe("verdict_regressed");
  });
});

describe("rubric versions", () => {
  it("flags a set of judgements spanning two rubric versions", () => {
    expect(
      spansRubricVersions([
        judgement(),
        judgement({ judgement_id: "j2", rubric_version: "agent-response-judge v1.1.0" }),
      ]),
    ).toBe(true);
  });

  it("does not flag one version", () => {
    expect(spansRubricVersions([judgement(), judgement({ judgement_id: "j2" })])).toBe(false);
  });

  it("does not flag an empty set", () => {
    expect(spansRubricVersions([])).toBe(false);
  });
});

describe("vocabulary", () => {
  it("offers three reviewer verdicts and explains the two that need it", () => {
    expect(runVerdictOptions.map((option) => option.value)).toEqual(["right", "wrong", "unusable"]);
    expect(runVerdictLabel("unusable")).toBe("Unusable");
    expect(runVerdictTone("wrong")).toBe("danger");
    expect(runVerdictTone("unusable")).toBe("warning");
  });

  it("attributes both judged criteria to the agent, not to what was served", () => {
    expect(judgedCriterionImplicates.groundedness).toBe("the agent");
    expect(judgedCriterionImplicates.answer_relevance).toBe("the agent");
  });

  it("tones a judge verdict without a middle", () => {
    expect(judgeVerdictTone("pass")).toBe("success");
    expect(judgeVerdictTone("fail")).toBe("danger");
  });

  it("treats a retired set as readable and not writable", () => {
    const base = {
      created_at: "2026-08-25T10:00:00Z",
      description: null,
      name: "set",
      prompt_count: 0,
      set_id: "set-1",
    };
    expect(isWritableSet({ ...base, retired_at: null })).toBe(true);
    expect(isWritableSet({ ...base, retired_at: "2026-08-25T11:00:00Z" })).toBe(false);
  });
});

describe("formatting", () => {
  it("shortens a fingerprint without pretending it is the whole digest", () => {
    expect(formatFingerprint(fingerprint)).toBe(`${"a".repeat(12)}…`);
  });

  it("passes through a fingerprint that is already short", () => {
    expect(formatFingerprint("sha256:abc")).toBe("abc");
  });

  it("reports an unknown token count as unreported rather than as zero", () => {
    expect(formatTokens(null, "unknown")).toBe("Not reported");
    expect(formatTokens(0, "provider_reported")).toBe("0");
    expect(formatTokens(1234, "provider_reported")).toBe("1,234");
  });
});
