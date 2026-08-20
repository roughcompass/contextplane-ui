import { describe, expect, it, vi } from "vitest";

import { ContextplaneApiError, clientFromRequest } from "./client";
import type { ContextplaneRequestOptions } from "./client";
import {
  createRelationship,
  queryRelationships,
  getRelationship,
  updateRelationship,
  type RelationshipWriteInput,
} from "./relationships";

function clientWithEtag(etag: string | null, value: unknown) {
  const requestWithEtag = vi.fn(async () => ({ etag, value }));
  const request = vi.fn(async () => value);
  return { client: { request, requestWithEtag }, request, requestWithEtag };
}

function omit<T extends Record<string, unknown>>(source: T, key: keyof T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));
}

function clientFor(handler: (path: string, options?: ContextplaneRequestOptions) => unknown) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
    handler(path, options),
  );
  return { client: clientFromRequest(request), request };
}

const writeInput: RelationshipWriteInput = {
  endpoints: {
    destination_entity_id: "8f9e1b3c-0000-4000-8000-000000000002",
    source_entity_id: "8f9e1b3c-0000-4000-8000-000000000001",
  },
  identity: { handle: "catalog:capability/checkout-api" },
  idempotencyKey: "3f7a0c11-0000-4000-8000-00000000aaaa",
  intent: "observation",
  provenance: {
    externalRecordId: "svc-42",
    observedTime: "2026-08-19T09:00:00Z",
    sourceNamespace: "prod",
    sourceSystem: "service-registry",
  },
  subjectType: "depends_on",
  targetRevision: { profileRevision: "relationship.v3" },
  temporal: { validFrom: "2026-08-19T00:00:00Z" },
};

const writeResult = {
  effect: "relationship_created",
  intent: "observation",
  profile: {
    binding_id: "b1000000-0000-4000-8000-000000000001",
    enforcement_mode: "enforcing",
    profile_revision_id: "r1000000-0000-4000-8000-000000000001",
  },
  readiness_state: "ready",
  relationship_id: "c1000000-0000-4000-8000-000000000001",
  review_entry_id: null,
  staged_claim_id: null,
  validation: { mode: "enforcing", valid: true },
};

