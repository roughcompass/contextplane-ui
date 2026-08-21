import { describe, expect, it, vi } from "vitest";

import { ContextplaneApiError, clientFromRequest } from "./client";
import type { ContextplaneRequestOptions } from "./client";
import { assertEntity, type EntityWriteInput } from "./entityWrites";

function clientFor(handler: (path: string, options?: ContextplaneRequestOptions) => unknown) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
    handler(path, options),
  );
  return { client: clientFromRequest(request), request };
}

const writeInput: EntityWriteInput = {
  identity: { handle: "core:capability/checkout" },
  idempotencyKey: "3f7a0c11-0000-4000-8000-00000000aaaa",
  intent: "observation",
  provenance: {
    externalRecordId: "svc-42",
    observedTime: "2026-08-20T09:00:00Z",
    sourceNamespace: "prod",
    sourceSystem: "service-registry",
  },
  subjectType: "core:capability",
  targetRevision: {
    bindingRevision: "sha256:extension-set",
    profileRevision: "r1000000-0000-4000-8000-000000000001",
  },
  validFrom: "2026-08-20T00:00:00Z",
};

const writeResult = {
  effect: "staged_claim",
  entity_id: null,
  intent: "observation",
  profile: {
    binding_id: "b1000000-0000-4000-8000-000000000001",
    enforcement_mode: "mandatory",
    profile_revision_id: "r1000000-0000-4000-8000-000000000001",
  },
  review_entry_id: null,
  staged_claim_id: "d1000000-0000-4000-8000-000000000001",
  validation: { mode: "mandatory", valid: true },
};

