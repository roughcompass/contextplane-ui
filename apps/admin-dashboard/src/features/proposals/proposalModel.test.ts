import { describe, expect, it } from "vitest";

import type { PromotionProposal, WhoAmI } from "../../shared/api";
import {
  diffProposalValues,
  filterPromotionProposals,
  formatProposalTimestamp,
  highImpactReasonLabel,
  humanizeProposalField,
  isPromotionProposalState,
  mayReviewPromotionProposals,
  parseProposalPageSize,
  proposalListIdentifier,
  proposalStateLabel,
  proposalStateTone,
  proposalValueDocument,
  proposalValueSummary,
  shortProposalIdentifier,
  summarizeProposalChange,
} from "./proposalModel";

const proposal: PromotionProposal = {
  author_tenant_id: "tenant-author",
  claim_id: "claim-001",
  created_at: "2026-08-12T10:00:00Z",
  current_value: { team: "identity" },
  high_impact: true,
  high_impact_reasons: ["narrows_capability_surface"],
  owner_tenant_id: "tenant-owner",
  predicate: "owned_by_team",
  proposal_id: "proposal-000000000000000000000001",
  proposed_value: { team: "trust" },
  state: "open",
  subject_entity_id: "subject-001",
  target_key: "owned_by_team",
  target_kind: "attribute",
  valid_from: "2026-08-12T09:00:00Z",
  valid_to: null,
};

const identity: WhoAmI = {
  actor_display_name: "Morgan Morris",
  actor_email: null,
  actor_id: "actor-1",
  roles: ["consumer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "tenant-owner",
  tenant_slug: "northstar",
};

describe("proposal model", () => {
  it("accepts only the service proposal states and supported page sizes", () => {
    expect(isPromotionProposalState("open")).toBe(true);
    expect(isPromotionProposalState("pending")).toBe(false);
    expect(parseProposalPageSize("25")).toBe(25);
    expect(parseProposalPageSize("500")).toBeNull();
    expect(parseProposalPageSize(null)).toBeNull();
  });

  it("labels service states without replacing their meaning", () => {
    expect(proposalStateLabel("open")).toBe("Open");
    expect(proposalStateTone("open")).toBe("warning");
    expect(proposalStateTone("accepted")).toBe("success");
    expect(proposalStateTone("amended")).toBe("info");
    expect(proposalStateTone("rejected")).toBe("danger");
  });

  it("formats machine fields, timestamps, values, and identifiers", () => {
    expect(humanizeProposalField("owned_by_team")).toBe("Owned by team");
    expect(humanizeProposalField(" ")).toBe("Unspecified");
    expect(highImpactReasonLabel("narrows_capability_surface")).toBe("Narrows capability surface");
    expect(formatProposalTimestamp(null)).toBe("Not published");
    expect(formatProposalTimestamp("2026-08-12T10:00:00Z")).toContain("Aug 12, 2026");
    expect(proposalValueDocument({ team: "trust" })).toBe('{\n  "team": "trust"\n}');
    expect(proposalValueSummary("short")).toBe('"short"');
    expect(proposalValueSummary("x".repeat(100))).toHaveLength(70);
    expect(shortProposalIdentifier("short-id")).toBe("short-id");
    expect(shortProposalIdentifier(proposal.proposal_id)).toBe("proposal-000…00000001");
    expect(proposalListIdentifier("short-id")).toBe("short-id");
    expect(proposalListIdentifier(proposal.proposal_id)).toBe("…00000001");
  });

  it("searches only fields carried by the returned proposal page", () => {
    expect(filterPromotionProposals([proposal], "trust")).toEqual([proposal]);
    expect(filterPromotionProposals([proposal], "claim-001")).toEqual([proposal]);
    expect(filterPromotionProposals([proposal], "not present")).toEqual([]);
    expect(filterPromotionProposals([proposal], " ")).toEqual([proposal]);
  });

  it("compares nested service values without conflating null and missing fields", () => {
    expect(
      diffProposalValues(
        { enabled: true, owners: ["identity"], removed: null },
        { added: null, enabled: false, owners: ["identity", "trust"] },
      ),
    ).toEqual([
      { current: "Not present", path: "$.added", proposed: "null", status: "added" },
      { current: "true", path: "$.enabled", proposed: "false", status: "changed" },
      {
        current: '"identity"',
        path: "$.owners[0]",
        proposed: '"identity"',
        status: "unchanged",
      },
      {
        current: "Not present",
        path: "$.owners[1]",
        proposed: '"trust"',
        status: "added",
      },
      { current: "null", path: "$.removed", proposed: "Not present", status: "removed" },
    ]);
    expect(diffProposalValues([], [])).toEqual([
      { current: "[]", path: "$", proposed: "[]", status: "unchanged" },
    ]);
    expect(diffProposalValues({}, {})).toEqual([
      { current: "{}", path: "$", proposed: "{}", status: "unchanged" },
    ]);
    expect(summarizeProposalChange("identity", "trust")).toEqual({
      detail: "Direct comparison",
      label: "Value changed",
    });
    expect(summarizeProposalChange("identity", "identity")).toEqual({
      detail: "Direct comparison",
      label: "No field changes",
    });
    expect(
      summarizeProposalChange(
        { enabled: true, owners: ["identity"], removed: null },
        { added: null, enabled: false, owners: ["identity", "trust"] },
      ),
    ).toEqual({
      detail: "1 changed · 2 added · 1 removed",
      label: "4 field changes",
    });
  });

  it("mirrors the service review role gate", () => {
    expect(mayReviewPromotionProposals(identity)).toBe(false);
    expect(mayReviewPromotionProposals({ ...identity, roles: ["producer"] })).toBe(true);
    expect(mayReviewPromotionProposals({ ...identity, roles: ["admin"] })).toBe(true);
  });
});
