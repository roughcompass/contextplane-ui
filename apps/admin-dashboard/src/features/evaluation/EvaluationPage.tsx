import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, GitCompareArrows, Play, Plus } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";

import { EmptyState, PageContainer, SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, RequestFailure, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  createPromptSet,
  getRun,
  listPromptSets,
  listPrompts,
  listRuns,
  startRun,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type EvaluationRun,
  type PromptSet,
} from "../../shared/api";
import { PageHeader } from "../../shared/navigation/surface";
import { RunComparison } from "./RunComparison";
import { RunItemList } from "./RunItemList";
import { formatEvaluationTimestamp, formatFingerprint, isWritableSet } from "./evaluationModel";

interface EvaluationPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

/**
 * The destination the **Served** surface was missing.
 *
 * E22-T10 named that surface's question — *what did the machines actually get,
 * and was it right?* — and placed Receipts, Context Lab and Sessions under it.
 * The service shipped prompt sets, runs and persisted verdicts; nothing here
 * consumed them, so the surface could answer the first half and not the second.
 *
 * ## Read path before write, and the ordering is the design
 *
 * The set list and a run's items come first; creating a set is reached *from*
 * that list rather than being the landing state. A screen whose first offer is a
 * form asks somebody to name something before they have seen what exists — which
 * is how a deployment accumulates four sets that mean the same thing.
 *
 * ## Run headers load without their items
 *
 * That is the shape `GET …/runs` returns and the reason it returns it: a
 * comparison starts by choosing two runs, and loading every item of every run to
 * render that choice would read the whole history to answer a question about two
 * rows of it. Items arrive when a run is opened.
 *
 * ## Nothing here is averaged
 *
 * A run of twenty prompts where three were wrong is not a percentage; it is
 * seventeen and three, and the three are what somebody has to look at. Errored
 * items are counted rather than excluded, and unjudged items are counted rather
 * than treated as passing — a run where two of twenty were reviewed is two
 * opinions and eighteen absences.
 */
export function EvaluationPage({ activeTenantName, apiTenantId, client }: EvaluationPageProps) {
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const [selectedSetId, setSelectedSetId] = useState<string>("");
  const [openRunId, setOpenRunId] = useState<string>("");
  const [comparing, setComparing] = useState(false);

  const sets = useQuery({
    queryFn: () => listPromptSets(client, requestContext),
    queryKey: ["evaluation", "prompt-sets", apiTenantId ?? "current"],
  });

  const activeSet = useMemo(
    () => sets.data?.find((entry) => entry.set_id === selectedSetId) ?? null,
    [sets.data, selectedSetId],
  );

  const prompts = useQuery({
    enabled: selectedSetId !== "",
    queryFn: () => listPrompts(client, selectedSetId, requestContext),
    queryKey: ["evaluation", "prompts", selectedSetId, apiTenantId ?? "current"],
  });

  const runs = useQuery({
    enabled: selectedSetId !== "",
    queryFn: () => listRuns(client, selectedSetId, requestContext),
    queryKey: ["evaluation", "runs", selectedSetId, apiTenantId ?? "current"],
  });

  const openRun = useQuery({
    enabled: openRunId !== "",
    queryFn: () => getRun(client, openRunId, requestContext),
    queryKey: ["evaluation", "run", openRunId, apiTenantId ?? "current"],
  });

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Evaluation" }]}
        description="Saved prompt sets, the runs over them, and the verdicts that outlive the page. A run resolves every prompt once and keeps the receipts, so 'what changed after I adjusted that policy?' is answerable."
        title="Evaluation"
      />

      {sets.isError ? (
        <RequestFailure onRetry={() => void sets.refetch()} title="Prompt sets could not be read">
          {sets.error.message}
        </RequestFailure>
      ) : null}

      <PromptSetList
        activeSetId={selectedSetId}
        client={client}
        isLoading={sets.isPending}
        onSelect={(setId) => {
          setSelectedSetId(setId);
          setOpenRunId("");
          setComparing(false);
        }}
        requestContext={requestContext}
        sets={sets.data ?? []}
      />

      {activeSet ? (
        <RunList
          client={client}
          isLoading={runs.isPending}
          onCompare={() => setComparing((previous) => !previous)}
          onOpen={(runId) => {
            setOpenRunId(runId);
            setComparing(false);
          }}
          openRunId={openRunId}
          promptCount={prompts.data?.length ?? 0}
          requestContext={requestContext}
          runs={runs.data ?? []}
          set={activeSet}
        />
      ) : null}

      {activeSet && comparing ? (
        <RunComparison
          client={client}
          requestContext={requestContext}
          runs={runs.data ?? []}
          setName={activeSet.name}
        />
      ) : null}

      {openRunId && !comparing ? (
        <SectionSurface
          description="Every prompt the run resolved, in the set's order. An errored prompt keeps its row: dropping it is how a number improves without anything improving."
          title="Run items"
        >
          {openRun.isError ? (
            <RequestFailure onRetry={() => void openRun.refetch()} title="This run could not be read">
              {openRun.error.message}
            </RequestFailure>
          ) : null}
          {openRun.data ? (
            <RunItemList
              client={client}
              prompts={prompts.data ?? []}
              requestContext={requestContext}
              run={openRun.data}
            />
          ) : null}
        </SectionSurface>
      ) : null}
    </PageContainer>
  );
}

