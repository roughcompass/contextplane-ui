import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";
import {
  nullableNumber,
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredNumber,
  requiredRecord,
  requiredString,
  stringArray,
} from "./parse";

type Schemas = components["schemas"];

export type AdminAllowlist = Schemas["AllowlistResponse"];
export type CalibrationMapping = Schemas["CalibrationMappingResponse"];
export type CalibrationRefitInput = Schemas["CalibrationRefitRequest"];
export type CalibrationRefitReceipt = Schemas["CalibrationRefitResponse"];
export type EntityTypeSchema = Schemas["EntityTypeSchemaResponse"];
export type ConformancePolicy = Schemas["ConformancePolicyView"];
export type ExternalSystem = Schemas["ExternalSystemResponse"];
export type PiiFieldPolicy = Schemas["PiiFieldPolicyResponse"];
export type PiiPattern = Schemas["PiiPatternResponse"];
export type ProgressionDefinition = Schemas["ProgressionDefinitionResponse"];
export interface ProgressionOverrideInput extends Omit<
  Schemas["ProgressionOverrideCreate"],
  "bypass_skip_rules"
> {
  bypass_skip_rules?: boolean;
}
export type ProgressionOverride = Schemas["ProgressionOverrideResponse"];
export type PromotionPolicy = Schemas["PromotionPolicyResponse"];
export type PromotionPolicyInput = Schemas["PromotionPolicyRequest"];
export type PurgeReceipt = {
  purged_entries: number;
  purged_workspaces: number;
  subsystems: Record<string, Record<string, number>>;
};
export type SourcePolicy = Schemas["SourcePolicyResponse"];
export type Strategy = Schemas["StrategyView"];
export interface StrategyUpdate extends Omit<
  Schemas["StrategyUpdate"],
  "clear_model_override" | "clear_prompt_override"
> {
  clear_model_override?: boolean;
  clear_prompt_override?: boolean;
}
export type SyncRun = Schemas["SyncRunResponse"];
export type SyncSource = Schemas["SyncSourceResponse"];
export type TriggerSyncReceipt = Schemas["TriggerResponse"];
export type VocabularyValue = Schemas["VocabularyValueResponse"];
export type EdgePropertySchema = Record<string, unknown>;

export const graphVocabularyKinds = ["entity_type", "edge_rel"] as const;
export type GraphVocabularyKind = (typeof graphVocabularyKinds)[number];

export interface ListSyncRunsParameters {
  from?: string;
  sourceId?: string;
  status?: string;
  to?: string;
}

export interface ListProgressionOverridesParameters {
  consumed?: boolean;
  expired?: boolean;
  fromState?: string;
  toState?: string;
}

function objectValue(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return { ...requiredRecord(record[key], key) };
}

function contextOptions(
  context: ContextplaneRequestOptions,
  signal: AbortSignal | undefined,
  headers?: Readonly<Record<string, string>>,
): ContextplaneRequestOptions {
  return {
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
    ...(signal ? { signal } : {}),
    ...(headers ? { headers } : {}),
  };
}

function append(search: URLSearchParams, key: string, value: string | boolean | undefined) {
  if (value !== undefined && value !== "") search.set(key, String(value));
}

function querySuffix(search: URLSearchParams): string {
  return search.size > 0 ? `?${search.toString()}` : "";
}

function parseSyncSource(value: unknown): SyncSource {
  const record = requiredRecord(value, "sync source");
  return {
    config: objectValue(record, "config"),
    created_at: requiredString(record, "created_at"),
    created_by: nullableString(record, "created_by"),
    credentials_ref: nullableString(record, "credentials_ref"),
    display_name: requiredString(record, "display_name"),
    is_active: requiredBoolean(record, "is_active"),
    schedule: nullableString(record, "schedule"),
    source_id: requiredString(record, "source_id"),
    source_type: requiredString(record, "source_type"),
    tenant_id: requiredString(record, "tenant_id"),
  };
}

function parseSyncRun(value: unknown): SyncRun {
  const record = requiredRecord(value, "sync run");
  return {
    artifact_count: nullableNumber(record, "artifact_count"),
    duration_s: nullableNumber(record, "duration_s"),
    error_summary: nullableString(record, "error_summary"),
    finished_at: nullableString(record, "finished_at"),
    source_id: requiredString(record, "source_id"),
    started_at: requiredString(record, "started_at"),
    status: requiredString(record, "status"),
    sync_run_id: requiredString(record, "sync_run_id"),
    tenant_id: requiredString(record, "tenant_id"),
    trigger: requiredString(record, "trigger"),
  };
}

