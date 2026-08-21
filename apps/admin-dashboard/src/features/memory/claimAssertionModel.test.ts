import { describe, expect, it } from "vitest";

import type { ClaimAssertionReceipt, ClaimPredicate } from "../../shared/api";
import {
  buildAssertClaimInput,
  claimAssertionBodyDigest,
  claimAssertionFieldError,
  claimAssertionOutcome,
  claimPredicateOptions,
  createClaimAssertionDefaults,
  findClaimPredicate,
  interpretClaimValue,
  valueFormatForPredicate,
  type ClaimAssertionFormValues,
} from "./claimAssertionModel";

const ownedByTeam: ClaimPredicate = {
  claim_category: "ownership",
  definition: "The team accountable for the subject.",
  deprecated_at: null,
  scope: "organization",
  value: "owned_by_team",
  value_type: "string",
};

const runbook: ClaimPredicate = {
  claim_category: "operations",
  definition: "Structured runbook metadata.",
  deprecated_at: null,
  scope: "organization",
  value: "runbook",
  value_type: "object",
};

const retired: ClaimPredicate = {
  ...ownedByTeam,
  deprecated_at: "2026-06-01T00:00:00Z",
  value: "owned_by",
};

const receipt: ClaimAssertionReceipt = {
  claim_id: "claim-asserted",
  is_contested: false,
  owning_tenant_id: "tenant-a",
  predicate: "owned_by_team",
  source_authority: "human_asserted",
  status: "linked",
  subject_entity_id: "entity-a",
  value: "trust-engineering",
  visibility: "tenant-shared",
};

function values(overrides: Partial<ClaimAssertionFormValues> = {}): ClaimAssertionFormValues {
  return {
    ...createClaimAssertionDefaults(),
    evidence: [{ excerpt: "  ", kind: "curator", ref: " review-114 " }],
    predicate: "owned_by_team",
    subjectReference: "  system:github/identity-service  ",
    valueText: "trust-engineering",
    ...overrides,
  };
}

