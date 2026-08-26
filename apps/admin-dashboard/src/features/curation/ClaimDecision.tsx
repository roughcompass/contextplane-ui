import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { Button, RequestFailure, ResourcePicker, useToast } from "@repo/ui/primitives";

import {
  confirmClaim,
  discardClaim,
  linkClaimSubject,
  openCurationCase,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type MemoryCurationItem,
} from "../../shared/api";
import { capabilitySource } from "../../shared/pickers/sources";

/** What the service publishes on a row, and the only actions this renders. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  confirm: "Confirm this claim",
  discard: "Discard this claim",
  escalate: "Escalate for another approver",
  link: "Link to a subject",
};

const ACTION_CONSEQUENCES: Readonly<Record<string, string>> = {
  confirm:
    "Somebody stands behind it. The claim serves as asserted rather than observed, and the record says who said so and when.",
  discard:
    "It stops being served. The reason is stored with it, because a discard nobody explained is one nobody can review.",
  escalate:
    "A case is opened for this subject and predicate. The service decides what settling it commits to; routing it to an owner is a separate decision.",
  link: "The claim gets a subject, and the service re-derives its owner, visibility and authority from that subject.",
};

interface ClaimDecisionProps {
  client: ContextplaneClient;
  item: MemoryCurationItem;
  onDecided: () => void;
  requestContext: ContextplaneRequestOptions;
}

/**
 * The decision, beside the claim it is about.
 *
 * ## The queue was readable and not workable
 *
 * Curation review ranked what was waiting, published why each row was there, and
 * listed what every disposition commits to. It had no action on any row and no
 * link off the page, and none of the four decision endpoints was called anywhere
 * in this application — so a curator could see their whole queue and could not
 * touch it. DESIGN.md's archetype for this page asks for *"the item, rubric or
 * policy, evidence, conflicts, history, and decision controls in one workflow"*;
 * five of six were there.
 *
 * ## The actions are the service's, not a mapping kept here
 *
 * `available_actions` is on every row. An `unlinked` claim offers `link` and
 * `discard`; a `contested` one offers `confirm`, `discard` and `escalate`.
 * Deriving that from `reason` on this side would be a second copy of a service
 * judgement, and it would be wrong the first time a reason is added — so an
 * action this screen does not recognise is *shown as unavailable and named*,
 * rather than dropped. A curator who can see a decision they cannot take here
 * knows to look elsewhere; one who sees nothing concludes there is nothing.
 *
 * ## No client-only gate
 *
 * `discard` asks for a reason because the contract requires one. Nothing else
 * asks for a confirmation step, because DESIGN.md forbids inventing governance
 * the service did not define — and because the required reason is already the
 * friction that makes a discard deliberate.
 *
 * ## The receipt is the queue, not the toast
 *
 * A decided row leaves the queue on refetch, which is a durable statement that
 * it was decided. The toast names what happened for the reader who is watching;
 * it is not the only evidence, which DESIGN.md is explicit about.
 */
export function ClaimDecision({ client, item, onDecided, requestContext }: ClaimDecisionProps) {
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [subjectEntityId, setSubjectEntityId] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const capabilities = capabilitySource(client, requestContext);

  const decide = useMutation({
    mutationFn: async (action: string) => {
      if (action === "confirm") return confirmClaim(client, { claimId: item.claim_id }, requestContext);
      if (action === "discard") {
        return discardClaim(client, { claimId: item.claim_id, reason }, requestContext);
      }
      if (action === "link") {
        return linkClaimSubject(
          client,
          { claimId: item.claim_id, subjectReference: subjectEntityId },
          requestContext,
        );
      }
      if (action === "escalate") {
        await openCurationCase(
          client,
          { predicate: item.predicate, subjectReference: item.subject_reference },
          requestContext,
        );
        return;
      }
      throw new Error(`${action} is not a decision this screen can take.`);
    },
    onSuccess: (_result, action) => {
      showToast({
        message: ACTION_CONSEQUENCES[action] ?? "The decision was recorded.",
        title: `${item.predicate} · ${ACTION_LABELS[action] ?? action}`,
        variant: "success",
      });
      setReason("");
      setSubjectEntityId("");
      setChosen(null);
      void queryClient.invalidateQueries({ queryKey: ["memory", "curation-queue"] });
      onDecided();
    },
  });

  const available = item.available_actions ?? [];
  const known = available.filter((action) => action in ACTION_LABELS);
  const unrecognised = available.filter((action) => !(action in ACTION_LABELS));

  // Each decision's own precondition, so a disabled control can say which one.
  const missing =
    chosen === "discard" && reason.trim().length === 0
      ? "Give a reason first — the service stores it with the discard."
      : chosen === "link" && subjectEntityId === ""
        ? "Choose the entity this claim is about."
        : null;

  if (known.length === 0 && unrecognised.length === 0) {
    return (
      <p className="text-xs text-muted">
        The service offers no decision on this row. It is here to be read, and something else moves
        it.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {known.map((action) => (
          <Button
            aria-pressed={chosen === action}
            key={action}
            onClick={() => setChosen(chosen === action ? null : action)}
            size="compact"
            variant={chosen === action ? "primary" : "secondary"}
          >
            {ACTION_LABELS[action]}
          </Button>
        ))}
      </div>

      {unrecognised.length > 0 ? (
        <p className="text-xs text-muted">
          The service also offers {unrecognised.join(", ")} on this row, which this screen cannot
          take yet.
        </p>
      ) : null}

      {chosen ? (
        <div className="space-y-3 rounded-md border border-border bg-surface-muted/40 p-3">
          <p className="text-xs leading-5 text-muted">{ACTION_CONSEQUENCES[chosen]}</p>

          {chosen === "discard" ? (
            <div>
              <label className="text-xs font-medium text-foreground" htmlFor={reasonId}>
                Why it is being discarded
              </label>
              <input
                aria-invalid={reason.trim().length === 0}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                id={reasonId}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Superseded by the owner's own record"
                value={reason}
              />
            </div>
          ) : null}

          {chosen === "link" ? (
            <div>
              {/* Chosen, never typed — ADR 0018. `link_subject` re-derives owner,
                  visibility and authority from the subject it resolves, and
                  refuses a reference it cannot resolve; a text box would let a
                  curator submit prose and read the refusal afterwards. */}
              <ResourcePicker
                label="Subject entity"
                load={capabilities}
                onValueChange={setSubjectEntityId}
                searchPlaceholder="Search the catalog for what this claim is about"
                value={subjectEntityId}
              />
              <p className="mt-1 text-xs text-muted">
                The claim currently says <span className="font-mono">{item.subject_reference}</span>,
                which resolved to nothing.
              </p>
            </div>
          ) : null}

          {decide.isError ? (
            <RequestFailure
              onRetry={() => decide.mutate(chosen)}
              title="The decision was not recorded"
            >
              {decide.error.message}
            </RequestFailure>
          ) : null}

          <div className="space-y-1">
            <Button
              disabled={decide.isPending || missing !== null}
              onClick={() => decide.mutate(chosen)}
              size="compact"
            >
              {decide.isPending ? "Recording…" : ACTION_LABELS[chosen]}
            </Button>
            {missing ? <p className="text-xs text-muted">{missing}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
