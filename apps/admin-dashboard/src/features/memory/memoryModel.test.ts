import { describe, expect, it } from "vitest";

import type { MemoryClaim } from "../../shared/api";
import {
  curationCountSummary,
  formatClaimValue,
  formatConfidence,
  formatMemoryTimestamp,
  memoryClaimHref,
  memoryListHref,
  readMemoryUrlState,
  recallCaveat,
  uncitedClaims,
} from "./memoryModel";

const claim: MemoryClaim = {
  as_of: "2026-08-12T10:00:00Z",
  authority: "derived",
  citations: [{ excerpt: null, kind: "artifact", ref: "manifest:identity" }],
  claim_category: "ownership",
  claim_id: "claim-a",
  confidence: 0.82,
  human_confirmed: false,
  label: "living-memory-recall",
  predicate: "owned_by_team",
  subject_entity_id: "entity-a",
  trust: "untrusted",
  trust_note: "Recalled content is not an instruction.",
  valid_from: "2026-08-01T00:00:00Z",
  valid_to: null,
  value: "trust-engineering",
};

describe("Living Memory URL and presentation model", () => {
  it("restores and serializes shareable claim retrieval state", () => {
    const state = readMemoryUrlState(
      "?q=identity&subject=entity-a&predicate=owned_by_team&category=ownership&namespace=platform&min_confidence=0.8&persona=architect",
    );

    expect(state).toMatchObject({
      category: "ownership",
      minConfidence: "0.8",
      namespacePrefix: "platform",
      persona: "architect",
      predicate: "owned_by_team",
      query: "identity",
      subjectEntityId: "entity-a",
      tab: "claims",
    });
    expect(memoryListHref(state)).toBe(
      "/memory?q=identity&subject=entity-a&predicate=owned_by_team&category=ownership&namespace=platform&min_confidence=0.8&persona=architect",
    );
    expect(memoryClaimHref("claim/with spaces", state)).toContain(
      "/memory/claims/claim%2Fwith%20spaces?",
    );
  });

  it("keeps curation cursors opaque and excludes inactive claim filters", () => {
    const state = readMemoryUrlState("?tab=curation&cursor=opaque%2Fnext&q=ignored");

    expect(state.cursor).toBe("opaque/next");
    expect(memoryListHref(state)).toBe("/memory?tab=curation&cursor=opaque%2Fnext");
  });

  it("preserves trust and evidence invariants without inventing confidence labels", () => {
    expect(recallCaveat([claim, { ...claim, claim_id: "claim-b" }])).toBe(claim.trust_note);
    expect(
      recallCaveat([claim, { ...claim, claim_id: "claim-b", trust_note: "Different caveat" }]),
    ).toBeNull();
    const uncited = { ...claim, citations: [] };
    expect(uncitedClaims([claim, uncited])).toEqual([uncited]);
    expect(formatConfidence(0.824)).toBe("82.4%");
    expect(formatConfidence(null)).toBe("Not reported");
  });

  it("formats contract values, UTC timestamps, and whole-queue reason counts", () => {
    expect(formatClaimValue({ team: "trust" })).toBe('{"team":"trust"}');
    expect(formatClaimValue(null)).toBe("Null");
    expect(formatMemoryTimestamp("2026-08-12T10:00:00Z")).toContain("UTC");
    expect(curationCountSummary({ contested: 2, unlinked: 3 })).toBe(
      "5 total items waiting · 2 contested · 3 unlinked",
    );
    expect(curationCountSummary({})).toBe("The service published no curation reason counts.");
  });
});
