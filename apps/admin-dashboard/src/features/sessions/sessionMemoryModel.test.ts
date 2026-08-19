import { describe, expect, it } from "vitest";

import {
  filterSessions,
  formatLatency,
  formatNumber,
  formatSessionTimestamp,
  formatUsageWindow,
  isSessionEventKind,
  isSessionWindow,
  parseSessionLimit,
  sessionEventKindLabel,
  sessionMemoryTools,
  sessionWindowRange,
  shortIdentifier,
} from "./sessionMemoryModel";

const sessions = [
  {
    event_count: 3,
    first_activity_at: "2026-08-12T10:00:00Z",
    last_activity_at: "2026-08-12T10:05:00Z",
    session_id: "session-alpha",
  },
  {
    event_count: 9,
    first_activity_at: "2026-08-11T09:00:00Z",
    last_activity_at: "2026-08-11T11:00:00Z",
    session_id: "support-beta",
  },
] as const;

describe("session memory model", () => {
  it("turns a relative selection into matching session and usage boundaries", () => {
    expect(sessionWindowRange("7-days", new Date("2026-08-12T18:30:00Z"))).toEqual({
      from: "2026-08-06",
      since: "2026-08-06T00:00:00.000Z",
      to: "2026-08-12",
    });
    expect(sessionWindowRange("30-days", new Date("2026-08-12T18:30:00Z")).from).toBe("2026-07-14");
    expect(sessionWindowRange("90-days", new Date("2026-08-12T18:30:00Z")).from).toBe("2026-05-15");
  });

  it("validates URL vocabulary without accepting invented values", () => {
    expect(isSessionWindow("7-days")).toBe(true);
    expect(isSessionWindow("all-time")).toBe(false);
    expect(parseSessionLimit("250")).toBe(250);
    expect(parseSessionLimit("500")).toBeNull();
    expect(isSessionEventKind("tool_invocation")).toBe(true);
    expect(isSessionEventKind("trace")).toBe(false);
  });

  it("filters only the sessions already returned by the actor-scoped endpoint", () => {
    expect(filterSessions(sessions, " SUPPORT ")).toEqual([sessions[1]]);
    expect(filterSessions(sessions, "")).toBe(sessions);
  });

  it("formats identifiers, timestamps, windows, counts, and honest missing latency", () => {
    expect(shortIdentifier("short-session")).toBe("short-session");
    expect(shortIdentifier("session-1234567890-abcdefghijklmnop")).toBe("session-123456…jklmnop");
    expect(formatSessionTimestamp("2026-08-12T10:05:06Z")).toMatch(/Aug 12, 2026.*10:05:06.*UTC/);
    expect(formatUsageWindow("2026-07-14", "2026-08-12")).toBe("Jul 14–Aug 12, 2026");
    expect(formatUsageWindow("2025-12-30", "2026-01-02")).toBe("Dec 30, 2025–Jan 2, 2026");
    expect(formatNumber(12340)).toBe("12,340");
    expect(formatLatency(412)).toBe("412 ms");
    expect(formatLatency(null)).toBe("Not available");
  });

  it("labels event kinds and keeps only actual session-memory tool rows", () => {
    expect(sessionEventKindLabel("user_message")).toBe("User message");
    expect(sessionEventKindLabel("agent_action")).toBe("Agent action");
    expect(sessionEventKindLabel("tool_invocation")).toBe("Tool invocation");
    expect(sessionEventKindLabel("future_kind")).toBe("future kind");

    const rows = [
      {
        actor_days: 2,
        calls: 8,
        error_calls: 0,
        ok_calls: 8,
        tool: "list_sessions",
        worst_daily_p95_ms: 80,
      },
      {
        actor_days: 4,
        calls: 12,
        error_calls: 1,
        ok_calls: 11,
        tool: "search_capabilities",
        worst_daily_p95_ms: 120,
      },
    ];
    expect(sessionMemoryTools(rows)).toEqual([rows[0]]);
  });
});
