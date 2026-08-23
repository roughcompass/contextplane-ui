import { CheckCircle2, Link2, Plus, Search, Trash2, Users } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import {
  Button,
  Notice,
  RequestFailure,
  SearchableSelect,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  addIntentParticipant,
  appendIntentCheckpoint,
  getIntentCheckpoint,
  getIntentCheckpointByDigest,
  listIntentParticipants,
  removeIntentParticipant,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type IntentCheckpoint,
} from "../../shared/api";

interface TaskCoordinationPanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";

const participantRoleOptions = [
  { label: "Owner", value: "owner" },
  { label: "Contributor", value: "contributor" },
  { label: "Reader", value: "reader" },
  { label: "Auditor", value: "auditor" },
];

function commaValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function CheckpointCard({ checkpoint }: { checkpoint: IntentCheckpoint }) {
  return (
    <article
      aria-label={`Checkpoint ${checkpoint.checkpointId}`}
      className="rounded-lg border border-border bg-surface-muted p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
            Sequence {checkpoint.sequence}
          </p>
          <h4 className="mt-1 font-semibold text-foreground">{checkpoint.goal}</h4>
        </div>
        <StatusBadge tone="success">Recorded</StatusBadge>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted">Author</dt>
        <dd className="text-foreground">{checkpoint.author}</dd>
        <dt className="text-muted">Next action</dt>
        <dd className="text-foreground">{checkpoint.nextAction ?? "Not recorded"}</dd>
        <dt className="text-muted">Recorded</dt>
        <dd className="text-foreground">{checkpoint.recordedAt}</dd>
        <dt className="text-muted">Digest</dt>
        <dd className="break-all font-mono text-xs text-foreground">{checkpoint.digest}</dd>
        <dt className="text-muted">Checkpoint ID</dt>
        <dd className="break-all font-mono text-xs text-foreground">{checkpoint.checkpointId}</dd>
      </dl>
      {checkpoint.decisions.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted">Decisions</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
            {checkpoint.decisions.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {checkpoint.openQuestions.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted">Open questions</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
            {checkpoint.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function TaskCoordinationPanel({ client, requestContext }: TaskCoordinationPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const tenantKey = requestContext.tenantId ?? "credential-default";
  const [intentInput, setIntentInput] = useState("");
  const [intentId, setIntentId] = useState("");
  const [actorId, setActorId] = useState("");
  const [role, setRole] = useState("contributor");
  const [expiresAt, setExpiresAt] = useState("");
  const [removeActor, setRemoveActor] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [checks, setChecks] = useState("");
  const [decisions, setDecisions] = useState("");
  const [questions, setQuestions] = useState("");
  const [checkpointReceipt, setCheckpointReceipt] = useState<IntentCheckpoint | null>(null);
  const [lookupMode, setLookupMode] = useState<"digest" | "id">("id");
  const [checkpointId, setCheckpointId] = useState("");
  const [digest, setDigest] = useState("");

  const participantsKey = [
    "contextplane",
    tenantKey,
    "coordination",
    intentId,
    "participants",
  ] as const;
  const participants = useQuery({
    enabled: Boolean(intentId),
    queryFn: ({ signal }) => listIntentParticipants(client, intentId, requestContext, signal),
    queryKey: participantsKey,
  });
  const addMutation = useMutation({
    mutationFn: () =>
      addIntentParticipant(
        client,
        intentId,
        {
          actor_id: actorId.trim(),
          ...(expiresAt ? { expires_at: new Date(expiresAt).toISOString() } : {}),
          role,
        },
        requestContext,
      ),
    onSuccess: () => {
      setActorId("");
      setExpiresAt("");
      void queryClient.invalidateQueries({ queryKey: participantsKey });
      showToast({
        message: "The participant grant was added to this intent.",
        title: "Participant added",
        variant: "success",
      });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (participantId: string) =>
      removeIntentParticipant(client, intentId, participantId, requestContext),
    onSuccess: () => {
      setRemoveActor(null);
      void queryClient.invalidateQueries({ queryKey: participantsKey });
      showToast({
        message: "The participant grant was ended. Historical grant evidence remains available.",
        title: "Participant removed",
        variant: "success",
      });
    },
  });
  const appendMutation = useMutation({
    mutationFn: () =>
      appendIntentCheckpoint(
        client,
        intentId,
        {
          assumptions: commaValues(assumptions),
          completed_checks: commaValues(checks),
          decisions: commaValues(decisions),
          goal: goal.trim(),
          ...(nextAction.trim() ? { next_action: nextAction.trim() } : {}),
          open_questions: commaValues(questions),
        },
        requestContext,
      ),
    onSuccess: (checkpoint) => {
      setCheckpointReceipt(checkpoint);
      showToast({
        message: `Sequence ${checkpoint.sequence} was appended to the intent's durable chain.`,
        title: "Checkpoint recorded",
        variant: "success",
      });
    },
  });
  const lookupMutation = useMutation({
    mutationFn: () =>
      lookupMode === "digest"
        ? getIntentCheckpointByDigest(client, digest.trim(), requestContext)
        : getIntentCheckpoint(client, intentId, checkpointId.trim(), requestContext),
    onSuccess: setCheckpointReceipt,
  });

  function loadIntent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntentId(intentInput.trim());
    setCheckpointReceipt(null);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-start gap-3">
          <Link2 aria-hidden="true" className="mt-0.5 size-5 text-accent" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Select intent</h2>
            <p className="mt-1 text-sm text-muted">
              Participants and checkpoints are always scoped to one task intent.
            </p>
          </div>
        </div>
        <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={loadIntent}>
          <label className={`${labelClassName} flex-1`}>
            Intent UUID
            <input
              required
              className={inputClassName}
              onChange={(event) => setIntentInput(event.target.value)}
              value={intentInput}
            />
          </label>
          <Button type="submit">Load intent</Button>
        </form>
        {intentId ? (
          <p className="mt-4 break-all rounded-md bg-surface-muted p-3 font-mono text-xs text-muted">
            Active intent: {intentId}
          </p>
        ) : null}
      </section>

      {!intentId ? (
        <Notice title="Choose an intent to continue" variant="info">
          Loading an intent reveals its current participants and enables checkpoint workflows.
        </Notice>
      ) : (
        <>
          <section
            aria-labelledby="participants-title"
            className="rounded-xl border border-border bg-surface"
          >
            <div className="border-b border-border p-6">
              <div className="flex items-center gap-2">
                <Users aria-hidden="true" className="size-5 text-accent" />
                <h2 id="participants-title" className="text-lg font-semibold text-foreground">
                  Intent participants
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted">
                Active and expired grants remain visible so past access can be reconstructed.
              </p>
            </div>
            {participants.isPending ? (
              <div className="m-6 h-28 animate-pulse rounded-lg bg-surface-muted" role="status" />
            ) : participants.isError ? (
              <div className="p-6">
                <RequestFailure
                  onRetry={() => void participants.refetch()}
                  title="Participants unavailable"
                >
                  The current task grants could not be loaded.
                </RequestFailure>
              </div>
            ) : participants.data.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">
                No participant grant was reported.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {participants.data.map((participant) => (
                  <li key={`${participant.actorId}:${participant.grantedAt}`} className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium text-foreground">{participant.actorId}</h3>
                          <StatusBadge>{participant.role}</StatusBadge>
                          {participant.expiresAt ? (
                            <StatusBadge tone="warning">Expires</StatusBadge>
                          ) : (
                            <StatusBadge tone="success">Open-ended</StatusBadge>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted">
                          Granted by {participant.grantedBy} · {participant.grantedAt}
                          {participant.expiresAt ? ` · ends ${participant.expiresAt}` : ""}
                        </p>
                      </div>
                      {removeActor === participant.actorId ? (
                        <div className="rounded-md border border-danger/40 bg-danger-subtle p-3">
                          <p className="text-xs font-medium text-foreground">
                            End participation now?
                          </p>
                          <div className="mt-2 flex gap-2">
                            <Button
                              disabled={removeMutation.isPending}
                              onClick={() => removeMutation.mutate(participant.actorId)}
                              size="compact"
                              variant="danger"
                            >
                              Confirm remove
                            </Button>
                            <Button
                              onClick={() => setRemoveActor(null)}
                              size="compact"
                              variant="secondary"
                            >
                              Keep
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          aria-label={`Remove ${participant.actorId}`}
                          onClick={() => setRemoveActor(participant.actorId)}
                          size="icon"
                          title="Remove participant"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="border-t border-border bg-surface-muted p-6"
              onSubmit={(event) => {
                event.preventDefault();
                addMutation.mutate();
              }}
            >
              <h3 className="font-semibold text-foreground">Add participant</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className={labelClassName}>
                  Actor ID
                  <input
                    required
                    className={inputClassName}
                    onChange={(event) => setActorId(event.target.value)}
                    value={actorId}
                  />
                </label>
                <SearchableSelect
                  allowEmpty={false}
                  label="Role"
                  onValueChange={setRole}
                  options={participantRoleOptions}
                  value={role}
                />
                <label className={labelClassName}>
                  Expires at
                  <input
                    className={inputClassName}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    type="datetime-local"
                    value={expiresAt}
                  />
                </label>
              </div>
              {addMutation.isError ? (
                <p className="mt-3 text-sm text-danger">
                  The grant was not added. Entered values remain available.
                </p>
              ) : null}
              <div className="mt-4 flex justify-end">
                <Button disabled={addMutation.isPending} type="submit">
                  <Plus aria-hidden="true" className="size-4" />
                  {addMutation.isPending ? "Adding…" : "Add participant"}
                </Button>
              </div>
            </form>
          </section>

          <section
            aria-labelledby="append-checkpoint-title"
            className="rounded-xl border border-border bg-surface p-6"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 aria-hidden="true" className="size-5 text-accent" />
              <h2 id="append-checkpoint-title" className="text-lg font-semibold text-foreground">
                Append checkpoint
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted">
              Record one immutable step in the intent chain. The service assigns sequence, author,
              retention, predecessor, and digest.
            </p>
            <form
              className="mt-5 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                appendMutation.mutate();
              }}
            >
              <label className={labelClassName}>
                Goal
                <input
                  required
                  className={inputClassName}
                  onChange={(event) => setGoal(event.target.value)}
                  value={goal}
                />
              </label>
              <label className={labelClassName}>
                Next action
                <input
                  className={inputClassName}
                  onChange={(event) => setNextAction(event.target.value)}
                  value={nextAction}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClassName}>
                  Assumptions<span className="mt-1 block font-normal">Comma-separated</span>
                  <textarea
                    className={`${inputClassName} min-h-24 resize-y`}
                    onChange={(event) => setAssumptions(event.target.value)}
                    value={assumptions}
                  />
                </label>
                <label className={labelClassName}>
                  Completed checks<span className="mt-1 block font-normal">Comma-separated</span>
                  <textarea
                    className={`${inputClassName} min-h-24 resize-y`}
                    onChange={(event) => setChecks(event.target.value)}
                    value={checks}
                  />
                </label>
                <label className={labelClassName}>
                  Decisions<span className="mt-1 block font-normal">Comma-separated</span>
                  <textarea
                    className={`${inputClassName} min-h-24 resize-y`}
                    onChange={(event) => setDecisions(event.target.value)}
                    value={decisions}
                  />
                </label>
                <label className={labelClassName}>
                  Open questions<span className="mt-1 block font-normal">Comma-separated</span>
                  <textarea
                    className={`${inputClassName} min-h-24 resize-y`}
                    onChange={(event) => setQuestions(event.target.value)}
                    value={questions}
                  />
                </label>
              </div>
              {appendMutation.isError ? (
                <Notice title="Checkpoint was not appended" variant="danger">
                  The current chain remains unchanged. Entered checkpoint content is preserved.
                </Notice>
              ) : null}
              <div className="flex justify-end">
                <Button disabled={appendMutation.isPending} type="submit">
                  {appendMutation.isPending ? "Appending…" : "Append checkpoint"}
                </Button>
              </div>
            </form>
          </section>

          <section
            aria-labelledby="checkpoint-lookup-title"
            className="rounded-xl border border-border bg-surface p-6"
          >
            <div className="flex items-center gap-2">
              <Search aria-hidden="true" className="size-5 text-accent" />
              <h2 id="checkpoint-lookup-title" className="text-lg font-semibold text-foreground">
                Retrieve checkpoint evidence
              </h2>
            </div>
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                lookupMutation.mutate();
              }}
            >
              <fieldset>
                <legend className="text-xs font-medium text-muted">Lookup method</legend>
                <div className="mt-2 flex gap-4 text-sm text-foreground">
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      checked={lookupMode === "id"}
                      name="checkpoint-mode"
                      onChange={() => setLookupMode("id")}
                      type="radio"
                    />
                    Checkpoint ID
                  </label>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      checked={lookupMode === "digest"}
                      name="checkpoint-mode"
                      onChange={() => setLookupMode("digest")}
                      type="radio"
                    />
                    Digest
                  </label>
                </div>
              </fieldset>
              {lookupMode === "id" ? (
                <label className={labelClassName}>
                  Checkpoint UUID
                  <input
                    required
                    className={inputClassName}
                    onChange={(event) => setCheckpointId(event.target.value)}
                    value={checkpointId}
                  />
                </label>
              ) : (
                <label className={labelClassName}>
                  Content digest
                  <input
                    required
                    className={inputClassName}
                    onChange={(event) => setDigest(event.target.value)}
                    value={digest}
                  />
                </label>
              )}
              {lookupMutation.isError ? (
                <p className="text-sm text-danger">
                  No visible checkpoint could be resolved from this address.
                </p>
              ) : null}
              <div className="flex justify-end">
                <Button disabled={lookupMutation.isPending} type="submit" variant="secondary">
                  Retrieve checkpoint
                </Button>
              </div>
            </form>
            {checkpointReceipt ? (
              <div className="mt-5">
                <CheckpointCard checkpoint={checkpointReceipt} />
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
