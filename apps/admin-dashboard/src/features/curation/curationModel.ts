import type { DispositionPolicy, MemoryCurationItem } from "../../shared/api";

/**
 * What the reviewer cockpit says about an ordering, and about a decision.
 *
 * Pure, so the two things this screen must not get wrong can be tested without
 * rendering anything:
 *
 * 1. It must not present the rank as authoritative. The service orders by
 *    escalation, leverage and sampling; there is no cost model in it. A screen
 *    that implied otherwise would have reviewers defer to a number that does
 *    not account for what a mistake costs.
 * 2. It must not restate what a disposition commits to. Those five dimensions
 *    come from the service, and a copy here would diverge silently the first
 *    time a policy changed.
 */

/** The exact terms the service ranks on, in the order it applies them. */
export const RANK_TERMS = ["escalated", "dependant_count", "sampling_priority"] as const;

/**
 * What the queue is ordered by, stated in the reviewer's words.
 *
 * The last sentence is the load-bearing one. The queue carries a confidence
 * beside a position and a reader assumes the first produced the second; it did
 * not, and the ordering accounts for no cost at all.
 */
export const ORDERING_STATEMENT =
  "Ordered by escalation age, then by how much depends on the subject, then by the sampling policy for its category. " +
  "Confidence does not move a row, and nothing here weighs what getting it wrong would cost.";

/** One reason a row sits where it does, as a reviewer would read it. */
export interface RankReason {
  readonly label: string;
  readonly detail: string;
  readonly emphasis: boolean;
}

/**
 * Why this row is here — from the terms the service published, never inferred.
 *
 * Returns them in the order the service applies them, so a reviewer reading two
 * rows can see which term separated them. A row with no distinguishing term
 * still gets an answer rather than an empty cell: it is here because it is
 * waiting, and saying so is better than leaving a reviewer to guess whether the
 * screen failed to load something.
 */
export function rankReasons(item: MemoryCurationItem): readonly RankReason[] {
  const reasons: RankReason[] = [];
  if (item.escalated) {
    reasons.push({
      detail:
        "Waited past the governed escalation age, so it is ordered ahead of everything younger whatever its leverage.",
      emphasis: true,
      label: "Escalated",
    });
  }
  if (item.dependant_count > 0) {
    reasons.push({
      detail: `${item.dependant_count} ${item.dependant_count === 1 ? "entity depends" : "entities depend"} on this subject.`,
      emphasis: false,
      label: `Leverage ${item.dependant_count}`,
    });
  }
  if (item.sampling_priority > 0) {
    reasons.push({
      detail: `The sampling policy for this category asks for ${item.sampling_priority} reviewed.`,
      emphasis: false,
      label: `Sampled ${item.sampling_priority}`,
    });
  }
  if (reasons.length === 0) {
    reasons.push({
      detail: "Nothing raises this above arrival order; it is here because it is waiting.",
      emphasis: false,
      label: "Arrival order",
    });
  }
  return reasons;
}

/**
 * Whether a disposition asks somebody outside curation for a write.
 *
 * Read from `target_kind` rather than from the disposition's name: the three
 * that propose a write are exactly the three that name a target, and matching
 * on a `propose_` prefix would be this client deciding which is which.
 */
export function asksForAWrite(policy: DispositionPolicy): boolean {
  return policy.target_kind !== null;
}

/**
 * The dispositions, grouped the way the service ordered them.
 *
 * The service returns declaration order and that order carries meaning — the
 * ones settling a disagreement first, the ones asking for a write after. Sorting
 * would lose it, so this partitions while preserving relative order.
 */
export function groupDispositions(policies: readonly DispositionPolicy[]): {
  readonly settles: readonly DispositionPolicy[];
  readonly proposes: readonly DispositionPolicy[];
} {
  return {
    proposes: policies.filter(asksForAWrite),
    settles: policies.filter((policy) => !asksForAWrite(policy)),
  };
}

/** The five consequences of one disposition, labelled for a reviewer. */
export interface ConsequenceLine {
  readonly label: string;
  readonly value: string;
}

/**
 * What taking this disposition commits to — every dimension the service records.
 *
 * All five, in a fixed order, and never a subset: the three proposal targets
 * deliberately disagree on all of them, and dropping one would make two of them
 * look alike in the place a reviewer decides between them.
 */
export function consequencesOf(policy: DispositionPolicy): readonly ConsequenceLine[] {
  return [
    { label: "Approved by", value: policy.approval_authority },
    { label: "Evidence required", value: policy.evidence_threshold },
    { label: "Reaches", value: policy.scope },
    { label: "What it supersedes", value: policy.supersession },
    { label: "How it is undone", value: policy.rollback },
  ];
}

/**
 * A disposition's name as a reviewer should read it.
 *
 * Only the underscore is removed. Rewording "supersede" into something friendlier
 * would put a different verb in front of the person than the one the audit log
 * will record, and the record is what they will be asked about.
 */
export function dispositionLabel(disposition: string): string {
  const spaced = disposition.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