describe("relationship write adapters", () => {
  it("posts a governed create in contract field names and parses the result", async () => {
    const { client, request } = clientFor(() => writeResult);

    const result = await createRelationship(client, writeInput, { tenantId: "tenant-a" });

    expect(request).toHaveBeenCalledTimes(1);
    const [path, options] = request.mock.calls[0]!;
    expect(path).toBe("/v1/relationships");
    expect(options?.method).toBe("POST");
    expect(options?.tenantId).toBe("tenant-a");
    expect(options?.body).toEqual({
      endpoints: {
        destination_entity_id: "8f9e1b3c-0000-4000-8000-000000000002",
        source_entity_id: "8f9e1b3c-0000-4000-8000-000000000001",
      },
      idempotency_key: "3f7a0c11-0000-4000-8000-00000000aaaa",
      identity: { handle: "catalog:capability/checkout-api" },
      intent: "observation",
      provenance: {
        external_record_id: "svc-42",
        observed_time: "2026-08-19T09:00:00Z",
        source_namespace: "prod",
        source_system: "service-registry",
      },
      subject_kind: "relationship",
      subject_type: "depends_on",
      target_revision: { profile_revision: "relationship.v3" },
      temporal: { valid_from: "2026-08-19T00:00:00Z" },
    });
    expect(result.relationship_id).toBe("c1000000-0000-4000-8000-000000000001");
    expect(result.validation).toEqual({
      mode: "enforcing",
      truncated: false,
      valid: true,
      violations: [],
    });
  });

  it("sends a distinct idempotency key for each user-initiated create", async () => {
    const { client, request } = clientFor(() => writeResult);

    await createRelationship(client, { ...writeInput, idempotencyKey: "key-one" });
    await createRelationship(client, { ...writeInput, idempotencyKey: "key-two" });

    const keys = request.mock.calls.map(
      ([, options]) => (options?.body as Record<string, unknown>).idempotency_key,
    );
    expect(keys).toEqual(["key-one", "key-two"]);
  });

  it("carries every optional field a caller supplies into the request body", async () => {
    const { client, request } = clientFor(() => writeResult);

    await createRelationship(client, {
      ...writeInput,
      approvalReference: "change-1042",
      identity: { handle: "catalog:capability/checkout-api", subjectId: "sub-1" },
      properties: { tier: "gold" },
      provenance: {
        confidence: 0.72,
        derivationMethod: "static-analysis",
        derivationProfile: "dependency.v2",
        eventTime: "2026-08-18T12:00:00Z",
        expiresAt: "2026-09-19T09:00:00Z",
        externalRecordId: "svc-42",
        externalRecordRevision: "rev-9",
        observedTime: "2026-08-19T09:00:00Z",
        sourceNamespace: "prod",
        sourceSystem: "service-registry",
      },
      targetRevision: { bindingRevision: "binding-7", profileRevision: "relationship.v3" },
      temporal: { validFrom: "2026-08-19T00:00:00Z", validTo: "2026-12-31T00:00:00Z" },
    });

    expect(request.mock.calls[0]?.[1]?.body).toEqual({
      approval_reference: "change-1042",
      endpoints: writeInput.endpoints,
      idempotency_key: "3f7a0c11-0000-4000-8000-00000000aaaa",
      identity: { handle: "catalog:capability/checkout-api", subject_id: "sub-1" },
      intent: "observation",
      properties: { tier: "gold" },
      provenance: {
        confidence: 0.72,
        derivation_method: "static-analysis",
        derivation_profile: "dependency.v2",
        event_time: "2026-08-18T12:00:00Z",
        expires_at: "2026-09-19T09:00:00Z",
        external_record_id: "svc-42",
        external_record_revision: "rev-9",
        observed_time: "2026-08-19T09:00:00Z",
        source_namespace: "prod",
        source_system: "service-registry",
      },
      subject_kind: "relationship",
      subject_type: "depends_on",
      target_revision: { binding_revision: "binding-7", profile_revision: "relationship.v3" },
      temporal: { valid_from: "2026-08-19T00:00:00Z", valid_to: "2026-12-31T00:00:00Z" },
    });
  });

  it("sends an explicit open-ended end date rather than dropping it", async () => {
    const { client, request } = clientFor(() => writeResult);

    await createRelationship(client, {
      ...writeInput,
      temporal: { validFrom: "2026-08-19T00:00:00Z", validTo: null },
    });

    const body = request.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.temporal).toEqual({ valid_from: "2026-08-19T00:00:00Z", valid_to: null });
  });

  it("keeps advisory violations that ride along with a valid write", async () => {
    const { client } = clientFor(() => ({
      ...writeResult,
      validation: {
        mode: "advisory",
        truncated: true,
        valid: true,
        violations: ["properties.tier is not in the governed vocabulary"],
      },
    }));

    const result = await createRelationship(client, writeInput);

    expect(result.validation.valid).toBe(true);
    expect(result.validation.violations).toEqual([
      "properties.tier is not in the governed vocabulary",
    ]);
    expect(result.validation.truncated).toBe(true);
  });

  it("patches an existing relationship at its encoded id", async () => {
    const { client, request } = clientFor(() => ({
      ...writeResult,
      effect: "relationship_updated",
    }));

    const result = await updateRelationship(client, "c100/0001", writeInput);

    const [path, options] = request.mock.calls[0]!;
    expect(path).toBe("/v1/relationships/c100%2F0001");
    expect(options?.method).toBe("PATCH");
    expect(result.effect).toBe("relationship_updated");
  });

  it("reports a staged review entry rather than an id when the write needs approval", async () => {
    const { client } = clientFor(() => ({
      effect: "review_requested",
      intent: "request",
      profile: writeResult.profile,
      readiness_state: null,
      relationship_id: null,
      review_entry_id: "e1000000-0000-4000-8000-000000000001",
      staged_claim_id: "d1000000-0000-4000-8000-000000000001",
      validation: { mode: "enforcing", valid: true },
    }));

    const result = await createRelationship(client, { ...writeInput, intent: "request" });

    expect(result.relationship_id).toBeNull();
    expect(result.review_entry_id).toBe("e1000000-0000-4000-8000-000000000001");
    expect(result.intent).toBe("request");
  });

  it("branches on the error code, not the display message, when a create is refused", async () => {
    const { client } = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [
          {
            code: "permission_denied",
            message: "You cannot write relationships in this tenant.",
            path: null,
          },
        ],
        requestId: "req-1",
        status: 403,
      });
    });

    const error = await createRelationship(client, writeInput).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ContextplaneApiError);
    expect((error as ContextplaneApiError).code).toBe("permission_denied");
    expect((error as ContextplaneApiError).status).toBe(403);
  });

  it("refuses a result whose intent is outside the contract vocabulary", async () => {
    const { client } = clientFor(() => ({ ...writeResult, intent: "guessed" }));

    await expect(createRelationship(client, writeInput)).rejects.toThrow(
      "unknown relationship write intent",
    );
  });
});

