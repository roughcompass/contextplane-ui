import type {
  MemoryCurationCounts,
  PromotionProposal,
  SessionSummary,
  Workspace,
} from "../../shared/api";

export const overviewPreviewLimit = 3;

export interface CurationReasonSummary {
  count: number;
  label: string;
  reason: string;
}

function timestampValue(value: string | null): number {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function formatOverviewTimestamp(value: string | null): string {
  if (value === null) return "Not published";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid service timestamp";
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
}

export function shortOverviewIdentifier(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export function humanizeOverviewToken(value: string): string {
  const words = value.replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ").trim();
  return words ? `${words.charAt(0).toLocaleUpperCase()}${words.slice(1)}` : "Unspecified";
}

export function overviewValuePreview(value: unknown, limit = 80): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  const text = serialized ?? String(value);
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1))}…`;
}

export function curationReasonSummaries(
  value: MemoryCurationCounts,
): readonly CurationReasonSummary[] {
  return Object.entries(value.counts)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => ({ count, label: humanizeOverviewToken(reason), reason }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function curationQueueTotal(value: MemoryCurationCounts): number {
  return curationReasonSummaries(value).reduce((sum, item) => sum + item.count, 0);
}

export function selectOverviewProposals(
  proposals: readonly PromotionProposal[],
  limit = overviewPreviewLimit,
): readonly PromotionProposal[] {
  return [...proposals]
    .sort(
      (left, right) =>
        Number(right.high_impact) - Number(left.high_impact) ||
        timestampValue(right.created_at) - timestampValue(left.created_at),
    )
    .slice(0, limit);
}

export function selectRecentSessions(
  sessions: readonly SessionSummary[],
  limit = overviewPreviewLimit,
): readonly SessionSummary[] {
  return [...sessions]
    .sort(
      (left, right) =>
        timestampValue(right.last_activity_at) - timestampValue(left.last_activity_at),
    )
    .slice(0, limit);
}

export function selectRecentWorkspaces(
  workspaces: readonly Workspace[],
  limit = overviewPreviewLimit,
): readonly Workspace[] {
  return [...workspaces]
    .filter((workspace) => !workspace.archived_at)
    .sort((left, right) => timestampValue(right.updated_at) - timestampValue(left.updated_at))
    .slice(0, limit);
}

export function selectGovernedOutcomes(
  accepted: readonly PromotionProposal[],
  amended: readonly PromotionProposal[],
  limit = overviewPreviewLimit,
): readonly PromotionProposal[] {
  const eligible = [...accepted, ...amended].filter(
    (proposal) => proposal.state === "accepted" || proposal.state === "amended",
  );
  const unique = [
    ...new Map(eligible.map((proposal) => [proposal.proposal_id, proposal])).values(),
  ];
  return unique
    .sort((left, right) => timestampValue(right.created_at) - timestampValue(left.created_at))
    .slice(0, limit);
}

export function overviewProposalHref(proposal: PromotionProposal): string {
  const path = `/memory/promotions/${encodeURIComponent(proposal.proposal_id)}`;
  return proposal.state === "open" ? path : `${path}?state=${proposal.state}`;
}

export function overviewSessionHref(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}`;
}

export function overviewWorkspaceHref(workspaceId: string): string {
  return `/notebooks/${encodeURIComponent(workspaceId)}`;
}
