import { SummaryStrip } from "@repo/ui/layouts";

import type { EvaluationRun } from "../../shared/api";
import { runSummaryItems } from "./evaluationModel";

/**
 * A run's outcome above its items.
 *
 * The rows come from `evaluationModel` rather than being built here, so the rule
 * they encode — nothing is a percentage, and an errored prompt is counted — is
 * asserted by a unit test rather than only rendered.
 */
export function RunSummary({ run }: { run: EvaluationRun }) {
  return <SummaryStrip items={runSummaryItems(run)} label="Run outcome" />;
}
