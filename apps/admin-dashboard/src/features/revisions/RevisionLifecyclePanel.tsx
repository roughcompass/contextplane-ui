import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, useToast } from "@repo/ui/primitives";

import {
  attachArcApprovalEvidence,
  invalidateArcRevision,
  revokeArcApprovalEvidence,
  revokeArcRevision,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";

interface RevisionLifecyclePanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const fieldClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

/**
 * The two terminal acts, and what each one says about the past.
 *
 * Neither is undoable, so a screen that sorted them by reversibility would be
 * sorting on an axis they do not differ on. What differs is reach in time, and
 * only one of them reaches backwards.
 */
type Ending = "invalidate" | "revoke";

const ENDINGS: Readonly<Record<Ending, { blurb: string; confirm: string; title: string }>> = {
  invalidate: {
    blurb:
      "The content was wrong, or the source it came from is gone. This reaches backwards: every resolution made while this revision was active is now in question, and the obligation tombstones as invalid so an auditor can tell.",
    confirm: "Everything decided under it is now in question",
    title: "The content was wrong",
  },
  revoke: {
    blurb:
      "The rule no longer applies from now on. Everything resolved while this revision was in force stands, and a mandatory obligation it satisfied keeps blocking until an approved successor satisfies it.",
    confirm: "What was decided under it stands",
    title: "The rule no longer applies",
  },
};

export function RevisionLifecyclePanel({ client, requestContext }: RevisionLifecyclePanelProps) {
  const { showToast } = useToast();
  const [attachRevision, setAttachRevision] = useState("");
  const [attachEvidence, setAttachEvidence] = useState("");
  const [revokeEvidence, setRevokeEvidence] = useState("");
  const [revokeEvidenceReason, setRevokeEvidenceReason] = useState("");
  const [endingRevision, setEndingRevision] = useState("");
  const [endingReason, setEndingReason] = useState("");
  const [ending, setEnding] = useState<Ending | null>(null);

  const attachMutation = useMutation({
    mutationFn: () =>
      attachArcApprovalEvidence(client, attachRevision.trim(), attachEvidence.trim(), requestContext),
    onSuccess: () => {
      showToast({ title: "Evidence attached", variant: "success" });
      setAttachRevision("");
      setAttachEvidence("");
    },
  });

  const evidenceRevokeMutation = useMutation({
    mutationFn: () =>
      revokeArcApprovalEvidence(
        client,
        revokeEvidence.trim(),
        revokeEvidenceReason.trim(),
        requestContext,
      ),
    onSuccess: () => {
      showToast({ title: "Approval withdrawn", variant: "success" });
      setRevokeEvidence("");
      setRevokeEvidenceReason("");
    },
  });

  // Two functions rather than one taking a flag. The bodies are identical and
  // only the path differs, so a boolean is precisely how they get swapped.
  const endingMutation = useMutation({
    mutationFn: (chosen: Ending) =>
      chosen === "revoke"
        ? revokeArcRevision(client, endingRevision.trim(), endingReason.trim(), requestContext)
        : invalidateArcRevision(client, endingRevision.trim(), endingReason.trim(), requestContext),
    onSuccess: (_result, chosen) => {
      showToast({
        title: chosen === "revoke" ? "Revision revoked" : "Revision invalidated",
        variant: "success",
      });
      setEndingRevision("");
      setEndingReason("");
      setEnding(null);
    },
  });

  const endingReady = endingRevision.trim() !== "" && endingReason.trim() !== "";

  function submitAttach(event: FormEvent) {
    event.preventDefault();
    if (attachRevision.trim() !== "" && attachEvidence.trim() !== "") attachMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <SectionSurface
        description="A revision and the evidence approving it are registered separately, because the evidence must name the revision it approves."
        title="Attach approval evidence"
      >
        <form className="space-y-3 px-6 py-4" onSubmit={submitAttach}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-muted" htmlFor="attach-revision">
              Revision
              <input
                className={fieldClassName}
                id="attach-revision"
                onChange={(event) => setAttachRevision(event.target.value)}
                value={attachRevision}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="attach-evidence">
              Evidence
              <input
                className={fieldClassName}
                id="attach-evidence"
                onChange={(event) => setAttachEvidence(event.target.value)}
                value={attachEvidence}
              />
            </label>
          </div>
          <Button
            disabled={
              attachRevision.trim() === "" ||
              attachEvidence.trim() === "" ||
              attachMutation.isPending
            }
            type="submit"
          >
            Attach this evidence
          </Button>
        </form>
      </SectionSurface>

      <SectionSurface
        description="Withdraws the approval itself, keyed by the evidence rather than by any revision citing it."
        title="Withdraw an approval"
      >
        <form
          className="space-y-3 px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (revokeEvidence.trim() !== "" && revokeEvidenceReason.trim() !== "") {
              evidenceRevokeMutation.mutate();
            }
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-muted" htmlFor="revoke-evidence-id">
              Evidence
              <input
                className={fieldClassName}
                id="revoke-evidence-id"
                onChange={(event) => setRevokeEvidence(event.target.value)}
                value={revokeEvidence}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="revoke-evidence-reason">
              Reason
              <input
                className={fieldClassName}
                id="revoke-evidence-reason"
                onChange={(event) => setRevokeEvidenceReason(event.target.value)}
                value={revokeEvidenceReason}
              />
            </label>
          </div>
          <Button
            disabled={
              revokeEvidence.trim() === "" ||
              revokeEvidenceReason.trim() === "" ||
              evidenceRevokeMutation.isPending
            }
            type="submit"
            variant="danger"
          >
            Withdraw this approval
          </Button>
        </form>
      </SectionSurface>

      <SectionSurface
        description="Two different statements about a revision, both final."
        title="Stop relying on a revision"
      >
        <div className="space-y-4 px-6 py-4">
          {/* The entry's warning: a reader who picks the wrong one cannot tell
              from the button. Neither is undoable, so the choice is presented as
              what it says about the past — which is where they actually differ. */}
          <Notice title="Neither of these can be undone" variant="warning">
            Both are terminal; a revoked revision cannot be reactivated. Choose between them by what
            you are saying about the time this revision was in force, not by which is easier to
            reverse — one of them casts doubt over everything decided under it, and the other does
            not.
          </Notice>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-muted" htmlFor="ending-revision">
              Revision
              <input
                className={fieldClassName}
                id="ending-revision"
                onChange={(event) => setEndingRevision(event.target.value)}
                value={endingRevision}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="ending-reason">
              Reason
              <input
                className={fieldClassName}
                id="ending-reason"
                onChange={(event) => setEndingReason(event.target.value)}
                value={endingReason}
              />
            </label>
          </div>

          <fieldset className="grid gap-3 md:grid-cols-2">
            <legend className="mb-1 text-xs font-medium text-muted">
              Which of these is true?
            </legend>
            {(["revoke", "invalidate"] as const).map((option) => (
              <label
                className="flex cursor-pointer gap-3 rounded-md border border-border p-3"
                key={option}
              >
                <input
                  checked={ending === option}
                  name="revision-ending"
                  onChange={() => setEnding(option)}
                  type="radio"
                  value={option}
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">
                    {ENDINGS[option].title}
                  </span>
                  <span className="mt-1 block text-xs text-muted">{ENDINGS[option].blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {ending ? (
            <p className="text-xs text-foreground">
              Recording that <strong>{ENDINGS[ending].confirm.toLowerCase()}</strong>.
            </p>
          ) : null}

          <Button
            disabled={ending === null || !endingReady || endingMutation.isPending}
            onClick={() => {
              if (ending && endingReady) endingMutation.mutate(ending);
            }}
            variant="danger"
          >
            {ending === "invalidate" ? "Invalidate this revision" : "Revoke this revision"}
          </Button>
        </div>
      </SectionSurface>
    </div>
  );
}