describe("the governed entity write", () => {
  it("posts to the generic surface, not a dedicated create route", async () => {
    const { client, request } = clientFor(() => writeResult);

    await assertEntity(client, writeInput, { tenantId: "tenant-a" });

    const [path, options] = request.mock.calls[0]!;
    expect(path).toBe("/v1/entities");
    expect(options?.method).toBe("POST");
    expect(options?.tenantId).toBe("tenant-a");
  });

  it("attests to both halves of the binding it composed against", async () => {
    const { client, request } = clientFor(() => writeResult);

    await assertEntity(client, writeInput);

    const body = request.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.target_revision).toEqual({
      binding_revision: "sha256:extension-set",
      profile_revision: "r1000000-0000-4000-8000-000000000001",
    });
    expect(body.subject_kind).toBe("entity");
  });

  it("routes by intent, so an observation stages rather than writing canon", async () => {
    const { client } = clientFor(() => writeResult);

    const result = await assertEntity(client, writeInput);

    expect(result.intent).toBe("observation");
    expect(result.effect).toBe("staged_claim");
    expect(result.entity_id).toBeNull();
    expect(result.staged_claim_id).toBe("d1000000-0000-4000-8000-000000000001");
  });

  it("reports the entity id only when the write reached canon", async () => {
    const { client } = clientFor(() => ({
      ...writeResult,
      effect: "canonical_assertion_write",
      entity_id: "e1000000-0000-4000-8000-000000000001",
      intent: "authorized_approval",
      staged_claim_id: null,
    }));

    const result = await assertEntity(client, {
      ...writeInput,
      approvalReference: "review-1",
      intent: "authorized_approval",
    });

    expect(result.entity_id).toBe("e1000000-0000-4000-8000-000000000001");
  });

  it("keeps a stale-revision violation that rides a successful write", async () => {
    // The service reports `stale_target_revision` as a violation rather than a
    // refusal, so an advisory binding returns 201 carrying it. Dropping it here
    // would hide the one thing the field was implemented to say.
    const { client } = clientFor(() => ({
      ...writeResult,
      validation: {
        mode: "advisory",
        valid: true,
        violations: ["stale_target_revision: composed against a revision no longer bound"],
      },
    }));

    const result = await assertEntity(client, writeInput);

    expect(result.validation.valid).toBe(true);
    expect(result.validation.violations[0]).toContain("stale_target_revision");
  });

  it("omits the optional halves a caller could not attest to", async () => {
    const { client, request } = clientFor(() => writeResult);

    await assertEntity(client, {
      ...writeInput,
      targetRevision: { profileRevision: "r-1" },
    });

    const body = request.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.target_revision).toEqual({ profile_revision: "r-1" });
    expect(body).not.toHaveProperty("approval_reference");
  });

  it("branches on the error code rather than the message", async () => {
    const { client } = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "permission_denied", message: "no", path: null }],
        requestId: "req-1",
        status: 403,
      });
    });

    const error = await assertEntity(client, writeInput).catch((caught: unknown) => caught);

    expect((error as ContextplaneApiError).code).toBe("permission_denied");
  });

  it("refuses a result whose intent is outside the contract vocabulary", async () => {
    const { client } = clientFor(() => ({ ...writeResult, intent: "guessed" }));

    await expect(assertEntity(client, writeInput)).rejects.toThrow("unknown entity write intent");
  });

  it("carries every optional field a caller supplies", async () => {
    const { client, request } = clientFor(() => writeResult);

    await assertEntity(client, {
      ...writeInput,
      approvalReference: "review-7",
      identity: { handle: "core:capability/checkout", subjectId: "sub-1" },
      intent: "authorized_approval",
      properties: { tier: "gold" },
      provenance: {
        confidence: 0.72,
        derivationMethod: "static-analysis",
        derivationProfile: "dependency.v2",
        eventTime: "2026-08-19T12:00:00Z",
        expiresAt: "2026-09-20T09:00:00Z",
        externalRecordId: "svc-42",
        externalRecordRevision: "rev-9",
        observedTime: "2026-08-20T09:00:00Z",
        sourceNamespace: "prod",
        sourceSystem: "service-registry",
      },
      validTo: "2026-12-31T00:00:00Z",
    });

    expect(request.mock.calls[0]?.[1]?.body).toEqual({
      approval_reference: "review-7",
      idempotency_key: writeInput.idempotencyKey,
      identity: { handle: "core:capability/checkout", subject_id: "sub-1" },
      intent: "authorized_approval",
      properties: { tier: "gold" },
      provenance: {
        confidence: 0.72,
        derivation_method: "static-analysis",
        derivation_profile: "dependency.v2",
        event_time: "2026-08-19T12:00:00Z",
        expires_at: "2026-09-20T09:00:00Z",
        external_record_id: "svc-42",
        external_record_revision: "rev-9",
        observed_time: "2026-08-20T09:00:00Z",
        source_namespace: "prod",
        source_system: "service-registry",
      },
      subject_kind: "entity",
      subject_type: "core:capability",
      target_revision: {
        binding_revision: "sha256:extension-set",
        profile_revision: "r1000000-0000-4000-8000-000000000001",
      },
      temporal: { valid_from: "2026-08-20T00:00:00Z", valid_to: "2026-12-31T00:00:00Z" },
    });
  });

  it("sends an explicit open-ended end date rather than dropping it", async () => {
    const { client, request } = clientFor(() => writeResult);

    await assertEntity(client, { ...writeInput, validTo: null });

    const body = request.mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body.temporal).toEqual({ valid_from: "2026-08-20T00:00:00Z", valid_to: null });
  });

  it("keeps a violation list the service reported as truncated", async () => {
    const { client } = clientFor(() => ({
      ...writeResult,
      validation: { mode: "advisory", truncated: true, valid: true, violations: ["a", "b"] },
    }));

    const result = await assertEntity(client, writeInput);

    expect(result.validation.truncated).toBe(true);
    expect(result.validation.violations).toEqual(["a", "b"]);
  });

  it.each([
    [{ effect: 7 }, "effect is not a string"],
    [{ validation: { mode: "m", valid: true, violations: "none" } }, "not a list"],
    [{ validation: { mode: "m", valid: true, violations: [1] } }, "violation 0"],
    [{ validation: { mode: "m", valid: "yes" } }, "valid is not a boolean"],
    [{ validation: { mode: "m", valid: true, truncated: "no" } }, "truncated is not a boolean"],
    [
      { profile: { enforcement_mode: 3, binding_id: null, profile_revision_id: null } },
      "enforcement_mode is not a string",
    ],
    [
      { profile: { enforcement_mode: "m", binding_id: 7, profile_revision_id: null } },
      "binding_id is not a string or null",
    ],
    [{ profile: "nope" }, "profile attribution is not an object"],
  ])("refuses a malformed result (%o)", async (override, message) => {
    const { client } = clientFor(() => ({ ...writeResult, ...override }));

    await expect(assertEntity(client, writeInput)).rejects.toThrow(message);
  });

  it("refuses a result that is not an object at all", async () => {
    const { client } = clientFor(() => "nope");

    await expect(assertEntity(client, writeInput)).rejects.toThrow(
      "entity write result is not an object",
    );
  });
});
