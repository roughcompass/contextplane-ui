import type {
  ContextBlock,
  ContextEnvelope,
  ContextExclusion,
  DeterministicScore,
  InstructionDisposition,
  JudgedCriterion,
  Judgement,
  Simulation,
} from "../../shared/api";

/**
 * The simulator's own vocabulary: five criteria, and the observations a failing
 * run supports.
 *
 * ## Five criteria, grouped by what they implicate
 *
 * ADR 0024 keeps memory evaluation and agent evaluation in one journey on the
 * grounds that the attribution a split would buy is **already inside one
 * result**: a failure of recall or precision implicates what was *served*, and a
 * failure of groundedness or relevance implicates what the *agent* did with it.
 * The pane groups by that column, and it mints no new score and no new
 * vocabulary to do so.
 *
 * ## The observations are unranked, and that is a decision
 *
 * `curationModel.ts` states the rule for the reviewer queue — *"Confidence does
 * not move a row, and nothing here weighs what getting it wrong would cost"* —
 * and it holds here for the same reason. A list ordered by a confidence the
 * product has not calibrated would invite exactly the deference that sentence
 * exists to prevent. The user's instruction is the same rule from the other
 * side: **do not assume there is one path to improve it.**
 *
 * So `observationsFor` returns every observation the run's record supports, in a
 * fixed order that is *not* a ranking — it is the order the evidence appears in,
 * so two readers of the same run see the same list.
 */

export const evaluationCriteria = [
  "required_fact_recall",
  "boundary_violations",
  "precision",
  "groundedness",
  "answer_relevance",
] as const;
export type EvaluationCriterion = (typeof evaluationCriteria)[number];

/** What a failure of each criterion implicates. The fourth column, on screen. */
export type Implicates = "memory" | "governance" | "the agent";

export const criterionImplicates: Record<EvaluationCriterion, Implicates> = {
  answer_relevance: "the agent",
  boundary_violations: "governance",
  groundedness: "the agent",
  precision: "memory",
  required_fact_recall: "memory",
};

export const criterionLabels: Record<EvaluationCriterion, string> = {
  answer_relevance: "Answer relevance",
  boundary_violations: "Boundary violations",
  groundedness: "Groundedness",
  precision: "Precision",
  required_fact_recall: "Required-fact recall",
};

/** Which criteria a program computes, and which a model does. */
export const deterministicCriteria: readonly EvaluationCriterion[] = [
  "required_fact_recall",
  "boundary_violations",
  "precision",
];

export const modelJudgedCriteria: readonly EvaluationCriterion[] = ["groundedness", "answer_relevance"];

export function criterionJudge(criterion: EvaluationCriterion): "deterministic" | "LLM, with human override" {
  return deterministicCriteria.includes(criterion) ? "deterministic" : "LLM, with human override";
}

/** The judged criterion a `Judgement` row corresponds to. */
export function criterionForJudgement(criterion: JudgedCriterion): EvaluationCriterion {
  return criterion === "groundedness" ? "groundedness" : "answer_relevance";
}

export type CriterionOutcome = "pass" | "fail" | "unassertable" | "unjudged";

export interface CriterionState {
  criterion: EvaluationCriterion;
  /**
   * Whether the number behind this outcome has been checked against people.
   *
   * Deterministic criteria are `true` — there is no model to calibrate. A judged
   * criterion is whatever the service said, and `false` means the verdict renders
   * as **unproven**: a confident-looking score on the screen whose job is
   * calibrating trust is a confident label on a guess.
   */
  isProven: boolean;
  implicates: Implicates;
  judge: "deterministic" | "LLM, with human override";
  outcome: CriterionOutcome;
  /** What it concluded from. Empty only when the criterion was not assessed. */
  evidence: readonly string[];
  /** The judge's reasoning, for a model-judged criterion. */
  reasoning: string | null;
  /** Whether a reviewer overruled the judge. A visible state, never a silent overwrite. */
  isDisputed: boolean;
  /** The judged row this state came from, when there is one, so a review can be filed. */
  judgementId: string | null;
  /** Why there is no outcome, when there is none. */
  unassertableReason: string | null;
}

