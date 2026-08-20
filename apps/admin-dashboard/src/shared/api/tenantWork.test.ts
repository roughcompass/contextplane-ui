import { describe, expect, it, vi } from "vitest";

import type { ContextplaneRequestOptions } from "./client";
import { clientFromRequest } from "./client";
import {
  addIntentParticipant,
  appendIntentCheckpoint,
  assignTenantOwnership,
  findTargetOwners,
  getIntentCheckpoint,
  getIntentCheckpointByDigest,
  getProfileConformance,
  getTenantLearningAggregates,
  getTenantOwnershipAssignment,
  ingestTenantSignal,
  listIntentParticipants,
  listPrincipalOwnership,
  listTenantLearningMetrics,
  listTenantNotifications,
  markTenantNotificationRead,
  planProfileBinding,
  publishProfileExtension,
  publishProfileRevision,
  removeIntentParticipant,
  transitionProfileBinding,
  transitionTenantOwnership,
} from "./tenantWork";

const notification = {
  capability_id: "capability-a",
  capability_slug: "policy-evaluation",
  change_classification: "breaking",
  event_kind: "interface.changed",
  fetch_url: "/v1/capabilities/capability-a",
  notification_id: "notification-a",
  occurred_at: "2026-08-12T14:28:41Z",
  subscription_id: "subscription-a",
  tenant_id: "tenant-a",
  version_after: "2.0.0",
  version_before: "1.0.0",
};

const ownership = {
  confidence: 0.9,
  derivation_method: "declared",
  effective_from: "2026-08-12T14:28:41Z",
  effective_to: null,
  is_pending: false,
  owned_target_id: "target-a",
  owned_target_kind: "capability",
  owner_principal: "actor-a",
  ownership_assignment_id: "assignment-a",
  provenance_id: "provenance-a",
  recorded_at: "2026-08-12T14:28:41Z",
  recorded_by: "actor-admin",
  replaced_by_assignment_id: null,
  revocation_reason: null,
  role: "owner",
  scope: "full",
  source: "manual",
  validation_state: "validated",
};

const participant = {
  actor_id: "actor-a",
  expires_at: null,
  granted_at: "2026-08-12T14:28:41Z",
  granted_by: "actor-admin",
  intent_id: "intent-a",
  resolver_version: "1",
  role: "contributor",
};

const checkpoint = {
  assumptions: ["Production access remains available"],
  author: "actor-a",
  checkpoint_id: "checkpoint-a",
  completed_checks: ["Contract verified"],
  decisions: ["Proceed with rollout"],
  digest: "sha256:checkpoint-a",
  goal: "Roll out policy evaluation",
  intent_id: "intent-a",
  next_action: "Validate production",
  open_questions: ["Who signs off?"],
  predecessor_id: null,
  recorded_at: "2026-08-12T14:28:41Z",
  retention_policy: "tenant-default",
  sequence: 1,
};

function clientFor(handler: (path: string, options?: ContextplaneRequestOptions) => unknown) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
    handler(path, options),
  );
  return clientFromRequest(request);
}

