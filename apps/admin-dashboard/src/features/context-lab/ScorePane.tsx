import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, ShieldAlert } from "lucide-react";
import { useId, useState } from "react";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, RequestFailure, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  recordJudgementReview,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type DeterministicScore,
  type Judgement,
  type ReviewVerdict,
} from "../../shared/api";
import {
  criteriaStates,
  criterionLabels,
  type CriterionState,
} from "./simulationModel";

interface ScorePaneProps {
  client: ContextplaneClient;
  judgements: readonly Judgement[];
  onJudge: () => void;
  isJudging: boolean;
  judgeAvailable: boolean;
  requestContext: ContextplaneRequestOptions;
  score: DeterministicScore | null;
  simulationId: string;
}

/**
 * Five criteria, each showing what it concluded and what it concluded it from.
 *
 * Three rules, each with a precedent in this repository rather than in a style
 * guide.
 *
 * **1. No bare scores.** Every judged criterion shows the judge's reasoning and
 * the span it relied on. A verdict a reviewer can only accept or reject is not
 * reviewable, so evidence is rendered for a *pass* as well as a fail — evidence
 * supplied only on failures teaches a reader that passes are not checkable.
 *
 * **2. An uncalibrated judge says so.** Until a bin fit exists for the judge's
 * pinned tuple the verdict renders as **unproven**. This is `calibration.py`'s
 * argument on screen: an unexamined number must not acquire an authoritative
 * look. The flag arrives from the service rather than being inferred here,
 * because a client that got it wrong would put a confident label on a guess in
 * the place least able to absorb one.
 *
 * **3. No blended score, and no ranking by confidence.** Five criteria produce
 * five answers, and a boundary violation fails the case whatever the other four
 * say. `curationModel.ts`'s rule holds — *confidence does not move a row, and
 * nothing here weighs what getting it wrong would cost*.
 *
 * **Grouped by what each criterion implicates, not by judge type.** That is ADR
 * 0024's column: a failure of recall or precision implicates what was *served*,
 * a failure of groundedness or relevance implicates what the *agent* did with
 * it, and the attribution a separate journey would have bought is already inside
 * one result.
 *
 * **Disagreement is a visible state.** A reviewer overruling the judge does not
 * overwrite it; the row says both, and the Judgement surface is where it
 * escalates rather than a second queue with its own conventions.
 */
