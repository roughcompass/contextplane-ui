import type { components } from "./generated/contextplane";
import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";

export type CreateCapabilityInput = components["schemas"]["CreateCapabilityRequest"];
export type UpdateCapabilityInput = components["schemas"]["UpdateEntityRequest"];
export type SetCapabilityVisibilityInput = components["schemas"]["SetVisibilityRequest"];
export type ChangeCapabilityLifecycleInput = components["schemas"]["LifecycleTransitionRequest"];
export type PutCapabilityInterfaceInput = components["schemas"]["InterfacePutRequest"];
export type PreviewCapabilityVersionInput = components["schemas"]["PreviewVersionRequest"];
export type CreateCapabilityArtifactInput = components["schemas"]["CreateArtifactRequest"];
export type CreateCapabilityAdoptionInput = components["schemas"]["AdoptionCreate"];
export type CreateCapabilitySubscriptionInput = components["schemas"]["SubscriptionCreate"];
export type UpdateCapabilitySubscriptionInput = components["schemas"]["SubscriptionUpdate"];

export interface CatalogCapabilitySummary {
  createdAt: string;
  entityId: string;
  entityType: string;
  externalId: string | null;
  name: string;
}

export interface CatalogCapabilityDetail extends CatalogCapabilitySummary {
  attributes: Readonly<Record<string, unknown>>;
  lifecycle: string;
}

export interface CatalogCapabilityPage {
  items: readonly CatalogCapabilitySummary[];
  nextCursor: string | null;
}

export interface CatalogArtifact {
  body: string | null;
  bodyFormat: string | null;
  category: string | null;
  createdAt: string | null;
  createdBy: string | null;
  factId: string;
  title: string | null;
}

export interface CatalogArtifactPage {
  items: readonly CatalogArtifact[];
  nextCursor: string | null;
}

export interface CatalogAdoption {
  adoptionId: string;
  consumerTenantId: string;
  intent: string | null;
  providerCapabilityId: string;
  versionPin: string | null;
}

export interface CatalogSubscription {
  capabilityId: string;
  digestWindow: string;
  eventKinds: readonly string[];
  isEnabled: boolean;
  subscriptionId: string;
  webhookUrl: string | null;
}

export interface CapabilityInterface {
  capabilityId: string;
  format: string | null;
  ingestedAt: string | null;
  source: unknown;
  surface: unknown;
}

export interface AffectedConsumer {
  entityId: string;
  name: string | null;
  tenantId: string;
  versionPin: string | null;
}

export interface CapabilityVersionPreview {
  affectedConsumers: readonly AffectedConsumer[];
  changes: readonly Readonly<Record<string, unknown>>[];
  classification: string;
  proposedVersion: string;
  releaseNotes: string;
}

export interface ListCapabilitiesParameters {
  asOf?: string;
  cursor?: string;
  entityType?: string;
  lifecycle?: string;
  pageSize?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} was not an object.`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} was not a string.`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return string(value, label);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} was not a boolean.`);
  return value;
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label} was not a list.`);
  return value.map((item, index) => string(item, `${label}[${index}]`));
}

function unknownRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  return record(value, label);
}

function parseCapabilitySummary(value: unknown): CatalogCapabilitySummary {
  const item = record(value, "Capability");
  return {
    createdAt: string(item.created_at, "Capability created_at"),
    entityId: string(item.entity_id, "Capability entity_id"),
    entityType: string(item.entity_type, "Capability entity_type"),
    externalId: nullableString(item.external_id, "Capability external_id"),
    name: string(item.name, "Capability name"),
  };
}

function parseCapabilityDetail(value: unknown): CatalogCapabilityDetail {
  const item = record(value, "Capability detail");
  return {
    ...parseCapabilitySummary(item),
    attributes: unknownRecord(item.attributes, "Capability attributes"),
    lifecycle: string(item.lifecycle, "Capability lifecycle"),
  };
}

function parseCapabilityMutation(value: unknown): CatalogCapabilityDetail {
  const item = record(value, "Capability mutation response");
  return {
    attributes: unknownRecord(item.attributes, "Capability attributes"),
    createdAt: string(item.created_at, "Capability created_at"),
    entityId: string(item.entity_id, "Capability entity_id"),
    entityType: "capability",
    externalId: nullableString(item.external_id, "Capability external_id"),
    lifecycle: string(item.lifecycle, "Capability lifecycle"),
    name: string(item.name, "Capability name"),
  };
}

function parseArtifact(value: unknown): CatalogArtifact {
  const item = record(value, "Artifact");
  return {
    body: nullableString(item.body, "Artifact body"),
    bodyFormat: nullableString(item.body_format, "Artifact body_format"),
    category: nullableString(item.category, "Artifact category"),
    createdAt: nullableString(item.created_at, "Artifact created_at"),
    createdBy: nullableString(item.created_by_display_name, "Artifact created_by_display_name"),
    factId: string(item.fact_id, "Artifact fact_id"),
    title: nullableString(item.title, "Artifact title"),
  };
}