function deterministicState(
  criterion: EvaluationCriterion,
  score: DeterministicScore | null,
): CriterionState {
  const base = {
    criterion,
    evidence: [] as readonly string[],
    implicates: criterionImplicates[criterion],
    isDisputed: false,
    // No model, nothing to calibrate. The criterion is as proven as arithmetic.
    isProven: true,
    judge: "deterministic" as const,
    judgementId: null,
    reasoning: null,
  };

  if (score === null) {
    return { ...base, outcome: "unjudged", unassertableReason: null };
  }
  if (score.unassertable !== null) {
    return { ...base, outcome: "unassertable", unassertableReason: score.unassertable };
  }

  if (criterion === "boundary_violations") {
    return {
      ...base,
      evidence: score.violations.map(
        (violation) => `${violation.block}/${violation.item_key}: ${violation.detail}`,
      ),
      outcome: score.is_safe === true ? "pass" : "fail",
      unassertableReason: null,
    };
  }
  if (criterion === "required_fact_recall") {
    const found = score.required_found ?? 0;
    const total = score.required_total ?? 0;
    return {
      ...base,
      evidence: [`${found} of ${total} required facts present`],
      // No partial credit: a required fact is present or it is not, and a
      // "nearly matched" item is a missed one.
      outcome: total === 0 ? "unassertable" : found === total ? "pass" : "fail",
      unassertableReason: total === 0 ? "This prompt declared no required facts." : null,
    };
  }
  const served = score.served_total ?? 0;
  return {
    ...base,
    evidence:
      served === 0
        ? []
        : [`${Math.round((score.precision ?? 0) * served)} of ${served} served items were relevant`],
    outcome: served === 0 ? "unassertable" : "pass",
    unassertableReason: served === 0 ? "Nothing was served, so precision has no denominator." : null,
  };
}

function judgedState(
  criterion: EvaluationCriterion,
  judgements: readonly Judgement[],
): CriterionState {
  const target = criterion === "groundedness" ? "groundedness" : "answer_relevance";
  const matching = judgements.filter((entry) => entry.criterion === target);
  const base = {
    criterion,
    implicates: criterionImplicates[criterion],
    judge: "LLM, with human override" as const,
  };

  if (matching.length === 0) {
    return {
      ...base,
      evidence: [],
      isDisputed: false,
      isProven: false,
      judgementId: null,
      outcome: "unjudged",
      reasoning: null,
      unassertableReason: null,
    };
  }

  // Panel position zero is the single judge; a panel occupies 0..n-1 and the
  // score pane shows position zero with the split reported beside it rather than
  // averaged, so the criterion's own row is one judge's verdict and never a
  // blend.
  const primary = matching.reduce(
    (lowest, entry) => (entry.panel_position < lowest.panel_position ? entry : lowest),
    matching[0] as Judgement,
  );
  return {
    ...base,
    evidence: primary.evidence,
    isDisputed: matching.some((entry) => entry.is_disputed),
    isProven: primary.confidence_is_calibrated,
    judgementId: primary.judgement_id,
    outcome: primary.verdict === "pass" ? "pass" : "fail",
    reasoning: primary.reasoning,
    unassertableReason: null,
  };
}

/**
 * All five criteria, always, in one order.
 *
 * **Five rows even when three of them have nothing to say.** A pane that
 * rendered only the criteria it had results for would let a reader believe the
 * run was assessed on two, and the absent three are exactly the ones that
 * implicate what was served. `unjudged` and `unassertable` are distinct outcomes
 * because their remedies are: one needs a judge run, the other needs
 * expectations declared before the next run.
 *
 * **No blended score, and none is derivable from this.** Five criteria produce
 * five answers, and a boundary violation fails the case whatever the other four
 * say — which is the one trade averaging would permit and the safety criterion
 * exists to forbid.
 */
export function criteriaStates(
  score: DeterministicScore | null,
  judgements: readonly Judgement[],
): readonly CriterionState[] {
  return evaluationCriteria.map((criterion) =>
    deterministicCriteria.includes(criterion)
      ? deterministicState(criterion, score)
      : judgedState(criterion, judgements),
  );
}

/** Whether any criterion failed. A boundary violation alone is enough. */
export function anyCriterionFailed(states: readonly CriterionState[]): boolean {
  return states.some((state) => state.outcome === "fail");
}

// ---------------------------------------------------------------------------
// The improvement surface
// ---------------------------------------------------------------------------

export const observationKinds = [
  "served_but_uncited",
  "assertion_cites_nothing",
  "assertion_cites_unserved",
  "block_degraded_or_failed",
  "receipt_exclusions",
  "canonical_empty_claims_full",
  "instruction_contradiction",
  "instructions_declared_unknown",
  "boundary_violation",
] as const;
export type ObservationKind = (typeof observationKinds)[number];

