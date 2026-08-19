import { describe, expect, it, vi } from "vitest";

import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import { queryAuditRecords } from "./audit";

const row = {
  action: "proposal.approve",
  actor_id: "actor-a",
  after_jsonb: { outcome: "approved" },
  audit_id: "audit-a",
  before_jsonb: { outcome: "open" },
  error_code: null,
  request_id: "request-a",
  target_id: "proposal-a",
  target_type: "proposal",
  ts: "2026-08-12T14:28:41Z",
};

describe("queryAuditRecords", () => {
  it("passes opaque cursors unchanged and expands date-only boundaries", async () => {
    const client = {
      request: vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
        void path;
        void options;
        return {
          items: [row],
          next_cursor: "opaque+/cursor==",
        };
      }),
    } satisfies ContextplaneClient;

    const result = await queryAuditRecords(
      client,
      {
        action: "proposal.approve",
        actorId: "actor-a",
        cursor: "opaque+/cursor==",
        from: "2026-08-01",
        pageSize: 25,
        targetId: "proposal-a",
        targetType: "proposal",
        to: "2026-08-12",
      },
      { tenantId: "tenant-a" },
    );

    const requestedPath = client.request.mock.calls[0]?.[0] ?? "";
    const requestedUrl = new URL(requestedPath, "https://example.test");
    expect(requestedUrl.pathname).toBe("/v1/admin/audit");
    expect(Object.fromEntries(requestedUrl.searchParams)).toEqual({
      action: "proposal.approve",
      actor_id: "actor-a",
      cursor: "opaque+/cursor==",
      from: "2026-08-01T00:00:00Z",
      page_size: "25",
      target_id: "proposal-a",
      target_type: "proposal",
      to: "2026-08-12T23:59:59.999Z",
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "GET", tenantId: "tenant-a" }),
    );
    expect(result).toEqual({ items: [row], next_cursor: "opaque+/cursor==" });
  });

  it("rejects malformed service payloads at the API boundary", async () => {
    const client = {
      request: vi.fn(async () => ({ items: [{ audit_id: 42 }], next_cursor: null })),
    } satisfies ContextplaneClient;

    await expect(queryAuditRecords(client, {})).rejects.toThrow("Invalid audit response");
  });
});