describe("tenant work API", () => {
  it("parses notifications, forwards tenant scope, and preserves opaque cursors", async () => {
    const client = clientFor((path) => {
      if (path.includes(":mark-read")) return undefined;
      return { items: [notification], next_cursor: "opaque+/cursor==" };
    });

    const result = await listTenantNotifications(
      client,
      { cursor: "opaque+/cursor==", pageSize: 25, status: "all" },
      { tenantId: "tenant-a" },
    );
    await markTenantNotificationRead(client, "notification/a", { tenantId: "tenant-a" });

    const listPath = client.request.mock.calls[0]?.[0] ?? "";
    const listUrl = new URL(listPath, "https://example.test");
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      cursor: "opaque+/cursor==",
      page_size: "25",
      status: "all",
      view: "default",
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          capabilitySlug: "policy-evaluation",
          changeClassification: "breaking",
          notificationId: "notification-a",
        }),
      ],
      nextCursor: "opaque+/cursor==",
    });
    expect(client.request).toHaveBeenLastCalledWith(
      "/v1/notifications/notification%2Fa:mark-read",
      { method: "POST", tenantId: "tenant-a" },
    );
  });

  it("loads learning evidence and returns a validated signal receipt", async () => {
    const client = clientFor((path) => {
      if (path.startsWith("/v1/learning/aggregates")) return { total: 12 };
      if (path === "/v1/learning/metrics") return [{ metric: "acceptance", value: 0.8 }];
      if (path === "/v1/signals") {
        return {
          authority: "registered-source",
          content_digest: "sha256:signal-a",
          ingested_at: "2026-08-12T14:28:41Z",
          replayed: false,
          signal_id: "signal-a",
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    await expect(
      getTenantLearningAggregates(client, 14, { tenantId: "tenant-a" }),
    ).resolves.toEqual({ total: 12 });
    await expect(listTenantLearningMetrics(client, { tenantId: "tenant-a" })).resolves.toEqual([
      { metric: "acceptance", value: 0.8 },
    ]);
    const receipt = await ingestTenantSignal(
      client,
      {
        classification: "internal",
        event_time: "2026-08-12T14:28:41Z",
        idempotency_key: "signal-submission-a",
        observed_time: "2026-08-12T14:29:00Z",
        payload: { outcome: "accepted" },
        producer_id: "agent-a",
        producer_type: "agent",
        schema_version: "external_signal.v1",
        source_event_id: "event-a",
        source_id: "source-a",
        source_system: "tracker",
      },
      { tenantId: "tenant-a" },
    );

    expect(receipt).toEqual({
      authority: "registered-source",
      contentDigest: "sha256:signal-a",
      ingestedAt: "2026-08-12T14:28:41Z",
      replayed: false,
      signalId: "signal-a",
    });
    expect(client.request).toHaveBeenCalledWith(
      "/v1/signals",
      expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
    );
  });

  it("supports ownership lookup, assignment, and lifecycle transitions", async () => {
    const client = clientFor(() => ({ items: [ownership] }));
    const mutationClient = clientFor(() => ownership);

    const byTarget = await findTargetOwners(client, "capability/type", "target with spaces", true, {
      tenantId: "tenant-a",
    });
    const byOwner = await listPrincipalOwnership(client, "actor/a", false, {
      tenantId: "tenant-a",
    });
    const created = await assignTenantOwnership(
      mutationClient,
      {
        owned_target_id: "target-a",
        owned_target_kind: "capability",
        owner_principal: "actor-a",
        profile_revision_id: "revision-a",
        role: "owner",
        scope: "full",
        source: "manual",
      },
      { tenantId: "tenant-a" },
    );
    await getTenantOwnershipAssignment(mutationClient, "assignment/a", {
      tenantId: "tenant-a",
    });
    await transitionTenantOwnership(
      mutationClient,
      "assignment/a",
      { reason: "Reviewed", to_state: "validated" },
      { tenantId: "tenant-a" },
    );

    expect(byTarget[0]).toEqual(expect.objectContaining({ confidence: 0.9, role: "owner" }));
    expect(byOwner[0]?.ownershipAssignmentId).toBe("assignment-a");
    expect(created.validationState).toBe("validated");
    expect(client.request.mock.calls.map(([path]) => path)).toEqual([
      "/v1/ownership:owned-by?include_pending=true&owned_target_id=target+with+spaces&owned_target_kind=capability%2Ftype",
      "/v1/ownership:owns?include_pending=false&owner_principal=actor%2Fa",
    ]);
    expect(mutationClient.request).toHaveBeenLastCalledWith(
      "/v1/ownership/assignments/assignment%2Fa:transition",
      expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
    );
  });

  it("covers profile publishing, planning, and binding transitions", async () => {
    const client = clientFor((path) => ({ path, state: "accepted" }));
    const context = { tenantId: "tenant-a" };

    await getProfileConformance(client, context);
    await planProfileBinding(
      client,
      {
        effective_from: "2026-08-12T14:28:41Z",
        profile_revision_id: "revision-a",
        reason: "Adopt policy profile",
      },
      context,
    );
    await transitionProfileBinding(
      client,
      "binding/a",
      "rollback/complete",
      { reason: "Recovery verified" },
      context,
    );
    await publishProfileExtension(
      client,
      { namespace: "tenant-policy", target_core_revision_id: "revision-a" },
      context,
    );
    await publishProfileRevision(
      client,
      {
        compatibility: "backward_compatible",
        profile_family: "policy",
        profile_name: "Policy service",
        semantic_version: "2.0.0",
      },
      context,
    );

    expect(client.request.mock.calls.map(([path]) => path)).toEqual([
      "/v1/profiles/conformance",
      "/v1/profiles/bindings",
      "/v1/profiles/bindings/binding%2Fa/rollback/complete",
      "/v1/profiles/extensions",
      "/v1/profiles/revisions",
    ]);
    expect(client.request).toHaveBeenLastCalledWith(
      "/v1/profiles/revisions",
      expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
    );
  });

  it("manages participants and uses a fresh key for each immutable checkpoint append", async () => {
    const client = clientFor((path, options) => {
      if (options?.method === "DELETE") return undefined;
      if (path.includes("/participants")) {
        return options?.method === "POST" ? participant : { grants: [participant] };
      }
      return checkpoint;
    });
    const context = { tenantId: "tenant-a" };

    const participants = await listIntentParticipants(client, "intent/a", context);
    const added = await addIntentParticipant(
      client,
      "intent/a",
      { actor_id: "actor-a", role: "contributor" },
      context,
    );
    await removeIntentParticipant(client, "intent/a", "actor/a", context);
    const first = await appendIntentCheckpoint(
      client,
      "intent/a",
      { goal: "Roll out policy evaluation", next_action: "Validate production" },
      context,
    );
    await appendIntentCheckpoint(client, "intent/a", { goal: "Validate production" }, context);
    const byId = await getIntentCheckpoint(client, "intent/a", "checkpoint/a", context);
    const byDigest = await getIntentCheckpointByDigest(client, "sha256:a/b", context);

    expect(participants[0]?.actorId).toBe("actor-a");
    expect(added.role).toBe("contributor");
    expect(first).toEqual(expect.objectContaining({ sequence: 1, digest: "sha256:checkpoint-a" }));
    expect(byId.checkpointId).toBe("checkpoint-a");
    expect(byDigest.goal).toBe("Roll out policy evaluation");
    expect(client.request).toHaveBeenCalledWith("/v1/intents/intent%2Fa/participants/actor%2Fa", {
      method: "DELETE",
      tenantId: "tenant-a",
    });
    expect(client.request).toHaveBeenCalledWith("/v1/checkpoints/by-digest/sha256%3Aa%2Fb", {
      tenantId: "tenant-a",
    });
    const checkpointCalls = client.request.mock.calls.filter(([path]) =>
      path.endsWith("/checkpoints"),
    );
    const firstKey = checkpointCalls[0]?.[1]?.headers?.["Idempotency-Key"];
    const secondKey = checkpointCalls[1]?.[1]?.headers?.["Idempotency-Key"];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(secondKey).toMatch(/^[0-9a-f-]{36}$/u);
    expect(secondKey).not.toBe(firstKey);
  });

  it("rejects malformed service payloads before they enter feature models", async () => {
    const client = clientFor(() => ({ items: [{ notification_id: 42 }], next_cursor: null }));

    await expect(listTenantNotifications(client)).rejects.toThrow(
      "Invalid API response: capability_id is not text.",
    );
  });
});
