import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  clientFromRequest,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { SettingsPage } from "./SettingsPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "actor-admin",
  roles: ["admin"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "tenant-a",
  tenant_slug: "northstar",
};

const syncSource = {
  config: {},
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

const sourcePolicy = {
  authority_tier: "authoritative",
  breach_count: 2,
  breaker_open_until: "2026-08-12T15:00:00Z",
  ingest_ceiling: 1000,
  may_provision_entities: true,
  source_id: "memory-source-a",
  tenant_id: "tenant-a",
  window_seconds: 3600,
};

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return clientFromRequest(
    vi.fn(async (path: string, options?: ContextplaneRequestOptions) => resolver(path, options)),
  );
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SettingsPage activeTenantName="Northstar Systems" client={client} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function expectStandardPageWidth() {
  const page = screen.getByRole("heading", { level: 1, name: "Settings" }).closest(".mx-auto");
  expect(page).not.toBeNull();
  expect(page).toHaveClass("w-full", "max-w-[1200px]", "px-3", "sm:px-4", "lg:px-6");
  expect(page).not.toHaveClass("max-w-[800px]");
}

function fixtureResolver(path: string, options?: ContextplaneRequestOptions): unknown {
  if (path === "/v1/whoami") return identity;
  if (path === "/v1/admin/sync-sources") return [syncSource];
  if (path.startsWith("/v1/admin/sync-runs?")) {
    return [
      {
        artifact_count: 12,
        duration_s: 9,
        error_summary: null,
        finished_at: "2026-08-12T10:00:09Z",
        source_id: "source-a",
        started_at: "2026-08-12T10:00:00Z",
        status: "done",
        sync_run_id: "run-a",
        tenant_id: "tenant-a",
        trigger: "scheduled",
      },
    ];
  }
  if (path === "/v1/admin/external-systems") {
    return [
      {
        created_at: "2026-08-12T09:00:00Z",
        description: "Change records",
        display_name: "ServiceNow",
        slug: "servicenow",
        tenant_id: "tenant-a",
        url_template: "https://example.test/{id}",
      },
    ];
  }
  if (path === "/v1/admin/sync-sources/source-a/trigger") {
    return {
      source_id: "source-a",
      started_at: "2026-08-12T11:00:00Z",
      status: "queued",
      sync_run_id: "run-queued",
      trigger: "manual",
    };
  }
  if (path === "/v1/admin/sync-sources/source-a" && options?.method === "PATCH") {
    return { ...syncSource, is_active: false };
  }
  if (path === "/v1/admin/extraction-strategies") {
    return [
      {
        confidence_floor: 0.8,
        is_enabled: true,
        model_id: "model-a",
        model_is_overridden: false,
        namespace_template: "{tenant}",
        permitted_predicates: ["owned_by_team"],
        prompt_is_overridden: true,
        strategy_id: "catalog_extract",
      },
    ];
  }
  if (path.endsWith("/conformance-policy")) {
    return { explanation: "At least nine of ten examples.", minimum_sample: 10, target_ratio: 0.9 };
  }
  if (path === "/v1/admin/extraction-strategies/catalog_extract") {
    return {
      confidence_floor: 0.8,
      is_enabled: false,
      model_override: null,
      prompt_override: null,
      strategy_id: "catalog_extract",
    };
  }
  if (path === "/v1/admin/vocabularies/entity_type") {
    const item = {
      created_at: "2026-08-12T09:00:00Z",
      deprecated_at: null,
      is_system: false,
      kind: "entity_type",
      value: options?.method === "POST" ? "operation" : "service",
      vocab_id: options?.method === "POST" ? "vocab-b" : "vocab-a",
    };
    return options?.method === "POST" ? item : [item];
  }
  if (path === "/v1/admin/vocabularies/edge_rel") return [];
  if (path === "/v1/admin/vocabularies/entity_type/service") {
    return {
      created_at: "2026-08-12T09:00:00Z",
      deprecated_at: "2026-08-12T12:00:00Z",
      is_system: false,
      kind: "entity_type",
      value: "service",
      vocab_id: "vocab-a",
    };
  }
  if (path === "/v1/admin/entity-types") {
    return [
      {
        entity_type: "service",
        is_advisory: true,
        json_schema: { type: "object" },
        schema_id: "schema-a",
        t_ingested_at: "2026-08-12T09:00:00Z",
        t_invalidated_at: null,
        t_valid_from: "2026-08-12T09:00:00Z",
        t_valid_to: null,
      },
    ];
  }
  if (path === "/v1/admin/entity-types/service") {
    return {
      entity_type: "service",
      is_advisory: false,
      json_schema: { type: "object" },
      schema_id: "schema-a",
      t_ingested_at: "2026-08-12T09:00:00Z",
      t_invalidated_at: null,
      t_valid_from: "2026-08-12T09:00:00Z",
      t_valid_to: null,
    };
  }
  if (path === "/v1/admin/edge-property-schemas") return [{ rel: "depends_on" }];
  if (path === "/v1/admin/memory-sources") return [sourcePolicy];
  if (path === "/v1/admin/memory-promotion-policy") {
    return { always_review: ["lifecycle"], blast_radius_threshold: 5, confidence_floor: 0.9 };
  }
  if (path.startsWith("/v1/admin/memory-autopromote-allowlist")) {
    return { predicates: options?.method === "POST" ? ["owned_by_team"] : ["lifecycle"] };
  }
  if (path === "/v1/admin/memory-calibration") {
    return [
      {
        fitted_at: "2026-08-12T09:00:00Z",
        measured_error: 0.03,
        model_id: "model-a",
        n_adjudicated: 40,
        provider_id: "provider-a",
        status: "fitted",
        strategy_id: "catalog_extract",
        version: "v2",
      },
    ];
  }
  if (path === "/v1/admin/memory-sources/memory-source-a:reset-breaker") {
    return { ...sourcePolicy, breaker_open_until: null };
  }
  if (path === "/v1/admin/memory-calibration:refit") {
    return {
      activated: true,
      model_id: "model-a",
      n_adjudicated: 40,
      provider_id: "provider-a",
      strategy_id: "catalog_extract",
      version: "v3",
    };
  }
  if (path === "/v1/admin/pii-patterns") {
    return [
      {
        category: "contact",
        created_at: "2026-08-12T09:00:00Z",
        created_by: "actor-admin",
        detector_module: null,
        is_enabled: true,
        is_system: false,
        name: "Tenant email",
        pattern_id: "pattern-a",
        policy_override: "block",
        regex: "@",
        tenant_id: "tenant-a",
      },
    ];
  }
  if (path === "/v1/admin/pii-patterns/pattern-a") {
    return {
      category: "contact",
      created_at: "2026-08-12T09:00:00Z",
      created_by: "actor-admin",
      detector_module: null,
      is_enabled: false,
      is_system: false,
      name: "Tenant email",
      pattern_id: "pattern-a",
      policy_override: "block",
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
        policy_id: "field-policy-a",
        tenant_id: "tenant-a",
      },
    ];
  }
  if (path === "/v1/admin/actors/actor-target/personal-data") {
    return {
      purged_entries: 4,
      purged_workspaces: 1,
      subsystems: { workspaces: { entries: 4, workspaces: 1 } },
    };
  }
  if (path === "/v1/admin/tenants/tenant-a/progression-definitions") {
    return [
      {
        definition: { states: ["draft", "active"] },
        entity_type: "service",
        is_advisory: true,
        progression_id: "progression-a",
        t_ingested_at: "2026-08-12T09:00:00Z",
        t_invalidated_at: null,
        t_valid_from: "2026-08-12T09:00:00Z",
        t_valid_to: null,
        tenant_id: "tenant-a",
      },
    ];
  }
  if (path === "/v1/admin/tenants/tenant-a/entities/entity-a/progression-overrides") {
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
    return options?.method === "POST" ? override : [override];
  }
  throw new Error(`Unhandled path: ${path}`);
}

