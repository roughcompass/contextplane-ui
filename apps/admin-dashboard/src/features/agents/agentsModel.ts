import type { AgentInstruction, FailureGroup } from "../../shared/api";

/**
 * A rate the service may legitimately have no answer for.
 *
 * `null` is not zero, and the whole point of the accuracy surface is that the
 * two mean opposite things: an author nobody adjudicated has no rate, an author
 * who was wrong every time has a rate of zero. Rendering the first as "0%"
 * reports a failing agent where the service reported an unmeasured one.
 */
export function formatRate(rate: number | null): string {
  if (rate === null) return "Not measured";
  return `${(rate * 100).toFixed(1)}%`;
}

/** A count and its denominator, so a rate is never read without its basis. */
export function formatBasis(numerator: number, denominator: number): string {
  if (denominator === 0) return "no observations";
  return `${numerator} of ${denominator}`;
}

/**
 * Failure groups worst-first by rate, not by volume.
 *
 * The report carries both counts for a reason its own field description gives:
 * a predicate used constantly and mostly got right leads on `incorrect_count`
 * by volume alone. Sorting on that would put the busiest predicate at the top
 * of a table whose job is to say which one to fix.
 *
 * Groups with no rate sort last rather than first — an unmeasured group is not
 * evidence of a problem, and floating it above measured failures would invert
 * the table's meaning. Ties break on `incorrect_count`, then on the group's
 * identity so the order is stable across renders.
 */
export function rankedFailureGroups(groups: readonly FailureGroup[]): readonly FailureGroup[] {
  return [...groups].sort((left, right) => {
    if (left.rate === null && right.rate === null) {
      return byVolumeThenName(left, right);
    }
    if (left.rate === null) return 1;
    if (right.rate === null) return -1;
    if (left.rate !== right.rate) return right.rate - left.rate;
    return byVolumeThenName(left, right);
  });
}

function byVolumeThenName(left: FailureGroup, right: FailureGroup): number {
  if (left.incorrect_count !== right.incorrect_count) {
    return right.incorrect_count - left.incorrect_count;
  }
  return groupKey(left).localeCompare(groupKey(right));
}

/** The stable identity of a failure group: what the service grouped by. */
export function groupKey(group: FailureGroup): string {
  return `${group.claim_category}/${group.predicate}`;
}

/**
 * The instruction in force, or `null`.
 *
 * Read off `status`, not off "the newest row". A proposal is a row too, and the
 * server's own partial unique index permits exactly one active instruction per
 * author — so picking the highest version would name a proposal as active in
 * precisely the state this screen exists to let somebody fix.
 */
export function activeInstruction(
  instructions: readonly AgentInstruction[],
): AgentInstruction | null {
  return instructions.find((instruction) => instruction.status === "active") ?? null;
}

/**
 * The instructions eligible to be activated: proposed, never yet in force.
 *
 * Newest first, because a reviewer working through proposals is looking at the
 * most recent one.
 */
export function activatableInstructions(
  instructions: readonly AgentInstruction[],
): readonly AgentInstruction[] {
  return instructions
    .filter((instruction) => instruction.status !== "active" && instruction.activated_at === null)
    .sort((left, right) => right.version - left.version);
}

/** The next version number to propose: one past the highest that exists. */
export function nextInstructionVersion(instructions: readonly AgentInstruction[]): number {
  return instructions.reduce((highest, instruction) => Math.max(highest, instruction.version), 0) + 1;
}

/**
 * Whether a rollback has anything to restore.
 *
 * Rollback is ordered by `activated_at`, not by version number, so what it
 * restores is the previously-active instruction rather than the numerically
 * previous one. With fewer than two instructions ever activated there is
 * nothing behind the current one, and offering the action would promise a
 * result the server will decline to produce.
 */
export function canRollback(instructions: readonly AgentInstruction[]): boolean {
  return instructions.filter((instruction) => instruction.activated_at !== null).length >= 2;
}

/** A `datetime-local` value as the UTC instant the API's query parameters take. */
export function toWindowInstant(localValue: string): string {
  return localValue.includes("T") ? new Date(localValue).toISOString() : `${localValue}T00:00:00Z`;
}

/** A `datetime-local` field value, `days` before `now`. */
export function windowStartDefault(now: Date, days: number): string {
  return localInputValue(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

export function localInputValue(moment: Date): string {
  return moment.toISOString().slice(0, 16);
}
