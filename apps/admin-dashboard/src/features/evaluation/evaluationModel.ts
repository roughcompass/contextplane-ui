import type { SummaryItem } from "@repo/ui/layouts";

import type {
  EvaluationRun,
  EvaluationVerdict,
  JudgedCriterion,
  Judgement,
  JudgeVerdict,
  PromptSet,
  RunItem,
} from "../../shared/api";

/**
 * The vocabulary and the arithmetic the evaluation screens share.
 *
 * Pure functions over server state, kept out of the components so each rule can
 * be asserted directly. Three of them are rules rather than formatting, and each
 * is here because its opposite is the ordinary way this goes wrong.
 */

/** Reviewer verdicts, in the order a reviewer reaches for them. */
export const runVerdictOptions: readonly { description: string; label: string; value: EvaluationVerdict }[] =
  [
    {
      description: "What was served answered the prompt.",
      label: "Right",
      value: "right",
    },
    {
      description: "Retrieval selected badly. Say what was wrong.",
      label: "Wrong",
      value: "wrong",
    },
    {
      description: "Could not tell whether it was right — a defect in what was served, not what was selected.",
      label: "Unusable",
      value: "unusable",
    },
  ];

export const judgedCriterionLabels: Record<JudgedCriterion, string> = {
  answer_relevance: "Answer relevance",
  groundedness: "Groundedness",
};

export const judgedCriterionDescriptions: Record<JudgedCriterion, string> = {
  answer_relevance:
    "Does the answer address the prompt that was asked? An answer that is true, well-sourced and about something else fails.",
  groundedness:
    "Is every assertion traceable to a served item? An assertion citing nothing served fails, and so does one whose cited item does not support it.",
};

/**
 * What each criterion implicates, which is the column ADR 0024 leans on.
 *
 * A failure of recall or precision implicates **what was served**; a failure of
 * groundedness or relevance implicates **what the agent did with it**. That
 * attribution is why memory evaluation and agent evaluation are one journey
 * rather than two — the split a fork would buy is already inside one result.
 */
export type CriterionImplicates = "memory" | "governance" | "the agent";

export const judgedCriterionImplicates: Record<JudgedCriterion, CriterionImplicates> = {
  answer_relevance: "the agent",
  groundedness: "the agent",
};

export function runVerdictLabel(verdict: EvaluationVerdict): string {
  return runVerdictOptions.find((option) => option.value === verdict)?.label ?? verdict;
}

export function runVerdictTone(verdict: EvaluationVerdict): "success" | "danger" | "warning" {
  if (verdict === "right") return "success";
  if (verdict === "wrong") return "danger";
  return "warning";
}

export function judgeVerdictTone(verdict: JudgeVerdict): "success" | "danger" {
  return verdict === "pass" ? "success" : "danger";
}

export interface RunTally {
  errored: number;
  judged: number;
  right: number;
  total: number;
  unjudged: number;
  unusable: number;
  wrong: number;
}

/**
 * What a run amounts to, counted rather than averaged.
 *
 * **An errored item is counted, never excluded.** Dropping it is how a number
 * improves without anything improving, and it is indistinguishable from the
 * system having got better at the prompts it did not crash on.
 *
 * **`judged` and `unjudged` are both reported.** A run where two of twenty items
 * were reviewed is not "100% right"; it is two opinions and eighteen absences,
 * and a percentage over the reviewed subset would say the first.
 */
export function tallyRun(run: EvaluationRun): RunTally {
  const tally: RunTally = {
    errored: 0,
    judged: 0,
    right: 0,
    total: run.items.length,
    unjudged: 0,
    unusable: 0,
    wrong: 0,
  };
  for (const item of run.items) {
    if (item.failure !== null) tally.errored += 1;
    if (item.verdicts.length === 0) {
      tally.unjudged += 1;
      continue;
    }
    tally.judged += 1;
    for (const verdict of item.verdicts) {
      if (verdict.verdict === "right") tally.right += 1;
      else if (verdict.verdict === "wrong") tally.wrong += 1;
      else tally.unusable += 1;
    }
  }
  return tally;
}

/**
 * A run's outcome as summary rows, and nothing here is a percentage.
 *
 * The two `detail` strings carry the reason. A run where two of twenty items
 * were reviewed is two opinions and eighteen absences, not "100% right"; and an
 * errored prompt is counted rather than excluded, because dropping it is how a
 * number improves without anything improving.
 */
