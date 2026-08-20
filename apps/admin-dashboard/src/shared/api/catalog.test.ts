import { describe, expect, it, vi } from "vitest";

import type { ContextplaneRequestOptions } from "./client";
import { clientFromRequest } from "./client";
import {
  changeCapabilityLifecycle,
  createCatalogEntity,
  createCapabilityAdoption,
  createCapabilityArtifact,
  createCapabilitySubscription,
  deleteCapability,
  deleteCapabilityAdoption,
  deleteCapabilityArtifact,
  deleteCapabilitySubscription,
  getCapability,
  getCapabilityInterface,
  listCapabilities,
  listCapabilityAdoptions,
  listCapabilityArtifacts,
  listCapabilitySubscriptions,
  previewCapabilityVersion,
  putCapabilityInterface,
  setCapabilityVisibility,
  updateCapability,
  updateCapabilitySubscription,
} from "./catalog";

const capability = {
  attributes: { owner: "Trust engineering" },
  created_at: "2026-08-12T14:28:41Z",
  entity_id: "capability-a",
  entity_type: "capability",
  external_id: "policy-evaluation",
  lifecycle: "ga",
  name: "Policy evaluation",
};

const artifact = {
  body: "Verified policy contract",
  body_format: "markdown",
  category: "runbook",
  created_at: "2026-08-12T14:28:41Z",
  created_by_display_name: "Morgan Morris",
  fact_id: "artifact-a",
  title: "Operations runbook",
};

const adoption = {
  adoption_id: "adoption-a",
  consumer_tenant_id: "tenant-a",
  intent: "Production policy checks",
  provider_capability_id: "capability-a",
  version_pin: "2.0.0",
};

const subscription = {
  capability_id: "capability-a",
  digest_window: "PT1H",
  event_kinds: ["interface.changed"],
  is_enabled: true,
  subscription_id: "subscription-a",
  webhook_url: "https://hooks.example.test/policy",
};

function clientFor(handler: (path: string, options?: ContextplaneRequestOptions) => unknown) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
    handler(path, options),
  );
  return clientFromRequest(request);
}