function parseAdoption(value: unknown): CatalogAdoption {
  const item = record(value, "Adoption");
  return {
    adoptionId: string(item.adoption_id, "Adoption adoption_id"),
    consumerTenantId: string(item.consumer_tenant_id, "Adoption consumer_tenant_id"),
    intent: nullableString(item.intent, "Adoption intent"),
    providerCapabilityId: string(item.provider_capability_id, "Adoption provider_capability_id"),
    versionPin: nullableString(item.version_pin, "Adoption version_pin"),
  };
}

function parseSubscription(value: unknown): CatalogSubscription {
  const item = record(value, "Subscription");
  return {
    capabilityId: string(item.capability_id, "Subscription capability_id"),
    digestWindow: string(item.digest_window, "Subscription digest_window"),
    eventKinds: stringArray(item.event_kinds, "Subscription event_kinds"),
    isEnabled: boolean(item.is_enabled, "Subscription is_enabled"),
    subscriptionId: string(item.subscription_id, "Subscription subscription_id"),
    webhookUrl: nullableString(item.webhook_url, "Subscription webhook_url"),
  };
}

function queryPath(path: string, values: Readonly<Record<string, string | number | undefined>>) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim()) query.set(name, String(value));
  }
  return query.size ? `${path}?${query.toString()}` : path;
}

function pathId(value: string): string {
  return encodeURIComponent(value);
}

export async function listCapabilities(
  client: ContextplaneClient,
  parameters: ListCapabilitiesParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogCapabilityPage> {
  const value = await client.request(
    queryPath("/v1/capabilities", {
      as_of: parameters.asOf,
      cursor: parameters.cursor,
      entity_type: parameters.entityType,
      lifecycle: parameters.lifecycle,
      page_size: parameters.pageSize ?? 50,
    }),
    { ...context, signal },
  );
  const page = record(value, "Capability page");
  if (!Array.isArray(page.items)) throw new Error("Capability page items was not a list.");
  return {
    items: page.items.map(parseCapabilitySummary),
    nextCursor: nullableString(page.next_cursor, "Capability page next_cursor"),
  };
}

export async function getCapability(
  client: ContextplaneClient,
  capabilityId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogCapabilityDetail> {
  const value = await client.request(
    queryPath(`/v1/capabilities/${pathId(capabilityId)}`, {
      include: "components,depends_on,external_ids,interface",
    }),
    { ...context, signal },
  );
  return parseCapabilityDetail(value);
}

export async function createCapability(
  client: ContextplaneClient,
  input: CreateCapabilityInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogCapabilityDetail> {
  const value = await client.request("/v1/capabilities", {
    ...context,
    body: input,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    method: "POST",
    signal,
  });
  return parseCapabilityMutation(value);
}

export async function updateCapability(
  client: ContextplaneClient,
  capabilityId: string,
  input: UpdateCapabilityInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogCapabilityDetail> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}`, {
    ...context,
    body: input,
    method: "PATCH",
    signal,
  });
  return parseCapabilityMutation(value);
}

export async function deleteCapability(
  client: ContextplaneClient,
  capabilityId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/capabilities/${pathId(capabilityId)}`, {
    ...context,
    method: "DELETE",
    signal,
  });
}

export async function setCapabilityVisibility(
  client: ContextplaneClient,
  capabilityId: string,
  input: SetCapabilityVisibilityInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogCapabilityDetail> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}/visibility`, {
    ...context,
    body: input,
    method: "PATCH",
    signal,
  });
  return parseCapabilityMutation(value);
}

export async function changeCapabilityLifecycle(
  client: ContextplaneClient,
  capabilityId: string,
  input: ChangeCapabilityLifecycleInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/capabilities/${pathId(capabilityId)}/lifecycle`, {
    ...context,
    body: input,
    method: "PATCH",
    signal,
  });
}

export async function getCapabilityInterface(
  client: ContextplaneClient,
  capabilityId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CapabilityInterface> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}/interface`, {
    ...context,
    signal,
  });
  const item = record(value, "Capability interface");
  return {
    capabilityId: string(item.capability_id, "Capability interface capability_id"),
    format: nullableString(item.interface_format, "Capability interface interface_format"),
    ingestedAt: nullableString(item.ingested_at, "Capability interface ingested_at"),
    source: item.interface_source,
    surface: item.interface_canonical,
  };
}

export async function putCapabilityInterface(
  client: ContextplaneClient,
  capabilityId: string,
  input: PutCapabilityInterfaceInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/capabilities/${pathId(capabilityId)}/interface`, {
    ...context,
    body: input,
    method: "PUT",
    signal,
  });
}

