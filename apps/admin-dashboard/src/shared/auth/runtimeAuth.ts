export interface AccessTokenProvider {
  getAccessToken(): Promise<string | null>;
  invalidate(): void;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAt: number;
}

interface LocalDevelopmentAccessTokenProviderOptions {
  endpoint?: string;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  storage?: Pick<Storage, "getItem" | "removeItem" | "setItem"> | null;
}

interface BrowserAccessTokenProviderOptions {
  getHostAccessToken: () => (() => Promise<string | null> | string | null) | undefined;
  hostname: string;
  isDevelopment: boolean;
  localProvider?: AccessTokenProvider;
}

const CACHE_KEY = "contextplane:localhost-access-token:v1";
const EXPIRY_MARGIN_SECONDS = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readCachedAccessToken(
  storage: LocalDevelopmentAccessTokenProviderOptions["storage"],
): CachedAccessToken | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeCachedAccessToken(
  storage: LocalDevelopmentAccessTokenProviderOptions["storage"],
  token: CachedAccessToken,
): void {
  if (!storage) return;
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(token));
  } catch {
    // A disabled or full storage area only costs another invisible token mint.
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export class LocalDevelopmentAccessTokenProvider implements AccessTokenProvider {
  private readonly endpoint: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly now: () => number;
  private readonly storage: LocalDevelopmentAccessTokenProviderOptions["storage"];
  private inFlight: Promise<string | null> | null = null;

  constructor(options: LocalDevelopmentAccessTokenProviderOptions = {}) {
    this.endpoint = options.endpoint ?? "/__contextplane/dev-token";
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => Date.now() / 1000);
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
  }

  async getAccessToken(): Promise<string | null> {
    const cached = readCachedAccessToken(this.storage);
    if (cached && cached.expiresAt - EXPIRY_MARGIN_SECONDS > this.now()) {
      return cached.accessToken;
    }

    this.inFlight ??= this.mint().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  invalidate(): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(CACHE_KEY);
    } catch {
      // Storage is only a cache; a later request can mint again.
    }
  }

  private async mint(): Promise<string> {
    const response = await this.fetchImplementation(this.endpoint, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      method: "POST",
    });
    const body: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      !isRecord(body) ||
      typeof body.access_token !== "string" ||
      typeof body.expires_at !== "number"
    ) {
      throw new Error("The local development session could not be established.");
    }

    const cached = { accessToken: body.access_token, expiresAt: body.expires_at };
    writeCachedAccessToken(this.storage, cached);
    return cached.accessToken;
  }
}

export function createBrowserAccessTokenProvider({
  getHostAccessToken,
  hostname,
  isDevelopment,
  localProvider,
}: BrowserAccessTokenProviderOptions): AccessTokenProvider {
  const localhostFallback =
    isDevelopment && isLoopbackHostname(hostname)
      ? (localProvider ?? new LocalDevelopmentAccessTokenProvider())
      : null;

  return {
    async getAccessToken() {
      const hostProvider = getHostAccessToken();
      if (hostProvider) return hostProvider();
      return localhostFallback?.getAccessToken() ?? null;
    },
    invalidate() {
      if (!getHostAccessToken()) localhostFallback?.invalidate();
    },
  };
}