export interface ImprovementObservation {
  /** What the record says. A fact, never a diagnosis. */
  evidence: string;
  kind: ObservationKind;
  /** What it *could* point at. Plural on purpose. */
  couldPointAt: readonly string[];
  /** Where to go, with a filter applied. Rebuilds nothing. */
  destinations: readonly { href: string; label: string }[];
  /** The feedback rating this observation records, drawn from the shipped thirteen. */
  rating: string | null;
  /** The receipt item this is about, when it is about one. */
  receiptItemId: string | null;
  title: string;
}

/**
 * Every improvement opportunity this run's record supports, unranked.
 *
 * **The user's correction is the specification:** *"if something doesn't pass,
 * there is an opportunity to improve something, do not assume there is one path
 * to improve it."* So each entry names what could be adjusted **without
 * asserting that it is the fault**, and `couldPointAt` is a list rather than a
 * conclusion.
 *
 * **Nothing is ranked and nothing is scored.** The order is the order the
 * evidence appears in, so two readers of one run see one list;
 * `curationModel.ts`'s rule holds — confidence does not move a row, and nothing
 * here weighs what getting it wrong would cost.
 *
 * **Every rating comes from the thirteen `signals/feedback.py` already accepts.**
 * `selected`, `ignored`, `missing`, `incorrect`, `stale`, `contradicted` and
 * `unsafe` all exist; nothing new is minted, and in particular nothing collapses
 * into the three the dashboard writes today.
 */