export function ScorePane({
  client,
  isJudging,
  judgeAvailable,
  judgements,
  onJudge,
  requestContext,
  score,
  simulationId,
}: ScorePaneProps) {
  const states = criteriaStates(score, judgements);
  const grouped: readonly { implicates: CriterionState["implicates"]; states: readonly CriterionState[] }[] = [
    { implicates: "memory", states: states.filter((state) => state.implicates === "memory") },
    { implicates: "governance", states: states.filter((state) => state.implicates === "governance") },
    { implicates: "the agent", states: states.filter((state) => state.implicates === "the agent") },
  ];

  return (
    <SectionSurface
      action={
        judgeAvailable ? (
          <Button disabled={isJudging} onClick={onJudge} variant="secondary">
            {isJudging ? "Judging…" : judgements.length > 0 ? "Judge again" : "Judge the answer"}
          </Button>
        ) : null
      }
      description="Five criteria, each showing what it concluded and what it concluded it from. Nothing here is averaged: a boundary violation fails the case whatever the other four say."
      title="Score"
    >
      {judgeAvailable ? null : (
        <Notice title="Groundedness and relevance need a second provider family" variant="info">
          No judge is configured, so the two model-judged criteria are unavailable. The three
          deterministic criteria need no judge and are unaffected — that separation is what keeps a
          failure of those attributable to what was served rather than to what graded it.
        </Notice>
      )}

      <div className="space-y-6">
        {grouped.map((group) =>
          group.states.length === 0 ? null : (
            <div key={group.implicates}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Implicates {group.implicates}
              </h3>
              <ul className="mt-2 divide-y divide-border">
                {group.states.map((state) => (
                  <CriterionRow
                    client={client}
                    key={state.criterion}
                    requestContext={requestContext}
                    simulationId={simulationId}
                    state={state}
                  />
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </SectionSurface>
  );
}

function outcomeBadge(state: CriterionState) {
  if (state.outcome === "pass") return <StatusBadge tone="success">Pass</StatusBadge>;
  if (state.outcome === "fail") return <StatusBadge tone="danger">Fail</StatusBadge>;
  if (state.outcome === "unassertable") return <StatusBadge tone="neutral">Not assertable</StatusBadge>;
  return <StatusBadge tone="neutral">Not judged</StatusBadge>;
}

interface CriterionRowProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
  simulationId: string;
  state: CriterionState;
}

function CriterionRow({ client, requestContext, simulationId, state }: CriterionRowProps) {
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{criterionLabels[state.criterion]}</span>
          {outcomeBadge(state)}
          {/* The corollary ADR 0026 calls non-negotiable. A judged verdict whose
              confidence has not been fitted is a claim, not a measurement, and
              the badge says which. Deterministic criteria carry no such badge —
              there is no model to calibrate. */}
          {state.judge !== "deterministic" && state.outcome !== "unjudged" && !state.isProven ? (
            <StatusBadge tone="warning">
              <CircleHelp className="size-3.5" />
              Unproven
            </StatusBadge>
          ) : null}
          {state.isDisputed ? <StatusBadge tone="warning">Reviewer disagrees</StatusBadge> : null}
        </span>
        <span className="text-xs text-muted-foreground">{state.judge}</span>
      </div>

      {state.unassertableReason ? (
        <p className="text-xs text-muted-foreground">{state.unassertableReason}</p>
      ) : null}

      {state.judge !== "deterministic" && state.outcome !== "unjudged" && !state.isProven ? (
        <p className="text-xs text-warning">
          This judge&apos;s confidence has not been fitted against human confirmations for its pinned
          tuple, so the verdict is a claim rather than a measurement. Confirming or overruling it is
          what makes a fit possible.
        </p>
      ) : null}

      {state.reasoning ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-primary">Why the judge concluded this</summary>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{state.reasoning}</p>
        </details>
      ) : null}

      {state.evidence.length > 0 ? (
        <ul className="space-y-1">
          {state.evidence.map((span) => (
            <li className="text-xs text-muted-foreground" key={span}>
              <span className="mr-1 text-foreground">Evidence:</span>
              {span}
            </li>
          ))}
        </ul>
      ) : null}

      {state.criterion === "boundary_violations" && state.outcome === "fail" ? (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          A boundary violation fails the case regardless of the other four criteria. The scenario
          declared the boundary in advance, and the judge asks the scenario rather than the system
          under test.
        </p>
      ) : null}

      {state.judgementId ? (
        <ReviewControls
          client={client}
          judgementId={state.judgementId}
          requestContext={requestContext}
          simulationId={simulationId}
        />
      ) : null}
    </li>
  );
}

interface ReviewControlsProps {
  client: ContextplaneClient;
  judgementId: string;
  requestContext: ContextplaneRequestOptions;
  simulationId: string;
}

/**
 * Confirm or overrule, one action away.
 *
 * The override is what calibration learns from, so it is not buried: the pair
 * *(what the judge said, what the person said)* is the only thing a fit can be
 * built from, and a review nobody files is a fit that never exists.
 *
 * `unsure` is offered and is not a third verdict on the answer — it is
 * information about the reviewer, and calibration excludes it because counting
 * it either way would bias the fit. It still needs a reason.
 */
function ReviewControls({ client, judgementId, requestContext, simulationId }: ReviewControlsProps) {
  const noteId = useId();
  const [chosen, setChosen] = useState<ReviewVerdict | "">("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const review = useMutation({
    mutationFn: (verdict: ReviewVerdict) =>
      recordJudgementReview(
        client,
        { judgementId, ...(note.trim() ? { note: note.trim() } : {}), verdict },
        requestContext,
      ),
    onSuccess: async () => {
      showToast({
        message: "It sits beside the judge's verdict rather than replacing it, which is what calibration is fitted from.",
        title: "Review recorded",
        variant: "success",
      });
      setChosen("");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["simulation", "judgements", simulationId] });
    },
  });

  const needsNote = chosen !== "" && chosen !== "confirmed";
  const blocked = needsNote && note.trim() === "";

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">Was the judge right?</p>
      <div className="flex flex-wrap gap-2">
        {(["confirmed", "overruled", "unsure"] as const).map((verdict) => (
          <Button
            aria-pressed={chosen === verdict}
            key={verdict}
            onClick={() => setChosen(chosen === verdict ? "" : verdict)}
            size="compact"
            variant={chosen === verdict ? "primary" : "secondary"}
          >
            {verdict === "confirmed" ? "Confirm" : verdict === "overruled" ? "Overrule" : "Unsure"}
          </Button>
        ))}
      </div>
      {chosen !== "" ? (
        <div>
          <label className="text-xs font-medium text-foreground" htmlFor={noteId}>
            {needsNote ? "Why (required)" : "Why (optional)"}
          </label>
          <input
            aria-invalid={blocked}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id={noteId}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
        </div>
      ) : null}
      {review.isError && chosen !== "" ? (
        <RequestFailure onRetry={() => review.mutate(chosen)} title="The review was not recorded">
          {review.error.message}
        </RequestFailure>
      ) : null}
      {chosen === "" ? null : (
        <Button disabled={blocked || review.isPending} onClick={() => review.mutate(chosen)} size="compact">
          {review.isPending ? "Recording…" : "Record review"}
        </Button>
      )}
    </div>
  );
}
