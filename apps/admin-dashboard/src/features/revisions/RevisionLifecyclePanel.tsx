import { useMutation } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, ResourcePicker, useToast } from "@repo/ui/primitives";

import {
  attachArcApprovalEvidence,
  invalidateArcRevision,
  revokeArcApprovalEvidence,
  revokeArcRevision,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type ArcRevision,
} from "../../shared/api";
import { governancePickerSource } from "../../shared/arcGovernance/governancePickerSource";

interface RevisionLifecyclePanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
  /**
   * The revision the reader opened from the index, if any.
   *
   * Both forms below act on a revision, and until E22-T8's read existed the only
   * way to name one was to type a UUID. A revision chosen from the list arrives
   * here and fills both — which is what turns two forms into two actions on a
   * record.
   */
  selected?: ArcRevision | null;
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

export function RevisionLifecyclePanel({
  client,
  requestContext,
  selected = null,
}: RevisionLifecyclePanelProps) {
  const { showToast } = useToast();
  const [attachRevision, setAttachRevision] = useState("");
  const [attachEvidence, setAttachEvidence] = useState("");
  const [revokeEvidence, setRevokeEvidence] = useState("");
  const [revokeEvidenceReason, setRevokeEvidenceReason] = useState("");
  const [endingRevision, setEndingRevision] = useState("");
  const [endingReason, setEndingReason] = useState("");
  const [ending, setEnding] = useState<Ending | null>(null);

  // Both forms follow the revision the reader opened. Derived during render
  // rather than pushed into state by an effect: which revision a form is about
  // is a function of what is open, and an effect would let the two disagree for
  // a frame — on a screen whose two actions are both irreversible.
  const attachRevisionValue = selected?.revision_id ?? attachRevision;
  const endingRevisionValue = selected?.revision_id ?? endingRevision;

  // See the note on the same memo in `VerifierEnrolmentPanel`: the context is
  // rebuilt inside rather than closed over, because the page constructs a fresh
  // one every render and depending on the object would rebuild the source —
  // discarding the collection it holds and re-requesting per keystroke.
  const tenantId = requestContext.tenantId;
  const evidenceSource = useMemo(
    () => governancePickerSource(client, "approvalEvidence", tenantId ? { tenantId } : {}),
    [client, tenantId],
  );

  const attachMutation = useMutation({
    mutationFn: () =>
      attachArcApprovalEvidence(
        client,
        attachRevisionValue.trim(),
        attachEvidence.trim(),
        requestContext,
      ),
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
        ? revokeArcRevision(client, endingRevisionValue.trim(), endingReason.trim(), requestContext)
        : invalidateArcRevision(client, endingRevisionValue.trim(), endingReason.trim(), requestContext),
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

  const endingReady = endingRevisionValue.trim() !== "" && endingReason.trim() !== "";

  function submitAttach(event: FormEvent) {
    event.preventDefault();
    if (attachRevisionValue.trim() !== "" && attachEvidence.trim() !== "") attachMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <SectionSurface
        description="A revision and the evidence approving it are registered separately, because the evidence must name the revision it approves."
        title="Attach approval evidence"
      >
        <form className="space-y-3 px-6 py-4" onSubmit={submitAttach}>
          <div className="grid gap-3 md:grid-cols-2">
            {/* The revision this acts on, shown rather than asked for. ADR 0018
                says a server-assigned identifier is chosen and never typed, and
                this panel renders only once one has been chosen — so a text box
                here would be a second way to name a choice already made, and the
                one way somebody could name a different revision than the one
                they are looking at. */}
            <div>
              <span className="block text-xs font-medium text-muted">Revision</span>
              <p className="mt-1.5 text-sm text-foreground" data-testid="attach-revision">
                <span className="font-medium">{selected?.artifact_slug ?? selected?.artifact_id}</span>
                <span className="block font-mono text-xs text-muted">{attachRevisionValue}</span>
              </p>
            </div>
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
              attachRevisionValue.trim() === "" ||
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
            {/* ADR 0018. Revoking approval evidence is the action whose target
                a reader is least able to name from memory: evidence ids are
                minted by the approval path and never shown to the person who
                later has to withdraw one. Only evidence still in force is
                offered — revoking what is already revoked is a no-op the
                service refuses. */}
            <ResourcePicker
              label="Evidence"
              load={evidenceSource.load}
              onValueChange={setRevokeEvidence}
              resolve={evidenceSource.resolve}
              searchPlaceholder="Search approval evidence"
              value={revokeEvidence}
            />
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
            {/* The revision this acts on, shown rather than asked for. ADR 0018
                says a server-assigned identifier is chosen and never typed, and
                this panel renders only once one has been chosen — so a text box
                here would be a second way to name a choice already made, and the
                one way somebody could name a different revision than the one
                they are looking at. */}
            <div>
              <span className="block text-xs font-medium text-muted">Revision</span>
              <p className="mt-1.5 text-sm text-foreground" data-testid="ending-revision">
                <span className="font-medium">{selected?.artifact_slug ?? selected?.artifact_id}</span>
                <span className="block font-mono text-xs text-muted">{endingRevisionValue}</span>
              </p>
            </div>
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
            <legend className="mb-1 text-xs font-medium text-muted">Which of these is true?</legend>
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