function alternativeResolver(path: string, options?: ContextplaneRequestOptions): unknown {
  if (path === "/v1/admin/sync-sources") {
    return [{ ...syncSource, is_active: false, schedule: null }];
  }
  if (path.startsWith("/v1/admin/sync-runs?")) {
    return [
      {
        artifact_count: null,
        duration_s: null,
        error_summary: "Connection refused",
        finished_at: null,
        source_id: "source-a",
        started_at: "2026-08-12T10:00:00Z",
        status: "failed",
        sync_run_id: "run-failed",
        tenant_id: "tenant-a",
        trigger: "manual",
      },
    ];
  }
  if (path === "/v1/admin/external-systems") {
    return [
      {
        created_at: "2026-08-12T09:00:00Z",
        description: null,
        display_name: "Unlinked registry",
        slug: "registry",
        tenant_id: "tenant-a",
        url_template: null,
      },
    ];
  }
  if (path === "/v1/admin/extraction-strategies") {
    return [
      {
        confidence_floor: 0.7,
        is_enabled: false,
        model_id: "model-override",
        model_is_overridden: true,
        namespace_template: "{tenant}",
        permitted_predicates: [],
        prompt_is_overridden: false,
        strategy_id: "catalog_extract",
      },
    ];
  }
  if (path === "/v1/admin/vocabularies/entity_type") {
    return [
      {
        created_at: "2026-08-12T09:00:00Z",
        deprecated_at: "2026-08-12T10:00:00Z",
        is_system: true,
        kind: "entity_type",
        value: "legacy_service",
        vocab_id: "vocab-system",
      },
    ];
  }
  if (path === "/v1/admin/entity-types") {
    return [
      {
        entity_type: "service",
        is_advisory: false,
        json_schema: {},
        schema_id: "schema-enforcing",
        t_ingested_at: "2026-08-12T09:00:00Z",
        t_invalidated_at: null,
        t_valid_from: "2026-08-12T09:00:00Z",
        t_valid_to: null,
      },
    ];
  }
  if (path === "/v1/admin/edge-property-schemas") return [];
  if (path === "/v1/admin/memory-sources") {
    return [{ ...sourcePolicy, breaker_open_until: null, may_provision_entities: false }];
  }
  if (path === "/v1/admin/memory-autopromote-allowlist" && options?.method !== "POST") {
    return { predicates: [] };
  }
  if (path === "/v1/admin/memory-calibration:refit") {
    return {
      activated: false,
      model_id: "model-a",
      n_adjudicated: 20,
      provider_id: "provider-a",
      strategy_id: "catalog_extract",
      version: "v2-candidate",
    };
  }
  if (path === "/v1/admin/pii-patterns") {
    return [
      {
        category: "contact",
        created_at: "2026-08-12T09:00:00Z",
        created_by: null,
        detector_module: "contextplane.detectors.email",
        is_enabled: false,
        is_system: true,
        name: "System email",
        pattern_id: "pattern-system",
        policy_override: null,
        regex: "@",
        tenant_id: "tenant-a",
      },
    ];
  }
  if (path === "/v1/admin/pii-field-policies") {
    return [
      {
        created_at: "2026-08-12T09:00:00Z",
        field_type: "workspace_body",
        pattern_id: "pattern-system",
        policy: "redact",
        policy_id: "field-policy-pattern",
        tenant_id: "tenant-a",
      },
    ];
  }
  if (path === "/v1/admin/tenants/tenant-a/progression-definitions") {
    return [
      {
        definition: {},
        entity_type: "legacy_service",
        is_advisory: false,
        progression_id: "progression-history",
        t_ingested_at: "2026-08-01T09:00:00Z",
        t_invalidated_at: "2026-08-11T09:00:00Z",
        t_valid_from: "2026-08-01T09:00:00Z",
        t_valid_to: "2026-08-11T09:00:00Z",
        tenant_id: "tenant-a",
      },
    ];
  }
  if (path === "/v1/admin/tenants/tenant-a/entities/entity-a/progression-overrides") {
    return [
      {
        audit_event_id: "audit-consumed",
        authorized_by: "actor-admin",
        bypass_skip_rules: true,
        consumed_at: "2026-08-12T11:00:00Z",
        entity_id: "entity-a",
        from_state: "draft",
        gate_id: "review",
        override_id: "override-consumed",
        reason: "Completed migration",
        t_valid_from: "2026-08-12T09:00:00Z",
        t_valid_to: "2026-08-13T09:00:00Z",
        tenant_id: "tenant-a",
        to_state: "active",
      },
    ];
  }
  return fixtureResolver(path, options);
}

