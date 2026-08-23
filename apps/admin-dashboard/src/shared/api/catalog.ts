import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";
import {
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredRecord,
  requiredString,
  stringArray,
} from "./parse";

/**
 * The entity types the service gives a dedicated create route. `GET
 * /v1/capabilities` returns every type a tenant holds regardless of this list —
 * it is named for its first caller, not for what it lists — so a tenant whose
 * profile declares some other type still sees it under "All types" and named in
 * the Type column. These three are what can be *created* from here.
 */
export const catalogEntityTypes = ["capability", "concept", "operation"] as const;
export type CatalogEntityType = (typeof catalogEntityTypes)[number];

const createPathByEntityType: Readonly<Record<CatalogEntityType, string>> = {
  capability: "/v1/capabilities",
  concept: "/v1/concepts",
  operation: "/v1/operations",
};

interface CreateCatalogEntityFields {
  attributes?: Readonly<Record<string, unknown>>;
  externalId?: string;
  name: string;
  validFrom?: string;
}

/**
 * A discriminated union rather than an optional `parentCapabilityId`, because
 * only a concept and an operation have a parent: the service links them to it
 * with a `concept_of` or `operation_of` edge, and a capability has no such
 * field to send.
 */
export type CreateCatalogEntityInput =
  | (CreateCatalogEntityFields & { entityType: "capability" })
  | (CreateCatalogEntityFields & {
      entityType: "concept" | "operation";
      parentCapabilityId?: string;
    });

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

