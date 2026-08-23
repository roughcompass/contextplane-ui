import { describe, expect, it, vi } from "vitest";

import type { ContextplaneRequestOptions } from "./client";
import { clientFromRequest } from "./client";
import {
  getTenantLearningAggregates,
  ingestTenantSignal,
  listTenantLearningMetrics,
  listTenantNotifications,
  markTenantNotificationRead,
} from "./activity";
const notification = {
  capability_id: "capability-a",
  capability_slug: "policy-evaluation",
  change_classification: "breaking",
  event_kind: "interface.changed",
  fetch_url: "/v1/capabilities/capability-a",
  notification_id: "notification-a",
  occurred_at: "2026-08-12T14:28:41Z",
  subscription_id: "subscription-a",
  tenant_id: "tenant-a",
  version_after: "2.0.0",
  version_before: "1.0.0",
};




function clientFor(handler: (path: string, options?: ContextplaneRequestOptions) => unknown) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
    handler(path, options),
  );
  return clientFromRequest(request);
}


describe("activity API", () => {
  it("parses notifications, forwards tenant scope, and preserves opaque cursors", async () => {
    const client = clientFor((path) => {
      if (path.includes(":mark-read")) return undefined;
      return { items: [notification], next_cursor: "opaque+/cursor==" };
    });

    const result = await listTenantNotifications(
      client,
      { cursor: "opaque+/cursor==", pageSize: 25, status: "all" },
      { tenantId: "tenant-a" },
    );
    await markTenantNotificationRead(client, "notification/a", { tenantId: "tenant-a" });

    const listPath = client.request.mock.calls[0]?.[0] ?? "";
    const listUrl = new URL(listPath, "https://example.test");
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      cursor: "opaque+/cursor==",
      page_size: "25",
      status: "all",
      view: "default",
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          capabilitySlug: "policy-evaluation",
          changeClassification: "breaking",
          notificationId: "notification-a",
        }),
      ],
      nextCursor: "opaque+/cursor==",
    });
    expect(client.request).toHaveBeenLastCalledWith(
      "/v1/notifications/notification%2Fa:mark-read",
      { method: "POST", tenantId: "tenant-a" },
    );
  });

  it("loads learning evidence and returns a validated signal receipt", async () => {
    const client = clientFor((path) => {
      if (path.startsWith("/v1/learning/aggregates")) return { total: 12 };
      if (path === "/v1/learning/metrics") return [{ metric: "acceptance", value: 0.8 }];
      if (path === "/v1/signals") {
        return {
          authority: "registered-source",
          content_digest: "sha256:signal-a",
          ingested_at: "2026-08-12T14:28:41Z",
          replayed: false,
          signal_id: "signal-a",
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    await expect(
      getTenantLearningAggregates(client, 14, { tenantId: "tenant-a" }),
    ).resolves.toEqual({ total: 12 });
    await expect(listTenantLearningMetrics(client, { tenantId: "tenant-a" })).resolves.toEqual([
      { metric: "acceptance", value: 0.8 },
    ]);
    const receipt = await ingestTenantSignal(
      client,
      {
        classification: "internal",
        event_time: "2026-08-12T14:28:41Z",
        idempotency_key: "signal-submission-a",
        observed_time: "2026-08-12T14:29:00Z",
        payload: { outcome: "accepted" },
        producer_id: "agent-a",
        producer_type: "agent",
        schema_version: "external_signal.v1",
        source_event_id: "event-a",
        source_id: "source-a",
        source_system: "tracker",
      },
      { tenantId: "tenant-a" },
    );

    expect(receipt).toEqual({
      authority: "registered-source",
      contentDigest: "sha256:signal-a",
      ingestedAt: "2026-08-12T14:28:41Z",
      replayed: false,
      signalId: "signal-a",
    });
    expect(client.request).toHaveBeenCalledWith(
      "/v1/signals",
      expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
    );
  });

  it("rejects malformed service payloads before they enter feature models", async () => {
    const client = clientFor(() => ({ items: [{ notification_id: 42 }], next_cursor: null }));

    await expect(listTenantNotifications(client)).rejects.toThrow(
      "Invalid API response: capability_id is not text.",
    );
  });
});