beforeEach(() => {
  window.history.replaceState({}, "", "/settings");
});

describe("SettingsPage", () => {
  it("organizes every major administrative area in URL-addressable tabs", async () => {
    const client = clientFor(fixtureResolver);
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    expectStandardPageWidth();
    expect(screen.getByText("Administrator access")).toBeVisible();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
    expect(screen.getByRole("tab", { name: "Integrations" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("Context repository")).toBeVisible();
    expect(screen.getByText("ServiceNow")).toBeVisible();
    expect(screen.getByRole("switch", { name: "Context repository sync source" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Trigger sync" }));
    expect(await screen.findByText("Sync run queued")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/admin/sync-sources/source-a/trigger",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(screen.getByRole("tab", { name: "Extraction" }));
    expect(window.location.search).toBe("?tab=extraction");
    expect(await screen.findByText("Catalog Extract")).toBeVisible();
    const extractionSwitch = screen.getByRole("switch", {
      name: "Catalog Extract extraction strategy",
    });
    expect(extractionSwitch).toBeChecked();
    fireEvent.click(extractionSwitch);
    const notifications = screen.getByRole("region", { name: "Notifications" });
    const extractionTitle = await within(notifications).findByText("Extraction strategy updated");
    const extractionToast = extractionTitle.closest('[role="status"]');
    expect(extractionToast).not.toBeNull();
    expect(extractionToast).toHaveTextContent("Catalog Extract is now disabled.");

    fireEvent.click(screen.getByRole("tab", { name: "Graph schema" }));
    expect(await screen.findByText("Edge property schemas")).toBeVisible();
    expect(screen.getByText("Depends On")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Memory" }));
    expect(await screen.findByText("Promotion policy")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Data protection" }));
    expect(await screen.findByText("Tenant email")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Lifecycle" }));
    expect(await screen.findByText("Progression definitions")).toBeVisible();
    expect(screen.getByText("Service")).toBeVisible();
  });

  it("applies graph, memory, privacy, and lifecycle changes with durable feedback", async () => {
    const client = clientFor(fixtureResolver);
    renderPage(client);
    await screen.findByText("Context repository");

    fireEvent.click(screen.getByRole("tab", { name: "Graph schema" }));
    await screen.findByText("Graph vocabulary");
    fireEvent.change(screen.getByRole("textbox", { name: /Add entity type/i }), {
      target: { value: "operation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add value" }));
    expect(await screen.findByText("Vocabulary value added")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Enforce writes" }));
    expect(screen.getByText("Enforce Service schema?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm enforcement" }));
    expect(await screen.findByText("Entity type schema updated")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Memory" }));
    await screen.findByText("Promotion policy");
    fireEvent.change(screen.getByRole("spinbutton", { name: /Confidence floor/i }), {
      target: { value: "0.85" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save promotion policy" }));
    expect(await screen.findByText("Promotion policy updated")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reset breaker" }));
    expect(await screen.findByText("Source breaker reset")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refit now" }));
    expect(await screen.findByText("Calibration refit completed")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Data protection" }));
    await screen.findByText("Tenant email");
    const patternSwitch = screen.getByRole("switch", {
      name: "Tenant email detection pattern",
    });
    expect(patternSwitch).toBeChecked();
    fireEvent.click(patternSwitch);
    expect(await screen.findByText("Detection pattern updated")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Actor ID" }), {
      target: { value: "actor-target" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Confirm actor ID" }), {
      target: { value: "actor-target" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Purge actor personal data" }));
    expect(await screen.findByText("Personal-data purge completed")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Lifecycle" }));
    await screen.findByText("Progression definitions");
    fireEvent.change(screen.getByRole("textbox", { name: "Entity ID" }), {
      target: { value: "entity-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load overrides" }));
    expect(await screen.findByText(/draft → active/i)).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "From state" }), {
      target: { value: "draft" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "To state" }), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Gate ID" }), {
      target: { value: "review" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Audit reason" }), {
      target: { value: "Approved exception" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record progression override" }));
    expect(await screen.findByText("Progression override recorded")).toBeVisible();
  });

  it("renders alternative service states without collapsing unknown, disabled, or historical values", async () => {
    renderPage(clientFor(alternativeResolver));
    expect(await screen.findByText("Paused")).toBeVisible();
    expect(screen.getByText(/Manual schedule/)).toBeVisible();
    expect(screen.getByText(/Artifact count unavailable/)).toBeVisible();
    expect(screen.getByText("No description supplied.")).toBeVisible();
    const sourceSwitch = screen.getByRole("switch", {
      name: "Context repository sync source",
    });
    expect(sourceSwitch).not.toBeChecked();
    fireEvent.click(sourceSwitch);
    expect(await screen.findByText("Sync source updated")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Extraction" }));
    const extractionSwitch = await screen.findByRole("switch", {
      name: "Catalog Extract extraction strategy",
    });
    expect(extractionSwitch).not.toBeChecked();
    expect(screen.getByText("Model override")).toBeVisible();
    fireEvent.click(extractionSwitch);
    expect(await screen.findByText("Extraction strategy updated")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Graph schema" }));
    expect(await screen.findByText("System value")).toBeVisible();
    expect(screen.getByText("Deprecated")).toBeVisible();
    expect(screen.getByText("Enforcing")).toBeVisible();
    expect(screen.getByText("No edge property schemas")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Make advisory" }));
    expect(await screen.findByText("Entity type schema updated")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Memory" }));
    expect(await screen.findByText("No predicates are allowlisted")).toBeVisible();
    expect(screen.getByText("Breaker closed")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reset breaker" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Allow predicate" }), {
      target: { value: "owned_by_team" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Allow predicate" }));
    expect(await screen.findByText("Autopromote allowlist updated")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refit now" }));
    expect(await screen.findByText(/was not activated/i)).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Data protection" }));
    expect(await screen.findByText("System email")).toBeVisible();
    expect(screen.getByText("System pattern")).toBeVisible();
    expect(screen.getByText(/Default policy/)).toBeVisible();
    expect(screen.getByText(/Pattern pattern-system/)).toBeVisible();
    expect(screen.queryByRole("switch", { name: "System email detection pattern" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Lifecycle" }));
    expect(await screen.findByText("Historical")).toBeVisible();
    expect(screen.getByText("Enforcing")).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "Entity ID" }), {
      target: { value: "entity-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load overrides" }));
    expect(await screen.findByText("Consumed")).toBeVisible();
  });

  it("restores tab state from the URL and browser history", async () => {
    window.history.replaceState({}, "", "/settings?tab=schema&vocab=edge_rel");
    renderPage(clientFor(fixtureResolver));

    expect(await screen.findByRole("tab", { name: "Graph schema" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByRole("combobox", { name: /^Vocabulary kind/ })).toHaveValue(
      "edge_rel",
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "Graph schema" }), { key: "End" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Lifecycle" })).toHaveFocus());
    expect(window.location.search).toBe("?tab=lifecycle");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Lifecycle" }), { key: "Home" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Integrations" })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("tab", { name: "Integrations" }), { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Lifecycle" })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("tab", { name: "Lifecycle" }), { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Integrations" })).toHaveFocus());

    window.history.pushState({}, "", "/settings?tab=privacy");
    fireEvent.popState(window);
    expect(await screen.findByRole("tab", { name: "Data protection" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not request administrative resources for a non-administrator", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return { ...identity, roles: ["producer"] };
      throw new Error(`Unexpected administrative request: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByText("Administrator access is required")).toBeVisible();
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("keeps the authentication-recovery state at the shared page width", async () => {
    const client = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "unauthenticated", message: "missing token", path: null }],
        requestId: "request-authentication",
        status: 401,
      });
    });
    renderPage(client);

    expect(
      await screen.findByText("Connect an authenticated DE Context Plane session"),
    ).toBeVisible();
    expectStandardPageWidth();
  });

  it("keeps an administrative failure recoverable with request correlation", async () => {
    let attempt = 0;
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      attempt += 1;
      throw new ContextplaneApiError({
        errors: [{ code: "service_unavailable", message: "offline", path: null }],
        requestId: "request-settings",
        status: 503,
      });
    });
    renderPage(client);

    expect(await screen.findByText("Settings could not be loaded")).toBeVisible();
    expect(screen.getByText(/request-settings/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry request" }));
    await waitFor(() => expect(attempt).toBeGreaterThan(3));
  });
});
