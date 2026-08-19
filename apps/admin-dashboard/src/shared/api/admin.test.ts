import { describe, expect, it, vi } from "vitest";

import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import {
  addVocabularyValue,
  changeAutopromotePredicate,
  createProgressionOverride,
  getAutopromoteAllowlist,
  getConformancePolicy,
  getPromotionPolicy,
  listEntityTypeSchemas,
  listEdgePropertySchemas,
  listExternalSystems,
  listExtractionStrategies,
  listMemoryCalibration,
  listMemorySources,
  listPiiFieldPolicies,
  listPiiPatterns,
  listProgressionDefinitions,
  listProgressionOverrides,
  listSyncRuns,
  listSyncSources,
  listVocabularyValues,
  purgeActorPersonalData,
  refitMemoryCalibration,
  replacePromotionPolicy,
  resetMemorySourceBreaker,
  setEntityTypeSchemaAdvisory,
  setPiiPatternEnabled,
  setSyncSourceActive,
  setVocabularyDeprecated,
  triggerSync,
  updateExtractionStrategy,
} from "./admin";

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return {
    request: vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
      resolver(path, options),
    ),
  } satisfies ContextplaneClient;
}

const source = {
  config: { repository: "context" },
  created_at: "2026-08-12T09:00:00Z",
  created_by: null,
  credentials_ref: "vault://context",
  display_name: "Context repository",
  is_active: true,
  schedule: "0 * * * *",
  source_id: "source-a",
  source_type: "docs_corpus",
  tenant_id: "tenant-a",
};

const run = {
  artifact_count: 4,
  duration_s: 12,
  error_summary: null,
  finished_at: "2026-08-12T10:00:12Z",
  source_id: "source-a",
  started_at: "2026-08-12T10:00:00Z",
  status: "done",
  sync_run_id: "run-a",
  tenant_id: "tenant-a",
  trigger: "manual",
};

const vocabulary = {
  created_at: "2026-08-12T09:00:00Z",
  deprecated_at: null,
  is_system: false,
  kind: "entity_type",
  value: "service",
  vocab_id: "vocab-a",
};

const entityTypeSchema = {
  entity_type: "capability",
  is_advisory: true,
  json_schema: { type: "object" },
  schema_id: "schema-a",
  t_ingested_at: "2026-08-12T09:00:00Z",
  t_invalidated_at: null,
  t_valid_from: "2026-08-12T09:00:00Z",
  t_valid_to: null,
};

