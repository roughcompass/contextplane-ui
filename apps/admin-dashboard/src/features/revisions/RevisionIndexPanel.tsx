import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState, TableSection } from "@repo/ui/layouts";
import { Button, RequestFailure, SearchableSelect, StatusBadge } from "@repo/ui/primitives";

import {
  listArcRevisions,
  type ArcRevision,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";

export interface RevisionIndexPanelProps {
  client: ContextplaneClient;
  onSelect: (revision: ArcRevision) => void;
  requestContext: ContextplaneRequestOptions;
  /** The revision currently open, so the row it came from is marked. */
  selectedRevisionId: string | null;
}

/**
 * What revisions exist, what state each is in, and what rests on it.
 *
 * `/revisions` was four text boxes asking for a UUID. Its argument about the two
 * terminal acts is correct and well made, and it gave the reader nothing to
 * perform them on — the fix is context, not copy, and this is the context.
 *
 * ## `resolutions_under_revision` is the column that changes a decision
 *
 * Invalidating says *everything decided under it is now in question*. How much
 * that is, the service knows and the screen did not say — so somebody was being
 * asked to accept a consequence of unstated size. It is a count of resolutions
 * that selected this revision and did not omit it, which is exactly the set that
 * comes into question.
 *
 * ## No activation verdict is computed here
 *
 * `is_draft`, `has_approval_evidence` and `review_expired` are shown as
 * themselves. Whether a revision may activate is ARC's decision, taken against
 * rules this dashboard does not hold, and a client-side verdict would be a
 * second authority that disagrees with the first exactly when it matters.
 */
const LIFECYCLE_FILTERS = [
  { label: "Every state", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Revoked", value: "revoked" },
  { label: "Invalidated", value: "invalidated" },
] as const;

export function RevisionIndexPanel({
  client,
  onSelect,
  requestContext,
  selectedRevisionId,
}: RevisionIndexPanelProps) {
  const [lifecycleState, setLifecycleState] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);

  const query = useQuery({
    queryFn: () =>
      listArcRevisions(
        client,
        { ...(cursor ? { cursor } : {}), ...(lifecycleState ? { lifecycleState } : {}) },
        requestContext,
      ),
    // The cursor and the filter are both part of the identity: a cache keyed on
    // neither would serve page one's rows for page two, which is the failure
    // that looks like the service returning the same page twice.
    queryKey: ["arc-revisions", lifecycleState, cursor, requestContext.tenantId ?? null],
  });

  const filters = (
    <div className="max-w-xs px-6 py-3">
      <SearchableSelect
        label="Lifecycle state"
        onValueChange={(next) => {
          setLifecycleState(next);
          // The cursor belongs to the previous filter's ordering. Carrying it
          // across would page through a list the service never returned.
          setCursor(null);
        }}
        options={LIFECYCLE_FILTERS.map((entry) => ({ label: entry.label, value: entry.value }))}
        value={lifecycleState}
      />
    </div>
  );

  if (query.isError) {
    return (
      <TableSection
        description="Every governed revision this tenant can see."
        filters={filters}
        title="Revisions"
      >
        <div className="px-6 py-4">
          <RequestFailure onRetry={() => void query.refetch()} title="Revisions could not be loaded">
            {/* Reported rather than rendered as an empty list: a reader shown
                "no revisions" for a request that never arrived would conclude
                none exist, and the two terminal acts below are exactly the wrong
                thing to reach for on that belief. */}
            {query.error instanceof Error ? query.error.message : "The request did not complete."}
          </RequestFailure>
        </div>
      </TableSection>
    );
  }

  const rows = query.data?.items ?? [];

  return (
    <TableSection
      defaultFiltersVisible
      description="Every governed revision this tenant can see. Choose one to see what rests on it and what ending it would mean."
      filters={filters}
      title="Revisions"
    >
      {query.isPending ? (
        <p className="px-6 py-4 text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          description="No revision matches this filter. Every state is available above."
          title="Nothing here"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Governed revisions</caption>
            <thead>
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  Artifact
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  State
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Approval
                </th>
                <th className="px-4 py-3 text-right font-medium" scope="col">
                  Resolutions under it
                </th>
                <th className="px-6 py-3 font-medium" scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((revision) => (
                <tr
                  className={revision.revision_id === selectedRevisionId ? "bg-accent-subtle" : ""}
                  key={revision.revision_id}
                >
                  <th className="px-6 py-3 font-medium text-foreground" scope="row">
                    <span className="block">{revision.artifact_slug ?? revision.artifact_id}</span>
                    <span className="block text-xs font-normal text-muted">
                      {revision.artifact_kind}
                    </span>
                  </th>
                  <td className="px-4 py-3">
                    <StatusBadge tone={stateTone(revision)}>{revision.lifecycle_state}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{approvalSummary(revision)}</td>
                  <td className="px-4 py-3 text-right">
                    {/* Absent is not zero. The service returns null when it did
                        not count, and rendering that as 0 would tell a reader
                        that invalidating costs nothing. */}
                    {revision.resolutions_under_revision === null
                      ? "Not counted"
                      : revision.resolutions_under_revision}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Button onClick={() => onSelect(revision)} size="compact" variant="ghost">
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {query.data?.next_cursor ? (
        <div className="border-t border-border-subtle p-3">
          <Button
            onClick={() => setCursor(query.data.next_cursor)}
            size="compact"
            variant="secondary"
          >
            Next page
          </Button>
        </div>
      ) : null}
      {cursor ? (
        <div className="border-t border-border-subtle p-3">
          <Button onClick={() => setCursor(null)} size="compact" variant="ghost">
            First page
          </Button>
        </div>
      ) : null}
    </TableSection>
  );
}

function stateTone(revision: ArcRevision) {
  if (revision.is_terminal) return "neutral" as const;
  if (revision.is_draft) return "info" as const;
  return "success" as const;
}

/**
 * What is known about approval, in the service's own three fields.
 *
 * Not "can activate": that is ARC's decision, and a sentence here that read like
 * one would be a second authority disagreeing with the first exactly when it
 * matters.
 */
function approvalSummary(revision: ArcRevision): string {
  if (!revision.has_approval_evidence) return "None filed";
  if (revision.review_expired) return "Filed, review expired";
  return "Filed";
}