export function observationsFor(input: {
  envelope: ContextEnvelope | null;
  exclusions: readonly ContextExclusion[];
  judgements: readonly Judgement[];
  score: DeterministicScore | null;
  simulation: Simulation | null;
}): readonly ImprovementObservation[] {
  const { envelope, exclusions, judgements, score, simulation } = input;
  const observations: ImprovementObservation[] = [];

  if (simulation) {
    for (const receiptItemId of simulation.uncited_served_ids) {
      observations.push({
        couldPointAt: [
          "the scope was too wide, so narrow the query or lower the item limit",
          "the agent ignored it, which is a fact about the agent rather than about retrieval",
        ],
        destinations: [
          { href: `/receipts?receipt=${encodeURIComponent(simulation.receipt_id)}`, label: "What was served" },
        ],
        evidence: `${receiptItemId} was served and no assertion cited it.`,
        kind: "served_but_uncited",
        rating: "ignored",
        receiptItemId,
        title: "Served but cited by no assertion",
      });
    }

    for (const assertion of simulation.assertions) {
      if (assertion.citations.length === 0) {
        observations.push({
          couldPointAt: [
            "a fact the graph does not hold, so assert or promote it",
            "a groundedness failure, which is a fact about the agent",
          ],
          destinations: [
            { href: "/memory/claims/new", label: "Assert a claim" },
            { href: "/memory/promotions", label: "Promotions" },
          ],
          evidence: `"${assertion.text}" rests on nothing that was served.`,
          kind: "assertion_cites_nothing",
          rating: "missing",
          receiptItemId: null,
          title: "An assertion citing no served item",
        });
      }
      for (const citation of assertion.citations) {
        if (citation.was_served) continue;
        observations.push({
          couldPointAt: [
            "the model named an id that was never in the envelope, which is a groundedness failure",
          ],
          destinations: [
            { href: `/receipts?receipt=${encodeURIComponent(simulation.receipt_id)}`, label: "What was served" },
          ],
          evidence: `"${assertion.text}" cites ${citation.receipt_item_id}, which was not served.`,
          kind: "assertion_cites_unserved",
          rating: "incorrect",
          receiptItemId: citation.receipt_item_id,
          title: "A citation naming something never served",
        });
      }
    }
  }

  if (envelope) {
    for (const block of envelope.blocks) {
      if (block.state !== "degraded" && block.state !== "failed") continue;
      observations.push({
        couldPointAt: [
          "retrieval configuration for this arm",
          "a source whose breaker tripped, which is an operational fact rather than a policy one",
        ],
        destinations: [
          { href: "/sources", label: "Sources" },
          { href: "/settings", label: "Settings" },
        ],
        evidence: `The ${block.name} block came back ${block.state}: ${block.reason ?? "no reason was carried"}.`,
        kind: "block_degraded_or_failed",
        rating: null,
        receiptItemId: null,
        title: `A block came back ${block.state}`,
      });
    }

    if (canonicalEmptyWhileClaimsFull(envelope)) {
      observations.push({
        couldPointAt: [
          "something true is stuck unpromoted, so review the promotion queue",
          "a promotion policy that is not admitting this predicate",
        ],
        destinations: [
          { href: "/memory/promotions", label: "Promotions" },
          { href: "/memory/review", label: "Needs review" },
        ],
        evidence: "The canonical block is empty while observed claims carried items.",
        kind: "canonical_empty_claims_full",
        rating: null,
        receiptItemId: null,
        title: "Canonical empty while claims is full",
      });
    }

    const instructions = envelope.blocks.find((block) => block.name === "instructions");
    for (const item of instructions?.items ?? []) {
      if (item.payload.contradicts !== true) continue;
      const note = typeof item.payload.contradiction_note === "string" ? item.payload.contradiction_note : null;
      observations.push({
        couldPointAt: [
          "the delta and the declared instruction set disagree, which is a Judgement event rather than a retrieval one",
        ],
        destinations: [
          { href: "/memory/review", label: "Needs review" },
          { href: "/agents", label: "Agents" },
        ],
        evidence: note ?? "An instruction delta contradicts the declared set.",
        kind: "instruction_contradiction",
        rating: "contradicted",
        receiptItemId: item.receipt_item_id.value,
        title: "The instruction block carries a contradiction",
      });
    }

    if (envelope.instruction_disposition === "declared_unknown") {
      observations.push({
        couldPointAt: [
          "the agent declared a digest whose content was never submitted, so contradictions cannot be computed for it",
        ],
        destinations: [{ href: "/agents", label: "Agents" }],
        evidence:
          envelope.instruction_block_note ??
          "The declared instruction set was never submitted, so corrections were served without a contradiction check.",
        kind: "instructions_declared_unknown",
        rating: null,
        receiptItemId: null,
        title: "Instructions declared but never submitted",
      });
    }
  }

  for (const exclusion of exclusions) {
    observations.push({
      couldPointAt: [
        "governance withheld it — a PII policy, a classification ceiling, or an ARC decision",
        "the withholding is correct and the prompt is asking for something it should not get",
      ],
      destinations: [
        { href: "/quarantine", label: "Withheld" },
        { href: "/arc", label: "Policies" },
      ],
      evidence: `${exclusion.block}/${exclusion.item_key} was withheld: ${exclusion.reason}`,
      kind: "receipt_exclusions",
      rating: null,
      receiptItemId: null,
      title: "The receipt records an exclusion",
    });
  }

  for (const violation of score?.violations ?? []) {
    observations.push({
      couldPointAt: [
        "a boundary the scenario declared in advance was crossed, which fails the case whatever the other criteria say",
        "the scenario's declared facts, if the boundary was declared wrongly",
      ],
      destinations: [
        { href: "/quarantine", label: "Withheld" },
        { href: "/arc", label: "Policies" },
      ],
      evidence: `${violation.block}/${violation.item_key} — ${violation.kind}: ${violation.detail}`,
      kind: "boundary_violation",
      rating: "unsafe",
      receiptItemId: null,
      title: "A boundary violation",
    });
  }

  for (const judgement of judgements) {
    if (judgement.verdict !== "fail") continue;
    observations.push({
      couldPointAt: [
        `the judge found ${judgement.criterion.replace("_", " ")} failing — read its reasoning before acting on it`,
        judgement.confidence_is_calibrated
          ? "the judge's confidence has been fitted against human confirmations for this tuple"
          : "the judge's confidence is unproven for this tuple, so the verdict is a claim rather than a measurement",
      ],
      destinations: [{ href: "/agents", label: "Agents" }],
      evidence: judgement.reasoning,
      kind: judgement.criterion === "groundedness" ? "assertion_cites_nothing" : "served_but_uncited",
      rating: null,
      receiptItemId: null,
      title: `A judge failed ${judgement.criterion.replace("_", " ")}`,
    });
  }

  return observations;
}

/** Canonical empty while observed claims carried something. */
export function canonicalEmptyWhileClaimsFull(envelope: ContextEnvelope): boolean {
  const canonical = envelope.blocks.find((block) => block.name === "canonical");
  const claims = envelope.blocks.find((block) => block.name === "observed_claims");
  return blockIsEmpty(canonical) && (claims?.items.length ?? 0) > 0;
}

function blockIsEmpty(block: ContextBlock | undefined): boolean {
  // Read the state rather than the item count. A failed arm has no items either,
  // and treating it as empty reads a broken arm as a quiet one — which is the
  // distinction the envelope contract exists to preserve.
  return block !== undefined && block.state === "empty";
}

/**
 * Whether an instruction editor should offer content at all.
 *
 * Three states, and the middle one is why this is a function rather than a
 * truthiness check: an agent that declared a digest whose content was never
 * submitted has nothing to edit *and* is in a state it can leave, which is
 * different from one that declared nothing.
 */
export function instructionsAreEditable(disposition: InstructionDisposition): boolean {
  return disposition === "declared_known";
}