describe("administrative API", () => {
  it("reads and operates integration settings with bounded run queries", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/admin/sync-sources") return [source];
      if (path.startsWith("/v1/admin/sync-runs?")) return [run];
      if (path === "/v1/admin/external-systems") {
        return [
          {
            created_at: "2026-08-12T09:00:00Z",
            description: null,
            display_name: "ServiceNow",
            slug: "servicenow",
            tenant_id: "tenant-a",
            url_template: null,
          },
        ];
      }
      if (path.endsWith("/trigger")) {
        return {
          source_id: "source-a",
          started_at: "2026-08-12T11:00:00Z",
          status: "queued",
          sync_run_id: "run-b",
          trigger: "manual",
        };
      }
      if (path === "/v1/admin/sync-sources/source-a") return { ...source, is_active: false };
      throw new Error(`Unhandled path: ${path}`);
    });

    await expect(listSyncSources(client)).resolves.toEqual([source]);
    await expect(
      listSyncRuns(client, { from: "2026-08-05T00:00:00Z", status: "done" }),
    ).resolves.toEqual([run]);
    await expect(listExternalSystems(client)).resolves.toMatchObject([
      { display_name: "ServiceNow", slug: "servicenow" },
    ]);
    await expect(triggerSync(client, "source-a", "key-a")).resolves.toMatchObject({
      status: "queued",
      sync_run_id: "run-b",
    });
    await expect(setSyncSourceActive(client, "source-a", false)).resolves.toMatchObject({
      is_active: false,
    });

    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("from=2026-08-05T00%3A00%3A00Z"),
      expect.any(Object),
    );
    expect(client.request).toHaveBeenCalledWith(
      "/v1/admin/sync-sources/source-a/trigger",
      expect.objectContaining({ headers: { "Idempotency-Key": "key-a" }, method: "POST" }),
    );
  });

  it("reads and updates extraction and graph schema settings", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/admin/extraction-strategies") {
        return [
          {
            confidence_floor: 0.8,
            is_enabled: true,
            model_id: "model-a",
            model_is_overridden: false,
            namespace_template: "{tenant}",
            permitted_predicates: ["owned_by_team"],
            prompt_is_overridden: false,
            strategy_id: "catalog",
          },
        ];
      }
      if (path.endsWith("conformance-policy")) {
        return {
          explanation: "At least nine of ten examples.",
          minimum_sample: 10,
          target_ratio: 0.9,
        };
      }
      if (path === "/v1/admin/extraction-strategies/catalog" && options?.method === "PATCH") {
        return { strategy_id: "catalog" };
      }
      if (path === "/v1/admin/vocabularies/entity_type") {
        return options?.method === "POST" ? vocabulary : [vocabulary];
      }
      if (path === "/v1/admin/vocabularies/entity_type/service") {
        return { ...vocabulary, deprecated_at: options?.body ? "2026-08-12T12:00:00Z" : null };
      }
      if (path === "/v1/admin/entity-types") return [entityTypeSchema];
      if (path === "/v1/admin/entity-types/capability") {
        return { ...entityTypeSchema, is_advisory: false };
      }
      if (path === "/v1/admin/edge-property-schemas") return [{ rel: "depends_on" }];
      throw new Error(`Unhandled path: ${path}`);
    });

    await expect(listExtractionStrategies(client)).resolves.toMatchObject([
      { strategy_id: "catalog" },
    ]);
    await expect(getConformancePolicy(client)).resolves.toMatchObject({ target_ratio: 0.9 });
    await expect(
      updateExtractionStrategy(client, "catalog", { is_enabled: false }),
    ).resolves.toBeUndefined();
    await expect(listVocabularyValues(client, "entity_type")).resolves.toEqual([vocabulary]);
    await expect(addVocabularyValue(client, "entity_type", "service", "key-b")).resolves.toEqual(
      vocabulary,
    );
    await expect(
      setVocabularyDeprecated(client, "entity_type", "service", true),
    ).resolves.toMatchObject({ value: "service" });
    await expect(listEntityTypeSchemas(client)).resolves.toEqual([entityTypeSchema]);
    await expect(setEntityTypeSchemaAdvisory(client, "capability", false)).resolves.toMatchObject({
      is_advisory: false,
    });
    await expect(listEdgePropertySchemas(client)).resolves.toEqual([{ rel: "depends_on" }]);
  });

  it("integrates memory, privacy, and lifecycle administration", async () => {
    const progression = {
      definition: { states: ["draft", "active"] },
      entity_type: "service",
      is_advisory: true,
      progression_id: "progression-a",
      t_ingested_at: "2026-08-12T09:00:00Z",
      t_invalidated_at: null,
      t_valid_from: "2026-08-12T09:00:00Z",
      t_valid_to: null,
      tenant_id: "tenant-a",
    };
    const override = {
      audit_event_id: "audit-a",
      authorized_by: "actor-admin",
      bypass_skip_rules: false,
      consumed_at: null,
      entity_id: "entity-a",
      from_state: "draft",
      gate_id: "review",
      override_id: "override-a",
      reason: "Approved exception",
      t_valid_from: "2026-08-12T09:00:00Z",
      t_valid_to: "2026-08-13T09:00:00Z",
      tenant_id: "tenant-a",
      to_state: "active",
    };
    const sourcePolicy = {
      authority_tier: "authoritative",
      breach_count: 1,
      breaker_open_until: null,
      ingest_ceiling: 1000,
      may_provision_entities: false,
      source_id: "source-a",
      tenant_id: "tenant-a",
      window_seconds: 3600,
    };
    const client = clientFor((path, options) => {
      if (path === "/v1/admin/memory-sources") return [sourcePolicy];
      if (path.endsWith(":reset-breaker")) return sourcePolicy;
      if (path === "/v1/admin/memory-promotion-policy") {
        return { always_review: ["lifecycle"], blast_radius_threshold: 5, confidence_floor: 0.9 };
      }
      if (path.startsWith("/v1/admin/memory-autopromote-allowlist")) {
        return { predicates: ["owned_by_team"] };
      }
      if (path === "/v1/admin/memory-calibration") {
        return [
          {
            fitted_at: "2026-08-12T09:00:00Z",
            measured_error: 0.05,
            model_id: "model-a",
            n_adjudicated: 30,
            provider_id: "provider-a",
            status: "fitted",
            strategy_id: "strategy-a",
            version: "v2",
          },
        ];
      }
      if (path.endsWith("memory-calibration:refit")) {
        return {
          activated: true,
          model_id: "model-a",
          n_adjudicated: 30,
          provider_id: "provider-a",
          strategy_id: "strategy-a",
          version: "v3",
        };
      }
      if (path === "/v1/admin/pii-patterns") {
        return [
          {
            category: "contact",
            created_at: "2026-08-12T09:00:00Z",
            created_by: null,
            detector_module: null,
            is_enabled: true,
            is_system: false,
            name: "Email",
            pattern_id: "pattern-a",
            policy_override: null,
            regex: "@",
            tenant_id: "tenant-a",
          },
        ];
      }
      if (path === "/v1/admin/pii-patterns/pattern-a") {
        return {
          category: "contact",
          created_at: "2026-08-12T09:00:00Z",
          created_by: null,
          detector_module: null,
          is_enabled: false,
          is_system: false,
          name: "Email",
          pattern_id: "pattern-a",
          policy_override: null,
          regex: "@",
          tenant_id: "tenant-a",
        };
      }
      if (path === "/v1/admin/pii-field-policies") {
        return [
          {
            created_at: "2026-08-12T09:00:00Z",
            field_type: "workspace_body",
            pattern_id: null,
            policy: "block",
            policy_id: "policy-a",
            tenant_id: "tenant-a",
          },
        ];
      }
      if (path.includes("/personal-data")) {
        return {
          purged_entries: 3,
          purged_workspaces: 1,
          subsystems: { workspaces: { entries: 3, workspaces: 1 } },
        };
      }
      if (path.endsWith("/progression-definitions")) return [progression];
      if (path.includes("/progression-overrides")) {
        return options?.method === "POST" ? override : [override];
      }
      throw new Error(`Unhandled path: ${path}`);
    });

    await expect(listMemorySources(client)).resolves.toEqual([sourcePolicy]);
    await expect(resetMemorySourceBreaker(client, "source-a")).resolves.toEqual(sourcePolicy);
    await expect(getPromotionPolicy(client)).resolves.toMatchObject({ confidence_floor: 0.9 });
    await expect(
      replacePromotionPolicy(client, { blast_radius_threshold: 3, confidence_floor: 0.8 }),
    ).resolves.toMatchObject({ always_review: ["lifecycle"] });
    await expect(getAutopromoteAllowlist(client)).resolves.toEqual({
      predicates: ["owned_by_team"],
    });
    await expect(changeAutopromotePredicate(client, "owned_by_team", "revoke")).resolves.toEqual({
      predicates: ["owned_by_team"],
    });
    const calibration = await listMemoryCalibration(client);
    expect(calibration[0]).toMatchObject({ measured_error: 0.05 });
    await expect(
      refitMemoryCalibration(client, {
        model_id: "model-a",
        provider_id: "provider-a",
        strategy_id: "strategy-a",
      }),
    ).resolves.toMatchObject({ activated: true, version: "v3" });
    await expect(listPiiPatterns(client)).resolves.toMatchObject([{ name: "Email" }]);
    await expect(setPiiPatternEnabled(client, "pattern-a", false)).resolves.toMatchObject({
      is_enabled: false,
    });
    await expect(listPiiFieldPolicies(client)).resolves.toMatchObject([
      { field_type: "workspace_body" },
    ]);
    await expect(purgeActorPersonalData(client, "actor-a")).resolves.toMatchObject({
      purged_entries: 3,
      subsystems: { workspaces: { entries: 3 } },
    });
    await expect(listProgressionDefinitions(client, "tenant-a")).resolves.toEqual([progression]);
    await expect(
      listProgressionOverrides(client, "tenant-a", "entity-a", { consumed: false }),
    ).resolves.toEqual([override]);
    await expect(
      createProgressionOverride(client, "tenant-a", "entity-a", {
        from_state: "draft",
        gate_id: "review",
        reason: "Approved exception",
        to_state: "active",
      }),
    ).resolves.toEqual(override);
  });

  it("rejects malformed administrative payloads instead of trusting them", async () => {
    const client = clientFor(() => [{ display_name: 42 }]);
    await expect(listSyncSources(client)).rejects.toThrow(/config is not an object/i);
    await expect(listPiiPatterns(client)).rejects.toThrow(/category is not text/i);
  });
});