export function runSummaryItems(run: EvaluationRun): readonly SummaryItem[] {
  const tally = tallyRun(run);
  return [
    { id: "resolved", label: "Prompts resolved", value: String(tally.total) },
    {
      detail: "A run where two of twenty were reviewed is two opinions and eighteen absences.",
      id: "judged",
      label: "Judged",
      value: `${tally.judged} of ${tally.total}`,
    },
    { id: "right", label: "Right", value: String(tally.right) },
    { id: "wrong", label: "Wrong", value: String(tally.wrong) },
    { id: "unusable", label: "Unusable", value: String(tally.unusable) },
    {
      detail:
        "Counted, never excluded: dropping an errored prompt is how a number improves without anything improving.",
      id: "errored",
      label: "Errored",
      value: String(tally.errored),
    },
  ];
}

/**
 * Whether two runs measure the same thing.
 *
 * Same set and same deployment fingerprint. Different fingerprints mean the
 * configuration moved between them, so a difference in results is not evidence
 * about retrieval quality — it is evidence the configuration changed, which the
 * reader already knew. The service says so rather than letting a surface diff
 * them, and this is that rule on the screen.
 */
export function runsAreComparable(left: EvaluationRun, right: EvaluationRun): boolean {
  return left.set_id === right.set_id && left.resolver_fingerprint === right.resolver_fingerprint;
}

/**
 * The named kinds of change between two runs of one set.
 *
 * Named rather than diffed as text, following ARC's baseline-diff vocabulary. A
 * reader comparing runs is asking *what changed in kind*; a character diff over
 * serialized payloads answers a different question and buries the answer to this
 * one.
 */
export const runChangeKinds = [
  "verdict_improved",
  "verdict_regressed",
  "verdict_added",
  "verdict_withdrawn",
  "resolution_started_failing",
  "resolution_started_succeeding",
  "envelope_state_changed",
  "prompt_absent_from_baseline",
  "prompt_absent_from_candidate",
] as const;
export type RunChangeKind = (typeof runChangeKinds)[number];

export const runChangeKindLabels: Record<RunChangeKind, string> = {
  envelope_state_changed: "Envelope state changed",
  prompt_absent_from_baseline: "Prompt not in the baseline run",
  prompt_absent_from_candidate: "Prompt not in the candidate run",
  resolution_started_failing: "Resolution started failing",
  resolution_started_succeeding: "Resolution started succeeding",
  verdict_added: "Verdict recorded",
  verdict_improved: "Verdict improved",
  verdict_regressed: "Verdict regressed",
  verdict_withdrawn: "Verdict withdrawn",
};

/**
 * Whether a change kind is a regression, an improvement, or neither.
 *
 * `null` is a real answer and most kinds have it: a prompt present in one run
 * and not the other is a fact about the set, not a movement in quality, and
 * colouring it either way would invite a reading nobody earned.
 */
export function runChangeDirection(kind: RunChangeKind): "better" | "worse" | null {
  if (kind === "verdict_improved" || kind === "resolution_started_succeeding") return "better";
  if (kind === "verdict_regressed" || kind === "resolution_started_failing") return "worse";
  return null;
}

export interface RunChange {
  detail: string;
  kind: RunChangeKind;
  promptId: string;
}

/** Reviewer verdicts ranked worst to best, so a movement has a direction. */
const verdictRank: Record<EvaluationVerdict, number> = { right: 2, unusable: 0, wrong: 1 };

function latestVerdict(item: RunItem): EvaluationVerdict | null {
  if (item.verdicts.length === 0) return null;
  // The most recently recorded, which is what a reviewer who changed their mind
  // meant. Two reviewers disagreeing is two rows and the newest is not "the
  // answer" — but for a movement between runs, the latest is the only thing a
  // comparison can be about.
  const sorted = [...item.verdicts].sort((left, right) =>
    left.recorded_at.localeCompare(right.recorded_at),
  );
  return sorted[sorted.length - 1]?.verdict ?? null;
}

