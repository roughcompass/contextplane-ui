import { FileCheck2, RefreshCw } from "lucide-react";

import { Button, StatusBadge, type StatusTone } from "@repo/ui/primitives";

import type { ArcSourceEvidence } from "../../shared/api/arcAuthoring";
import type { ArcArtifactFamily, ArcProposalVersion } from "../../shared/api/contextplane";
import { formatArcLabel } from "./arcModel";

interface ArcAuthoringContextProps {
  artifact: ArcArtifactFamily;
  onChangePolicy: () => void;
  proposal: ArcProposalVersion | null;
  source: ArcSourceEvidence | null;
}

function sourceTone(source: ArcSourceEvidence | null): StatusTone {
  if (!source) return "neutral";
  if (source.status === "current") return "success";
  if (source.status === "unknown" || source.status === "overdue") return "warning";
  return "danger";
}

export function ArcAuthoringContext({
  artifact,
  onChangePolicy,
  proposal,
  source,
}: ArcAuthoringContextProps) {
  return (
    <section
      aria-label="Current policy authoring context"
      className="rounded-lg border border-border bg-surface p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent-strong">
            <FileCheck2 aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
              Current policy
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-foreground">
              {artifact.title}
            </h2>
            <p className="mt-1 break-words text-sm text-muted">
              {artifact.slug} · {formatArcLabel(artifact.kind)} ·{" "}
              {formatArcLabel(artifact.owning_scope)} scope
            </p>
          </div>
        </div>
        <Button onClick={onChangePolicy} variant="ghost">
          <RefreshCw aria-hidden="true" className="size-4" />
          Change policy
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
        <StatusBadge tone={artifact.active_revision_id ? "success" : "neutral"}>
          {artifact.active_revision_id ? "Active revision" : "No active revision"}
        </StatusBadge>
        <StatusBadge tone={sourceTone(source)}>
          {source ? `Source ${formatArcLabel(source.status)}` : "Source needed"}
        </StatusBadge>
        <StatusBadge tone={proposal ? "info" : "neutral"}>
          {proposal ? `Draft ${formatArcLabel(proposal.state)}` : "Draft not opened"}
        </StatusBadge>
      </div>
    </section>
  );
}