interface PromptSetListProps {
  activeSetId: string;
  client: ContextplaneClient;
  isLoading: boolean;
  onSelect: (setId: string) => void;
  requestContext: ContextplaneRequestOptions;
  sets: readonly PromptSet[];
}

function PromptSetList({
  activeSetId,
  client,
  isLoading,
  onSelect,
  requestContext,
  sets,
}: PromptSetListProps) {
  const [creating, setCreating] = useState(false);

  return (
    <SectionSurface
      action={
        <Button onClick={() => setCreating((previous) => !previous)} variant="secondary">
          <Plus className="size-4" />
          {creating ? "Cancel" : "New set"}
        </Button>
      }
      description="A named collection of prompts, resolved together so two runs of it can be read side by side."
      title="Prompt sets"
    >
      {creating ? (
        <CreateSetForm
          client={client}
          onCreated={(set) => {
            setCreating(false);
            onSelect(set.set_id);
          }}
          requestContext={requestContext}
        />
      ) : null}

      {isLoading ? <p className="text-sm text-muted-foreground">Reading prompt sets…</p> : null}

      {!isLoading && sets.length === 0 ? (
        <EmptyState
          description="A set is a group of prompts you want to resolve together and judge over time. Create one to start."
          icon={ClipboardList}
          title="No prompt sets yet"
        />
      ) : null}

      {sets.length > 0 ? (
        <ul className="divide-y divide-border">
          {sets.map((set) => (
            <li key={set.set_id}>
              <button
                aria-current={set.set_id === activeSetId ? "true" : undefined}
                className="flex w-full items-center justify-between gap-4 py-3 text-left hover:bg-muted/40"
                onClick={() => onSelect(set.set_id)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{set.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {set.description ?? "No description"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {set.prompt_count} {set.prompt_count === 1 ? "prompt" : "prompts"}
                  </span>
                  {isWritableSet(set) ? null : (
                    <StatusBadge tone="neutral">
                      Retired
                    </StatusBadge>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionSurface>
  );
}

interface CreateSetFormProps {
  client: ContextplaneClient;
  onCreated: (set: PromptSet) => void;
  requestContext: ContextplaneRequestOptions;
}

function CreateSetForm({ client, onCreated, requestContext }: CreateSetFormProps) {
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const create = useMutation({
    mutationFn: () =>
      createPromptSet(
        client,
        {
          ...(description.trim() ? { description: description.trim() } : {}),
          name: name.trim(),
        },
        requestContext,
      ),
    onSuccess: async (set) => {
      showToast({
        message: "Add prompts to it from Context Lab, where a resolution you have already looked at can be saved.",
        title: `Created ${set.name}`,
        variant: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["evaluation", "prompt-sets"] });
      onCreated(set);
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate();
  }

  return (
    <form className="mb-4 space-y-3 rounded-md border border-border bg-muted/30 p-4" noValidate onSubmit={submit}>
      <div>
        <label className="text-sm font-medium text-foreground" htmlFor={nameId}>
          Set name
        </label>
        <input
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id={nameId}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground" htmlFor={descriptionId}>
          What this set is for
        </label>
        <input
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id={descriptionId}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Read by somebody who did not write it."
          value={description}
        />
      </div>
      {create.isError ? (
        <RequestFailure onRetry={() => create.mutate()} title="The set could not be created">
          {create.error.message}
        </RequestFailure>
      ) : null}
      <Button disabled={create.isPending || !name.trim()} type="submit">
        {create.isPending ? "Creating…" : "Create set"}
      </Button>
    </form>
  );
}

interface RunListProps {
  client: ContextplaneClient;
  isLoading: boolean;
  onCompare: () => void;
  onOpen: (runId: string) => void;
  openRunId: string;
  promptCount: number;
  requestContext: ContextplaneRequestOptions;
  runs: readonly EvaluationRun[];
  set: PromptSet;
}

function RunList({
  client,
  isLoading,
  onCompare,
  onOpen,
  openRunId,
  promptCount,
  requestContext,
  runs,
  set,
}: RunListProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const run = useMutation({
    mutationFn: () => startRun(client, set.set_id, requestContext),
    onSuccess: async (started) => {
      showToast({
        message: "Every prompt was attempted. One that raised kept its row rather than being dropped.",
        title: `Resolved ${started.prompt_count} ${started.prompt_count === 1 ? "prompt" : "prompts"}`,
        variant: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["evaluation", "runs", set.set_id] });
      onOpen(started.run_id);
    },
  });

  return (
    <SectionSurface
      action={
        <span className="flex gap-2">
          {runs.length >= 2 ? (
            <Button onClick={onCompare} variant="secondary">
              <GitCompareArrows className="size-4" />
              Compare runs
            </Button>
          ) : null}
          <Button disabled={run.isPending || promptCount === 0} onClick={() => run.mutate()}>
            <Play className="size-4" />
            {run.isPending ? "Resolving…" : "Run set"}
          </Button>
        </span>
      }
      description={`Runs of ${set.name}, newest first. Headers only: a run's items load when you open it.`}
      title="Runs"
    >
      {promptCount === 0 ? (
        <Notice title="This set holds no prompts yet" variant="info">
          Add one from Context Lab, where a resolution you have already looked at can be saved into a set.
        </Notice>
      ) : null}

      {run.isError ? (
        <RequestFailure onRetry={() => run.mutate()} title="The run could not be started">
          {run.error.message}
        </RequestFailure>
      ) : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Reading runs…</p> : null}

      {!isLoading && runs.length === 0 ? (
        <EmptyState
          description="Running the set resolves every prompt once and keeps the receipts, so you can judge them and compare against the next run."
          icon={Play}
          title="This set has not been run"
        />
      ) : null}

      {runs.length > 0 ? (
        <ul className="divide-y divide-border">
          {runs.map((entry) => (
            <li className="py-3" key={entry.run_id}>
              <button
                aria-current={entry.run_id === openRunId ? "true" : undefined}
                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                onClick={() => onOpen(entry.run_id)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {formatEvaluationTimestamp(entry.started_at)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {entry.prompt_count} {entry.prompt_count === 1 ? "prompt" : "prompts"} · deployment{" "}
                    {formatFingerprint(entry.resolver_fingerprint)}
                  </span>
                </span>
                {entry.finished_at === null ? (
                  <StatusBadge tone="warning">In flight</StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">Finished</StatusBadge>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionSurface>
  );
}
