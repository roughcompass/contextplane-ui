import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Receipt } from "lucide-react";
import { useId, useState } from "react";

import { Button, Notice, RequestFailure, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  recordRunVerdict,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type EvaluationPrompt,
  type EvaluationRun,
  type EvaluationVerdict,
  type RunItem,
} from "../../shared/api";
import {
  formatDuration,
  runVerdictLabel,
  runVerdictOptions,
  runVerdictTone,
} from "./evaluationModel";
import { RunSummary } from "./RunSummary";

interface RunItemListProps {
  client: ContextplaneClient;
  prompts: readonly EvaluationPrompt[];
  requestContext: ContextplaneRequestOptions;
  run: EvaluationRun;
}

/**
 * One run's items, each with the verdict a reviewer may record on it.
 *
 * **A verdict is on an item, never on the run.** A run of twenty prompts where
 * three were wrong is right seventeen times and wrong three, and the three are
 * what somebody has to look at; a run-level verdict would flatten exactly the
 * signal the loop produces.
 *
 * **An errored item keeps its row and says why.** It carries a failure and no
 * receipt, and it is still judgeable — a resolution that raised is a fact about
 * the system, and a reviewer marking it `unusable` is recording something true.
 *
 * **Two reviewers disagreeing stays two rows.** Somebody who changed their mind
 * has one opinion, which the service enforces; two people who disagree have two,
 * and collapsing them would let a reader count revisions as agreement.
 */
export function RunItemList({ client, prompts, requestContext, run }: RunItemListProps) {
  const promptsById = new Map(prompts.map((prompt) => [prompt.prompt_id, prompt]));

  return (
    <div className="space-y-4">
      <RunSummary run={run} />
      <ul className="divide-y divide-border">
        {run.items.map((item) => (
          <RunItemRow
            client={client}
            item={item}
            key={item.item_id}
            prompt={promptsById.get(item.prompt_id) ?? null}
            requestContext={requestContext}
            runId={run.run_id}
          />
        ))}
      </ul>
      {run.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">This run resolved no prompts.</p>
      ) : null}
    </div>
  );
}

interface RunItemRowProps {
  client: ContextplaneClient;
  item: RunItem;
  prompt: EvaluationPrompt | null;
  requestContext: ContextplaneRequestOptions;
  runId: string;
}

function RunItemRow({ client, item, prompt, requestContext, runId }: RunItemRowProps) {
  const noteId = useId();
  const [chosen, setChosen] = useState<EvaluationVerdict | "">("");
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const record = useMutation({
    mutationFn: (verdict: EvaluationVerdict) =>
      recordRunVerdict(
        client,
        { itemId: item.item_id, ...(note.trim() ? { note: note.trim() } : {}), verdict },
        requestContext,
      ),
    onSuccess: async (recorded) => {
      showToast({
        message: "It outlives this page, so it can be compared against the next run of this set.",
        title: `Recorded ${runVerdictLabel(recorded.verdict).toLowerCase()}`,
        variant: "success",
      });
      setChosen("");
      setNote("");
      await queryClient.invalidateQueries({ queryKey: ["evaluation", "run", runId] });
    },
  });

  const query = typeof prompt?.request.query === "string" ? prompt.request.query : null;
  // Anything but `right` needs a reason, and the service refuses one without. The
  // form says so before the request rather than after, because a refusal a
  // person could have been told about in advance reads as a bug.
  const needsNote = chosen !== "" && chosen !== "right";
  const blocked = needsNote && note.trim() === "";

  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {query ?? `Prompt ${item.position + 1}`}
          </p>
          {prompt?.intent_note ? (
            <p className="text-xs text-muted-foreground">Checking: {prompt.intent_note}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatDuration(item.duration_ms)}</span>
          {item.failure === null ? (
            <StatusBadge tone={item.envelope_state === "complete" ? "success" : "warning"}>
              {item.envelope_state ?? "Resolved"}
            </StatusBadge>
          ) : (
            <StatusBadge tone="danger">Failed</StatusBadge>
          )}
        </div>
      </div>

      {item.failure !== null ? (
        <Notice title="This resolution raised" variant="danger">
          <span className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {item.failure}. It stays in the run — dropping it is how a number improves without
              anything improving.
            </span>
          </span>
        </Notice>
      ) : null}

      {item.receipt_id !== null ? (
        <a
          className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
          href={`/receipts?receipt=${encodeURIComponent(item.receipt_id)}`}
        >
          <Receipt className="size-3.5" />
          What this resolution served
        </a>
      ) : null}

      {item.verdicts.length > 0 ? (
        <ul className="space-y-1">
          {item.verdicts.map((verdict) => (
            <li className="flex flex-wrap items-center gap-2 text-xs" key={`${verdict.recorded_by}-${verdict.recorded_at}`}>
              <StatusBadge tone={runVerdictTone(verdict.verdict)}>
                {runVerdictLabel(verdict.verdict)}
              </StatusBadge>
              <span className="text-muted-foreground">{verdict.note ?? "No note"}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">
          Was what this resolution served right?
        </legend>
        <div className="flex flex-wrap gap-2">
          {runVerdictOptions.map((option) => (
            <Button
              aria-pressed={chosen === option.value}
              key={option.value}
              onClick={() => setChosen(chosen === option.value ? "" : option.value)}
              size="compact"
              title={option.description}
              variant={chosen === option.value ? "primary" : "secondary"}
            >
              {option.label}
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
              placeholder="A judgement with no reason is one the next reader has to reach again from scratch."
              value={note}
            />
          </div>
        ) : null}
        {record.isError && chosen !== "" ? (
          <RequestFailure onRetry={() => record.mutate(chosen)} title="The verdict was not recorded">
            {record.error.message}
          </RequestFailure>
        ) : null}
        {chosen === "" ? null : (
          <Button disabled={blocked || record.isPending} onClick={() => record.mutate(chosen)} size="compact">
            {record.isPending ? "Recording…" : "Record verdict"}
          </Button>
        )}
      </fieldset>
    </li>
  );
}
