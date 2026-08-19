import type { Plugin } from "vite";

interface DevTokenBrokerOptions {
  clientId: string;
  clientSecret: string;
  fetchImplementation?: typeof fetch;
  idpOrigin: string;
  now?: () => number;
}

interface DevTokenBrokerRequest {
  host: string | undefined;
  method: string | undefined;
  remoteAddress: string | undefined;
}

interface DevTokenBrokerResponse {
  body: Readonly<Record<string, unknown>>;
  status: number;
}

const ENDPOINT = "/__contextplane/dev-token";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  try {
    const hostname = new URL(`http://${host}`).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function isLoopbackAddress(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export async function createDevTokenBrokerResponse(
  request: DevTokenBrokerRequest,
  {
    clientId,
    clientSecret,
    fetchImplementation = globalThis.fetch.bind(globalThis),
    idpOrigin,
    now = () => Date.now() / 1000,
  }: DevTokenBrokerOptions,
): Promise<DevTokenBrokerResponse> {
  if (!isLoopbackHost(request.host) || !isLoopbackAddress(request.remoteAddress)) {
    return { body: { error: "not_found" }, status: 404 };
  }
  if (request.method !== "POST") {
    return { body: { error: "method_not_allowed" }, status: 405 };
  }

  try {
    const response = await fetchImplementation(`${idpOrigin.replace(/\/$/, "")}/default/token`, {
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
        scope: "registry",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(body) || typeof body.access_token !== "string") {
      return { body: { error: "dev_session_unavailable" }, status: 502 };
    }

    const expiresIn =
      typeof body.expires_in === "number" && Number.isFinite(body.expires_in) && body.expires_in > 0
        ? body.expires_in
        : 3600;
    return {
      body: {
        access_token: body.access_token,
        expires_at: Math.floor(now() + expiresIn),
      },
      status: 200,
    };
  } catch {
    return { body: { error: "dev_session_unavailable" }, status: 502 };
  }
}

export function devTokenBroker(options: DevTokenBrokerOptions): Plugin {
  return {
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url ?? "/", "http://localhost").pathname;
        if (path !== ENDPOINT) {
          next();
          return;
        }

        const result = await createDevTokenBrokerResponse(
          {
            host: request.headers.host,
            method: request.method,
            remoteAddress: request.socket.remoteAddress,
          },
          options,
        );
        response.statusCode = result.status;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify(result.body));
      });
    },
    name: "contextplane-local-dev-token-broker",
  };
}
