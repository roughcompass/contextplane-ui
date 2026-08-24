import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState, TableSection } from "@repo/ui/layouts";
import { Button, Notice, RequestFailure, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  listArcGovernanceObjects,
  revokeArcSourceGrant,
  type ArcGrantKind,
  type ArcGovernanceCollection,
  type ArcGovernanceObject,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../api";

export interface GovernanceObjectTableProps {
  client: ContextplaneClient;
  collection: ArcGovernanceCollection;
  description: string;
  /** What the identifier column is called on this collection. */
  identifierLabel: string;
  /**
   * Which kind of grant a row here is, when it can be revoked.
   *
   * Absent for the collections whose revoke path this screen does not own —
   * approval evidence and verifiers are ended from their own screens, where the
   * argument about what revoking means is already made. A revoke button on a
   * table that did not carry that argument would be the same act with the
   * warning removed.
   */
  revocable?: ArcGrantKind;
  requestContext: ContextplaneRequestOptions;
  title: string;
}

/**
 * One ARC governance collection, read back.
 *
 * In `shared/` rather than under `sources/` because two features render it —
 * source governance and approval verifiers — and reaching into another
 * feature's folder for a component is the import this workspace does not allow.
 * It keeps a domain name rather than becoming a generic `<DataTable>`: what it
 * knows is the shape the five ARC governance collections share, which is a fact
 * about them and not about tables.
 *
 * ## Revoked rows are shown, and the state is a column
 *
 * The question an operator brings to these screens is usually about the
 * registration that is *no longer* there — who could approve last month, why a
 * fetch that used to work now refuses. A table filtered to what is in force
 * answers "nothing was ever registered" to that question, which is the same
 * failure as not having the table.
 *
 * So every row appears and `in_force` is a badge. The picker path is where
 * revoked objects are excluded, and for a different reason: a list is a record
 * of what happened, a picker is a set of things you may choose.
 *
 * ## `detail` is deliberately not rendered
 *
 * The kind-specific remainder differs per collection and the shared endpoint
 * does not promise its shape. Rendering it generically would mean either
 * dumping JSON at a reader or inventing a field mapping the service has not
 * agreed to. The identifier, scope, state and dates are what all five have in
 * common and what an operator needs to answer "is it there, and does it still
 * apply"; the registration forms above each table hold the rest.
 */
export function GovernanceObjectTable({
  client,
  collection,
  description,
  identifierLabel,
  requestContext,
  revocable,
  title,
}: GovernanceObjectTableProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<ArcGovernanceObject | null>(null);
  const [reason, setReason] = useState("");

  const revoke = useMutation({
    mutationFn: async () => {
      if (!revocable || !revoking) return;
      await revokeArcSourceGrant(client, revocable, revoking.object_id, reason.trim(), requestContext);
    },
    onError: (error: unknown) => {
      showToast({
        message: error instanceof Error ? error.message : "The request did not complete.",
        title: "Could not revoke",
        variant: "danger",
      });
    },
    onSuccess: () => {
      showToast({
        message:
          "It no longer governs future admissions. What it governed while it stood is unchanged.",
        title: "Revoked",
      });
      setRevoking(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: ["arc-governance"] });
    },
  });

  const query = useQuery({
    queryFn: () => listArcGovernanceObjects(client, collection, {}, requestContext),
    // The tenant is part of the identity because the same collection under two
    // tenants is two different answers, and a cache keyed on the collection
    // alone would serve one tenant's registrations to the other.
    queryKey: ["arc-governance", collection, requestContext.tenantId ?? null],
  });

  if (query.isError) {
    return (
      <TableSection description={description} title={title}>
        <div className="px-6 py-4">
          <RequestFailure
            onRetry={() => void query.refetch()}
            title={`${title} could not be loaded`}
          >
            {/* The failure is reported rather than rendered as an empty table.
                A reader shown "nothing registered" for a request that never
                arrived would conclude the registration was never made, and act
                on that. */}
            {query.error instanceof Error ? query.error.message : "The request did not complete."}
          </RequestFailure>
        </div>
      </TableSection>
    );
  }

  const rows: readonly ArcGovernanceObject[] = query.data ?? [];

  return (
    <TableSection description={description} title={title}>
      {query.isPending ? (
        <p className="px-6 py-4 text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          description="Nothing has been registered here yet. Registrations made above appear in this table."
          title="Nothing registered"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  {identifierLabel}
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Scope
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  State
                </th>
                <th className="px-6 py-3 font-medium" scope="col">
                  Registered
                </th>
                {revocable ? (
                  <th className="px-6 py-3 font-medium" scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((row) => (
                <tr key={row.object_id}>
                  <th
                    className="px-6 py-3 font-mono text-xs font-medium text-foreground"
                    scope="row"
                  >
                    {row.object_id}
                  </th>
                  <td className="px-4 py-3">{row.scope}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={row.in_force ? "success" : "neutral"}>
                      {row.in_force ? "In force" : "Revoked"}
                    </StatusBadge>
                  </td>
                  <td className="px-6 py-3 text-muted">{row.created_at}</td>
                  {revocable ? (
                    <td className="px-6 py-3 text-right">
                      {row.in_force ? (
                        <Button
                          onClick={() => {
                            setRevoking(row);
                            setReason("");
                          }}
                          size="compact"
                          variant="ghost"
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {revoking ? (
        <div className="border-t border-border-subtle px-6 py-4">
          {/* The argument, at the moment of the act rather than in a doc.
              Revoking ends future authority; it does not unmake what this grant
              already governed, and a reader who thinks it does will revoke to
              undo something and find they have not. */}
          <Notice title={`Revoke ${revoking.object_id}?`} variant="warning">
            This ends what <strong>every future admission</strong> through it would have inherited.
            It does not unmake anything already admitted under it, and the registration stays
            visible here so the reason a past admission was permitted is still readable.
          </Notice>
          <label className="mt-3 block text-xs font-medium text-muted" htmlFor="revoke-reason">
            Why
            <input
              className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              id="revoke-reason"
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </label>
          <p className="mt-1.5 text-xs text-muted">
            Required. A revocation with no reason leaves the next reader to work out why authority
            was withdrawn, from a row that no longer does anything.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              disabled={reason.trim() === "" || revoke.isPending}
              onClick={() => revoke.mutate()}
              variant="danger"
            >
              Revoke this registration
            </Button>
            <Button onClick={() => setRevoking(null)} variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </TableSection>
  );
}
