import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState, SectionSurface } from "@repo/ui/layouts";
import { Button, RequestFailure, StatusBadge } from "@repo/ui/primitives";

import {
  listEnvelopeBindings,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type EnvelopeBinding,
} from "../../shared/api";
import { posture } from "./envelopeModel";

interface EnvelopeDirectoryProps {
  client: ContextplaneClient;
  onOpen: (principal: { issuer: string; subject: string }) => void;
  requestContext: ContextplaneRequestOptions;
}

const TONE: Readonly<Record<string, "success" | "warning" | "neutral" | "danger">> = {
  ended: "neutral",
  "in-force": "success",
  suspended: "warning",
  ungoverned: "danger",
};

const LABEL: Readonly<Record<string, string>> = {
  ended: "Ended",
  "in-force": "In force",
  suspended: "Suspended",
  ungoverned: "No envelope",
};

/**
 * Who is governed, for an operator who cannot name them.
 *
 * The lookup beside this needs an exact `(issuer, subject)` pair, and during an
 * incident the person reaching for the control is usually the person who does
 * not have it to hand. A surface that only works for somebody who already knows
 * the answer is the failure ADR 0018 is about, one level up.
 *
 * **Suspended and revoked rows are here on purpose.** Filtering to what is in
 * force would hide the agent somebody suspended an hour ago — the one the next
 * responder is looking for — and would answer "never governed" to a question
 * whose real answer is "yes, until Tuesday".
 */
export function EnvelopeDirectory({ client, onOpen, requestContext }: EnvelopeDirectoryProps) {
  // Pages are accumulated rather than replaced: an operator scanning for an
  // agent is scanning, and a "next" that discards what they have already read
  // makes them start over every time they guess wrong about which page it is on.
  const [pages, setPages] = useState<readonly string[]>([""]);
  const cursor = pages[pages.length - 1] ?? "";

  const tenantKey = requestContext.tenantId ?? "credential-default";
  const query = useQuery({
    queryFn: () =>
      listEnvelopeBindings(client, { ...(cursor ? { cursor } : {}), limit: 25 }, requestContext),
    queryKey: ["envelope-directory", tenantKey, cursor],
  });

  if (query.isError) {
    return (
      <SectionSurface description="Every principal this tenant governs." title="Governed agents">
        <div className="px-6 py-4">
          <RequestFailure onRetry={() => void query.refetch()} title="Directory unavailable">
            The list of governed principals could not be read. It has <strong>not</strong> been
            shown as empty — no agents governed and no answer are different facts, and only one of
            them means nothing is holding anything back.
          </RequestFailure>
        </div>
      </SectionSurface>
    );
  }

  const rows: readonly EnvelopeBinding[] = query.data?.items ?? [];

  return (
    <SectionSurface
      description="Every principal this tenant governs, including the ones somebody switched off. Choose one to operate its envelope."
      title="Governed agents"
    >
      {rows.length === 0 && !query.isPending ? (
        <div className="px-6 py-4">
          <EmptyState
            description="No envelope has been granted in this tenant. Every agent here acts under whatever the decision path allows by default, which is not the same as being unconstrained — but nothing on this screen is constraining them."
            title="Nobody is governed yet"
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Envelope bindings in this tenant</caption>
            <thead>
              <tr className="border-y border-border bg-surface-muted text-xs text-muted">
                <th className="px-6 py-3 font-medium" scope="col">
                  Principal
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Posture
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  Governing revision
                </th>
                <th className="px-4 py-3 font-medium" scope="col">
                  In force since
                </th>
                <th className="px-4 py-3" scope="col">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((binding) => {
                const state = posture(binding);
                return (
                  <tr key={binding.binding_id} className="border-b border-border-subtle">
                    <td className="px-6 py-3">
                      <p className="font-medium text-foreground">{binding.principal_subject}</p>
                      <p className="text-xs text-muted">{binding.principal_issuer}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={TONE[state] ?? "neutral"}>
                        {LABEL[state] ?? state}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      {/* The revision's own lifecycle, beside the binding's. A
                          binding is only checked for an active revision when it
                          is granted, so a live envelope over a revoked document
                          is real — and a table showing only the green badge
                          would report governance that is not happening. */}
                      <StatusBadge
                        tone={binding.revision_lifecycle_state === "active" ? "success" : "warning"}
                      >
                        {binding.revision_lifecycle_state}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-muted">{binding.effective_from}</td>
                    <td className="px-4 py-3 text-right">
                      {/* An `aria-label` rather than a visually-hidden suffix:
                          twenty buttons all named "Open" is a list a screen
                          reader cannot navigate, and the subject is already on
                          the row for everybody else. */}
                      <Button
                        aria-label={`Open ${binding.principal_subject}`}
                        onClick={() =>
                          onOpen({
                            issuer: binding.principal_issuer,
                            subject: binding.principal_subject,
                          })
                        }
                        size="compact"
                        variant="secondary"
                      >
                        Open
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {query.data?.next_cursor || pages.length > 1 ? (
        <div className="flex gap-2 border-t border-border-subtle px-6 py-3">
          <Button
            disabled={pages.length === 1}
            onClick={() => setPages((current) => current.slice(0, -1))}
            size="compact"
            variant="secondary"
          >
            Previous page
          </Button>
          <Button
            disabled={!query.data?.next_cursor}
            onClick={() =>
              setPages((current) =>
                query.data?.next_cursor ? [...current, query.data.next_cursor] : current,
              )
            }
            size="compact"
            variant="secondary"
          >
            Next page
          </Button>
        </div>
      ) : null}
    </SectionSurface>
  );
}
