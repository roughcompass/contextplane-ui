import type { ReactNode } from "react";

import { Notice } from "@repo/ui/primitives";

interface CapabilityUnavailableProps {
  /** The operator's fix, disclosed rather than shouted. Variable names live here. */
  operatorNote: ReactNode;
  /** What the reader can still do. Never omitted — it is the point of the notice. */
  stillWorks: ReactNode;
  /** What is missing, in product terms rather than configuration terms. */
  summary: ReactNode;
  title: string;
}

/**
 * A capability this deployment does not have, said to the person reading it.
 *
 * Nothing here has failed, so this is not an error and does not read as one. It
 * is the standard's **unavailable or partial** state: *state which source or
 * scope is missing and how that limits interpretation*.
 *
 * ## Three rules, and the first one is the one that was broken
 *
 * **1. The reader and the operator are usually different people.** The first
 * version of this notice told an evaluator to set `SIMULATION_PROVIDER` and
 * `SIMULATION_API_KEY` — instructions they almost certainly cannot act on, in
 * place of the thing they came to find out. Environment variable names are
 * deployment diagnostics, and the content standard is explicit that diagnostics
 * are *supporting detail, not the primary message*. They are still here, because
 * an operator does sometimes read this screen and hiding the answer helps nobody
 * — they are one disclosure away instead of first.
 *
 * **2. Lead with what still works.** A reader who has just been told a feature is
 * off needs to know what they can do *now*, and on this surface that is most of
 * the product: prompt sets, runs, verdicts and the three criteria a program
 * computes without any model at all. Leading with the absence makes a partial
 * deployment read as a broken one.
 *
 * **3. No rationale the reader did not ask for.** The 10–25 % self-preference
 * figure is the argument for a design decision, not something a person blocked
 * at this moment needs. It belongs in ADR 0026, where it is, and in the operator
 * note where it explains an otherwise arbitrary-looking requirement.
 */
export function CapabilityUnavailable({
  operatorNote,
  stillWorks,
  summary,
  title,
}: CapabilityUnavailableProps) {
  return (
    <Notice title={title} variant="info">
      <p>{summary}</p>
      <p className="mt-2">{stillWorks}</p>
      <details className="mt-2">
        <summary className="cursor-pointer">For whoever runs this deployment</summary>
        <div className="mt-1 space-y-1">{operatorNote}</div>
      </details>
    </Notice>
  );
}
