import { describe, expect, it } from "vitest";

import type { PromotionProposal, SessionSummary, Workspace } from "../../shared/api";
import {
  curationQueueTotal,
  curationReasonSummaries,
  formatOverviewTimestamp,
  humanizeOverviewToken,
  overviewProposalHref,
  overviewSessionHref,
  overviewValuePreview,
  overviewWorkspaceHref,
  selectGovernedOutcomes,
  selectOverviewProposals,
  selectRecentSessions,
  selectRecentWorkspaces,
  shortOverviewIdentifier,
} from "./overviewModel";

function proposal(
  proposalId: string,
  overrides: Partial<PromotionProposal> = {},
): PromotionProposal {
  return {
    author_tenant_id: "tenant-a",
    claim_id: `claim-${proposalId}`,
    created_at: "2026-08-12T10:00:00Z",
    current_value: "current",
    high_impact: false,
    high_impact_reasons: [],
    owner_tenant_id: "tenant-a",
    predicate: "owned_by_team",
    proposal_id: proposalId,
    proposed_value: "trust-engineering",
    state: "open",
    subject_entity_id: "entity-a",
    target_key: "entity-a",
    target_kind: "capability",
    valid_from: "2026-08-12T10:00:00Z",
    valid_to: null,
    ...overrides,
  };
}

function workspace(
  workspaceId: string,
  updatedAt: string,
  archivedAt: string | null = null,
): Workspace {
  return {
    archived_at: archivedAt,
    created_at: "2026-08-01T10:00:00Z",
    created_by: "actor-a",
    description: null,
    name: `Workspace ${workspaceId}`,
    owner_actor_id: "actor-a",
    owner_kind: "actor",
    t_invalidated_at: null,
    tenant_id: "tenant-a",
    updated_at: updatedAt,
    workspace_id: workspaceId,
  };
}

describe("overviewModel", () => {
  it("formats service timestamps and identifiers defensively", () => {
    expect(formatOverviewTimestamp("2026-08-12T10:30:00Z")).toContain("12");
    expect(formatOverviewTimestamp(null)).toBe("Not published");
    expect(formatOverviewTimestamp("not-a-date")).toBe("Invalid service timestamp");
    expect(shortOverviewIdentifier("short-id")).toBe("short-id");
    expect(shortOverviewIdentifier("123456789012345678901234567890")).toBe("123456789012…34567890");
  });

  it("humanizes service tokens and safely truncates values", () => {
    expect(humanizeOverviewToken("missing_source-reference")).toBe("Missing source reference");
    expect(humanizeOverviewToken("   ")).toBe("Unspecified");
    expect(overviewValuePreview({ enabled: true }, 12)).toBe('{"enabled":…');
    expect(overviewValuePreview("short value", 20)).toBe("short value");
  });

  it("orders positive curation reasons and computes a whole-queue total", () => {
    const counts = { counts: { unlinked: 4, contested: 2, ignored: 0 } };

    expect(curationReasonSummaries(counts)).toEqual([
      { count: 4, label: "Unlinked", reason: "unlinked" },
      { count: 2, label: "Contested", reason: "contested" },
    ]);
    expect(curationQueueTotal(counts)).toBe(6);
  });

  it("prioritizes high-impact open proposals before recency", () => {
    const selected = selectOverviewProposals([
      proposal("recent", { created_at: "2026-08-13T10:00:00Z" }),
      proposal("older-high", {
        created_at: "2026-08-01T10:00:00Z",
        high_impact: true,
      }),
      proposal("middle", { created_at: "2026-08-12T10:00:00Z" }),
      proposal("not-shown", { created_at: "2026-08-11T10:00:00Z" }),
    ]);

    expect(selected.map((item) => item.proposal_id)).toEqual(["older-high", "recent", "middle"]);
  });

  it("selects sessions by latest activity", () => {
    const sessions: SessionSummary[] = [
      {
        event_count: 4,
        first_activity_at: "2026-08-01T10:00:00Z",
        last_activity_at: "2026-08-10T10:00:00Z",
        session_id: "older",
      },
      {
        event_count: 2,
        first_activity_at: "2026-08-12T10:00:00Z",
        last_activity_at: "2026-08-12T12:00:00Z",
        session_id: "newer",
      },
    ];

    expect(selectRecentSessions(sessions).map((item) => item.session_id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("excludes archived workspaces and selects active work by update time", () => {
    const selected = selectRecentWorkspaces([
      workspace("older", "2026-08-10T10:00:00Z"),
      workspace("archived", "2026-08-13T10:00:00Z", "2026-08-13T11:00:00Z"),
      workspace("newer", "2026-08-12T10:00:00Z"),
    ]);

    expect(selected.map((item) => item.workspace_id)).toEqual(["newer", "older"]);
  });

  it("merges governed outcomes without duplicates and excludes unresolved states", () => {
    const selected = selectGovernedOutcomes(
      [
        proposal("accepted", { state: "accepted" }),
        proposal("open", { created_at: "2026-08-13T10:00:00Z", state: "open" }),
      ],
      [
        proposal("amended", {
          created_at: "2026-08-12T12:00:00Z",
          state: "amended",
        }),
        proposal("accepted", { state: "accepted" }),
      ],
    );

    expect(selected.map((item) => item.proposal_id)).toEqual(["amended", "accepted"]);
  });

  it("builds encoded destination links and preserves outcome list state", () => {
    expect(overviewProposalHref(proposal("proposal / one"))).toBe(
      "/memory/promotions/proposal%20%2F%20one",
    );
    expect(overviewProposalHref(proposal("accepted", { state: "accepted" }))).toBe(
      "/memory/promotions/accepted?state=accepted",
    );
    expect(overviewSessionHref("session / one")).toBe("/sessions/session%20%2F%20one");
    expect(overviewWorkspaceHref("workspace / one")).toBe("/notebooks/workspace%20%2F%20one");
  });
});
