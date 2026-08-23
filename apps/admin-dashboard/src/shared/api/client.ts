import { BRAND } from "@repo/ui/brand";
import { isRecord } from "./parse";

export interface ContextplaneErrorItem {
  code: string;
  message: string;
  path: string | null;
  [key: string]: unknown;
}

export class ContextplaneApiError extends Error {
  readonly code: string;
  readonly errors: readonly ContextplaneErrorItem[];
  readonly requestId: string | null;
  readonly status: number;

  constructor({
    errors,
    requestId,
    status,
  }: {
    errors: readonly ContextplaneErrorItem[];
    requestId: string | null;
    status: number;
  }) {
    const firstError = errors[0];
    super(firstError?.message || `${BRAND.name} request failed with status ${status}`);
    this.name = "ContextplaneApiError";
    this.code = firstError?.code ?? "request_failed";
    this.errors = errors;
    this.requestId = requestId;
    this.status = status;
  }
}

export interface ContextplaneRequestOptions {
  body?: FormData | unknown;
  headers?: Readonly<Record<string, string>>;
  method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  signal?: AbortSignal | undefined;
  tenantId?: string;
}

/** A parsed body together with the validator the response carried, if any. */
export interface ContextplaneResponse {
  etag: string | null;
  value: unknown;
}

export interface ContextplaneClient {
  request(path: string, options?: ContextplaneRequestOptions): Promise<unknown>;
  /**
   * The same request, keeping the `ETag`.
   *
   * A second method rather than a wider `request` return, because almost every
   * caller wants the body and would otherwise destructure past a field that is
   * `null` at all but one endpoint. Added when the first endpoint gained an
   * `ETag` to read; before that it would have returned `null` everywhere while
   * every test double in the app had to grow a member to satisfy it.
   */
  requestWithEtag(
    path: string,
    options?: ContextplaneRequestOptions,
  ): Promise<ContextplaneResponse>;
}

/**
 * A client that answers both methods from one `request`, for a test or an
 * adapter that has no headers to offer. `etag` is `null`, which is what a
 * response without the header means.
 */
export function clientFromRequest<Request extends ContextplaneClient["request"]>(
  request: Request,
): Omit<ContextplaneClient, "request"> & { request: Request } {
  return {
    request,
    async requestWithEtag(path, options = {}) {
      return { etag: null, value: await request(path, options) };
    },
  };
}

export interface ContextplaneClientOptions {
  baseUrl?: string;
  fetchImplementation?: typeof fetch;
  getAccessToken?: () => Promise<string | null> | string | null;
  onUnauthorized?: () => Promise<void> | void;
  timeoutMs?: number;
}

function errorItemsFrom(value: unknown, status: number): readonly ContextplaneErrorItem[] {
  if (isRecord(value) && Array.isArray(value.errors)) {
    const items = value.errors.flatMap((candidate): ContextplaneErrorItem[] => {
      if (!isRecord(candidate)) return [];
      const code = typeof candidate.code === "string" ? candidate.code : `http_${status}`;
      const message =
        typeof candidate.message === "string"
          ? candidate.message
          : "The request could not be completed.";
      const path = typeof candidate.path === "string" ? candidate.path : null;
      return [{ ...candidate, code, message, path }];
    });

    if (items.length > 0) return items;
  }

  if (isRecord(value) && isRecord(value.detail)) {
    const detail = value.detail;
    const code = typeof detail.code === "string" ? detail.code : `http_${status}`;
    const message =
      typeof detail.message === "string"
        ? detail.message
        : code === "pii_detected"
          ? "The service refused workspace material containing prohibited personal data."
          : "The request could not be completed.";
    return [{ ...detail, code, message, path: null }];
  }

  if (isRecord(value) && typeof value.detail === "string") {
    return [{ code: `http_${status}`, message: value.detail, path: null }];
  }

  return [
    { code: `http_${status}`, message: "The service returned an unreadable error.", path: null },
  ];
}

function requestUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createContextplaneClient({
  baseUrl = "",
  fetchImplementation = globalThis.fetch.bind(globalThis),
  getAccessToken,
  onUnauthorized,
  timeoutMs = 10_000,
}: ContextplaneClientOptions = {}): ContextplaneClient {
  async function perform(
    path: string,
    options: ContextplaneRequestOptions,
  ): Promise<ContextplaneResponse> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = window.setTimeout(() => controller.abort("timeout"), timeoutMs);

    try {
      const send = async () => {
        const token = await getAccessToken?.();
        const headers = new Headers({ Accept: "application/json" });
        for (const [name, value] of Object.entries(options.headers ?? {})) {
          headers.set(name, value);
        }
        if (token) headers.set("Authorization", `Bearer ${token}`);
        if (options.tenantId) headers.set("X-Tenant-ID", options.tenantId);
        const hasMultipartBody = options.body instanceof FormData;
        if (options.body !== undefined && !hasMultipartBody) {
          headers.set("Content-Type", "application/json");
        }
        const requestBody: BodyInit | undefined =
          options.body === undefined
            ? undefined
            : options.body instanceof FormData
              ? options.body
              : JSON.stringify(options.body);

        return fetchImplementation(requestUrl(baseUrl, path), {
          ...(requestBody === undefined ? {} : { body: requestBody }),
          credentials: "same-origin",
          headers,
          method: options.method ?? "GET",
          signal: controller.signal,
        });
      };

      let response = await send();
      if (response.status === 401 && onUnauthorized) {
        await onUnauthorized();
        response = await send();
      }
      const payload = await readJson(response);

      if (!response.ok) {
        throw new ContextplaneApiError({
          errors: errorItemsFrom(payload, response.status),
          requestId: response.headers.get("x-request-id"),
          status: response.status,
        });
      }

      return { etag: response.headers.get("etag"), value: payload };
    } catch (error) {
      if (error instanceof ContextplaneApiError) throw error;
      if (options.signal?.aborted) throw error;
      if (controller.signal.aborted) {
        throw new ContextplaneApiError({
          errors: [
            {
              code: "timeout",
              message: `The ${BRAND.name} service did not respond before the request deadline.`,
              path: null,
            },
          ],
          requestId: null,
          status: 0,
        });
      }
      throw new ContextplaneApiError({
        errors: [
          {
            code: "network_error",
            message: `The ${BRAND.name} service could not be reached.`,
            path: null,
          },
        ],
        requestId: null,
        status: 0,
      });
    } finally {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  return {
    async request(path, options = {}) {
      const { value } = await perform(path, options);
      return value;
    },
    async requestWithEtag(path, options = {}) {
      return perform(path, options);
    },
  };
}