function parseExternalSystem(value: unknown): ExternalSystem {
  const record = requiredRecord(value, "external system");
  return {
    created_at: requiredString(record, "created_at"),
    description: nullableString(record, "description"),
    display_name: requiredString(record, "display_name"),
    slug: requiredString(record, "slug"),
    tenant_id: requiredString(record, "tenant_id"),
    url_template: nullableString(record, "url_template"),
  };
}

function parseStrategy(value: unknown): Strategy {
  const record = requiredRecord(value, "extraction strategy");
  return {
    confidence_floor: requiredNumber(record, "confidence_floor"),
    is_enabled: requiredBoolean(record, "is_enabled"),
    model_id: requiredString(record, "model_id"),
    model_is_overridden: requiredBoolean(record, "model_is_overridden"),
    namespace_template: requiredString(record, "namespace_template"),
    permitted_predicates: mutableStringArray(record.permitted_predicates, "permitted predicates"),
    prompt_is_overridden: requiredBoolean(record, "prompt_is_overridden"),
    strategy_id: requiredString(record, "strategy_id"),
  };
}

function parseConformancePolicy(value: unknown): ConformancePolicy {
  const record = requiredRecord(value, "conformance policy");
  return {
    explanation: requiredString(record, "explanation"),
    minimum_sample: requiredNumber(record, "minimum_sample"),
    target_ratio: requiredNumber(record, "target_ratio"),
  };
}

function parseVocabularyValue(value: unknown): VocabularyValue {
  const record = requiredRecord(value, "vocabulary value");
  return {
    created_at: requiredString(record, "created_at"),
    deprecated_at: nullableString(record, "deprecated_at"),
    is_system: requiredBoolean(record, "is_system"),
    kind: requiredString(record, "kind"),
    value: requiredString(record, "value"),
    vocab_id: requiredString(record, "vocab_id"),
  };
}

function parseEntityTypeSchema(value: unknown): EntityTypeSchema {
  const record = requiredRecord(value, "entity type schema");
  return {
    is_advisory: requiredBoolean(record, "is_advisory"),
    json_schema: objectValue(record, "json_schema"),
    schema_id: requiredString(record, "schema_id"),
    t_ingested_at: requiredString(record, "t_ingested_at"),
    t_invalidated_at: nullableString(record, "t_invalidated_at"),
    t_valid_from: requiredString(record, "t_valid_from"),
    t_valid_to: nullableString(record, "t_valid_to"),
    entity_type: requiredString(record, "entity_type"),
  };
}

function parseSourcePolicy(value: unknown): SourcePolicy {
  const record = requiredRecord(value, "memory source policy");
  return {
    authority_tier: requiredString(record, "authority_tier"),
    breach_count: requiredNumber(record, "breach_count"),
    breaker_open_until: nullableString(record, "breaker_open_until"),
    ingest_ceiling: requiredNumber(record, "ingest_ceiling"),
    may_provision_entities: requiredBoolean(record, "may_provision_entities"),
    source_id: requiredString(record, "source_id"),
    tenant_id: requiredString(record, "tenant_id"),
    window_seconds: requiredNumber(record, "window_seconds"),
  };
}

function parsePromotionPolicy(value: unknown): PromotionPolicy {
  const record = requiredRecord(value, "promotion policy");
  return {
    always_review: mutableStringArray(record.always_review, "always-review predicates"),
    blast_radius_threshold: requiredNumber(record, "blast_radius_threshold"),
    confidence_floor: requiredNumber(record, "confidence_floor"),
  };
}

function parseAllowlist(value: unknown): AdminAllowlist {
  const record = requiredRecord(value, "autopromote allowlist");
  return { predicates: mutableStringArray(record.predicates, "autopromote predicates") };
}

function parseCalibration(value: unknown): CalibrationMapping {
  const record = requiredRecord(value, "calibration mapping");
  return {
    fitted_at: requiredString(record, "fitted_at"),
    measured_error: requiredNumber(record, "measured_error"),
    model_id: requiredString(record, "model_id"),
    n_adjudicated: requiredNumber(record, "n_adjudicated"),
    provider_id: requiredString(record, "provider_id"),
    status: requiredString(record, "status"),
    strategy_id: requiredString(record, "strategy_id"),
    version: requiredString(record, "version"),
  };
}

