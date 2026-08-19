import { describe, expect, it, vi } from "vitest";

import { createDevTokenBrokerResponse, isLoopbackHost } from "./devTokenBroker";

const options = {
  clientId: "registry-dev",
  clientSecret: "server-only-secret",
  idpOrigin: "http://localhost:8090/",
  now: () => 1_000,
};

describe("createDevTokenBrokerResponse", () => {
  it("mints a scoped token while keeping client credentials server-side", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ access_token: "minted-token", expires_in: 900 }));

    const result = await createDevTokenBrokerResponse(
      { host: "localhost:3000", method: "POST", remoteAddress: "::1" },
      { ...options, fetchImplementation },
    );

    expect(result).toEqual({
      body: { access_token: "minted-token", expires_at: 1_900 },
      status: 200,
    });
    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:8090/default/token");
    expect(request?.body?.toString()).toBe(
      "client_id=registry-dev&client_secret=server-only-secret&grant_type=" +
        "client_credentials&scope=registry",
    );
    expect(JSON.stringify(result)).not.toContain("server-only-secret");
  });

  it("is unavailable to non-loopback hosts and rejects other methods", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    await expect(
      createDevTokenBrokerResponse(
        { host: "console.example.com", method: "POST", remoteAddress: "::1" },
        { ...options, fetchImplementation },
      ),
    ).resolves.toEqual({ body: { error: "not_found" }, status: 404 });
    await expect(
      createDevTokenBrokerResponse(
        { host: "[::1]:3000", method: "GET", remoteAddress: "::ffff:127.0.0.1" },
        { ...options, fetchImplementation },
      ),
    ).resolves.toEqual({ body: { error: "method_not_allowed" }, status: 405 });
    await expect(
      createDevTokenBrokerResponse(
        { host: "localhost", method: "POST", remoteAddress: "192.0.2.10" },
        { ...options, fetchImplementation },
      ),
    ).resolves.toEqual({ body: { error: "not_found" }, status: 404 });

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(isLoopbackHost("127.0.0.1:3000")).toBe(true);
    expect(isLoopbackHost("not a host")).toBe(false);
  });

  it("does not expose identity-provider failures", async () => {
    const unavailable = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: "invalid_client" }, { status: 400 }));
    const unreachable = vi.fn<typeof fetch>().mockRejectedValue(new Error("connection refused"));

    await expect(
      createDevTokenBrokerResponse(
        { host: "localhost", method: "POST", remoteAddress: "127.0.0.1" },
        { ...options, fetchImplementation: unavailable },
      ),
    ).resolves.toEqual({ body: { error: "dev_session_unavailable" }, status: 502 });
    await expect(
      createDevTokenBrokerResponse(
        { host: "localhost", method: "POST", remoteAddress: "127.0.0.1" },
        { ...options, fetchImplementation: unreachable },
      ),
    ).resolves.toEqual({ body: { error: "dev_session_unavailable" }, status: 502 });
  });
});
