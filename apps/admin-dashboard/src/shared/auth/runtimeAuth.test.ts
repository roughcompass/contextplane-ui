import { describe, expect, it, vi } from "vitest";

import {
  createBrowserAccessTokenProvider,
  isLoopbackHostname,
  LocalDevelopmentAccessTokenProvider,
  type AccessTokenProvider,
} from "./runtimeAuth";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

function tokenResponse(accessToken: string, expiresAt: number): Response {
  return Response.json({ access_token: accessToken, expires_at: expiresAt });
}

describe("LocalDevelopmentAccessTokenProvider", () => {
  it("caches a minted token for the browser session", async () => {
    const storage = memoryStorage();
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse("local-token", 2_000));
    const provider = new LocalDevelopmentAccessTokenProvider({
      fetchImplementation,
      now: () => 1_000,
      storage,
    });

    await expect(provider.getAccessToken()).resolves.toBe("local-token");
    await expect(provider.getAccessToken()).resolves.toBe("local-token");

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/__contextplane/dev-token",
      expect.objectContaining({ credentials: "same-origin", method: "POST" }),
    );
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it("re-mints expired tokens and clears rejected tokens", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "contextplane:localhost-access-token:v1",
      JSON.stringify({ accessToken: "expiring-token", expiresAt: 1_050 }),
    );
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(tokenResponse("fresh-token", 2_000));
    const provider = new LocalDevelopmentAccessTokenProvider({
      fetchImplementation,
      now: () => 1_000,
      storage,
    });

    await expect(provider.getAccessToken()).resolves.toBe("fresh-token");
    provider.invalidate();

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(storage.removeItem).toHaveBeenCalledWith("contextplane:localhost-access-token:v1");
  });

  it("de-duplicates concurrent token mints", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const provider = new LocalDevelopmentAccessTokenProvider({
      fetchImplementation,
      storage: memoryStorage(),
    });

    const first = provider.getAccessToken();
    const second = provider.getAccessToken();
    resolveResponse?.(tokenResponse("shared-token", 4_000_000_000));

    await expect(Promise.all([first, second])).resolves.toEqual(["shared-token", "shared-token"]);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("refuses malformed or unsuccessful broker responses", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ expires_at: 2_000 }));
    const provider = new LocalDevelopmentAccessTokenProvider({
      fetchImplementation,
      storage: null,
    });

    await expect(provider.getAccessToken()).rejects.toThrow(
      "The local development session could not be established.",
    );
    await expect(provider.getAccessToken()).rejects.toThrow(
      "The local development session could not be established.",
    );
  });
});

describe("createBrowserAccessTokenProvider", () => {
  it("always gives a dynamically supplied host provider precedence", async () => {
    const localProvider: AccessTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("local-token"),
      invalidate: vi.fn(),
    };
    const hostProvider = vi.fn().mockResolvedValue("host-token");
    const provider = createBrowserAccessTokenProvider({
      getHostAccessToken: () => hostProvider,
      hostname: "localhost",
      isDevelopment: true,
      localProvider,
    });

    await expect(provider.getAccessToken()).resolves.toBe("host-token");
    provider.invalidate();

    expect(localProvider.getAccessToken).not.toHaveBeenCalled();
    expect(localProvider.invalidate).not.toHaveBeenCalled();
  });

  it("uses the local fallback only during loopback development", async () => {
    const localProvider: AccessTokenProvider = {
      getAccessToken: vi.fn().mockResolvedValue("local-token"),
      invalidate: vi.fn(),
    };
    const local = createBrowserAccessTokenProvider({
      getHostAccessToken: () => undefined,
      hostname: "127.0.0.1",
      isDevelopment: true,
      localProvider,
    });
    const deployed = createBrowserAccessTokenProvider({
      getHostAccessToken: () => undefined,
      hostname: "console.example.com",
      isDevelopment: true,
      localProvider,
    });

    await expect(local.getAccessToken()).resolves.toBe("local-token");
    local.invalidate();
    await expect(deployed.getAccessToken()).resolves.toBeNull();

    expect(localProvider.invalidate).toHaveBeenCalledOnce();
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
    expect(isLoopbackHostname("dev.example.com")).toBe(false);
  });
});
