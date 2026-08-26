import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Lightbulb } from "lucide-react";
import { useState } from "react";

import { EmptyState, SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, RequestFailure, useToast } from "@repo/ui/primitives";

import {
  recordContextFeedback,
  type ContextExclusion,
  type ContextEnvelope,
  type ContextFeedbackRating,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type DeterministicScore,
  type Judgement,
  type Simulation,
  type WhoAmI,
} from "../../shared/api";
import { observationsFor, type ImprovementObservation } from "./simulationModel";

interface ImprovementSurfaceProps {
  client: ContextplaneClient;
  envelope: ContextEnvelope | null;
  exclusions: readonly ContextExclusion[];
  identity: WhoAmI;
  judgements: readonly Judgement[];
  receiptId: string | null;
  requestContext: ContextplaneRequestOptions;
  score: DeterministicScore | null;
  simulation: Simulation | null;
}

/**
 * Every opportunity this run's record supports, several at once, unranked.
 *
 * The user's correction is the specification: *"if something doesn't pass, there
 * is an opportunity to improve something, **do not assume there is one path to
 * improve it**."* So each entry presents an **observation with its evidence** and
 * names what it *could* point at, without asserting which one is the fault.
 *
 * ## Ranking is refused, and for a reason already written down
 *
 * `curationModel.ts` states it for the reviewer queue — *"Confidence does not
 * move a row, and nothing here weighs what getting it wrong would cost"* — and it
 * holds here. A list ordered by a confidence the product has not calibrated
 * would invite exactly the deference that sentence exists to prevent. The order
 * is the order the evidence appears in, so two readers of one run see one list.
 *
 * ## It rebuilds nothing
 *
 * Policy authoring, claims, curation, quarantine, promotions and the agent
 * instruction lifecycle all ship. Each observation deep-links with a filter
 * applied and reimplements none of them.
 *
 * ## Recording a conclusion writes the rating that matches it
 *
 * From the thirteen `signals/feedback.py` already accepts — `selected`,
 * `ignored`, `missing`, `incorrect`, `stale`, `contradicted`, `unsafe` — rather
 * than collapsing everything into the three the dashboard writes today. Nothing
 * new is minted.
 *
 * ## The instruction door stays gated
 *
 * E20-T7 requires a stored failure-pattern report before an instruction change,
 * and that is treated as a feature rather than friction: it turns a finding here
 * into citable evidence instead of an opinion. This surface links to the agent's
 * own page and does not offer an instruction edit.
 */
export function ImprovementSurface({
  client,
  envelope,
  exclusions,
  identity,
  judgements,
  receiptId,
  requestContext,
  score,
  simulation,
}: ImprovementSurfaceProps) {
  const observations = observationsFor({ envelope, exclusions, judgements, score, simulation });

  return (
    <SectionSurface
      description="What this run's own record supports. Several at once, unranked, each naming what could be adjusted without asserting that it is the fault."
      title="Ways to improve this"
    >
      {observations.length === 0 ? (
        <EmptyState
          // Two different empty results, and the page used to report the second
          // one for both. With no simulation there are no assertions and no
          // citations, so "every assertion rested on something served" described
          // a check that had not run — a clean bill of health for work nobody
          // did, on the surface whose whole job is saying what a record supports.
          description={
            simulation === null
              ? "Nothing was withheld and no block degraded, which is all this resolution alone can say. Simulate an agent above to find out what an answer built from it would rest on."
              : "Every served item was cited, every assertion rested on something served, no block degraded, and nothing was withheld. That is a real result rather than a missing one."
          }
          icon={Lightbulb}
          title={
            simulation === null
              ? "This resolution's record supports no observations yet"
              : "This run's record supports no observations"
          }
        />
      ) : (
        <>
          <Notice title="These are observations, not a diagnosis" variant="info">
            A failing run does not have <em>a</em> cause. Nothing below is ranked, and nothing claims
            to be the fault — each names what it could point at, and more than one may be true at
            once.
          </Notice>
          <ul className="mt-4 divide-y divide-border">
            {observations.map((observation, index) => (
              <ObservationRow
                client={client}
                identity={identity}
                key={`${observation.kind}-${observation.receiptItemId ?? index}`}
                observation={observation}
                receiptId={receiptId}
                requestContext={requestContext}
              />
            ))}
          </ul>
        </>
      )}
    </SectionSurface>
  );
}

interface ObservationRowProps {
  client: ContextplaneClient;
  identity: WhoAmI;
  observation: ImprovementObservation;
  receiptId: string | null;
  requestContext: ContextplaneRequestOptions;
}

function ObservationRow({
  client,
  identity,
  observation,
  receiptId,
  requestContext,
}: ObservationRowProps) {
  const [recorded, setRecorded] = useState(false);
  const { showToast } = useToast();

  const record = useMutation({
    mutationFn: () => {
      if (!observation.rating || !observation.receiptItemId || !receiptId) {
        throw new Error("This observation carries no item-level rating to record.");
      }
      return recordContextFeedback(
        client,
        {
          idempotencyKey: crypto.randomUUID(),
          rating: observation.rating as ContextFeedbackRating,
          receiptId,
          receiptItemId: observation.receiptItemId,
          reporterId: identity.actor_id,
        },
        requestContext,
      );
    },
    onSuccess: () => {
      setRecorded(true);
      showToast({
        message: `Recorded as ${observation.rating}. That is one of the ratings the signal surface already accepts, not a new one.`,
        title: "Observation recorded",
        variant: "success",
      });
    },
  });

  const canRecord =
    observation.rating !== null && observation.receiptItemId !== null && receiptId !== null;

  return (
    <li className="space-y-2 py-4">
      <p className="text-sm font-medium text-foreground">{observation.title}</p>
      <p className="text-xs text-muted-foreground">{observation.evidence}</p>

      <div>
        <p className="text-xs font-medium text-muted-foreground">What this could point at</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {observation.couldPointAt.map((candidate) => (
            <li className="text-xs text-muted-foreground" key={candidate}>
              {candidate}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {observation.destinations.map((destination) => (
          <a
            className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            href={destination.href}
            key={destination.href}
          >
            {destination.label}
            <ArrowUpRight className="size-3.5" />
          </a>
        ))}
        {canRecord && !recorded ? (
          <Button disabled={record.isPending} onClick={() => record.mutate()} size="compact" variant="secondary">
            {record.isPending ? "Recording…" : `Record as ${observation.rating}`}
          </Button>
        ) : null}
        {recorded ? <span className="text-xs text-success">Recorded</span> : null}
      </div>

      {record.isError ? (
        <RequestFailure onRetry={() => record.mutate()} title="The observation was not recorded">
          {record.error.message}
        </RequestFailure>
      ) : null}
    </li>
  );
}
