/**
 * Notifications, learning evidence and external signals — what has arrived and
 * what needs acknowledging.
 *
 * Split out of `tenantWork.ts`, which was named after a destination E10-T2
 * dissolved and carried three domains' worth of calls behind that one name.
 */
import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";
import {
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredRecord,
  requiredString,
} from "./parse";

function contextOptions(
  context: ContextplaneRequestOptions,
  signal?: AbortSignal,
): ContextplaneRequestOptions {
  return {
    ...(signal ? { signal } : {}),
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
  };
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

export type StructuredServiceResult = Readonly<Record<string, unknown>> | readonly unknown[];

function structured(value: unknown, label: string): StructuredServiceResult {
  if (Array.isArray(value)) return value;
  return requiredRecord(value, label);
}

export type SignalIngestInput = components["schemas"]["SignalIngestRequest"];

export interface TenantNotification {
  capabilityId: string;
  capabilitySlug: string;
  changeClassification: string | null;
  eventKind: string;
  fetchUrl: string;
  notificationId: string;
  occurredAt: string;
  subscriptionId: string | null;
  tenantId: string;
  versionAfter: string | null;
  versionBefore: string | null;
}

export interface TenantNotificationPage {
  items: readonly TenantNotification[];
  nextCursor: string | null;
}

export interface SignalIngestReceipt {
  authority: string;
  contentDigest: string;
  ingestedAt: string;
  replayed: boolean;
  signalId: string;
}

function parseNotification(value: unknown): TenantNotification {
  const item = requiredRecord(value, "notification");
  return {
    capabilityId: requiredString(item, "capability_id"),
    capabilitySlug: requiredString(item, "capability_slug"),
    changeClassification: nullableString(item, "change_classification"),
    eventKind: requiredString(item, "event_kind"),
    fetchUrl: requiredString(item, "fetch_url"),
    notificationId: requiredString(item, "notification_id"),
    occurredAt: requiredString(item, "occurred_at"),
    subscriptionId: nullableString(item, "subscription_id"),
    tenantId: requiredString(item, "tenant_id"),
    versionAfter: nullableString(item, "version_after"),
    versionBefore: nullableString(item, "version_before"),
  };
}

export async function listTenantNotifications(
  client: ContextplaneClient,
  parameters: { cursor?: string; pageSize?: number; status?: "all" | "read" | "unread" } = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<TenantNotificationPage> {
  const search = new URLSearchParams({
    page_size: String(parameters.pageSize ?? 50),
    status: parameters.status ?? "unread",
    view: "default",
  });
  if (parameters.cursor) search.set("cursor", parameters.cursor);
  const value = requiredRecord(
    await client.request(`/v1/notifications?${search.toString()}`, contextOptions(context, signal)),
    "notification page",
  );
  return {
    items: requiredArray(value.items, "notifications").map(parseNotification),
    nextCursor: nullableString(value, "next_cursor"),
  };
}

export async function markTenantNotificationRead(
  client: ContextplaneClient,
  notificationId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/notifications/${encode(notificationId)}:mark-read`, {
    ...contextOptions(context, signal),
    method: "POST",
  });
}

export async function getTenantLearningAggregates(
  client: ContextplaneClient,
  windowDays = 30,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request(
      `/v1/learning/aggregates?window_days=${encode(String(windowDays))}`,
      contextOptions(context, signal),
    ),
    "learning aggregates",
  );
}

export async function listTenantLearningMetrics(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/learning/metrics", contextOptions(context, signal)),
    "learning metrics",
  );
}

export async function ingestTenantSignal(
  client: ContextplaneClient,
  input: SignalIngestInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<SignalIngestReceipt> {
  const value = requiredRecord(
    await client.request("/v1/signals", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "signal receipt",
  );
  return {
    authority: requiredString(value, "authority"),
    contentDigest: requiredString(value, "content_digest"),
    ingestedAt: requiredString(value, "ingested_at"),
    replayed: requiredBoolean(value, "replayed"),
    signalId: requiredString(value, "signal_id"),
  };
}

