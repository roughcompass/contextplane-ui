import { describe, expect, it } from "vitest";

import type { EnvelopeBinding } from "../../shared/api";
import {
  ageInSeconds,
  availableActs,
  formatAge,
  governedByADeadRevision,
  posture,
} from "./envelopeModel";

function binding(overrides: Partial<EnvelopeBinding> = {}): EnvelopeBinding {
  return {
    artifact_id: "artifact-a",
    binding_id: "binding-a",
    effective_from: "2026-08-01T00:00:00Z",
    effective_to: null,
    is_in_force: true,
    principal_issuer: "https://idp.example.com",
    principal_subject: "agent-planner-7",
    revision_id: "revision-a",
    revision_lifecycle_state: "active",
    state: "active",
    suspended_at: null,
    suspension_reason: null,
    ...overrides,
  };
}

describe("posture", () => {
  /** The distinction the whole control rests on, and the reason this is a unit
   * test: a component test can pass while the two render differently but mean
   * the same thing to the reader. */
  it("keeps an ungoverned principal apart from a suspended one", () => {
    expect(posture(null)).toBe("ungoverned");
    expect(posture(binding({ is_in_force: false }))).toBe("suspended");
  });

  it("reads a closed interval as ended rather than as suspended", () => {
    // A revocation and a suspension both leave an agent unable to act, and only
    // one of them is reversible. An operator who reads a revoked binding as
    // suspended waits for a reinstatement that will never work.
    expect(posture(binding({ effective_to: "2026-08-10T00:00:00Z", is_in_force: false }))).toBe(
      "ended",
    );
    expect(posture(binding({ effective_to: "2026-08-10T00:00:00Z", is_in_force: true }))).toBe(
      "ended",
    );
  });

  it("reads a live binding as in force", () => {
    expect(posture(binding())).toBe("in-force");
  });
});

describe("availableActs", () => {
  it("offers reinstating only what is suspended", () => {
    expect(availableActs("suspended")).toEqual(["reinstate", "revoke"]);
    expect(availableActs("in-force")).toEqual(["suspend", "revoke"]);
  });

  it("offers nothing on a binding that does not exist or has ended", () => {
    // Offering "suspend" over an ungoverned principal would let an operator
    // believe they had stopped an agent that nothing was ever holding back.
    expect(availableActs("ungoverned")).toEqual([]);
    expect(availableActs("ended")).toEqual([]);
  });
});

describe("governedByADeadRevision", () => {
  it("reports a live binding against a superseded document", () => {
    expect(governedByADeadRevision(binding({ revision_lifecycle_state: "superseded" }))).toBe(true);
  });

  it("says nothing about a binding that is already off", () => {
    // A suspended binding to a revoked revision is not a hazard — nothing is
    // being authorised by it. Warning about it would spend the operator's
    // attention on the case that cannot hurt them.
    expect(
      governedByADeadRevision(binding({ is_in_force: false, revision_lifecycle_state: "revoked" })),
    ).toBe(false);
    expect(governedByADeadRevision(null)).toBe(false);
  });

  it("is quiet when the revision is in force", () => {
    expect(governedByADeadRevision(binding())).toBe(false);
  });
});

describe("age", () => {
  it("counts from the reading rather than from the render", () => {
    const readAt = new Date("2026-08-19T12:00:00Z");
    expect(ageInSeconds(readAt, new Date("2026-08-19T12:03:20Z"))).toBe(200);
  });

  it("never reports a negative age", () => {
    // Clock skew between a server timestamp and the browser is ordinary. "-4s
    // ago" reads as a bug and makes a reader distrust the number that matters.
    const readAt = new Date("2026-08-19T12:00:00Z");
    expect(ageInSeconds(readAt, new Date("2026-08-19T11:59:56Z"))).toBe(0);
  });

  it("says how old, never what time it is", () => {
    expect(formatAge(2)).toBe("just now");
    expect(formatAge(42)).toBe("42s ago");
    expect(formatAge(200)).toBe("3m ago");
    expect(formatAge(7300)).toBe("2h ago");
  });
});
