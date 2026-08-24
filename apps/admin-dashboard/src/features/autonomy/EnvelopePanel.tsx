import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PauseCircle, RefreshCw, ShieldOff } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { EmptyState, SectionSurface } from "@repo/ui/layouts";
import {
  Button,
  Notice,
  RequestFailure,
  ResourcePicker,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  actOnEnvelope,
  grantEnvelope,
  resolveEnvelope,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type EnvelopeAct,
} from "../../shared/api";
import { revisionSource } from "../../shared/pickers/sources";
import {
  ageInSeconds,
  availableActs,
  formatAge,
  governedByADeadRevision,
  posture,
} from "./envelopeModel";

interface EnvelopePanelProps {
  apiTenantId?: string;
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

const ACT_COPY: Readonly<
  Record<EnvelopeAct, { confirm: string; done: string; keep: string; label: string; note: string }>
> = {
  reinstate: {
    confirm: "Put this envelope back in force?",
    done: "Envelope reinstated",
    keep: "Leave suspended",
    label: "Reinstate this envelope",
    note: "The principal can act under this envelope again from the moment this commits.",
  },
  revoke: {
    confirm: "End this binding for good?",
    done: "Envelope revoked",
    keep: "Keep the binding",
    label: "Revoke this binding",
    note: "This closes the interval rather than switching the envelope off. Nothing reinstates a revoked binding — governing this principal again means granting a new one.",
  },
  suspend: {
    confirm: "Suspend this envelope now?",
    done: "Envelope suspended",
    keep: "Leave in force",
    label: "Suspend this envelope",
    note: "Nothing the principal begins after this commits is authorised by the envelope, on any replica. Reinstating is one action away, and it is on this screen.",
  },
};

const TONE: Readonly<Record<string, "success" | "warning" | "danger" | "neutral">> = {
  ended: "neutral",
  "in-force": "success",
  suspended: "warning",
  ungoverned: "danger",
};

export function EnvelopePanel({ apiTenantId, client, requestContext }: EnvelopePanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [issuerInput, setIssuerInput] = useState("");
  const [subjectInput, setSubjectInput] = useState("");
  const [principal, setPrincipal] = useState<{ issuer: string; subject: string } | null>(null);
  const [pendingAct, setPendingAct] = useState<EnvelopeAct | null>(null);
  const [reason, setReason] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [now, setNow] = useState(() => new Date());

  const revisions = useMemo(
    () => revisionSource(client, apiTenantId ? { tenantId: apiTenantId } : {}, { lifecycleState: "active" }),
    [apiTenantId, client],
  );

  const tenantKey = apiTenantId ?? "credential-default";
  const bindingQuery = useQuery({
    enabled: principal !== null,
    queryFn: () => resolveEnvelope(client, principal!, {}, requestContext),
    queryKey: ["envelope", tenantKey, principal?.issuer, principal?.subject],
  });

  // `dataUpdatedAt` is when this answer came back, not when the component
  // rendered. The distinction is the whole point of the staleness notice: a
  // re-render for an unrelated reason must not make a five-minute-old reading
  // look fresh.
  const readAt = bindingQuery.dataUpdatedAt > 0 ? new Date(bindingQuery.dataUpdatedAt) : null;
  const binding = bindingQuery.data ?? null;
  const state = posture(binding);
  const acts = availableActs(state);

  function refresh() {
    setNow(new Date());
    void bindingQuery.refetch();
  }

  const actMutation = useMutation({
    mutationFn: (act: EnvelopeAct) =>
      actOnEnvelope(client, binding!.binding_id, act, reason.trim(), requestContext),
    onSuccess: (_result, act) => {
      showToast({ title: ACT_COPY[act].done, variant: "success" });
      setPendingAct(null);
      setReason("");
      setNow(new Date());
      void queryClient.invalidateQueries({ queryKey: ["envelope", tenantKey] });
    },
  });

  const grantMutation = useMutation({
    mutationFn: () =>
      grantEnvelope(
        client,
        {
          issuer: principal!.issuer,
          reason: grantReason.trim(),
          revision_id: revisionId,
          subject: principal!.subject,
        },
        requestContext,
      ),
    onSuccess: () => {
      showToast({ title: "Envelope granted", variant: "success" });
      setRevisionId("");
      setGrantReason("");
      setNow(new Date());
      void queryClient.invalidateQueries({ queryKey: ["envelope", tenantKey] });
    },
  });

  function load(event: FormEvent) {
    event.preventDefault();
    const issuer = issuerInput.trim();
    const subject = subjectInput.trim();
    if (issuer === "" || subject === "") return;
    setPrincipal({ issuer, subject });
    setPendingAct(null);
    setReason("");
    setNow(new Date());
  }

  return (
    <div className="space-y-6">
      <SectionSurface
        description="An envelope is the control that decides what an agent may do. Look one up by the identity its own provider issued it."
        title="Find a principal's envelope"
      >
        <form className="space-y-3 px-6 py-4" onSubmit={load}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-muted" htmlFor="envelope-issuer">
              Issuer
              <input
                className={inputClassName}
                id="envelope-issuer"
                onChange={(event) => setIssuerInput(event.target.value)}
                placeholder="https://idp.example.com"
                value={issuerInput}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="envelope-subject">
              Subject
              {/* The agent's own IdP issued this subject, this service never
                  assigned it, and there is no collection of workload identities to
                  enumerate — a picker here would be a dropdown that is always empty.
                  identifier-exception: external-id */}
              <input
                className={inputClassName}
                id="envelope-subject"
                onChange={(event) => setSubjectInput(event.target.value)}
                placeholder="agent-planner-7"
                value={subjectInput}
              />
            </label>
          </div>
          {/* ADR 0018 says a server-assigned identifier is chosen, never typed.
              This pair is the exception the ADR names: it comes from the agent's
              own provider, this service never assigned it, and there is no
              collection to enumerate. Saying so beats leaving a reader to wonder
              where the dropdown went. */}
          <p className="text-xs text-muted">
            Both halves come from the agent&rsquo;s own identity provider, so there is no list to
            choose from. They are matched as a pair — the same subject under a different issuer is a
            different principal.
          </p>
          <Button disabled={issuerInput.trim() === "" || subjectInput.trim() === ""} type="submit">
            Look up envelope
          </Button>
        </form>
      </SectionSurface>

      {bindingQuery.isError ? (
        <RequestFailure onRetry={refresh} title="Envelope unavailable">
          This principal&rsquo;s envelope could not be read. It has <strong>not</strong> been shown
          as ungoverned — an unanswered request and a principal nobody governs are different
          answers, and only one of them means there is nothing holding this agent back.
        </RequestFailure>
      ) : null}

      {principal !== null && !bindingQuery.isError && !bindingQuery.isPending ? (
        <SectionSurface
          description={`${principal.subject} at ${principal.issuer}`}
          title="Current posture"
        >
          <div className="space-y-4 px-6 py-4">
            {/* The reading is point-in-time, and this says so. Somebody else can
                suspend or revoke between the read and the act, so an operator
                acting on a stale posture is the same failure the quarantine
                preview's notice guards against. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge tone={TONE[state] ?? "neutral"}>
                {state === "ungoverned"
                  ? "No envelope"
                  : state === "in-force"
                    ? "In force"
                    : state === "suspended"
                      ? "Suspended"
                      : "Ended"}
              </StatusBadge>
              <p className="text-xs text-muted">
                Read {readAt ? formatAge(ageInSeconds(readAt, now)) : "just now"}. Someone else can
                change this between the reading and your action.{" "}
                <button
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={refresh}
                  type="button"
                >
                  Re-read
                </button>
              </p>
            </div>

            {state === "ungoverned" ? (
              <EmptyState
                description="No envelope covers this principal right now. That is not the same as a suspended one: nobody has governed this agent, so nothing here is holding it back."
                title="This principal is ungoverned"
              />
            ) : null}

            {binding !== null ? (
              <dl className="grid gap-4 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted">Binding</dt>
                  <dd className="mt-1 font-mono text-xs text-foreground">{binding.binding_id}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Governing revision</dt>
                  <dd className="mt-1 font-mono text-xs text-foreground">
                    {binding.revision_id}{" "}
                    <StatusBadge
                      tone={binding.revision_lifecycle_state === "active" ? "success" : "warning"}
                    >
                      {binding.revision_lifecycle_state}
                    </StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">In force since</dt>
                  <dd className="mt-1 text-foreground">{binding.effective_from}</dd>
                </div>
                {binding.suspended_at !== null ? (
                  <div>
                    <dt className="text-xs font-medium text-muted">Suspended at</dt>
                    <dd className="mt-1 text-foreground">
                      {binding.suspended_at}
                      {binding.suspension_reason ? ` — ${binding.suspension_reason}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : null}

            {governedByADeadRevision(binding) ? (
              <Notice title="In force against a revision that is not" variant="warning">
                A binding is only checked for an active revision when it is granted, so this agent
                is being governed by a document somebody has since moved on from. Granting a new
                envelope replaces it; suspending stops it.
              </Notice>
            ) : null}

            {state === "ended" ? (
              <Notice title="This binding was revoked" variant="info">
                Its interval is closed, and nothing reinstates it. Governing this principal again
                means granting a new envelope.
              </Notice>
            ) : null}

            {/* Reinstate sits beside suspend as a peer, for E10-T1's reason
                carried over verbatim: an operator who cannot see the way back
                will not run the control on a real incident. */}
            {acts.length > 0 && pendingAct === null ? (
              <div className="flex flex-wrap gap-2">
                {acts.map((act) => (
                  <Button
                    key={act}
                    onClick={() => {
                      setPendingAct(act);
                      setReason("");
                    }}
                    variant={act === "reinstate" ? "primary" : "danger"}
                  >
                    {act === "suspend" ? (
                      <PauseCircle aria-hidden="true" className="size-4" />
                    ) : act === "revoke" ? (
                      <ShieldOff aria-hidden="true" className="size-4" />
                    ) : (
                      <RefreshCw aria-hidden="true" className="size-4" />
                    )}
                    {ACT_COPY[act].label}
                  </Button>
                ))}
              </div>
            ) : null}

            {pendingAct !== null ? (
              <form
                className="space-y-3 rounded-md border border-border p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (reason.trim() !== "") actMutation.mutate(pendingAct);
                }}
              >
                <p className="text-xs font-medium text-foreground">{ACT_COPY[pendingAct].confirm}</p>
                <p className="text-xs text-muted">{ACT_COPY[pendingAct].note}</p>
                <label className="block text-xs font-medium text-muted" htmlFor="envelope-reason">
                  Why
                  <input
                    className={inputClassName}
                    id="envelope-reason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Incident 4412 — the planner is asserting ownership it cannot substantiate."
                    value={reason}
                  />
                </label>
                <p className="text-xs text-muted">
                  Required. A binding switched off with no stated reason leaves the next reader
                  working out why an agent stopped being able to act, during the incident where that
                  matters most.
                </p>
                <div className="flex gap-2">
                  <Button
                    disabled={reason.trim() === "" || actMutation.isPending}
                    type="submit"
                    variant={pendingAct === "reinstate" ? "primary" : "danger"}
                  >
                    Confirm {pendingAct}
                  </Button>
                  <Button onClick={() => setPendingAct(null)} type="button" variant="secondary">
                    {ACT_COPY[pendingAct].keep}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </SectionSurface>
      ) : null}

      {principal !== null && !bindingQuery.isError && state !== "in-force" && state !== "suspended" ? (
        <SectionSurface
          description="Bind this principal to a governance revision. Only revisions that are in force are offered — governing an agent by a superseded document is how a binding outlives the policy behind it."
          title="Grant an envelope"
        >
          <form
            className="space-y-3 px-6 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (revisionId !== "" && grantReason.trim() !== "") grantMutation.mutate();
            }}
          >
            <ResourcePicker
              label="Governing revision"
              load={revisions}
              onValueChange={setRevisionId}
              searchPlaceholder="Search revisions by artifact"
              value={revisionId}
            />
            <label className="block text-xs font-medium text-muted" htmlFor="envelope-grant-reason">
              Why
              <input
                className={inputClassName}
                id="envelope-grant-reason"
                onChange={(event) => setGrantReason(event.target.value)}
                placeholder="Planner agent enrolled for the ownership backfill."
                value={grantReason}
              />
            </label>
            <Button
              disabled={revisionId === "" || grantReason.trim() === "" || grantMutation.isPending}
              type="submit"
            >
              Grant envelope
            </Button>
          </form>
        </SectionSurface>
      ) : null}
    </div>
  );
}
