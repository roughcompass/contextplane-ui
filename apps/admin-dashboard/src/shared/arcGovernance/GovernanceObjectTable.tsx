import { useQuery } from "@tanstack/react-query";

import { EmptyState, TableSection } from "@repo/ui/layouts";
import { RequestFailure, StatusBadge } from "@repo/ui/primitives";

import {
  listArcGovernanceObjects,
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
  title,
}: GovernanceObjectTableProps) {
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableSection>
  );
}
