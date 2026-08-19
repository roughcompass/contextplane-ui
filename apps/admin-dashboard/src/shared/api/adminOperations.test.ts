import { describe, expect, it, vi } from "vitest";

import type { ContextplaneClient } from "./client";
import { executeAdminOperation } from "./adminOperations";

function testClient() {
  return { request: vi.fn(async () => ({ status: "ok" })) } satisfies ContextplaneClient;
}

describe("executeAdminOperation", () => {
  it("resolves only declared path values and omits blank query values", async () => {
    const client = testClient();

    await executeAdminOperation(
      client,
      {
        method: "GET",
        path: "/v1/admin/tenants/{tenant_id}/progression-definitions/{progression_id}",
        pathValues: { progression_id: "definition/a", tenant_id: "tenant a" },
        queryValues: { cursor: "", from: "2026-01-01" },
      },
      { tenantId: "tenant-a" },
    );

    expect(client.request).toHaveBeenCalledWith(
      "/v1/admin/tenants/tenant%20a/progression-definitions/definition%2Fa?from=2026-01-01",
      expect.objectContaining({ method: "GET", tenantId: "tenant-a" }),
    );
  });

  it("forwards mutation bodies, idempotency keys, and cancellation", async () => {
    const client = testClient();
    const controller = new AbortController();

    await executeAdminOperation(
      client,
      {
        body: { display_name: "Source", source_type: "github" },
        idempotencyKey: "idempotency-a",
        method: "POST",
        path: "/v1/admin/sync-sources",
      },
      {},
      controller.signal,
    );

    expect(client.request).toHaveBeenCalledWith("/v1/admin/sync-sources", {
      body: { display_name: "Source", source_type: "github" },
      headers: { "Idempotency-Key": "idempotency-a" },
      method: "POST",
      signal: controller.signal,
    });
  });

  it("refuses an unresolved required path value before making a request", async () => {
    const client = testClient();

    await expect(
      executeAdminOperation(client, {
        method: "DELETE",
        path: "/v1/admin/sync-sources/{source_id}",
        pathValues: { source_id: " " },
      }),
    ).rejects.toThrow("Enter source id.");
    expect(client.request).not.toHaveBeenCalled();
  });
});