/**
 * A mutable copy, because the generated contract types declare these arrays as
 * `string[]`.
 *
 * Copied rather than cast: the shared validator returns `readonly string[]`
 * precisely so a parsed response cannot be edited in place, and a cast here
 * would keep the annotation while dropping the guarantee. Three call sites
 * need it, all of them fields of a generated response type.
 */
function mutableStringArray(value: unknown, label: string): string[] {
  return [...stringArray(value, label)];
}

function parsePiiPattern(value: unknown): PiiPattern {
  const record = requiredRecord(value, "PII pattern");
  return {
    category: requiredString(record, "category"),
    created_at: requiredString(record, "created_at"),
    created_by: nullableString(record, "created_by"),
    detector_module: nullableString(record, "detector_module"),
    is_enabled: requiredBoolean(record, "is_enabled"),
    is_system: requiredBoolean(record, "is_system"),
    name: requiredString(record, "name"),
    pattern_id: requiredString(record, "pattern_id"),
    policy_override: nullableString(record, "policy_override"),
    regex: requiredString(record, "regex"),
    tenant_id: requiredString(record, "tenant_id"),
  };
}

function parsePiiFieldPolicy(value: unknown): PiiFieldPolicy {
  const record = requiredRecord(value, "PII field policy");
  return {
    created_at: requiredString(record, "created_at"),
    field_type: requiredString(record, "field_type"),
    pattern_id: nullableString(record, "pattern_id"),
    policy: requiredString(record, "policy"),
    policy_id: requiredString(record, "policy_id"),
    tenant_id: requiredString(record, "tenant_id"),
  };
}

function parseProgressionDefinition(value: unknown): ProgressionDefinition {
  const record = requiredRecord(value, "progression definition");
  return {
    definition: objectValue(record, "definition"),
    entity_type: requiredString(record, "entity_type"),
    is_advisory: requiredBoolean(record, "is_advisory"),
    progression_id: requiredString(record, "progression_id"),
    t_ingested_at: requiredString(record, "t_ingested_at"),
    t_invalidated_at: nullableString(record, "t_invalidated_at"),
    t_valid_from: requiredString(record, "t_valid_from"),
    t_valid_to: nullableString(record, "t_valid_to"),
    tenant_id: requiredString(record, "tenant_id"),
  };
}

function parseProgressionOverride(value: unknown): ProgressionOverride {
  const record = requiredRecord(value, "progression override");
  return {
    audit_event_id: requiredString(record, "audit_event_id"),
    authorized_by: requiredString(record, "authorized_by"),
    bypass_skip_rules: requiredBoolean(record, "bypass_skip_rules"),
    consumed_at: nullableString(record, "consumed_at"),
    entity_id: requiredString(record, "entity_id"),
    from_state: requiredString(record, "from_state"),
    gate_id: requiredString(record, "gate_id"),
    override_id: requiredString(record, "override_id"),
    reason: requiredString(record, "reason"),
    t_valid_from: requiredString(record, "t_valid_from"),
    t_valid_to: requiredString(record, "t_valid_to"),
    tenant_id: requiredString(record, "tenant_id"),
    to_state: requiredString(record, "to_state"),
  };
}

