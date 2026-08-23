import { describe, expect, it } from "vitest";

import type { AgentInstruction, FailureGroup } from "../../shared/api";
import {
  activatableInstructions,
  activeInstruction,
  canRollback,
  formatBasis,
  formatRate,
  groupKey,
  nextInstructionVersion,
  rankedFailureGroups,
  toWindowInstant,
  windowStartDefault,
} from "./agentsModel";

function group(overrides: Partial<FailureGroup> = {}): FailureGroup {
  return {
    claim_category: "capability",
    examples: [],
    incorrect_count: 1,
    predicate: "supports",
    rate: 0.5,
    total_count: 2,
    ...overrides,
  };
}

function instruction(overrides: Partial<AgentInstruction> = {}): AgentInstruction {
  return {
    activated_at: null,
    author_actor_id: "actor-a",
    content: "Cite the interface version.",
    instruction_id: "instruction-a",
    motivated_by_report_id: "report-a",
    status: "proposed",
    superseded_at: null,
    version: 1,
    ...overrides,
  };
}

describe("formatRate", () => {
  it("distinguishes an unmeasured rate from a zero one", () => {
    // The two mean opposite things: nobody adjudicated this author, versus this
    // author was wrong every time. Rendering the first as 0% reports a failing
    // agent where the service reported an unmeasured one.
    expect(formatRate(null)).toBe("Not measured");
    expect(formatRate(0)).toBe("0.0%");
  });

  it("renders a fraction as a percentage", () => {
    expect(formatRate(0.8125)).toBe("81.3%");
    expect(formatRate(1)).toBe("100.0%");
  });
});

describe("formatBasis", () => {
  it("says there were no observations rather than dividing by zero", () => {
    expect(formatBasis(0, 0)).toBe("no observations");
  });

  it("carries the denominator so a rate is never read without its basis", () => {
    expect(formatBasis(3, 12)).toBe("3 of 12");
  });
});

describe("rankedFailureGroups", () => {
  it("ranks by rate, not by volume", () => {
    // The report's own field description gives the reason: a predicate used
    // constantly and mostly got right leads on incorrect_count by volume alone.
    // A table whose job is to say what to fix must not put it first.
    const busy = group({ incorrect_count: 40, predicate: "busy", rate: 0.04, total_count: 1000 });
    const broken = group({ incorrect_count: 3, predicate: "broken", rate: 0.75, total_count: 4 });

    expect(rankedFailureGroups([busy, broken]).map((entry) => entry.predicate)).toEqual([
      "broken",
      "busy",
    ]);
  });

  it("sorts unmeasured groups last, not first", () => {
    const measured = group({ predicate: "measured", rate: 0.1 });
    const unmeasured = group({ predicate: "unmeasured", rate: null });

    expect(rankedFailureGroups([unmeasured, measured]).map((entry) => entry.predicate)).toEqual([
      "measured",
      "unmeasured",
    ]);
  });

  it("orders ties stably rather than by input order", () => {
    const later = group({ claim_category: "z", incorrect_count: 2, predicate: "a", rate: 0.5 });
    const earlier = group({ claim_category: "a", incorrect_count: 2, predicate: "a", rate: 0.5 });

    expect(rankedFailureGroups([later, earlier]).map(groupKey)).toEqual([
      rankedFailureGroups([earlier, later]).map(groupKey)[0],
      rankedFailureGroups([earlier, later]).map(groupKey)[1],
    ]);
    expect(rankedFailureGroups([later, earlier]).map(groupKey)).toEqual(["a/a", "z/a"]);
  });

  it("does not mutate the report it was handed", () => {
    const groups = [group({ predicate: "low", rate: 0.1 }), group({ predicate: "high", rate: 0.9 })];
    rankedFailureGroups(groups);
    expect(groups.map((entry) => entry.predicate)).toEqual(["low", "high"]);
  });
});

describe("activeInstruction", () => {
  it("reads status rather than picking the highest version", () => {
    // A proposal is a row too. Picking the newest would name a proposal as
    // in force in exactly the state this screen exists to let somebody fix.
    const inForce = instruction({ activated_at: "2026-08-01T00:00:00Z", status: "active", version: 2 });
    const proposed = instruction({ instruction_id: "instruction-b", version: 7 });

    expect(activeInstruction([inForce, proposed])?.version).toBe(2);
  });

  it("reports no active instruction rather than guessing one", () => {
    expect(activeInstruction([instruction()])).toBeNull();
    expect(activeInstruction([])).toBeNull();
  });
});

describe("activatableInstructions", () => {
  it("offers only instructions that were never in force, newest first", () => {
    const active = instruction({ activated_at: "2026-08-01T00:00:00Z", status: "active" });
    const superseded = instruction({
      activated_at: "2026-07-01T00:00:00Z",
      instruction_id: "instruction-old",
      status: "superseded",
      version: 2,
    });
    const first = instruction({ instruction_id: "instruction-c", version: 3 });
    const second = instruction({ instruction_id: "instruction-d", version: 5 });

    expect(
      activatableInstructions([active, superseded, first, second]).map((entry) => entry.version),
    ).toEqual([5, 3]);
  });
});

describe("nextInstructionVersion", () => {
  it("continues past the highest version that exists, active or not", () => {
    expect(nextInstructionVersion([instruction({ version: 2 }), instruction({ version: 9 })])).toBe(10);
  });

  it("starts at one when the author has no instructions", () => {
    expect(nextInstructionVersion([])).toBe(1);
  });
});

describe("canRollback", () => {
  it("requires something behind the current instruction", () => {
    // Rollback is ordered by activated_at, so it restores the previously
    // *active* instruction. With one activation ever there is nothing behind
    // it, and offering the action would promise a result the server declines.
    const activated = instruction({ activated_at: "2026-08-01T00:00:00Z", status: "active" });
    const proposed = instruction({ instruction_id: "instruction-b", version: 2 });

    expect(canRollback([activated, proposed])).toBe(false);
    expect(
      canRollback([
        activated,
        instruction({ activated_at: "2026-07-01T00:00:00Z", status: "superseded", version: 0 }),
      ]),
    ).toBe(true);
  });
});

describe("window inputs", () => {
  it("sends a date-only value as the start of that UTC day", () => {
    expect(toWindowInstant("2026-08-01")).toBe("2026-08-01T00:00:00Z");
  });

  it("sends a datetime-local value as a UTC instant", () => {
    expect(toWindowInstant("2026-08-01T12:00")).toMatch(/^2026-08-01T\d{2}:00:00\.000Z$/u);
  });

  it("defaults the window start to a fixed distance behind the given moment", () => {
    expect(windowStartDefault(new Date("2026-08-31T00:00:00Z"), 30)).toBe("2026-08-01T00:00");
  });
});
