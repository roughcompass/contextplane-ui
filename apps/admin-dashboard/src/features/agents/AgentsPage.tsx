import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Controller, useForm } from "react-hook-form";

import { EmptyState, PageContainer, PageHeader, SummaryStrip, TableSection } from "@repo/ui/layouts";
import {
  Button,
  Notice,
  RequestFailure,
  SearchableSelect,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  activateAgentInstruction,
  getAgentAccuracy,
  getAgentAutonomy,
  getAgentFailurePatterns,
  listAgentInstructions,
  proposeAgentInstruction,
  rollbackAgentInstruction,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import {
  activatableInstructions,
  activeInstruction,
  canRollback,
  formatBasis,
  formatRate,
  groupKey,
  localInputValue,
  nextInstructionVersion,
  rankedFailureGroups,
  toWindowInstant,
  windowStartDefault,
} from "./agentsModel";

interface AgentsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

interface ProposalFormValues {
  content: string;
  motivatedByReportId: string;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

const DEFAULT_WINDOW_DAYS = 30;

export function AgentsPage({ activeTenantName, apiTenantId, client }: AgentsPageProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const requestContext: ContextplaneRequestOptions = apiTenantId ? { tenantId: apiTenantId } : {};
  const tenantKey = apiTenantId ?? "credential-default";

  const [actorInput, setActorInput] = useState("");
  const [actorId, setActorId] = useState("");
  const [now] = useState(() => new Date());
  const [windowStart, setWindowStart] = useState(() =>
    windowStartDefault(now, DEFAULT_WINDOW_DAYS),
  );
  const [windowEnd, setWindowEnd] = useState(() => localInputValue(now));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rollbackArmed, setRollbackArmed] = useState(false);

  const windowParameters = {
    windowEnd: toWindowInstant(windowEnd),
    windowStart: toWindowInstant(windowStart),
  };
  const enabled = actorId !== "";
  const windowKey = [windowParameters.windowStart, windowParameters.windowEnd];

  const accuracyQuery = useQuery({
    enabled,
    queryFn: () =>
      getAgentAccuracy(
        client,
        actorId,
        { ...windowParameters, breakdown: "predicate" },
        requestContext,
      ),
    queryKey: ["agent-accuracy", tenantKey, actorId, ...windowKey],
  });
  const autonomyQuery = useQuery({
    enabled,
    queryFn: () => getAgentAutonomy(client, actorId, windowParameters, requestContext),
    queryKey: ["agent-autonomy", tenantKey, actorId, ...windowKey],
  });
  const failureQuery = useQuery({
    enabled,
    queryFn: () => getAgentFailurePatterns(client, actorId, windowParameters, requestContext),
    queryKey: ["agent-failures", tenantKey, actorId, ...windowKey],
  });
  const instructionsQuery = useQuery({
    enabled,
    queryFn: () => listAgentInstructions(client, actorId, requestContext),
    queryKey: ["agent-instructions", tenantKey, actorId],
  });

  const instructions = instructionsQuery.data ?? [];
  const inForce = activeInstruction(instructions);
  const activatable = activatableInstructions(instructions);

  // The report this proposal cites. Selected from the agent's own reports
  // rather than typed, which makes the server's "must cite evidence" CHECK a
  // thing the form cannot violate rather than a thing it reports afterwards.
  const proposalForm = useForm<ProposalFormValues>({
    defaultValues: { content: "", motivatedByReportId: "" },
  });
  const contentError = proposalForm.formState.errors.content;
  const reportError = proposalForm.formState.errors.motivatedByReportId;

  // The reports this agent actually has. Free-text entry is what the server's
  // "must cite evidence" CHECK exists to refuse; offering only real reports
  // makes that refusal unreachable from the UI rather than merely reported.
  const reportOptions = failureQuery.data
    ? [
        {
          label: `${failureQuery.data.report_id} · ${failureQuery.data.n_incorrect} incorrect of ${failureQuery.data.n_adjudicated}`,
          value: failureQuery.data.report_id,
        },
      ]
    : [];

  function invalidateInstructions() {
    void queryClient.invalidateQueries({
      queryKey: ["agent-instructions", tenantKey, actorId],
    });
  }

  const proposeMutation = useMutation({
    mutationFn: (values: ProposalFormValues) =>
      proposeAgentInstruction(
        client,
        actorId,
        {
          content: values.content,
          motivated_by_report_id: values.motivatedByReportId,
          version: nextInstructionVersion(instructions),
        },
        requestContext,
      ),
    onSuccess: () => {
      showToast({ title: "Instruction proposed", variant: "success" });
      proposalForm.reset({ content: "", motivatedByReportId: "" });
      invalidateInstructions();
    },
  });

  const activateMutation = useMutation({
    mutationFn: (instructionId: string) =>
      activateAgentInstruction(client, actorId, instructionId, requestContext),
    onSuccess: () => {
      showToast({ title: "Instruction activated", variant: "success" });
      invalidateInstructions();
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: () => rollbackAgentInstruction(client, actorId, requestContext),
    onSuccess: (restored) => {
      showToast({
        title: restored ? "Rolled back to the previous instruction" : "Nothing to roll back to",
        variant: restored ? "success" : "info",
      });
      setRollbackArmed(false);
      invalidateInstructions();
    },
  });

  function loadAgent(event: FormEvent) {
    event.preventDefault();
    setActorId(actorInput.trim());
    setExpanded(null);
    setRollbackArmed(false);
  }

  const summaryItems = [
    {
      detail: accuracyQuery.data
        ? formatBasis(accuracyQuery.data.overall.n_correct, accuracyQuery.data.overall.n_decided)
        : "Load an agent",
      id: "accuracy",
      label: "Accuracy",
      value: accuracyQuery.data ? formatRate(accuracyQuery.data.overall.rate) : "—",
    },
    {
      detail: autonomyQuery.data
        ? formatBasis(autonomyQuery.data.n_autonomous, autonomyQuery.data.n_sessions)
        : "Load an agent",
      id: "autonomy",
      label: "Autonomy",
      value: autonomyQuery.data ? formatRate(autonomyQuery.data.autonomy_rate) : "—",
    },
    {
      detail: "Sessions a human corrected mid-run",
      id: "intervened",
      label: "Interventions",
      value: autonomyQuery.data ? String(autonomyQuery.data.n_intervened) : "—",
    },
    {
      detail: "Claims a reviewer decided",
      id: "adjudicated",
      label: "Adjudicated",
      value: accuracyQuery.data ? String(accuracyQuery.data.overall.n_adjudicated) : "—",
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Agents" }]}
        description="How one agent principal is doing, and the instruction in force for it. Accuracy and autonomy are two dimensions of one question — an agent can be accurate but needy, or fast and wrong, and those need different fixes."
        eyebrow="Monitor"
        title="Agent performance"
      />

      <form className="rounded-lg border border-border bg-surface p-4" onSubmit={loadAgent}>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs font-medium text-muted md:col-span-2" htmlFor="agent-actor">
            Agent actor UUID
            <input
              className={inputClassName}
              id="agent-actor"
              onChange={(event) => setActorInput(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              value={actorInput}
            />
          </label>
          <label className="text-xs font-medium text-muted" htmlFor="agent-window-start">
            Window start
            <input
              className={inputClassName}
              id="agent-window-start"
              onChange={(event) => setWindowStart(event.target.value)}
              type="datetime-local"
              value={windowStart}
            />
          </label>
          <label className="text-xs font-medium text-muted" htmlFor="agent-window-end">
            Window end
            <input
              className={inputClassName}
              id="agent-window-end"
              onChange={(event) => setWindowEnd(event.target.value)}
              type="datetime-local"
              value={windowEnd}
            />
          </label>
        </div>
        <div className="mt-3">
          <Button type="submit">Load agent</Button>
        </div>
      </form>

      {enabled ? null : (
        <Notice title="Choose an agent to continue" variant="info">
          Every figure below is scoped to one agent principal and one time window.
        </Notice>
      )}

      <SummaryStrip items={summaryItems} label="Agent performance summary" />

      {accuracyQuery.isError ? (
        <RequestFailure
          onRetry={() => void accuracyQuery.refetch()}
          title="Accuracy unavailable"
        >
          The adjudicated record for this agent could not be loaded.
        </RequestFailure>
      ) : null}
      {autonomyQuery.isError ? (
        <RequestFailure
          onRetry={() => void autonomyQuery.refetch()}
          title="Autonomy unavailable"
        >
          Session intervention counts could not be loaded.
        </RequestFailure>
      ) : null}

      <TableSection
        description="One row per predicate the reviewer decided on. A rate of “Not measured” means nothing was decided, which is not the same as being wrong."
        title="Accuracy by predicate"
      >
        {accuracyQuery.data && accuracyQuery.data.groups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Adjudicated accuracy by predicate</caption>
              <thead>
                <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                  <th className="px-6 py-3 font-medium" scope="col">
                    Predicate
                  </th>
                  <th className="px-4 py-3 text-right font-medium" scope="col">
                    Correct
                  </th>
                  <th className="px-4 py-3 text-right font-medium" scope="col">
                    Incorrect
                  </th>
                  <th className="px-4 py-3 text-right font-medium" scope="col">
                    Undecidable
                  </th>
                  <th className="px-6 py-3 text-right font-medium" scope="col">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {accuracyQuery.data.groups.map((entry) => (
                  <tr key={entry.label}>
                    <th className="px-6 py-3 font-medium text-foreground" scope="row">
                      {entry.label}
                    </th>
                    <td className="px-4 py-3 text-right">{entry.n_correct}</td>
                    <td className="px-4 py-3 text-right">{entry.n_incorrect}</td>
                    <td className="px-4 py-3 text-right">{entry.n_undecidable}</td>
                    <td className="px-6 py-3 text-right">{formatRate(entry.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            description="No claim by this agent was adjudicated in this window."
            title="Nothing decided yet"
          />
        )}
      </TableSection>

      <TableSection
        description="Ranked by failure rate rather than by volume: a predicate used constantly and mostly got right leads on raw count alone, and is not the one to fix."
        title="Failure patterns"
      >
        {failureQuery.isError ? (
          <RequestFailure
            onRetry={() => void failureQuery.refetch()}
            title="Failure patterns unavailable"
          >
            The grouped failure report could not be loaded.
          </RequestFailure>
        ) : failureQuery.data && failureQuery.data.groups.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {rankedFailureGroups(failureQuery.data.groups).map((entry) => {
              const key = groupKey(entry);
              const open = expanded === key;
              return (
                <li key={key} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{entry.predicate}</p>
                      <p className="mt-1 text-xs text-muted">
                        {entry.claim_category} · {formatBasis(entry.incorrect_count, entry.total_count)}{" "}
                        incorrect
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge tone={entry.rate !== null && entry.rate >= 0.5 ? "danger" : "warning"}>
                        {formatRate(entry.rate)}
                      </StatusBadge>
                      <Button
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : key)}
                        size="compact"
                        variant="secondary"
                      >
                        {open ? "Hide examples" : `Examples (${entry.examples.length})`}
                      </Button>
                    </div>
                  </div>
                  {open ? (
                    entry.examples.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {entry.examples.map((example) => (
                          <li
                            key={example.claim_id}
                            className="rounded-md border border-border-subtle bg-surface-muted p-3 text-xs"
                          >
                            <p className="font-mono text-subtle">{example.claim_id}</p>
                            <p className="mt-1 text-foreground">{String(example.value ?? "—")}</p>
                            {example.note ? (
                              <p className="mt-1 text-muted">{example.note}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs text-muted">
                        This group carried no example claims.
                      </p>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            description="No adjudicated failure was grouped for this agent in this window."
            title="No failure pattern"
          />
        )}
      </TableSection>

      <TableSection
        description="One instruction is in force at a time. A proposal must cite a failure-pattern report, which is why the report is chosen from this agent's own reports rather than typed."
        title="Instruction lifecycle"
      >
        <div className="space-y-4 px-6 py-4">
          {instructionsQuery.isError ? (
            <RequestFailure
              onRetry={() => void instructionsQuery.refetch()}
              title="Instructions unavailable"
            >
              This agent's instruction history could not be loaded.
            </RequestFailure>
          ) : null}

          {inForce ? (
            <section className="rounded-md border border-accent/30 bg-accent-subtle p-4">
              <div className="flex items-center gap-2">
                <Bot aria-hidden="true" className="size-4 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">
                  Version {inForce.version} is in force
                </h3>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{inForce.content}</p>
              <p className="mt-2 text-xs text-muted">
                Activated {inForce.activated_at ?? "at an unrecorded time"}
                {inForce.motivated_by_report_id
                  ? ` · cites report ${inForce.motivated_by_report_id}`
                  : ""}
              </p>
            </section>
          ) : enabled && !instructionsQuery.isLoading ? (
            <EmptyState
              description="This agent runs on its base prompt until one is activated."
              title="No instruction in force"
            />
          ) : null}

          <form
            className="rounded-md border border-border p-4"
            onSubmit={proposalForm.handleSubmit((values) => proposeMutation.mutate(values))}
          >
            <h3 className="text-sm font-semibold text-foreground">Propose a version</h3>
            <div className="mt-3">
              <Controller
                control={proposalForm.control}
                name="motivatedByReportId"
                render={({ field }) => (
                  <SearchableSelect
                    emptyLabel="Select a report…"
                    label="Motivating failure report"
                    onValueChange={field.onChange}
                    options={reportOptions}
                    value={field.value}
                  />
                )}
                rules={{ required: "Choose the report this instruction answers." }}
              />
            </div>
            {reportError ? (
              <p className="mt-1 text-xs text-danger" id="proposal-report-error" role="alert">
                {reportError.message}
              </p>
            ) : null}

            <label className="mt-3 block text-xs font-medium text-muted" htmlFor="proposal-content">
              Instruction
              <textarea
                aria-describedby={contentError ? "proposal-content-error" : undefined}
                aria-invalid={contentError ? true : undefined}
                className={`${inputClassName} min-h-24`}
                id="proposal-content"
                {...proposalForm.register("content", {
                  required: "An instruction needs content.",
                })}
              />
            </label>
            {contentError ? (
              <p className="mt-1 text-xs text-danger" id="proposal-content-error">
                {contentError.message}
              </p>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <Button disabled={proposeMutation.isPending} type="submit">
                {proposeMutation.isPending ? (
                  <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
                ) : null}
                Propose version {nextInstructionVersion(instructions)}
              </Button>
            </div>
          </form>

          {activatable.length > 0 ? (
            <section className="rounded-md border border-border p-4">
              <h3 className="text-sm font-semibold text-foreground">Awaiting activation</h3>
              <ul className="mt-3 space-y-2">
                {activatable.map((candidate) => (
                  <li
                    key={candidate.instruction_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Version {candidate.version}
                      </p>
                      <p className="mt-1 text-xs text-muted">{candidate.content}</p>
                    </div>
                    <Button
                      disabled={activateMutation.isPending}
                      onClick={() => activateMutation.mutate(candidate.instruction_id)}
                      size="compact"
                    >
                      Activate
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {canRollback(instructions) ? (
            <section className="rounded-md border border-danger/40 p-4">
              <h3 className="text-sm font-semibold text-foreground">Roll back</h3>
              <p className="mt-1 text-xs text-muted">
                Restores the instruction that was in force before this one. This changes live agent
                behaviour, and rolling forward again is a new activation rather than an undo.
              </p>
              {rollbackArmed ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    disabled={rollbackMutation.isPending}
                    onClick={() => rollbackMutation.mutate()}
                    size="compact"
                    variant="danger"
                  >
                    Confirm rollback
                  </Button>
                  <Button onClick={() => setRollbackArmed(false)} size="compact" variant="secondary">
                    Keep current
                  </Button>
                </div>
              ) : (
                <div className="mt-3">
                  <Button onClick={() => setRollbackArmed(true)} size="compact" variant="secondary">
                    Roll back…
                  </Button>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </TableSection>
    </PageContainer>
  );
}