describe("claim assertion model", () => {
  it("starts a scalar predicate in text entry and a structured one in JSON", () => {
    expect(valueFormatForPredicate(ownedByTeam)).toBe("text");
    expect(valueFormatForPredicate(runbook)).toBe("json");
    expect(valueFormatForPredicate({ ...ownedByTeam, value_type: "STRING" })).toBe("text");
    expect(valueFormatForPredicate(undefined)).toBe("text");
  });

  it("marks deprecated predicates in the picker instead of hiding them", () => {
    expect(claimPredicateOptions([ownedByTeam, retired])).toEqual([
      { label: "owned_by_team · Ownership", value: "owned_by_team" },
      { label: "owned_by (deprecated)", value: "owned_by" },
    ]);
    expect(findClaimPredicate([ownedByTeam, retired], "owned_by")).toBe(retired);
    expect(findClaimPredicate([ownedByTeam], "missing")).toBeUndefined();
  });

  it("rejects an empty text value and unparseable JSON before any request is made", () => {
    expect(interpretClaimValue("   ", "text")).toEqual({
      message: "Enter the value this claim asserts.",
      ok: false,
    });
    expect(interpretClaimValue("  trust-engineering  ", "text")).toEqual({
      ok: true,
      value: "trust-engineering",
    });
    expect(interpretClaimValue("{oops}", "json")).toEqual({
      message: "Enter valid JSON, or switch the value to plain text.",
      ok: false,
    });
    expect(interpretClaimValue('{"team":"trust"}', "json")).toEqual({
      ok: true,
      value: { team: "trust" },
    });
    expect(interpretClaimValue("null", "json")).toEqual({ ok: true, value: null });
  });

  it("trims operator input and omits optional fields the operator left blank", () => {
    expect(buildAssertClaimInput(values(), "trust-engineering", "key-1")).toEqual({
      evidence: [{ kind: "curator", ref: "review-114" }],
      idempotencyKey: "key-1",
      predicate: "owned_by_team",
      subjectReference: "system:github/identity-service",
      value: "trust-engineering",
      visibility: "tenant-shared",
    });
  });

  it("converts entered local validity bounds to instants and keeps a stated excerpt", () => {
    const input = buildAssertClaimInput(
      values({
        assertedValidFrom: "2026-08-01T00:00",
        assertedValidTo: "not-a-date",
        evidence: [{ excerpt: " Confirmed in review. ", kind: "incident", ref: "INC-9" }],
        namespace: "  platform.identity  ",
        visibility: "private",
      }),
      { team: "trust" },
      "key-2",
    );

    expect(input.assertedValidFrom).toBe(new Date("2026-08-01T00:00").toISOString());
    expect(input).not.toHaveProperty("assertedValidTo");
    expect(input.evidence).toEqual([
      { excerpt: "Confirmed in review.", kind: "incident", ref: "INC-9" },
    ]);
    expect(input.namespace).toBe("platform.identity");
    expect(input.visibility).toBe("private");
    expect(input.value).toEqual({ team: "trust" });
  });

  it("digests the body without the key so only an unchanged retry reuses it", () => {
    const first = buildAssertClaimInput(values(), "trust-engineering", "key-1");
    const retried = buildAssertClaimInput(values(), "trust-engineering", "key-2");
    const edited = buildAssertClaimInput(values(), "platform-team", "key-3");

    expect(claimAssertionBodyDigest(first)).toBe(claimAssertionBodyDigest(retried));
    expect(claimAssertionBodyDigest(first)).not.toBe(claimAssertionBodyDigest(edited));
  });

  it("attaches service error paths to the control that produced them", () => {
    expect(claimAssertionFieldError("$.subject_reference", "Unknown reference")).toEqual({
      message: "Unknown reference",
      name: "subjectReference",
    });
    expect(claimAssertionFieldError("$.value", "Wrong type")).toEqual({
      message: "Wrong type",
      name: "valueText",
    });
    expect(claimAssertionFieldError("$.evidence.1.ref", "Unknown reference")).toEqual({
      message: "Unknown reference",
      name: "evidence.1.ref",
    });
    expect(claimAssertionFieldError("evidence.0.kind", "Unsupported kind")).toEqual({
      message: "Unsupported kind",
      name: "evidence.0.kind",
    });
  });

  it("leaves paths without a matching control unmapped rather than guessing", () => {
    expect(claimAssertionFieldError(null, "Rejected")).toBeNull();
    expect(claimAssertionFieldError("$.tenant_id", "Rejected")).toBeNull();
    expect(claimAssertionFieldError("$.evidence.ref", "Rejected")).toBeNull();
    expect(claimAssertionFieldError("$.evidence.0.provenance", "Rejected")).toBeNull();
    expect(claimAssertionFieldError("$.", "Rejected")).toBeNull();
  });

  it("says plainly when the service stored an assertion it could not attach", () => {
    expect(
      claimAssertionOutcome({ ...receipt, status: "unlinked", subject_entity_id: null }),
    ).toEqual({
      body: "The service stored this assertion as unlinked because it could not resolve the subject reference to a known entity. It will not be recalled against that subject until a curator links it.",
      linked: false,
      title: "Stored, but not attached to a subject",
      variant: "warning",
    });
  });

  it("separates a contested assertion from a clean one and never calls either canonical", () => {
    const contested = claimAssertionOutcome({ ...receipt, is_contested: true });
    expect(contested.variant).toBe("warning");
    expect(contested.title).toBe("Recorded as a contested observation");
    expect(contested.body).toContain("human asserted authority");

    const clean = claimAssertionOutcome(receipt);
    expect(clean.variant).toBe("success");
    expect(clean.linked).toBe(true);
    expect(clean.body).toContain("only through promotion review");
  });
});
