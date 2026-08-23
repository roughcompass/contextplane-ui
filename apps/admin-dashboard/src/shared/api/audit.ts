import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  isRecord,
  nullableString,
  requiredString,
} from "./parse";

export type AuditSnapshot = Readonly<Record<string, unknown>> | null;

export interface AuditRecord {
  action: string;
  actor_id: string | null;
  after_jsonb: AuditSnapshot;
  audit_id: string;
  before_jsonb: AuditSnapshot;
  error_code: string | null;
  request_id: string | null;
  target_id: string;
  target_type: string;
  ts: string;
}

export interface AuditRecordPage {
  items: readonly AuditRecord[];
  next_cursor: string | null;
}

export interface QueryAuditRecordsParameters {
  action?: string;
  actorId?: string;
  cursor?: string;
  from?: string;
  pageSize?: number;
  targetId?: string;
  targetType?: string;
  to?: string;
}

function snapshot(value: unknown, field: string): AuditSnapshot {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error(`Invalid audit response: ${field}`);
  return value;
}

function auditRecord(value: unknown): AuditRecord {
  if (!isRecord(value)) throw new Error("Invalid audit response: item");
  return {
    action: requiredString(value, "action"),
    actor_id: nullableString(value, "actor_id"),
    after_jsonb: snapshot(value.after_jsonb, "after_jsonb"),
    audit_id: requiredString(value, "audit_id"),
    before_jsonb: snapshot(value.before_jsonb, "before_jsonb"),
    error_code: nullableString(value, "error_code"),
    request_id: nullableString(value, "request_id"),
    target_id: requiredString(value, "target_id"),
    target_type: requiredString(value, "target_type"),
    ts: requiredString(value, "ts"),
  };
}

function asAuditRecordPage(value: unknown): AuditRecordPage {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error("Invalid audit response: page");
  }
  return {
    items: value.items.map(auditRecord),
    next_cursor: nullableString(value, "next_cursor"),
  };
}

function dateBoundary(value: string | undefined, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  return value.includes("T") ? value : `${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}Z`;
}

export async function queryAuditRecords(
  client: ContextplaneClient,
  parameters: QueryAuditRecordsParameters,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<AuditRecordPage> {
  const query = new URLSearchParams();
  const from = dateBoundary(parameters.from, false);
  const to = dateBoundary(parameters.to, true);
  if (parameters.actorId) query.set("actor_id", parameters.actorId);
  if (parameters.action) query.set("action", parameters.action);
  if (parameters.targetType) query.set("target_type", parameters.targetType);
  if (parameters.targetId) query.set("target_id", parameters.targetId);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (parameters.cursor) query.set("cursor", parameters.cursor);
  query.set("page_size", String(parameters.pageSize ?? 50));

  const value = await client.request(`/v1/admin/audit?${query.toString()}`, {
    ...context,
    ...(signal ? { signal } : {}),
    method: "GET",
  });
  return asAuditRecordPage(value);
}
