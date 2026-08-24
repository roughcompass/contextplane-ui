import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useMemo } from "react";

import { ResourcePicker } from "@repo/ui/primitives";

import {
  listArcGovernanceObjects,
  type ArcGovernanceObject,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../api";

export interface VerifierAuthorityPickerProps {
  client: ContextplaneClient;
  /** Explains, in this form's terms, what adding a verifier here grants. */
  hint: string;
  label: string;
  onChange: (next: readonly string[]) => void;
  tenantId: string | undefined;
  value: readonly string[];
}

/**
 * Choosing who may approve, with what each choice already grants alongside it.
 *
 * ## Why this is not a text box, and not a plain picker either
 *
 * ADR 0018 settles the first half: a field whose value is a server-assigned
 * identifier is chosen, never typed. This one asked for a comma-separated list
 * of verifier UUIDs — the worst case of the pattern, because it is the widest
 * field on its form and a typo in it either fails loudly or, worse, names a real
 * verifier somebody did not mean.
 *
 * The second half is the reason this is its own component. Every registration
 * here grants approval authority over **every future admission** through the
 * object being registered, and the fact an operator most needs at the moment of
 * choosing is *how much authority this verifier already has*. A verifier already
 * on six connectors is a broadly trusted credential; one on none is a first
 * grant, and the two deserve different hesitation. That count is computable —
 * `allowed_verifier_ids` is on every connector and upload policy the read
 * returns — and it was not shown anywhere before.
 *
 * ## The count is a fact about now, and says so
 *
 * It counts objects **currently in force**. A verifier named by a connector
 * revoked last month is not approving anything through it, and including that
 * would inflate the number in the direction that makes a grant look safer than
 * it is. Where the counting read fails, the picker still works and the count is
 * simply absent — a missing annotation is better than a wrong one, and better
 * than blocking the choice.
 */
export function VerifierAuthorityPicker({
  client,
  hint,
  label,
  onChange,
  tenantId,
  value,
}: VerifierAuthorityPickerProps) {
  const requestContext: ContextplaneRequestOptions = useMemo(
    () => (tenantId ? { tenantId } : {}),
    [tenantId],
  );

  const verifiers = useQuery({
    queryFn: () =>
      listArcGovernanceObjects(client, "approvalVerifiers", { inForceOnly: true }, requestContext),
    queryKey: ["arc-governance", "approvalVerifiers", "in-force", tenantId ?? null],
  });

  // Two reads rather than one, because a verifier's authority comes from both
  // and a count over either alone would understate it.
  const connectors = useQuery({
    queryFn: () =>
      listArcGovernanceObjects(client, "sourceConnectors", { inForceOnly: true }, requestContext),
    queryKey: ["arc-governance", "sourceConnectors", "in-force", tenantId ?? null],
  });
  const policies = useQuery({
    queryFn: () =>
      listArcGovernanceObjects(
        client,
        "sourceUploadPolicies",
        { inForceOnly: true },
        requestContext,
      ),
    queryKey: ["arc-governance", "sourceUploadPolicies", "in-force", tenantId ?? null],
  });

  const grantsByVerifier = useMemo(
    () => countGrants([...(connectors.data ?? []), ...(policies.data ?? [])]),
    [connectors.data, policies.data],
  );

  const options = useMemo(
    () =>
      (verifiers.data ?? [])
        .filter((verifier) => !value.includes(verifier.object_id))
        .map((verifier) => ({
          description: describeAuthority(grantsByVerifier.get(verifier.object_id)),
          label: verifier.object_id,
          value: verifier.object_id,
        })),
    [grantsByVerifier, value, verifiers.data],
  );

  return (
    <div className="space-y-2">
      <ResourcePicker
        emptyMessage="No verifier is enrolled and still in force. Enrol one before granting it authority here."
        label={label}
        load={async (query) => ({
          items: options.filter((option) =>
            option.label.toLowerCase().includes(query.search.trim().toLowerCase()),
          ),
          // These collections have no cursor. Fabricating one would be inventing
          // a bookmark the service never issued.
          next_cursor: null,
        })}
        onValueChange={(next) => {
          // Guarded because the picker is single-value and this field is not: a
          // second click on a chosen verifier would otherwise add it twice, and
          // the service would receive a list naming one credential two ways.
          if (next && !value.includes(next)) onChange([...value, next]);
        }}
        searchPlaceholder="Search enrolled verifiers"
        value=""
      />

      {value.length > 0 ? (
        <ul aria-label={`${label} chosen`} className="flex flex-wrap gap-2">
          {value.map((chosen) => (
            <li key={chosen}>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2 py-1 text-xs text-foreground">
                <span className="font-mono">{chosen}</span>
                <button
                  aria-label={`Remove ${chosen}`}
                  className="rounded p-0.5 text-muted hover:text-foreground"
                  onClick={() => onChange(value.filter((entry) => entry !== chosen))}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

/**
 * How many in-force objects already grant each verifier authority.
 *
 * `detail` is unvalidated by contract, so `allowed_verifier_ids` is narrowed
 * here, at the one place it is read. A row whose detail does not carry the field
 * contributes nothing rather than throwing: this is an annotation on a choice,
 * and a shape surprise must not take the form down with it.
 */
function countGrants(objects: readonly ArcGovernanceObject[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const object of objects) {
    const ids = object.detail.allowed_verifier_ids;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id !== "string") continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

function describeAuthority(count: number | undefined): string {
  if (count === undefined || count === 0) {
    return "Approves nothing yet — this would be its first grant";
  }
  return count === 1
    ? "Already approves for 1 registration"
    : `Already approves for ${count} registrations`;
}