/**
 * What moved between two runs of one prompt set, in named kinds.
 *
 * Keyed by prompt rather than by run item, because a run item id is a fact about
 * one run and the question is what happened to the *prompt* across two.
 *
 * A prompt in one run and not the other is reported, not skipped: a set that
 * gained a prompt between runs is exactly the case where a naive comparison
 * silently narrows to the intersection and calls the result a trend.
 */
export function compareRuns(baseline: EvaluationRun, candidate: EvaluationRun): readonly RunChange[] {
  const byPrompt = new Map<string, { after?: RunItem; before?: RunItem }>();
  for (const item of baseline.items) {
    byPrompt.set(item.prompt_id, { ...byPrompt.get(item.prompt_id), before: item });
  }
  for (const item of candidate.items) {
    byPrompt.set(item.prompt_id, { ...byPrompt.get(item.prompt_id), after: item });
  }

  const changes: RunChange[] = [];
  for (const [promptId, pair] of byPrompt) {
    const { after, before } = pair;
    if (!before) {
      changes.push({
        detail: "This prompt was added to the set after the baseline run.",
        kind: "prompt_absent_from_baseline",
        promptId,
      });
      continue;
    }
    if (!after) {
      changes.push({
        detail: "This prompt was in the baseline run and not in the candidate.",
        kind: "prompt_absent_from_candidate",
        promptId,
      });
      continue;
    }

    if (before.failure === null && after.failure !== null) {
      changes.push({
        detail: after.failure,
        kind: "resolution_started_failing",
        promptId,
      });
    } else if (before.failure !== null && after.failure === null) {
      changes.push({
        detail: "The resolution that failed in the baseline succeeded here.",
        kind: "resolution_started_succeeding",
        promptId,
      });
    } else if (
      before.envelope_state !== after.envelope_state &&
      before.envelope_state !== null &&
      after.envelope_state !== null
    ) {
      changes.push({
        detail: `${before.envelope_state} → ${after.envelope_state}`,
        kind: "envelope_state_changed",
        promptId,
      });
    }

    const wasVerdict = latestVerdict(before);
    const isVerdict = latestVerdict(after);
    if (wasVerdict === null && isVerdict !== null) {
      changes.push({ detail: runVerdictLabel(isVerdict), kind: "verdict_added", promptId });
    } else if (wasVerdict !== null && isVerdict === null) {
      changes.push({
        detail: `Was ${runVerdictLabel(wasVerdict).toLowerCase()}; nobody has judged this run.`,
        kind: "verdict_withdrawn",
        promptId,
      });
    } else if (wasVerdict !== null && isVerdict !== null && wasVerdict !== isVerdict) {
      const better = verdictRank[isVerdict] > verdictRank[wasVerdict];
      changes.push({
        detail: `${runVerdictLabel(wasVerdict)} → ${runVerdictLabel(isVerdict)}`,
        kind: better ? "verdict_improved" : "verdict_regressed",
        promptId,
      });
    }
  }
  return changes;
}

/**
 * Rubric versions spanned by a set of judgements.
 *
 * More than one is a warning rather than an error: the results are real, they
 * were just produced under different rules, and conflating them silently is what
 * ADR 0026 part 4 forbids.
 */
export function rubricVersionsIn(judgements: readonly Judgement[]): readonly string[] {
  return [...new Set(judgements.map((entry) => entry.rubric_version))].sort();
}

export function spansRubricVersions(judgements: readonly Judgement[]): boolean {
  return rubricVersionsIn(judgements).length > 1;
}

/** A set that is retired is readable and not writable. */
export function isWritableSet(set: PromptSet): boolean {
  return set.retired_at === null;
}

export function formatFingerprint(fingerprint: string): string {
  const digest = fingerprint.startsWith("sha256:") ? fingerprint.slice("sha256:".length) : fingerprint;
  return digest.length <= 12 ? digest : `${digest.slice(0, 12)}…`;
}

export function formatEvaluationTimestamp(value: string | null): string {
  if (!value) return "Not reported";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(parsed);
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

/**
 * A token figure, or an honest absence.
 *
 * Never zero for an unreported count. A call that consumed tokens shown as free
 * is wrong in the direction nobody investigates, which is why the provider
 * contract distinguishes `unknown` from a number in the first place.
 */
export function formatTokens(value: number | null, source: string): string {
  if (value === null) return source === "unknown" ? "Not reported" : "Not reported";
  return new Intl.NumberFormat("en-US").format(value);
}