describe("relationship traversal adapter", () => {
  const relationship = {
    endpoints: {
      destination_entity_id: "8f9e1b3c-0000-4000-8000-000000000002",
      source_entity_id: "8f9e1b3c-0000-4000-8000-000000000001",
    },
    is_inverse: true,
    profile: writeResult.profile,
    properties: { tier: "gold" },
    provenance: {
      authority: "service-registry",
      confidence: 0.8,
      external_record_id: "svc-42",
      external_revision: null,
      freshness_state: "current",
      source_system: "service-registry",
    },
    readiness_state: "ready",
    relationship_id: "c1000000-0000-4000-8000-000000000001",
    relationship_type: "depends_on",
    temporal: { effective_from: "2026-08-19T00:00:00Z", effective_to: null, recorded_at: null },
    validation: { mode: "enforcing", valid: true },
  };

  it("sends only the traversal bounds the caller set", async () => {
    const { client, request } = clientFor(() => ({
      has_more: true,
      items: [relationship],
      limit: 25,
      offset: 50,
    }));

    const page = await queryRelationships(client, {
      direction: "incoming",
      entityId: "8f9e1b3c-0000-4000-8000-000000000001",
      limit: 25,
      offset: 50,
    });

    const [path, options] = request.mock.calls[0]!;
    expect(path).toBe("/v1/relationships:query");
    expect(options?.method).toBe("POST");
    expect(options?.body).toEqual({
      direction: "incoming",
      entity_id: "8f9e1b3c-0000-4000-8000-000000000001",
      limit: 25,
      offset: 50,
    });
    expect(page.has_more).toBe(true);
    expect(page.items).toHaveLength(1);
  });

  it("keeps is_inverse so a reader does not count a derived edge twice", async () => {
    const { client } = clientFor(() => ({
      has_more: false,
      items: [relationship, { ...relationship, is_inverse: false }],
      limit: 50,
      offset: 0,
    }));

    const page = await queryRelationships(client, { entityId: "entity-1" });

    expect(page.items.map((item) => item.is_inverse)).toEqual([true, false]);
    expect(page.items[0]?.properties).toEqual({ tier: "gold" });
  });

  it("defaults is_inverse to false when the service omits it", async () => {
    const withoutInverse = omit(relationship, "is_inverse");
    const { client } = clientFor(() => ({
      has_more: false,
      items: [withoutInverse],
      limit: 50,
      offset: 0,
    }));

    const page = await queryRelationships(client, { entityId: "entity-1" });

    expect(page.items[0]?.is_inverse).toBe(false);
  });

  it("reads a relationship the service returned without properties or temporal bounds", async () => {
    const bare = omit(omit(relationship, "properties"), "temporal");
    const { client } = clientFor(() => ({ has_more: false, items: [bare], limit: 50, offset: 0 }));

    const page = await queryRelationships(client, { entityId: "entity-1" });

    expect(page.items[0]?.properties).toEqual({});
    expect(page.items[0]?.temporal).toEqual({
      effective_from: null,
      effective_to: null,
      recorded_at: null,
    });
  });

  it("sends the point in time and the type filter when a caller narrows the traversal", async () => {
    const { client, request } = clientFor(() => ({
      has_more: false,
      items: [],
      limit: 50,
      offset: 0,
    }));

    await queryRelationships(client, {
      at: "2026-01-01T00:00:00Z",
      entityId: "entity-1",
      relationshipType: "depends_on",
    });

    expect(request.mock.calls[0]?.[1]?.body).toEqual({
      at: "2026-01-01T00:00:00Z",
      entity_id: "entity-1",
      relationship_type: "depends_on",
    });
  });

  it("refuses a page whose items are not relationships", async () => {
    const { client } = clientFor(() => ({
      has_more: false,
      items: ["nope"],
      limit: 50,
      offset: 0,
    }));

    await expect(queryRelationships(client, { entityId: "entity-1" })).rejects.toThrow(
      "relationship is not an object",
    );
  });

  it.each([
    [{ items: undefined }, "relationship page items are not a list"],
    [{ has_more: "yes" }, "has_more is not a boolean"],
    [{ limit: 1.5 }, "limit is not an integer"],
  ])("refuses a malformed page envelope (%o)", async (override, message) => {
    const { client } = clientFor(() => ({
      has_more: false,
      items: [],
      limit: 50,
      offset: 0,
      ...override,
    }));

    await expect(queryRelationships(client, { entityId: "entity-1" })).rejects.toThrow(message);
  });

  it.each([
    [{ is_inverse: "maybe" }, "is_inverse is not a boolean"],
    [{ properties: "gold" }, "relationship properties are not an object"],
    [{ readiness_state: 3 }, "readiness_state is not a string"],
    [{ provenance: { confidence: "high" } }, "confidence is not a number or null"],
    [{ profile: { ...writeResult.profile, binding_id: 7 } }, "binding_id is not a string or null"],
    [{ validation: { mode: "enforcing", valid: true, violations: "none" } }, "not a list"],
    [{ validation: { mode: "enforcing", valid: true, violations: [1] } }, "violation 0"],
  ])("refuses a malformed relationship row (%o)", async (override, message) => {
    const { client } = clientFor(() => ({
      has_more: false,
      items: [{ ...relationship, ...override }],
      limit: 50,
      offset: 0,
    }));

    await expect(queryRelationships(client, { entityId: "entity-1" })).rejects.toThrow(message);
  });
});

