import type { SessionEventKind, SessionSummary, ToolUsage } from "../../shared/api";

export type SessionWindow = "7-days" | "30-days" | "90-days";

export interface SessionWindowOption {
  days: number;
  label: string;
  value: SessionWindow;
}

export const sessionWindowOptions: readonly SessionWindowOption[] = [
  { days: 7, label: "Last 7 days", value: "7-days" },
  { days: 30, label: "Last 30 days", value: "30-days" },
  { days: 90, label: "Last 90 days", value: "90-days" },
];

export const sessionLimitOptions = [50, 100, 250] as const;
export type SessionLimit = (typeof sessionLimitOptions)[number];

export const defaultSessionWindow: SessionWindow = "30-days";
export const defaultSessionLimit: SessionLimit = 100;

export const sessionKindOptions: readonly { label: string; value: SessionEventKind | "" }[] = [
  { label: "All event kinds", value: "" },
  { label: "User messages", value: "user_message" },
  { label: "Agent actions", value: "agent_action" },
  { label: "Tool invocations", value: "tool_invocation" },
];

const sessionMemoryToolNames = new Set([
  "delete_session_event",
  "get_session_event",
  "list_session_events",
  "list_sessions",
  "record_session_event",
]);

function dateAtUtcStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function windowDays(window: SessionWindow): number {
  const option = sessionWindowOptions.find((candidate) => candidate.value === window);
  if (!option) throw new Error(`Unknown session window: ${window}`);
  return option.days;
}

export function isSessionWindow(value: string | null): value is SessionWindow {
  return sessionWindowOptions.some((option) => option.value === value);
}

export function parseSessionLimit(value: string | null): SessionLimit | null {
  if (!value) return null;
  const parsed = Number(value);
  return sessionLimitOptions.find((limit) => limit === parsed) ?? null;
}

export function isSessionEventKind(value: string | null): value is SessionEventKind {
  return value === "user_message" || value === "agent_action" || value === "tool_invocation";
}

export function sessionWindowRange(
  window: SessionWindow,
  now: Date = new Date(),
): { from: string; since: string; to: string } {
  const end = dateAtUtcStart(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (windowDays(window) - 1));

  return {
    from: start.toISOString().slice(0, 10),
    since: start.toISOString(),
    to: end.toISOString().slice(0, 10),
  };
}

export function formatSessionTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatUsageWindow(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const range = `${formatter.format(startDate)}–${formatter.format(endDate)}`;
  return sameYear ? `${range}, ${endDate.getUTCFullYear()}` : range;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatLatency(value: number | null): string {
  return value === null ? "Not available" : `${formatNumber(value)} ms`;
}

export function shortIdentifier(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 14)}…${value.slice(-7)}`;
}

export function filterSessions(
  sessions: readonly SessionSummary[],
  query: string,
): readonly SessionSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return sessions;
  return sessions.filter((session) => session.session_id.toLocaleLowerCase().includes(normalized));
}

export function sessionEventKindLabel(kind: string): string {
  if (kind === "user_message") return "User message";
  if (kind === "agent_action") return "Agent action";
  if (kind === "tool_invocation") return "Tool invocation";
  return kind.replaceAll("_", " ");
}

export function sessionMemoryTools(tools: readonly ToolUsage[]): readonly ToolUsage[] {
  return tools.filter((tool) => sessionMemoryToolNames.has(tool.tool));
}
