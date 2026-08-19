import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";

export type AdminOperationMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export interface AdminOperationRequest {
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  idempotencyKey?: string;
  method: AdminOperationMethod;
  path: string;
  pathValues?: Readonly<Record<string, string>>;
  queryValues?: Readonly<Record<string, string>>;
}

function resolvedPath(path: string, values: Readonly<Record<string, string>>): string {
  return path.replaceAll(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = values[name]?.trim();
    if (!value) throw new Error(`Enter ${name.replaceAll("_", " ")}.`);
    return encodeURIComponent(value);
  });
}

export async function executeAdminOperation(
  client: ContextplaneClient,
  operation: AdminOperationRequest,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<unknown> {
  const path = resolvedPath(operation.path, operation.pathValues ?? {});
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(operation.queryValues ?? {})) {
    if (value.trim()) query.set(name, value.trim());
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  const headers = {
    ...operation.headers,
    ...(operation.idempotencyKey ? { "Idempotency-Key": operation.idempotencyKey } : {}),
  };
  return client.request(`${path}${suffix}`, {
    ...(operation.body === undefined ? {} : { body: operation.body }),
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(signal ? { signal } : {}),
    method: operation.method,
  });
}