describe("relationship detail read", () => {
  const stored = {
    endpoints: {
      destination_entity_id: "8f9e1b3c-0000-4000-8000-000000000002",
      source_entity_id: "8f9e1b3c-0000-4000-8000-000000000001",
    },
    is_inverse: false,
    profile: writeResult.profile,
    properties: {},
    provenance: {
      authority: null,
      confidence: null,
      external_record_id: null,
      external_revision: null,
      freshness_state: null,
      source_system: null,
    },
    readiness_state: "ready",
    relationship_id: "c1000000-0000-4000-8000-000000000001",
    relationship_type: "depends_on",
    temporal: { effective_from: "2026-08-19T00:00:00Z", effective_to: null, recorded_at: null },
    validation: { mode: "enforcing", valid: true },
  };

  it("keeps the validator the response carried, beside the row", async () => {
    const { client, requestWithEtag } = clientWithEtag('W/"abc"', stored);

    const read = await getRelationship(client, "c100/0001", { tenantId: "tenant-a" });

    expect(requestWithEtag).toHaveBeenCalledWith(
      "/v1/relationships/c100%2F0001",
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
    expect(read.etag).toBe('W/"abc"');
    expect(read.relationship.relationship_id).toBe(stored.relationship_id);
  });

  it("reports a missing validator as absent rather than inventing one", async () => {
    const { client } = clientWithEtag(null, stored);

    await expect(getRelationship(client, "c1")).resolves.toMatchObject({ etag: null });
  });
});

describe("optimistic concurrency on an update", () => {
  it("sends the validator the caller was handed", async () => {
    const { client, request } = clientFor(() => writeResult);

    await updateRelationship(client, "c1", writeInput, {}, undefined, 'W/"abc"');

    expect(request.mock.calls[0]?.[1]?.headers).toEqual({ "If-Match": 'W/"abc"' });
  });

  it("sends no precondition when the caller has none, rather than a fabricated one", async () => {
    const { client, request } = clientFor(() => writeResult);

    await updateRelationship(client, "c1", writeInput);

    expect(request.mock.calls[0]?.[1]?.headers).toBeUndefined();
  });

  it("surfaces a stale precondition by its code, for a caller that must keep the draft", async () => {
    const { client } = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [
          {
            code: "precondition_failed",
            message: "relationship changed since the If-Match ETag was issued.",
            path: null,
          },
        ],
        requestId: "req-2",
        status: 412,
      });
    });

    const error = await updateRelationship(
      client,
      "c1",
      writeInput,
      {},
      undefined,
      'W/"old"',
    ).catch((caught: unknown) => caught);

    expect((error as ContextplaneApiError).code).toBe("precondition_failed");
    expect((error as ContextplaneApiError).status).toBe(412);
  });
});
