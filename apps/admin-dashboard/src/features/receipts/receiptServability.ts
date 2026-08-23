import { ContextplaneApiError } from "../../shared/api";

/**
 * Why a receipt's exclusions and references are not readable yet — or at all.
 *
 * The service refuses those two reads rather than answering emptily, because an
 * empty exclusions list is indistinguishable from "nothing was excluded" and
 * that is exactly the belief the refusal exists to prevent.
 *
 * **There are two refusals, not one, and they are opposite in kind.**
 *
 * - `receipt_not_hydrated` — the receipt is still being written. Waiting fixes
 *   it. This is the system being careful, and an explorer that renders it as a
 *   failure teaches its reader that the system is broken when it is working.
 * - `receipt_withheld` — the receipt's content was deliberately withheld, by an
 *   operator, for a stated reason. Waiting fixes nothing.
 *
 * Collapsing them into one "unavailable" state would tell somebody that a
 * withheld receipt is merely slow, which is the same mistake in the other
 * direction: it invites them to keep refreshing a screen that will never change,
 * and hides that a decision was taken.
 */
export type ReceiptServability = "readable" | "still-being-written" | "withheld";

const NOT_HYDRATED = "receipt_not_hydrated";
const WITHHELD = "receipt_withheld";

/**
 * Classify a failed exclusions/references read.
 *
 * Returns `null` for anything that is not one of the two servability refusals —
 * a real error stays a real error, and swallowing a 500 into "still being
 * written" would be the third version of this mistake.
 */
export function servabilityFromError(error: unknown): Exclude<ReceiptServability, "readable"> | null {
  if (!(error instanceof ContextplaneApiError)) return null;
  if (error.code === NOT_HYDRATED) return "still-being-written";
  if (error.code === WITHHELD) return "withheld";
  return null;
}

interface ServabilityCopy {
  detail: string;
  title: string;
  /** Whether re-reading could change the answer. Drives whether a retry is offered. */
  waitingHelps: boolean;
}

export const SERVABILITY_COPY: Readonly<
  Record<Exclude<ReceiptServability, "readable">, ServabilityCopy>
> = {
  "still-being-written": {
    detail:
      "The service refuses to list exclusions for a receipt it has not finished writing, because an empty list would read as “nothing was excluded”. Re-read in a moment.",
    title: "This receipt is still being written",
    waitingHelps: true,
  },
  withheld: {
    detail:
      "Somebody withheld this receipt's content deliberately, and it stays withheld until that is reverted. This is not a delay — re-reading will return the same refusal.",
    title: "This receipt's content was withheld",
    waitingHelps: false,
  },
};
