import type {
  ArcProposalVersion,
  ArcStructuredResponse,
  ToolUsageRanking,
} from "../../shared/api/contextplane";

export interface ArcReceiptDirective {
  artifactId: string;
  audienceRedacted: boolean;
  directiveId: string;
  isMandatory: boolean;
  omissionReason: string | null;
  revisionId: string;
  sourceLocator: string | null;
  wasOmitted: boolean;
}

export interface ArcReceiptEvent {
  createdAt: string;
  eventSource: string;
  eventType: string;
  sequence: number;
}

export interface ArcReceiptView {
  blockedReasons: readonly string[];
  budgetLimitBytes: number | null;
  degradedReasons: readonly string[];
  evaluatedAt: string | null;
  events: readonly ArcReceiptEvent[];
  integrityState: string;
  mandatoryDirectiveCount: number | null;
  receiptId: string;
  renderedContentBytes: number | null;
  resolutionStatus: string;
  selected: readonly ArcReceiptDirective[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = "Unavailable"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readDirectives(value: unknown): readonly ArcReceiptDirective[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    return [
      {
        artifactId: readString(item.artifact_id),
        audienceRedacted: readBoolean(item.audience_redacted),
        directiveId: readString(item.directive_id),
        isMandatory: readBoolean(item.is_mandatory),
        omissionReason: readNullableString(item.omission_reason),
        revisionId: readString(item.revision_id),
        sourceLocator: readNullableString(item.source_locator),
        wasOmitted: readBoolean(item.was_omitted),
      },
    ];
  });
}

function readEvents(value: unknown): readonly ArcReceiptEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.sequence !== "number") return [];
    return [
      {
        createdAt: readString(item.created_at),
        eventSource: readString(item.event_source),
        eventType: readString(item.event_type),
        sequence: item.sequence,
      },
    ];
  });
}

export function toArcReceiptView(
  receipt: ArcStructuredResponse,
  explanation?: ArcStructuredResponse,
): ArcReceiptView {
  const source = explanation ?? receipt;
  const budget = isRecord(source.budget) ? source.budget : source;
  return {
    blockedReasons: readStringArray(source.blocked_reasons),
    budgetLimitBytes: readNumber(budget.budget_limit_bytes),
    degradedReasons: readStringArray(source.degraded_reasons),
    evaluatedAt: readNullableString(source.evaluated_at),
    events: readEvents(source.events),
    integrityState: readString(source.integrity_state),
    mandatoryDirectiveCount: readNumber(receipt.mandatory_directive_count),
    receiptId: readString(source.receipt_id),
    renderedContentBytes: readNumber(budget.rendered_content_bytes),
    resolutionStatus: readString(source.resolution_status),
    selected: readDirectives(source.selected),
  };
}

export function getArcUsageWindow(now = new Date()): { from: string; to: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function getArcToolUsage(ranking: ToolUsageRanking) {
  return ranking.tools.filter(({ tool }) => tool.startsWith("arc_"));
}

export function formatArcLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) =>
      part.toLocaleLowerCase() === "arc"
        ? "ARC"
        : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join(" ");
}

export function formatArcDate(value: string | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        timeZoneName: "short",
        year: "numeric",
      }).format(date);
}

export function formatArcCount(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "Not published"
    : new Intl.NumberFormat().format(value);
}

export function proposalActionSummary(proposal: ArcProposalVersion): string {
  if (proposal.available_actions.length === 0) return "No actions are currently available.";
  return proposal.available_actions.map(formatArcLabel).join(", ");
}
