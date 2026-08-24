import type { EnvelopeBinding } from "../../shared/api";

/**
 * Reading an envelope's posture, and how stale the reading is.
 *
 * Both of these exist because the screen must not merge things the service
 * keeps apart. They are here rather than inline so the distinctions have tests
 * of their own — a rendering that collapses two states is a defect a component
 * test can miss and a unit test cannot.
 */

/**
 * The four answers, which are not three.
 *
 * `ungoverned` and `suspended` are the pair that matters. A `null` binding means
 * nobody has governed this principal; a suspended binding means somebody chose a
 * posture and can reverse it. An operator who reads the first as the second
 * concludes the agent is under control and stops looking.
 *
 * `ended` is separate from `suspended` for the auditor's reason: a revocation
 * closed the interval, and no reinstatement will reopen it.
 */
export type EnvelopePosture = "ungoverned" | "in-force" | "suspended" | "ended";

export function posture(binding: EnvelopeBinding | null): EnvelopePosture {
  if (binding === null) return "ungoverned";
  if (binding.effective_to !== null) return "ended";
  return binding.is_in_force ? "in-force" : "suspended";
}

/** Which acts a posture admits. An act that cannot apply is not offered. */
export function availableActs(current: EnvelopePosture): readonly ("suspend" | "reinstate" | "revoke")[] {
  if (current === "in-force") return ["suspend", "revoke"];
  if (current === "suspended") return ["reinstate", "revoke"];
  return [];
}

/**
 * Whether a binding is in force against a governance document that no longer is.
 *
 * A binding is only checked for `active` at grant time, so this state is real
 * and reachable: an agent still governed by a policy revision somebody has since
 * superseded or revoked. Reported rather than hidden, because the alternative is
 * a screen that shows a green envelope over a dead document.
 */
export function governedByADeadRevision(binding: EnvelopeBinding | null): boolean {
  if (binding === null || !binding.is_in_force) return false;
  return binding.revision_lifecycle_state !== "active";
}

/**
 * How old the reading is, in whole seconds.
 *
 * The envelope is a live control and a screen is a snapshot of it. An operator
 * acting on a five-minute-old reading may be suspending a binding somebody else
 * already revoked, which is why the screen states the age rather than implying
 * currency by saying nothing.
 */
export function ageInSeconds(readAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - readAt.getTime()) / 1000));
}

/** Wording for that age. Reads as an age, never as a timestamp posing as now. */
export function formatAge(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
