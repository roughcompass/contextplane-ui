import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState, SectionSurface } from "@repo/ui/layouts";
import { Notice, RequestFailure, SearchableSelect, StatusBadge } from "@repo/ui/primitives";

import {
  getRun,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type EvaluationRun,
} from "../../shared/api";
import {
  compareRuns,
  formatEvaluationTimestamp,
  formatFingerprint,
  runChangeDirection,
  runChangeKindLabels,
  runsAreComparable,
  tallyRun,
} from "./evaluationModel";

interface RunComparisonProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
  runs: readonly EvaluationRun[];
  setName: string;
}

/**
 * Two runs of one prompt set, with what moved **named** rather than diffed.
 *
 * ## Named change kinds, not a text diff
 *
 * Following ARC's baseline-diff vocabulary. A reader comparing runs is asking
 * *what changed in kind* — a verdict improved, a resolution started failing, a
 * prompt is in one run and not the other — and a character diff over serialized
 * payloads answers a different question while burying the answer to this one.
 *
 * ## Two runs under different deployments are not compared
 *
 * A difference between them is evidence the *configuration* changed, which the
 * reader already knew, so this refuses rather than rendering a movement nobody
 * can attribute. `resolver_fingerprint` is what makes that checkable, and it is
 * the reason a run pins the deployment it ran under.
 *
 * ## A prompt in one run and not the other is reported
 *
 * Not skipped. A set that gained a prompt between runs is exactly the case where
 * a naive comparison silently narrows to the intersection and calls the result a
 * trend, and the two "absent from" kinds carry no direction because a set
 * changing size is a fact about the set rather than a movement in quality.
 *
 * ## Both runs load their items, and only here
 *
 * The list read returns headers precisely so choosing two rows does not read the
 * whole history. Once two are chosen, both are fetched — a comparison over
 * headers alone could report only that two runs exist.
 */
export function RunComparison({ client, requestContext, runs, setName }: RunComparisonProps) {
  // Newest as candidate, the one before it as baseline. The common question is
  // "what changed since last time", and defaulting to it means the screen answers
  // before anybody chooses anything.
  const [baseline, setBaseline] = useState(runs[1]?.run_id ?? "");
  const [candidate, setCandidate] = useState(runs[0]?.run_id ?? "");

  const runOptions = useMemo(
    () =>
      runs.map((entry) => ({
        label: `${formatEvaluationTimestamp(entry.started_at)} · ${formatFingerprint(entry.resolver_fingerprint)}`,
        value: entry.run_id,
      })),
    [runs],
  );

  const baselineRun = useQuery({
    enabled: baseline !== "",
    queryFn: () => getRun(client, baseline, requestContext),
    queryKey: ["evaluation", "run", baseline, requestContext.tenantId ?? "current"],
  });
  const candidateRun = useQuery({
    enabled: candidate !== "",
    queryFn: () => getRun(client, candidate, requestContext),
    queryKey: ["evaluation", "run", candidate, requestContext.tenantId ?? "current"],
  });

  const comparable = useMemo(
    () =>
      baselineRun.data && candidateRun.data
        ? runsAreComparable(baselineRun.data, candidateRun.data)
        : null,
    [baselineRun.data, candidateRun.data],
  );

  const changes = useMemo(
    () =>
      baselineRun.data && candidateRun.data && comparable
        ? compareRuns(baselineRun.data, candidateRun.data)
        : [],
    [baselineRun.data, candidateRun.data, comparable],
  );

  return (
    <SectionSurface
      description={`Two runs of ${setName}, with what moved named rather than diffed as text.`}
      title="Compare runs"
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <SearchableSelect
          allowEmpty
          emptyLabel="Choose a run"
          label="Baseline"
          onValueChange={setBaseline}
          options={runOptions}
          value={baseline}
        />
        <SearchableSelect
          allowEmpty
          emptyLabel="Choose a run"
          label="Candidate"
          onValueChange={setCandidate}
          options={runOptions}
          value={candidate}
        />
      </div>

      {baselineRun.isError ? (
        <RequestFailure
          onRetry={() => void baselineRun.refetch()}
          title="The baseline run could not be read"
        >
          {baselineRun.error.message}
        </RequestFailure>
      ) : null}
      {candidateRun.isError ? (
        <RequestFailure
          onRetry={() => void candidateRun.refetch()}
          title="The candidate run could not be read"
        >
          {candidateRun.error.message}
        </RequestFailure>
      ) : null}

      {baseline !== "" && baseline === candidate ? (
        <Notice title="Choose two different runs" variant="info">
          A run compared with itself reports nothing moved, which is true and useless.
        </Notice>
      ) : null}

      {comparable === false ? (
        <Notice title="These two runs are not comparable" variant="warning">
          They ran under different deployments (
          {formatFingerprint(baselineRun.data?.resolver_fingerprint ?? "")} and{" "}
          {formatFingerprint(candidateRun.data?.resolver_fingerprint ?? "")}). A difference between them
          is evidence the configuration changed, not evidence about retrieval quality.
        </Notice>
      ) : null}

      {comparable && baselineRun.data && candidateRun.data ? (
        <div className="space-y-4">
          <TallyDelta baseline={baselineRun.data} candidate={candidateRun.data} />
          {changes.length === 0 ? (
            <EmptyState
              description="Every prompt resolved the same way and carries the same verdict. That is a real result, not a missing one."
              icon={Minus}
              title="Nothing moved"
            />
          ) : (
            <ul className="divide-y divide-border">
              {changes.map((change) => {
                const direction = runChangeDirection(change.kind);
                return (
                  <li
                    className="flex flex-wrap items-start justify-between gap-3 py-3"
                    key={`${change.promptId}-${change.kind}`}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {direction === "better" ? <ArrowUpRight className="size-4" /> : null}
                        {direction === "worse" ? <ArrowDownRight className="size-4" /> : null}
                        {runChangeKindLabels[change.kind]}
                      </span>
                      <span className="block text-xs text-muted-foreground">{change.detail}</span>
                    </span>
                    <StatusBadge
                      tone={direction === "better" ? "success" : direction === "worse" ? "danger" : "neutral"}
                    >
                      {direction === "better" ? "Better" : direction === "worse" ? "Worse" : "Changed"}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </SectionSurface>
  );
}

/**
 * The two runs' counts side by side.
 *
 * Counts rather than a delta percentage. A movement from 1 judged item to 2 is
 * not "+100%", and rendering it as one would imply a statistical meaning the
 * service does not provide.
 */
function TallyDelta({ baseline, candidate }: { baseline: EvaluationRun; candidate: EvaluationRun }) {
  const before = tallyRun(baseline);
  const after = tallyRun(candidate);
  const rows: readonly { label: string; left: number; right: number }[] = [
    { label: "Prompts resolved", left: before.total, right: after.total },
    { label: "Judged", left: before.judged, right: after.judged },
    { label: "Right", left: before.right, right: after.right },
    { label: "Wrong", left: before.wrong, right: after.wrong },
    { label: "Unusable", left: before.unusable, right: after.unusable },
    { label: "Errored", left: before.errored, right: after.errored },
  ];

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Baseline and candidate run counts</caption>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th scope="col">Measure</th>
          <th scope="col">Baseline</th>
          <th scope="col">Candidate</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.label}>
            <th className="py-2 text-left font-normal text-muted-foreground" scope="row">
              {row.label}
            </th>
            <td className="py-2 tabular-nums">{row.left}</td>
            <td className="py-2 tabular-nums">{row.right}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
