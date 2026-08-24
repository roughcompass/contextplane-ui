import { useQuery } from "@tanstack/react-query";
import { Inbox, Scale } from "lucide-react";

import { EmptyState, SectionSurface } from "@repo/ui/layouts";
import { Notice, RequestFailure, Skeleton, StatusBadge } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  listDispositionPolicies,
  listMemoryCurationQueue,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type DispositionPolicy,
  type MemoryCurationItem,
} from "../../shared/api";

import {
  ORDERING_STATEMENT,
  consequencesOf,
  dispositionLabel,
  groupDispositions,
  rankReasons,
} from "./curationModel";

interface CurationCockpitPanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
  tenantKey: string;
}

/**
 * What a reviewer is committing to, shown before they commit to it.
 *
 * The six dispositions carry five different approval authorities, evidence
 * bars, blast radiuses and rollback stories, and the service is the only place
 * that knows them. This screen reads them; it does not restate them, because a
 * client copy of a governance rule diverges silently the first time a policy
 * changes.
 */
export function CurationCockpitPanel({
  client,
  requestContext,
  tenantKey,
}: CurationCockpitPanelProps) {
  const policies = useQuery({
    queryFn: ({ signal }) => listDispositionPolicies(client, requestContext, signal),
    queryKey: ["contextplane", tenantKey, "memory", "disposition-policies"],
  });

  const queue = useQuery({
    queryFn: ({ signal }) =>
      listMemoryCurationQueue(client, { pageSize: 25 }, requestContext, signal),
    queryKey: ["contextplane", tenantKey, "memory", "cockpit-queue"],
  });

  const grouped = policies.data ? groupDispositions(policies.data.items) : undefined;

  return (
    <div className="space-y-6">
      <Notice title="What orders this queue, and what it does not weigh">
        {ORDERING_STATEMENT}
      </Notice>

      <SectionSurface
        description="The service ranks this queue and publishes the terms it ranked on. Each row says which of them put it where it is."
        title="What is waiting, and why it is where it is"
      >
        {queue.isPending ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : queue.isError ? (
          <div className="p-6">
            <CockpitFailure error={queue.error} onRetry={() => void queue.refetch()} />
          </div>
        ) : (queue.data?.items.length ?? 0) > 0 ? (
          <RankedQueue items={queue.data?.items ?? []} />
        ) : (
          <EmptyState
            description="Nothing is waiting for curator attention in this tenant. This does not imply that no contested or unlinked claims exist outside the current scope."
            icon={Inbox}
            title="Nothing waiting"
          />
        )}
      </SectionSurface>

      <SectionSurface
        description="Every disposition commits to an approver, an evidence bar, a blast radius, and a way back. The service publishes them; this screen does not restate them."
        title="What each decision commits to"
      >
        {policies.isPending ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ) : policies.isError ? (
          <div className="p-6">
            <CockpitFailure error={policies.error} onRetry={() => void policies.refetch()} />
          </div>
        ) : grouped && grouped.settles.length + grouped.proposes.length > 0 ? (
          <div className="space-y-8 p-6">
            <DispositionGroup
              caption="Settle the disagreement on the curator's own authority. Nothing outside curation is asked for a write."
              policies={grouped.settles}
              title="Decisions a curator makes"
            />
            <DispositionGroup
              caption="Ask an approver outside curation to write something. The approver, the evidence and the rollback differ for each — the one that reaches every agent is not the one that edits a row."
              policies={grouped.proposes}
              title="Decisions a curator proposes"
            />
          </div>
        ) : (
          <EmptyState
            description="The service published no disposition vocabulary. Until it does, this screen cannot say what any decision commits to, and taking one on trust is the thing it exists to prevent."
            icon={Scale}
            title="No disposition vocabulary"
          />
        )}
      </SectionSurface>
    </div>
  );
}

/**
 * A failure this screen can be honest about.
 *
 * The two things it loads fail for different reasons and a reviewer's next step
 * differs: a queue this identity cannot read is an access question, and a
 * vocabulary the deployment does not publish means the screen cannot say what a
 * decision commits to — which is a reason to stop, not to guess.
 */
function CockpitFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const apiError = error instanceof ContextplaneApiError ? error : null;
  const restricted = apiError?.status === 403 || apiError?.code === "unauthenticated";
  return (
    <RequestFailure
      onRetry={onRetry}
      requestId={apiError?.requestId ?? null}
      title={
        restricted ? "This review scope is restricted" : "The review queue could not be loaded"
      }
      variant={restricted ? "warning" : "danger"}
    >
      {restricted
        ? "The resolved identity cannot read this curation scope. Nothing has been changed, and no decision has been recorded."
        : "No claim has been disposed and no proposal has been raised. Retry when the service is available; do not act on a queue you could not load."}
    </RequestFailure>
  );
}

function RankedQueue({ items }: { items: readonly MemoryCurationItem[] }) {
  return (
    <div
      aria-label="Scrollable review queue"
      className="overflow-x-auto"
      role="region"
      tabIndex={0}
    >
      <table className="w-full min-w-[840px] table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">
          Claims waiting for curator attention, in the order the service ranked them
        </caption>
        <thead>
          <tr className="border-y border-border bg-surface-muted text-xs text-muted">
            <th className="w-12 px-6 py-3 font-medium" scope="col">
              #
            </th>
            <th className="w-56 px-4 py-3 font-medium" scope="col">
              Subject
            </th>
            <th className="w-28 px-4 py-3 font-medium" scope="col">
              Reason
            </th>
            <th className="px-4 py-3 font-medium" scope="col">
              Why it is here
            </th>
            <th className="w-24 px-4 py-3 text-right font-medium" scope="col">
              Confidence
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {items.map((item, index) => (
            <tr key={item.claim_id} className="hover:bg-surface-muted">
              <td className="px-6 py-4 align-top text-xs text-muted tabular-nums">{index + 1}</td>
              <th className="px-4 py-4 align-top font-medium" scope="row">
                <span
                  className="block truncate font-mono text-xs text-foreground"
                  title={item.subject_reference}
                >
                  {item.subject_reference}
                </span>
                <span className="mt-1 block text-xs font-normal text-muted">{item.predicate}</span>
              </th>
              <td className="px-4 py-4 align-top">
                <StatusBadge tone="warning">{item.reason.replaceAll("_", " ")}</StatusBadge>
              </td>
              <td className="px-4 py-4 align-top">
                <ul className="space-y-1.5">
                  {rankReasons(item).map((reason) => (
                    <li key={reason.label} className="flex flex-wrap items-baseline gap-2">
                      <StatusBadge tone={reason.emphasis ? "danger" : "neutral"}>
                        {reason.label}
                      </StatusBadge>
                      <span className="text-xs leading-5 text-muted">{reason.detail}</span>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-4 py-4 text-right align-top text-xs text-muted tabular-nums">
                {item.confidence === null ? "—" : item.confidence.toFixed(2)}
                <span className="mt-1 block text-[0.65rem] leading-4 text-subtle">
                  not ranked on
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DispositionGroup({
  caption,
  policies,
  title,
}: {
  caption: string;
  policies: readonly DispositionPolicy[];
  title: string;
}) {
  if (policies.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted">{caption}</p>
      <ul className="mt-4 space-y-4">
        {policies.map((policy) => (
          <li
            key={policy.disposition}
            className="rounded-md border border-border-subtle bg-surface-muted p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {dispositionLabel(policy.disposition)}
              </span>
              {policy.target_kind ? (
                <StatusBadge tone="warning">
                  Proposes a {policy.target_kind.replaceAll("_", " ")}
                </StatusBadge>
              ) : null}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
              {consequencesOf(policy).map((line) => (
                <div key={line.label} className="contents">
                  <dt className="text-xs font-medium text-muted">{line.label}</dt>
                  <dd className="text-xs leading-5 text-foreground">{line.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </section>
  );
}