describe("catalog API", () => {
  it("parses canonical capability detail, interface, evidence, connections, and impact", async () => {
    const client = clientFor((path) => {
      if (path.includes("/interface")) {
        return {
          capability_id: "capability-a",
          ingested_at: "2026-08-12T14:28:41Z",
          interface_canonical: { operations: ["evaluate"] },
          interface_format: "json_schema",
          interface_source: { type: "object" },
        };
      }
      if (path.includes("/preview-version")) {
        return {
          affected_consumers: [
            {
              entity_id: "consumer-a",
              name: "Checkout",
              tenant_id: "tenant-a",
              version_pin: null,
            },
          ],
          changes: [{ path: "$.required", type: "added" }],
          diff_classification: "breaking",
          proposed_version: "3.0.0",
          release_notes_scaffold: "Review required fields.",
        };
      }
      if (path.includes("/artifacts")) return { items: [artifact], next_cursor: null };
      if (path.includes("/adoptions")) return { items: [adoption] };
      if (path.includes("/subscriptions")) return { items: [subscription] };
      if (path.startsWith("/v1/capabilities/capability-a?")) return capability;
      return { items: [capability], next_cursor: "opaque+/cursor==" };
    });
    const context = { tenantId: "tenant-a" };

    const page = await listCapabilities(
      client,
      {
        asOf: "2026-08-12T14:28:41Z",
        cursor: "opaque+/cursor==",
        entityType: "capability",
        lifecycle: "ga",
        pageSize: 25,
      },
      context,
    );
    const detail = await getCapability(client, "capability-a", context);
    const declaredInterface = await getCapabilityInterface(client, "capability-a", context);
    const impact = await previewCapabilityVersion(
      client,
      "capability-a",
      {
        interface_format: "json_schema",
        proposed_interface: { type: "object" },
        proposed_version: "3.0.0",
      },
      context,
    );
    const artifacts = await listCapabilityArtifacts(client, "capability-a", context);
    const adoptions = await listCapabilityAdoptions(client, "capability-a", context);
    const subscriptions = await listCapabilitySubscriptions(client, "capability-a", context);

    expect(page.nextCursor).toBe("opaque+/cursor==");
    expect(detail).toEqual(expect.objectContaining({ entityType: "capability" }));
    expect(declaredInterface.surface).toEqual({ operations: ["evaluate"] });
    expect(impact).toEqual(
      expect.objectContaining({
        affectedConsumers: [expect.objectContaining({ name: "Checkout", versionPin: null })],
        classification: "breaking",
      }),
    );
    expect(artifacts.items[0]).toEqual(expect.objectContaining({ title: "Operations runbook" }));
    expect(adoptions[0]).toEqual(expect.objectContaining({ adoptionId: "adoption-a" }));
    expect(subscriptions[0]).toEqual(
      expect.objectContaining({ eventKinds: ["interface.changed"], isEnabled: true }),
    );
    const listUrl = new URL(client.request.mock.calls[0]?.[0] ?? "", "https://example.test");
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      as_of: "2026-08-12T14:28:41Z",
      cursor: "opaque+/cursor==",
      entity_type: "capability",
      lifecycle: "ga",
      page_size: "25",
    });
  });

  it("sends every capability mutation with tenant scope and fresh create keys", async () => {
    const client = clientFor((path, options) => {
      if (options?.method === "PATCH" && !path.endsWith("/lifecycle")) return capability;
      if (path.endsWith("/artifacts") && options?.method === "POST") return artifact;
      if (path.endsWith("/adoptions") && options?.method === "POST") return adoption;
      if (options?.method === "POST" && path === "/v1/capabilities") return capability;
      return undefined;
    });
    const context = { tenantId: "tenant-a" };

    await createCatalogEntity(
      client,
      { entityType: "capability", name: "Policy evaluation" },
      context,
    );
    await updateCapability(client, "capability/a", { updates: { owner: "Platform" } }, context);
    await setCapabilityVisibility(
      client,
      "capability/a",
      { visibility: "tenant-shared", shared_with_tenants: ["tenant-b"] },
      context,
    );
    await changeCapabilityLifecycle(
      client,
      "capability/a",
      { new_state: "deprecated", successor: "none" },
      context,
    );
    await putCapabilityInterface(
      client,
      "capability/a",
      { interface_format: "json_schema", interface_source: { type: "object" } },
      context,
    );
    await createCapabilityArtifact(
      client,
      "capability/a",
      {
        body: "Verified policy contract",
        body_format: "markdown",
        category: "runbook",
        title: "Operations runbook",
      },
      context,
    );
    await deleteCapabilityArtifact(client, "capability/a", "artifact/a", context);
    await createCapabilityAdoption(
      client,
      "capability/a",
      { intent: "Production policy checks", version_pin: "2.0.0" },
      context,
    );
    await deleteCapabilityAdoption(client, "capability/a", "adoption/a", context);
    await createCapabilitySubscription(
      client,
      "capability/a",
      { event_kinds: ["interface.changed"], webhook_url: null },
      context,
    );
    await updateCapabilitySubscription(client, "subscription/a", { is_enabled: false }, context);
    await deleteCapabilitySubscription(client, "subscription/a", context);
    await deleteCapability(client, "capability/a", context);

    expect(client.request).toHaveBeenCalledWith(
      "/v1/capabilities/capability%2Fa/visibility",
      expect.objectContaining({ method: "PATCH", tenantId: "tenant-a" }),
    );
    expect(client.request).toHaveBeenCalledWith(
      "/v1/subscriptions/subscription%2Fa",
      expect.objectContaining({ method: "DELETE", tenantId: "tenant-a" }),
    );
    const idempotencyKeys = client.request.mock.calls
      .map(([, options]) => options?.headers?.["Idempotency-Key"])
      .filter((value): value is string => typeof value === "string");
    expect(idempotencyKeys).toHaveLength(4);
    expect(new Set(idempotencyKeys).size).toBe(4);
  });

  it("rejects malformed pages and impact payloads at the API boundary", async () => {
    const malformedPage = clientFor(() => ({ items: "not-a-list", next_cursor: null }));
    await expect(listCapabilities(malformedPage)).rejects.toThrow(
      "Capability page items was not a list.",
    );

    const malformedImpact = clientFor(() => ({ affected_consumers: [], changes: "invalid" }));
    await expect(
      previewCapabilityVersion(malformedImpact, "capability-a", {
        interface_format: "json_schema",
        proposed_interface: {},
        proposed_version: "3.0.0",
      }),
    ).rejects.toThrow("Version preview changes was not a list.");

    const malformedSubscriptions = clientFor(() => ({
      items: [{ ...subscription, event_kinds: 1 }],
    }));
    await expect(
      listCapabilitySubscriptions(malformedSubscriptions, "capability-a"),
    ).rejects.toThrow("Subscription event_kinds was not a list.");
  });

  it("sends each creatable entity type to its own route", async () => {
    const client = clientFor(() => capability);

    await createCatalogEntity(client, { entityType: "capability", name: "Policy evaluation" });
    await createCatalogEntity(client, {
      entityType: "concept",
      name: "Settlement window",
      parentCapabilityId: "51485c54-ed69-459b-8dd8-30d80f62d835",
    });
    await createCatalogEntity(client, { entityType: "operation", name: "Reprice order" });

    expect(client.request.mock.calls.map(([path]) => path)).toEqual([
      "/v1/capabilities",
      "/v1/concepts",
      "/v1/operations",
    ]);
    expect(client.request.mock.calls[1]?.[1]?.body).toEqual({
      attributes: {},
      entity_type: "concept",
      name: "Settlement window",
      parent_capability_id: "51485c54-ed69-459b-8dd8-30d80f62d835",
    });
    const keys = client.request.mock.calls.map(
      ([, options]) => options?.headers?.["Idempotency-Key"],
    );
    expect(new Set(keys).size).toBe(3);
  });

  it("omits the optional fields a caller did not supply", async () => {
    const client = clientFor(() => capability);

    await createCatalogEntity(client, { entityType: "capability", name: "Policy evaluation" });

    expect(client.request.mock.calls[0]?.[1]?.body).toEqual({
      attributes: {},
      entity_type: "capability",
      name: "Policy evaluation",
    });
  });
});
