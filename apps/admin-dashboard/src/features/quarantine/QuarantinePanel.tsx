import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";

import { EmptyState, SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, SearchableSelect, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  applyQuarantine,
  previewQuarantine,
  revertQuarantine,
  type AppliedQuarantine,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type QuarantinePreview,
  type QuarantineSelector,
} from "../../shared/api";

interface QuarantinePanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

/**
 * The closed provenance vocabulary, with what each one actually selects.
 *
 * Labelled rather than shown raw because the values are the service's column
 * names: an operator reaching for this during an incident should not have to
 * know that "strategy_id" means the extractor version that produced a claim.
 */
const SELECTORS: readonly { label: string; value: QuarantineSelector }[] = [
  { label: "Connector run — everything one ingest produced", value: "connector_run" },
  { label: "Extractor version — everything one strategy asserted", value: "strategy_id" },
  { label: "Namespace prefix — everything under one namespace", value: "namespace_prefix" },
];

export function QuarantinePanel({ client, requestContext }: QuarantinePanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selector, setSelector] = useState<QuarantineSelector | "">("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<QuarantinePreview | null>(null);
  const [previewedAt, setPreviewedAt] = useState<Date | null>(null);
  const [applied, setApplied] = useState<AppliedQuarantine | null>(null);
  const [confirmingRevert, setConfirmingRevert] = useState(false);

  const ready = selector !== "" && value.trim() !== "";

  const previewMutation = useMutation({
    mutationFn: () =>
      previewQuarantine(
        client,
        { selector: selector as QuarantineSelector, value: value.trim() },
        requestContext,
      ),
    onSuccess: (result) => {
      setPreview(result);
      // Stamped so the screen can say how old the answer is. The graph moves,
      // and a preview acted on ten minutes later reached a different set.
      setPreviewedAt(new Date());
    },
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      applyQuarantine(
        client,
        { reason: reason.trim(), selector: selector as QuarantineSelector, value: value.trim() },
        requestContext,
      ),
    onSuccess: (result) => {
      showToast({ title: `Withheld ${result.matched_count} claim(s)`, variant: "success" });
      setApplied(result);
      setPreview(null);
      setPreviewedAt(null);
      void queryClient.invalidateQueries({ queryKey: ["memory-curation"] });
    },
  });

  const revertMutation = useMutation({
    mutationFn: (quarantineId: string) => revertQuarantine(client, quarantineId, requestContext),
    onSuccess: (restored) => {
      showToast({ title: `Restored ${restored} claim(s)`, variant: "success" });
      setApplied(null);
      setConfirmingRevert(false);
      void queryClient.invalidateQueries({ queryKey: ["memory-curation"] });
    },
  });

  function runPreview(event: FormEvent) {
    event.preventDefault();
    if (ready) previewMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <SectionSurface
        description="Withhold claims by where they came from, and put them back. Withholding is reversible and recorded; it does not delete anything."
        title="Quarantine by provenance"
      >
        <form className="space-y-3 px-6 py-4" onSubmit={runPreview}>
          <div className="grid gap-3 md:grid-cols-2">
            <SearchableSelect
              emptyLabel="Choose what to select on…"
              label="Provenance selector"
              onValueChange={(next) => setSelector(next as QuarantineSelector)}
              options={SELECTORS.map((entry) => ({ label: entry.label, value: entry.value }))}
              value={selector}
            />
            <label className="text-xs font-medium text-muted" htmlFor="quarantine-value">
              Value
              <input
                className={inputClassName}
                id="quarantine-value"
                onChange={(event) => setValue(event.target.value)}
                placeholder="run-42"
                value={value}
              />
            </label>
          </div>
          <Button disabled={!ready || previewMutation.isPending} type="submit" variant="secondary">
            {previewMutation.isPending ? (
              <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            Preview what this reaches
          </Button>
        </form>

        {preview ? (
          <div className="space-y-4 border-t border-border-subtle px-6 py-4">
            <Notice title="A preview is a point-in-time answer" variant="info">
              Taken {previewedAt ? previewedAt.toLocaleTimeString() : "just now"}. The graph moves —
              claims arrive and are consolidated — so applying later can reach a different set than
              this one. Re-run it if you have been away from this screen.
            </Notice>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted">Would be withheld</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {preview.matched.length}
                </p>
                <p className="mt-1 text-xs text-muted">Claims this predicate matches, exactly.</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted">Depends on those claims</p>
                <p className="mt-1 flex items-baseline gap-2 text-2xl font-semibold tabular-nums text-foreground">
                  {preview.downstream.length}
                  {preview.truncated ? <StatusBadge tone="warning">at least</StatusBadge> : null}
                </p>
                {/* The distinction the service keeps and the screen must not lose. */}
                <p className="mt-1 text-xs text-muted">
                  Advisory. Applying withholds <strong>none</strong> of these — they are shown so
                  you can see what rests on what you are about to withhold.
                </p>
              </div>
            </div>

            {preview.truncated ? (
              <Notice title="The downstream figure is a floor, not the answer" variant="warning">
                {preview.seeds_traversed} of {preview.seeds_total} subjects were traversed, so more
                may depend on this than is shown.
              </Notice>
            ) : null}

            {preview.matched.length === 0 ? (
              <EmptyState
                description="Applying a predicate that matches nothing is refused, because a quarantine that withheld nothing reads later as one that worked."
                title="This predicate matches no claim"
              />
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (reason.trim().length > 0) applyMutation.mutate();
                }}
              >
                <label className="block text-xs font-medium text-muted" htmlFor="quarantine-reason">
                  Why
                  <input
                    className={inputClassName}
                    id="quarantine-reason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Connector run 42 asserted stale ownership across the estate."
                    value={reason}
                  />
                </label>
                <p className="text-xs text-muted">
                  Recorded with the quarantine. Withheld content with no stated cause is
                  unreviewable afterwards.
                </p>
                <Button
                  disabled={reason.trim().length === 0 || applyMutation.isPending}
                  type="submit"
                  variant="danger"
                >
                  <ShieldAlert aria-hidden="true" className="size-4" />
                  Withhold {preview.matched.length} claim(s)
                </Button>
              </form>
            )}
          </div>
        ) : null}
      </SectionSurface>

      {applied ? (
        <SectionSurface
          description="Reverting restores exactly what this quarantine withheld — not what the predicate matches now."
          title="Applied, and reversible"
        >
          <div className="space-y-3 px-6 py-4">
            <p className="text-sm text-foreground">
              <code className="text-xs">{applied.quarantine_id}</code> withheld{" "}
              {applied.matched_count} claim(s) matching {applied.selector} ={" "}
              <code className="text-xs">{applied.value}</code>.
            </p>
            {/* Revert is a primary action here rather than an item in a menu:
                an operator who cannot see how to undo a quarantine will not run
                one on a real incident, which makes its discoverability part of
                whether the feature works at all. */}
            {confirmingRevert ? (
              <div className="rounded-md border border-border p-3">
                <p className="text-xs font-medium text-foreground">
                  Restore the claims this quarantine withheld?
                </p>
                <p className="mt-1 text-xs text-muted">
                  A claim held by a second, unreverted quarantine stays withheld, so the restored
                  count can be lower than {applied.matched_count} without anything having failed.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    disabled={revertMutation.isPending}
                    onClick={() => revertMutation.mutate(applied.quarantine_id)}
                    size="compact"
                  >
                    Confirm restore
                  </Button>
                  <Button
                    onClick={() => setConfirmingRevert(false)}
                    size="compact"
                    variant="secondary"
                  >
                    Keep withheld
                  </Button>
                </div>
              </div>
            ) : (
              <Button onClick={() => setConfirmingRevert(true)}>Revert this quarantine</Button>
            )}
          </div>
        </SectionSurface>
      ) : null}
    </div>
  );
}
