import { describe, expect, it, vi } from "vitest";

import { ContextplaneApiError, createContextplaneClient } from "./client";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

describe("createContextplaneClient", () => {
  it("sends runtime authentication and tenant context without bundling either value", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createContextplaneClient({
      baseUrl: "https://context.example/",
      fetchImplementation,
      getAccessToken: () => "runtime-token",
    });

    await expect(client.request("/v1/whoami", { tenantId: "tenant-a" })).resolves.toEqual({
      ok: true,
    });

    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe("https://context.example/v1/whoami");
    expect(request?.credentials).toBe("same-origin");
    expect(new Headers(request?.headers).get("Authorization")).toBe("Bearer runtime-token");
    expect(new Headers(request?.headers).get("X-Tenant-ID")).toBe("tenant-a");
  });

  it("keeps requests relative when a same-origin gateway supplies authentication", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]));
    const client = createContextplaneClient({ fetchImplementation });

    await client.request("/v1/memory/sessions");

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/v1/memory/sessions",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    const request = fetchImplementation.mock.calls[0]?.[1];
    expect(new Headers(request?.headers).has("Authorization")).toBe(false);
    expect(new Headers(request?.headers).has("X-Tenant-ID")).toBe(false);
  });

  it("serializes JSON mutations with an explicit method and content type", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createContextplaneClient({ fetchImplementation });

    await client.request("/v1/memory/promotion-proposals/proposal-a", {
      body: { state: "accepted" },
      method: "PATCH",
    });

    const request = fetchImplementation.mock.calls[0]?.[1];
    expect(request?.method).toBe("PATCH");
    expect(request?.body).toBe(JSON.stringify({ state: "accepted" }));
    expect(new Headers(request?.headers).get("Content-Type")).toBe("application/json");
  });

  it("passes multipart bodies through so the browser can supply the boundary", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createContextplaneClient({ fetchImplementation });
    const body = new FormData();
    body.set("metadata", JSON.stringify({ policy_id: "policy-a" }));
    body.set("file", new Blob(["policy body"], { type: "text/plain" }), "policy.txt");

    await client.request("/v1/arc/sources/uploads", { body, method: "POST" });

    const request = fetchImplementation.mock.calls[0]?.[1];
    expect(request?.body).toBe(body);
    expect(new Headers(request?.headers).has("Content-Type")).toBe(false);
  });

  it("forwards operation headers without allowing them to replace runtime authorization", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const client = createContextplaneClient({
      fetchImplementation,
      getAccessToken: () => "runtime-token",
    });

    await client.request("/v1/admin/sync-sources/source-a/trigger", {
      headers: { Authorization: "untrusted", "Idempotency-Key": "operation-key" },
      method: "POST",
    });

    const headers = new Headers(fetchImplementation.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer runtime-token");
    expect(headers.get("Idempotency-Key")).toBe("operation-key");
  });

  it("invalidates and retries an unauthorized request once with a fresh token", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ detail: "expired" }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const getAccessToken = vi
      .fn<() => string | null>()
      .mockReturnValueOnce("expired-token")
      .mockReturnValueOnce("fresh-token");
    const onUnauthorized = vi.fn();
    const client = createContextplaneClient({
      fetchImplementation,
      getAccessToken,
      onUnauthorized,
    });

    await expect(client.request("/v1/whoami")).resolves.toEqual({ ok: true });

    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchImplementation.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer fresh-token",
    );
  });

  it("does not retry an unauthorized request more than once", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ detail: "authentication required" }, { status: 401 }));
    const client = createContextplaneClient({
      fetchImplementation,
      getAccessToken: () => "rejected-token",
      onUnauthorized: vi.fn(),
    });

    await expect(client.request("/v1/whoami")).rejects.toMatchObject({ status: 401 });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it("supports successful no-content deletes", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createContextplaneClient({ fetchImplementation });

    await expect(
      client.request("/v1/workspaces/workspace-a", { method: "DELETE" }),
    ).resolves.toBeNull();
    expect(fetchImplementation.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("preserves structured service errors and request correlation", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          errors: [
            {
              available_tenants: ["northstar", "field-labs"],
              code: "tenant_required",
              message: "choose a tenant",
              path: null,
            },
          ],
        },
        { headers: { "x-request-id": "request-123" }, status: 400 },
      ),
    );
    const client = createContextplaneClient({ fetchImplementation });

    const error = await client.request("/v1/whoami").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ContextplaneApiError);
    expect(error).toMatchObject({
      code: "tenant_required",
      requestId: "request-123",
      status: 400,
    });
    expect((error as ContextplaneApiError).errors[0]).toMatchObject({
      available_tenants: ["northstar", "field-labs"],
    });
  });

  it("preserves FastAPI detail errors used by workspace PII admission", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          detail: {
            categories: ["PII_EMAIL"],
            code: "pii_detected",
            field: "workspace_entry.body",
          },
        },
        { status: 422 },
      ),
    );
    const client = createContextplaneClient({ fetchImplementation });

    const error = await client
      .request("/v1/workspaces/workspace-a/entries")
      .catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: "pii_detected", status: 422 });
    expect((error as ContextplaneApiError).errors[0]).toMatchObject({
      categories: ["PII_EMAIL"],
      field: "workspace_entry.body",
    });
  });

  it("classifies malformed failures and network failures without exposing response text", async () => {
    const malformedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not-json", { status: 503 }));
    const malformedClient = createContextplaneClient({ fetchImplementation: malformedFetch });

    await expect(malformedClient.request("/v1/whoami")).rejects.toMatchObject({
      code: "http_503",
      status: 503,
    });

    const networkClient = createContextplaneClient({
      fetchImplementation: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")),
    });
    await expect(networkClient.request("/v1/whoami")).rejects.toMatchObject({
      code: "network_error",
      status: 0,
    });
  });
});