export async function previewCapabilityVersion(
  client: ContextplaneClient,
  capabilityId: string,
  input: PreviewCapabilityVersionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CapabilityVersionPreview> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}/preview-version`, {
    ...context,
    body: input,
    method: "POST",
    signal,
  });
  const item = record(value, "Version preview");
  if (!Array.isArray(item.changes)) throw new Error("Version preview changes was not a list.");
  if (!Array.isArray(item.affected_consumers)) {
    throw new Error("Version preview affected_consumers was not a list.");
  }
  return {
    affectedConsumers: item.affected_consumers.map((candidate) => {
      const consumer = record(candidate, "Affected consumer");
      return {
        entityId: string(consumer.entity_id, "Affected consumer entity_id"),
        name: nullableString(consumer.name, "Affected consumer name"),
        tenantId: string(consumer.tenant_id, "Affected consumer tenant_id"),
        versionPin: nullableString(consumer.version_pin, "Affected consumer version_pin"),
      };
    }),
    changes: item.changes.map((change) => unknownRecord(change, "Version preview change")),
    classification: string(item.diff_classification, "Version preview diff_classification"),
    proposedVersion: string(item.proposed_version, "Version preview proposed_version"),
    releaseNotes: string(item.release_notes_scaffold, "Version preview release_notes_scaffold"),
  };
}

export async function listCapabilityArtifacts(
  client: ContextplaneClient,
  capabilityId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogArtifactPage> {
  const value = await client.request(
    queryPath(`/v1/capabilities/${pathId(capabilityId)}/artifacts`, {
      fields: "fact_id,category,title,body_format,created_at,created_by_display_name,body",
      page_size: 100,
    }),
    { ...context, signal },
  );
  const page = record(value, "Artifact page");
  if (!Array.isArray(page.items)) throw new Error("Artifact page items was not a list.");
  return {
    items: page.items.map(parseArtifact),
    nextCursor: nullableString(page.next_cursor, "Artifact page next_cursor"),
  };
}

export async function createCapabilityArtifact(
  client: ContextplaneClient,
  capabilityId: string,
  input: CreateCapabilityArtifactInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogArtifact> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}/artifacts`, {
    ...context,
    body: input,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    method: "POST",
    signal,
  });
  return parseArtifact(value);
}

export async function deleteCapabilityArtifact(
  client: ContextplaneClient,
  capabilityId: string,
  factId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/capabilities/${pathId(capabilityId)}/artifacts/${pathId(factId)}`, {
    ...context,
    method: "DELETE",
    signal,
  });
}

export async function listCapabilityAdoptions(
  client: ContextplaneClient,
  capabilityId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly CatalogAdoption[]> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}/adoptions`, {
    ...context,
    signal,
  });
  const page = record(value, "Adoption page");
  if (!Array.isArray(page.items)) throw new Error("Adoption page items was not a list.");
  return page.items.map(parseAdoption);
}

export async function createCapabilityAdoption(
  client: ContextplaneClient,
  capabilityId: string,
  input: CreateCapabilityAdoptionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogAdoption> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}/adoptions`, {
    ...context,
    body: input,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    method: "POST",
    signal,
  });
  return parseAdoption(value);
}

export async function deleteCapabilityAdoption(
  client: ContextplaneClient,
  capabilityId: string,
  adoptionId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/capabilities/${pathId(capabilityId)}/adoptions/${pathId(adoptionId)}`, {
    ...context,
    method: "DELETE",
    signal,
  });
}

export async function listCapabilitySubscriptions(
  client: ContextplaneClient,
  capabilityId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly CatalogSubscription[]> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}/subscriptions`, {
    ...context,
    signal,
  });
  const page = record(value, "Subscription page");
  if (!Array.isArray(page.items)) throw new Error("Subscription page items was not a list.");
  return page.items.map(parseSubscription);
}

export async function createCapabilitySubscription(
  client: ContextplaneClient,
  capabilityId: string,
  input: CreateCapabilitySubscriptionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/capabilities/${pathId(capabilityId)}/subscriptions`, {
    ...context,
    body: input,
    headers: { "Idempotency-Key": crypto.randomUUID() },
    method: "POST",
    signal,
  });
}

export async function updateCapabilitySubscription(
  client: ContextplaneClient,
  subscriptionId: string,
  input: UpdateCapabilitySubscriptionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/subscriptions/${pathId(subscriptionId)}`, {
    ...context,
    body: input,
    method: "PATCH",
    signal,
  });
}

export async function deleteCapabilitySubscription(
  client: ContextplaneClient,
  subscriptionId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/subscriptions/${pathId(subscriptionId)}`, {
    ...context,
    method: "DELETE",
    signal,
  });
}