/** One entity read, together with the validator its writes must echo. */
export interface CatalogCapabilityRead {
  capability: CatalogCapabilityDetail;
  etag: string | null;
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

function parseCapabilitySummary(value: unknown): CatalogCapabilitySummary {
  const item = requiredRecord(value, "Capability");
  return {
    createdAt: requiredString(item, "created_at", "Capability created_at"),
    entityId: requiredString(item, "entity_id", "Capability entity_id"),
    entityType: requiredString(item, "entity_type", "Capability entity_type"),
    externalId: nullableString(item, "external_id", "Capability external_id"),
    name: requiredString(item, "name", "Capability name"),
  };
}

function parseCapabilityDetail(value: unknown): CatalogCapabilityDetail {
  const item = requiredRecord(value, "Capability detail");
  return {
    ...parseCapabilitySummary(item),
    attributes: requiredRecord(item.attributes, "Capability attributes"),
    lifecycle: requiredString(item, "lifecycle", "Capability lifecycle"),
  };
}

function parseCapabilityMutation(value: unknown): CatalogCapabilityDetail {
  const item = requiredRecord(value, "Capability mutation response");
  return {
    attributes: requiredRecord(item.attributes, "Capability attributes"),
    createdAt: requiredString(item, "created_at", "Capability created_at"),
    entityId: requiredString(item, "entity_id", "Capability entity_id"),
    entityType: "capability",
    externalId: nullableString(item, "external_id", "Capability external_id"),
    lifecycle: requiredString(item, "lifecycle", "Capability lifecycle"),
    name: requiredString(item, "name", "Capability name"),
  };
}

function parseArtifact(value: unknown): CatalogArtifact {
  const item = requiredRecord(value, "Artifact");
  return {
    body: nullableString(item, "body", "Artifact body"),
    bodyFormat: nullableString(item, "body_format", "Artifact body_format"),
    category: nullableString(item, "category", "Artifact category"),
    createdAt: nullableString(item, "created_at", "Artifact created_at"),
    createdBy: nullableString(item, "created_by_display_name", "Artifact created_by_display_name"),
    factId: requiredString(item, "fact_id", "Artifact fact_id"),
    title: nullableString(item, "title", "Artifact title"),
  };
}

function parseAdoption(value: unknown): CatalogAdoption {
  const item = requiredRecord(value, "Adoption");
  return {
    adoptionId: requiredString(item, "adoption_id", "Adoption adoption_id"),
    consumerTenantId: requiredString(item, "consumer_tenant_id", "Adoption consumer_tenant_id"),
    intent: nullableString(item, "intent", "Adoption intent"),
    providerCapabilityId: requiredString(item, "provider_capability_id", "Adoption provider_capability_id"),
    versionPin: nullableString(item, "version_pin", "Adoption version_pin"),
  };
}

function parseSubscription(value: unknown): CatalogSubscription {
  const item = requiredRecord(value, "Subscription");
  return {
    capabilityId: requiredString(item, "capability_id", "Subscription capability_id"),
    digestWindow: requiredString(item, "digest_window", "Subscription digest_window"),
    eventKinds: stringArray(item.event_kinds, "Subscription event_kinds"),
    isEnabled: requiredBoolean(item, "is_enabled", "Subscription is_enabled"),
    subscriptionId: requiredString(item, "subscription_id", "Subscription subscription_id"),
    webhookUrl: nullableString(item, "webhook_url", "Subscription webhook_url"),
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
  const page = requiredRecord(value, "Capability page");
  const items = requiredArray(page.items, "Capability page items");
  return {
    items: items.map(parseCapabilitySummary),
    nextCursor: nullableString(page, "next_cursor", "Capability page next_cursor"),
  };
}

/**
 * One entity, with the `ETag` the write path needs.
 *
 * The validator comes back rather than being dropped, because the three PATCH
 * routes below honour `If-Match` and a caller cannot send one it never saw. The
 * contract's own recommended flow is exactly this: GET, read the header, PATCH
 * with it.
 */
export async function getCapability(
  client: ContextplaneClient,
  capabilityId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogCapabilityRead> {
  const { etag, value } = await client.requestWithEtag(
    queryPath(`/v1/capabilities/${pathId(capabilityId)}`, {
      include: "components,depends_on,external_ids,interface",
    }),
    { ...context, signal },
  );
  return { capability: parseCapabilityDetail(value), etag };
}

export async function createCatalogEntity(
  client: ContextplaneClient,
  input: CreateCatalogEntityInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CatalogCapabilityDetail> {
  const value = await client.request(createPathByEntityType[input.entityType], {
    ...context,
    body: {
      attributes: input.attributes ? { ...input.attributes } : {},
      entity_type: input.entityType,
      ...(input.externalId ? { external_id: input.externalId } : {}),
      name: input.name,
      ...(input.entityType !== "capability" && input.parentCapabilityId
        ? { parent_capability_id: input.parentCapabilityId }
        : {}),
      ...(input.validFrom ? { valid_from: input.validFrom } : {}),
    },
    headers: { "Idempotency-Key": crypto.randomUUID() },
    method: "POST",
    signal,
  });
  return parseCapabilityMutation(value);
}

/**
 * Apply a bag of attribute updates.
 *
 * `ifMatch` is the `ETag` from the read the draft was composed against. Sending
 * it turns a row that moved underneath into a `412` the caller can act on --
 * keep the draft, refetch, show the newer state -- instead of a write landing on
 * something the operator never saw. The contract says an absent precondition
 * "logs a warning and accepts the write", so until this existed the dashboard
 * was the caller generating those warnings.
 *
 * Optional rather than required, matching `updateRelationship`: the service
 * accepts its absence, and forcing one would have callers inventing a value to
 * satisfy the signature. A fabricated precondition is worse than none.
 */
export async function updateCapability(
  client: ContextplaneClient,
  capabilityId: string,
  input: UpdateCapabilityInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
  ifMatch?: string,
): Promise<CatalogCapabilityDetail> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}`, {
    ...context,
    body: input,
    ...(ifMatch ? { headers: { "If-Match": ifMatch } } : {}),
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

/** Change who may discover this entity. `ifMatch` as on `updateCapability`. */
export async function setCapabilityVisibility(
  client: ContextplaneClient,
  capabilityId: string,
  input: SetCapabilityVisibilityInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
  ifMatch?: string,
): Promise<CatalogCapabilityDetail> {
  const value = await client.request(`/v1/capabilities/${pathId(capabilityId)}/visibility`, {
    ...context,
    body: input,
    ...(ifMatch ? { headers: { "If-Match": ifMatch } } : {}),
    method: "PATCH",
    signal,
  });
  return parseCapabilityMutation(value);
}

/** Move the entity along its lifecycle. `ifMatch` as on `updateCapability`. */
export async function changeCapabilityLifecycle(
  client: ContextplaneClient,
  capabilityId: string,
  input: ChangeCapabilityLifecycleInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
  ifMatch?: string,
): Promise<void> {
  await client.request(`/v1/capabilities/${pathId(capabilityId)}/lifecycle`, {
    ...context,
    body: input,
    ...(ifMatch ? { headers: { "If-Match": ifMatch } } : {}),
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
  const item = requiredRecord(value, "Capability interface");
  return {
    capabilityId: requiredString(item, "capability_id", "Capability interface capability_id"),
    format: nullableString(item, "interface_format", "Capability interface interface_format"),
    ingestedAt: nullableString(item, "ingested_at", "Capability interface ingested_at"),
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
  const item = requiredRecord(value, "Version preview");
  const changes = requiredArray(item.changes, "Version preview changes");
  const consumers = requiredArray(item.affected_consumers, "Version preview affected_consumers");
  return {
    affectedConsumers: consumers.map((candidate) => {
      const consumer = requiredRecord(candidate, "Affected consumer");
      return {
        entityId: requiredString(consumer, "entity_id", "Affected consumer entity_id"),
        name: nullableString(consumer, "name", "Affected consumer name"),
        tenantId: requiredString(consumer, "tenant_id", "Affected consumer tenant_id"),
        versionPin: nullableString(consumer, "version_pin", "Affected consumer version_pin"),
      };
    }),
    changes: changes.map((change) => requiredRecord(change, "Version preview change")),
    classification: requiredString(item, "diff_classification", "Version preview diff_classification"),
    proposedVersion: requiredString(item, "proposed_version", "Version preview proposed_version"),
    releaseNotes: requiredString(item, "release_notes_scaffold", "Version preview release_notes_scaffold"),
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
  const page = requiredRecord(value, "Artifact page");
  const items = requiredArray(page.items, "Artifact page items");
  return {
    items: items.map(parseArtifact),
    nextCursor: nullableString(page, "next_cursor", "Artifact page next_cursor"),
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
  const page = requiredRecord(value, "Adoption page");
  const items = requiredArray(page.items, "Adoption page items");
  return items.map(parseAdoption);
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
  const page = requiredRecord(value, "Subscription page");
  const items = requiredArray(page.items, "Subscription page items");
  return items.map(parseSubscription);
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