export async function listSyncSources(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly SyncSource[]> {
  const payload = await client.request("/v1/admin/sync-sources", contextOptions(context, signal));
  return requiredArray(payload, "sync sources").map(parseSyncSource);
}

export async function listSyncRuns(
  client: ContextplaneClient,
  parameters: ListSyncRunsParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly SyncRun[]> {
  const search = new URLSearchParams();
  append(search, "source_id", parameters.sourceId);
  append(search, "status", parameters.status);
  append(search, "from", parameters.from);
  append(search, "to", parameters.to);
  const payload = await client.request(
    `/v1/admin/sync-runs${querySuffix(search)}`,
    contextOptions(context, signal),
  );
  return requiredArray(payload, "sync runs").map(parseSyncRun);
}

export async function listExternalSystems(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly ExternalSystem[]> {
  const payload = await client.request(
    "/v1/admin/external-systems",
    contextOptions(context, signal),
  );
  return requiredArray(payload, "external systems").map(parseExternalSystem);
}

export async function triggerSync(
  client: ContextplaneClient,
  sourceId: string,
  idempotencyKey: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<TriggerSyncReceipt> {
  const payload = requiredRecord(
    await client.request(`/v1/admin/sync-sources/${encodeURIComponent(sourceId)}/trigger`, {
      ...contextOptions(context, signal, { "Idempotency-Key": idempotencyKey }),
      method: "POST",
    }),
    "sync trigger receipt",
  );
  return {
    source_id: requiredString(payload, "source_id"),
    started_at: requiredString(payload, "started_at"),
    status: requiredString(payload, "status"),
    sync_run_id: requiredString(payload, "sync_run_id"),
    trigger: requiredString(payload, "trigger"),
  };
}

export async function setSyncSourceActive(
  client: ContextplaneClient,
  sourceId: string,
  isActive: boolean,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<SyncSource> {
  const payload = await client.request(`/v1/admin/sync-sources/${encodeURIComponent(sourceId)}`, {
    ...contextOptions(context, signal),
    body: { is_active: isActive } satisfies Schemas["SyncSourcePatch"],
    method: "PATCH",
  });
  return parseSyncSource(payload);
}

export async function listExtractionStrategies(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly Strategy[]> {
  const payload = await client.request(
    "/v1/admin/extraction-strategies",
    contextOptions(context, signal),
  );
  return requiredArray(payload, "extraction strategies").map(parseStrategy);
}

export async function getConformancePolicy(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ConformancePolicy> {
  return parseConformancePolicy(
    await client.request(
      "/v1/admin/extraction-strategies/conformance-policy",
      contextOptions(context, signal),
    ),
  );
}

export async function updateExtractionStrategy(
  client: ContextplaneClient,
  strategyId: string,
  input: StrategyUpdate,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/admin/extraction-strategies/${encodeURIComponent(strategyId)}`, {
    ...contextOptions(context, signal),
    body: {
      clear_model_override: input.clear_model_override ?? false,
      clear_prompt_override: input.clear_prompt_override ?? false,
      ...input,
    } satisfies Schemas["StrategyUpdate"],
    method: "PATCH",
  });
}

export async function listVocabularyValues(
  client: ContextplaneClient,
  kind: GraphVocabularyKind,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly VocabularyValue[]> {
  const payload = await client.request(
    `/v1/admin/vocabularies/${encodeURIComponent(kind)}`,
    contextOptions(context, signal),
  );
  return requiredArray(payload, "vocabulary values").map(parseVocabularyValue);
}

export async function addVocabularyValue(
  client: ContextplaneClient,
  kind: GraphVocabularyKind,
  value: string,
  idempotencyKey: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<VocabularyValue> {
  const payload = await client.request(`/v1/admin/vocabularies/${encodeURIComponent(kind)}`, {
    ...contextOptions(context, signal, { "Idempotency-Key": idempotencyKey }),
    body: { value } satisfies Schemas["VocabularyValueCreate"],
    method: "POST",
  });
  return parseVocabularyValue(payload);
}

export async function setVocabularyDeprecated(
  client: ContextplaneClient,
  kind: GraphVocabularyKind,
  value: string,
  deprecated: boolean,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<VocabularyValue> {
  const payload = await client.request(
    `/v1/admin/vocabularies/${encodeURIComponent(kind)}/${encodeURIComponent(value)}`,
    {
      ...contextOptions(context, signal),
      body: {
        deprecated_at: deprecated ? new Date().toISOString() : null,
      } satisfies Schemas["VocabularyValuePatch"],
      method: "PATCH",
    },
  );
  return parseVocabularyValue(payload);
}

export async function listEntityTypeSchemas(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly EntityTypeSchema[]> {
  const payload = await client.request("/v1/admin/entity-types", contextOptions(context, signal));
  return requiredArray(payload, "entity type schemas").map(parseEntityTypeSchema);
}

export async function setEntityTypeSchemaAdvisory(
  client: ContextplaneClient,
  entityType: string,
  isAdvisory: boolean,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<EntityTypeSchema> {
  const payload = await client.request(`/v1/admin/entity-types/${encodeURIComponent(entityType)}`, {
    ...contextOptions(context, signal),
    body: { is_advisory: isAdvisory } satisfies Schemas["EntityTypeSchemaPatch"],
    method: "PATCH",
  });
  return parseEntityTypeSchema(payload);
}

export async function listEdgePropertySchemas(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly EdgePropertySchema[]> {
  const payload = await client.request(
    "/v1/admin/edge-property-schemas",
    contextOptions(context, signal),
  );
  return requiredArray(payload, "edge property schemas").map((item) => ({
    ...requiredRecord(item, "edge property schema"),
  }));
}

export async function listMemorySources(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly SourcePolicy[]> {
  const payload = await client.request("/v1/admin/memory-sources", contextOptions(context, signal));
  return requiredArray(payload, "memory sources").map(parseSourcePolicy);
}

export async function resetMemorySourceBreaker(
  client: ContextplaneClient,
  sourceId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<SourcePolicy> {
  const payload = await client.request(
    `/v1/admin/memory-sources/${encodeURIComponent(sourceId)}:reset-breaker`,
    { ...contextOptions(context, signal), method: "POST" },
  );
  return parseSourcePolicy(payload);
}

export async function getPromotionPolicy(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<PromotionPolicy> {
  return parsePromotionPolicy(
    await client.request("/v1/admin/memory-promotion-policy", contextOptions(context, signal)),
  );
}

export async function replacePromotionPolicy(
  client: ContextplaneClient,
  input: PromotionPolicyInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<PromotionPolicy> {
  return parsePromotionPolicy(
    await client.request("/v1/admin/memory-promotion-policy", {
      ...contextOptions(context, signal),
      body: input,
      method: "PUT",
    }),
  );
}

export async function getAutopromoteAllowlist(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<AdminAllowlist> {
  return parseAllowlist(
    await client.request("/v1/admin/memory-autopromote-allowlist", contextOptions(context, signal)),
  );
}

export async function changeAutopromotePredicate(
  client: ContextplaneClient,
  predicate: string,
  action: "allow" | "revoke",
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<AdminAllowlist> {
  return parseAllowlist(
    await client.request(`/v1/admin/memory-autopromote-allowlist:${action}`, {
      ...contextOptions(context, signal),
      body: { predicate } satisfies Schemas["AllowlistPredicateRequest"],
      method: "POST",
    }),
  );
}

export async function listMemoryCalibration(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly CalibrationMapping[]> {
  const payload = await client.request(
    "/v1/admin/memory-calibration",
    contextOptions(context, signal),
  );
  return requiredArray(payload, "calibration mappings").map(parseCalibration);
}

export async function refitMemoryCalibration(
  client: ContextplaneClient,
  input: CalibrationRefitInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<CalibrationRefitReceipt> {
  const record = requiredRecord(
    await client.request("/v1/admin/memory-calibration:refit", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "calibration refit receipt",
  );
  return {
    activated: requiredBoolean(record, "activated"),
    model_id: requiredString(record, "model_id"),
    n_adjudicated: requiredNumber(record, "n_adjudicated"),
    provider_id: requiredString(record, "provider_id"),
    strategy_id: requiredString(record, "strategy_id"),
    version: requiredString(record, "version"),
  };
}

export async function listPiiPatterns(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly PiiPattern[]> {
  const payload = await client.request("/v1/admin/pii-patterns", contextOptions(context, signal));
  return requiredArray(payload, "PII patterns").map(parsePiiPattern);
}

export async function setPiiPatternEnabled(
  client: ContextplaneClient,
  patternId: string,
  isEnabled: boolean,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<PiiPattern> {
  const payload = await client.request(`/v1/admin/pii-patterns/${encodeURIComponent(patternId)}`, {
    ...contextOptions(context, signal),
    body: { is_enabled: isEnabled } satisfies Schemas["PiiPatternPatch"],
    method: "PATCH",
  });
  return parsePiiPattern(payload);
}

export async function listPiiFieldPolicies(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly PiiFieldPolicy[]> {
  const payload = await client.request(
    "/v1/admin/pii-field-policies",
    contextOptions(context, signal),
  );
  return requiredArray(payload, "PII field policies").map(parsePiiFieldPolicy);
}

/**
 * Set a tenant's policy for one field type, optionally narrowed to one pattern.
 *
 * This is the operator's primary PII control and it had no adapter: the
 * dashboard could list policies and not change one, so the documented way to
 * raise a field to `block` was a `curl`. Omitting `patternId` writes the
 * catch-all override for that field type, which is what the endpoint means by a
 * null `pattern_id` — it is not the same as "no policy".
 */
/**
 * The two vocabularies, read off the contract rather than written out.
 *
 * They arrived as bare `string` until the service published them as enums, and
 * until then a picker had to duplicate nine field-type literals — with a
 * free-text box the only alternative, which let an operator save a policy that
 * stored, listed, and governed nothing. These aliases are what let the editor
 * drop its copy.
 */
export type PiiFieldType = NonNullable<Schemas["PiiFieldPolicyCreate"]["field_type"]>;
export type PiiPolicy = NonNullable<Schemas["PiiFieldPolicyCreate"]["policy"]>;

export async function setPiiFieldPolicy(
  client: ContextplaneClient,
  input: { fieldType: PiiFieldType; patternId?: string | null; policy: PiiPolicy },
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<PiiFieldPolicy> {
  const payload = await client.request("/v1/admin/pii-field-policies", {
    ...contextOptions(context, signal),
    body: {
      field_type: input.fieldType,
      pattern_id: input.patternId ?? null,
      policy: input.policy,
    } satisfies Schemas["PiiFieldPolicyCreate"],
    method: "POST",
  });
  return parsePiiFieldPolicy(payload);
}

/**
 * Remove one policy override, restoring whatever resolves beneath it.
 *
 * Deleting an override is not the same as setting `advisory`: resolution falls
 * through to the field-wide override, then the pattern's own, then the runtime
 * default. A screen that offered only "set to advisory" would leave a row that
 * shadows a broader policy the tenant may have meant to apply.
 *
 * Posts to the item path. The collection path takes a create, so a delete sent
 * there is a different operation entirely.
 */
export async function deletePiiFieldPolicy(
  client: ContextplaneClient,
  policyId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  await client.request(`/v1/admin/pii-field-policies/${encodeURIComponent(policyId)}`, {
    ...contextOptions(context, signal),
    method: "DELETE",
  });
}

export async function purgeActorPersonalData(
  client: ContextplaneClient,
  actorId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<PurgeReceipt> {
  const record = requiredRecord(
    await client.request(`/v1/admin/actors/${encodeURIComponent(actorId)}/personal-data`, {
      ...contextOptions(context, signal),
      method: "DELETE",
    }),
    "personal-data purge receipt",
  );
  const subsystemValue = requiredRecord(record.subsystems ?? {}, "purge subsystems");
  const subsystems: Record<string, Record<string, number>> = {};
  for (const [name, countsValue] of Object.entries(subsystemValue)) {
    const countsRecord = requiredRecord(countsValue, `purge subsystem ${name}`);
    const counts: Record<string, number> = {};
    for (const [countName, countValue] of Object.entries(countsRecord)) {
      if (typeof countValue !== "number" || !Number.isFinite(countValue)) {
        throw new Error(`Invalid API response: purge count ${countName} is not numeric.`);
      }
      counts[countName] = countValue;
    }
    subsystems[name] = counts;
  }
  return {
    purged_entries: requiredNumber(record, "purged_entries"),
    purged_workspaces: requiredNumber(record, "purged_workspaces"),
    subsystems,
  };
}

export async function listProgressionDefinitions(
  client: ContextplaneClient,
  tenantId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly ProgressionDefinition[]> {
  const payload = await client.request(
    `/v1/admin/tenants/${encodeURIComponent(tenantId)}/progression-definitions`,
    contextOptions(context, signal),
  );
  return requiredArray(payload, "progression definitions").map(parseProgressionDefinition);
}

export async function listProgressionOverrides(
  client: ContextplaneClient,
  tenantId: string,
  entityId: string,
  parameters: ListProgressionOverridesParameters = {},
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly ProgressionOverride[]> {
  const search = new URLSearchParams();
  append(search, "consumed", parameters.consumed);
  append(search, "expired", parameters.expired);
  append(search, "from_state", parameters.fromState);
  append(search, "to_state", parameters.toState);
  const path = `/v1/admin/tenants/${encodeURIComponent(tenantId)}/entities/${encodeURIComponent(entityId)}/progression-overrides${querySuffix(search)}`;
  const payload = await client.request(path, contextOptions(context, signal));
  return requiredArray(payload, "progression overrides").map(parseProgressionOverride);
}

export async function createProgressionOverride(
  client: ContextplaneClient,
  tenantId: string,
  entityId: string,
  input: ProgressionOverrideInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<ProgressionOverride> {
  const path = `/v1/admin/tenants/${encodeURIComponent(tenantId)}/entities/${encodeURIComponent(entityId)}/progression-overrides`;
  const payload = await client.request(path, {
    ...contextOptions(context, signal),
    body: {
      bypass_skip_rules: input.bypass_skip_rules ?? false,
      ...input,
    } satisfies Schemas["ProgressionOverrideCreate"],
    method: "POST",
  });
  return parseProgressionOverride(payload);
}
