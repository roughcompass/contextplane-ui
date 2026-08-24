import { describe, expect, it } from "vitest";

import type { DispositionPolicy, MemoryCurationItem } from "../../shared/api";

import {
  ORDERING_STATEMENT,
  RANK_TERMS,
  asksForAWrite,
  consequencesOf,
  dispositionLabel,
  groupDispositions,
  rankReasons,
} from "./curationModel";

function item(overrides: Partial<MemoryCurationItem> = {}): MemoryCurationItem {
  return {
    available_actions: [],
    claim_id: "c1",
    confidence: 0.42,
    created_at: "2026-08-01T00:00:00Z",
    dependant_count: 0,
    escalated: false,
    human_backed: false,
    predicate: "owned_by_team",
    proposal_id: null,
    reason: "contested",
    sampling_priority: 0,
    subject_entity_id: null,
    subject_reference: "svc/checkout",
    value: "platform",
    ...overrides,
  };
}

function policy(overrides: Partial<DispositionPolicy> = {}): DispositionPolicy {
  return {
    approval_authority: "curation_owner",
    evidence_threshold: "one attributable source the owner accepts",
    rollback: "record a further disposition on a new case for the same axis",
    scope: "the contested claim only",
    supersession: "none: the counterpart claim is retained and stays visible",
    disposition: "confirm",
    target_kind: null,
    ...overrides,
  };
}

describe("what the ordering is, and what it is not", () => {
  it("names every term the service ranks on and no others", () => {
    // Pinned against the service's own set. A fourth term added there and not
    // here would leave rows unexplained on the one screen built to explain them.
    expect([...RANK_TERMS]).toEqual(["escalated", "dependant_count", "sampling_priority"]);
  });

  it("says plainly that nothing in the order weighs what a mistake costs", () => {
    // The caution E5-T6 states: a reviewer who believes a number accounts for
    // cost will defer to it. The ordering has three inputs and none is a loss
    // model, so the screen has to say so rather than let a rank imply it.
    expect(ORDERING_STATEMENT).toContain("nothing here weighs what getting it wrong would cost");
  });

  it("says confidence does not move a row, because the row shows one", () => {
    // The adjacent misreading: the queue carries a confidence beside a position
    // and a reader assumes the first produced the second.
    expect(ORDERING_STATEMENT).toContain("Confidence does not move a row");
  });
});

describe("why a row sits where it does", () => {
  it("reports escalation first, because that is the term applied first", () => {
    const reasons = rankReasons(
      item({ dependant_count: 9, escalated: true, sampling_priority: 3 }),
    );

    expect(reasons.map((reason) => reason.label)).toEqual(["Escalated", "Leverage 9", "Sampled 3"]);
    expect(reasons[0]?.emphasis).toBe(true);
  });

  it("explains a row with nothing distinguishing it rather than leaving a blank", () => {
    // An empty cell reads as a screen that failed to load something. "It is
    // here because it is waiting" is an answer.
    const reasons = rankReasons(item());

    expect(reasons).toHaveLength(1);
    expect(reasons[0]?.label).toBe("Arrival order");
    expect(reasons[0]?.detail).toContain("it is waiting");
  });

  it("counts dependants in the singular when there is one", () => {
    expect(rankReasons(item({ dependant_count: 1 }))[0]?.detail).toContain("1 entity depends");
    expect(rankReasons(item({ dependant_count: 2 }))[0]?.detail).toContain("2 entities depend");
  });

  it("omits a term the service reported as zero rather than showing a zero", () => {
    // A "Leverage 0" badge reads as a measured finding. Absence is the honest
    // rendering of a term that did not move this row.
    const labels = rankReasons(item({ escalated: true })).map((reason) => reason.label);

    expect(labels).toEqual(["Escalated"]);
  });
});

describe("what a disposition commits to", () => {
  it("reads which dispositions ask for a write from the target, not the name", () => {
    // Matching on a `propose_` prefix would be this client deciding which
    // dispositions are consequential. The service says, via `target_kind`.
    expect(asksForAWrite(policy())).toBe(false);
    expect(asksForAWrite(policy({ disposition: "propose_arc", target_kind: "arc_artifact" }))).toBe(
      true,
    );
  });

  it("keeps the service's order within each group", () => {
    const policies = [
      policy({ disposition: "confirm" }),
      policy({ disposition: "reject" }),
      policy({ disposition: "propose_canonical", target_kind: "canonical_fact" }),
      policy({ disposition: "propose_arc", target_kind: "arc_artifact" }),
    ];

    const grouped = groupDispositions(policies);

    expect(grouped.settles.map((entry) => entry.disposition)).toEqual(["confirm", "reject"]);
    expect(grouped.proposes.map((entry) => entry.disposition)).toEqual([
      "propose_canonical",
      "propose_arc",
    ]);
  });

  it("shows all five dimensions, because the three targets disagree on all of them", () => {
    // Dropping one would make two proposals look alike in the place a reviewer
    // decides between them — and the one that reaches every agent is not the
    // same as the one that edits a row.
    const lines = consequencesOf(
      policy({
        approval_authority: "arc_approver",
        disposition: "propose_arc",
        evidence_threshold: "an attested source plus recorded human judgment",
        rollback: "revoke the activated revision",
        scope: "every agent that resolves the artifact",
        supersession: "a new revision activates; the previous revision is retained",
        target_kind: "arc_artifact",
      }),
    );

    expect(lines.map((line) => line.label)).toEqual([
      "Approved by",
      "Evidence required",
      "Reaches",
      "What it supersedes",
      "How it is undone",
    ]);
    expect(lines.map((line) => line.value)).toContain("every agent that resolves the artifact");
    expect(lines.map((line) => line.value)).toContain("revoke the activated revision");
  });

  it("labels a disposition with the verb the audit log will record", () => {
    // Rewording "supersede" into something friendlier would put a different verb
    // in front of the person than the one they will be asked about.
    expect(dispositionLabel("supersede")).toBe("Supersede");
    expect(dispositionLabel("propose_canonical")).toBe("Propose canonical");
  });
});
