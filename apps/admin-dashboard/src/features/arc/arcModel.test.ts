import { describe, expect, it } from "vitest";

import type { ToolUsageRanking } from "../../shared/api/contextplane";
import {
  formatArcCount,
  formatArcDate,
  formatArcLabel,
  getArcToolUsage,
  getArcUsageWindow,
  proposalActionSummary,
  toArcReceiptView,
} from "./arcModel";

describe("arcModel", () => {
  it("turns retained receipt and explanation data into an audience-safe view", () => {
    const view = toArcReceiptView(
      {
        evaluated_at: "2026-08-12T10:00:00Z",
        integrity_state: "verified",
        mandatory_directive_count: 2,
        receipt_id: "receipt-1",
        resolution_status: "degraded",
        selected: [],
      },
      {
        blocked_reasons: [],
        budget: { budget_limit_bytes: 2048, rendered_content_bytes: 512 },
        degraded_reasons: ["optional_source_unavailable"],
        evaluated_at: "2026-08-12T10:00:00Z",
        events: [
          {
            created_at: "2026-08-12T10:00:01Z",
            event_source: "selection-engine",
            event_type: "directive_omitted",
            sequence: 3,
          },
          null,
        ],
        integrity_state: "verified",
        receipt_id: "receipt-1",
        resolution_status: "degraded",
        selected: [
          {
            artifact_id: "artifact-1",
            audience_redacted: true,
            directive_id: "directive-1",
            is_mandatory: false,
            omission_reason: "outside_budget",
            revision_id: "revision-1",
            source_locator: null,
            was_omitted: true,
          },
          "invalid",
        ],
      },
    );

    expect(view).toMatchObject({
      budgetLimitBytes: 2048,
      degradedReasons: ["optional_source_unavailable"],
      mandatoryDirectiveCount: 2,
      renderedContentBytes: 512,
      resolutionStatus: "degraded",
    });
    expect(view.selected[0]).toMatchObject({
      audienceRedacted: true,
      directiveId: "directive-1",
      omissionReason: "outside_budget",
      wasOmitted: true,
    });
    expect(view.events).toHaveLength(1);
  });

  it("filters usage to ARC MCP tools without deriving per-directive totals", () => {
    const ranking: ToolUsageRanking = {
      end: "2026-08-12",
      start: "2026-07-14",
      tools: [
        {
          actor_days: 2,
          calls: 4,
          error_calls: 0,
          ok_calls: 4,
          tool: "arc_get_review_package",
          worst_daily_p95_ms: null,
        },
        {
          actor_days: 2,
          calls: 8,
          error_calls: 0,
          ok_calls: 8,
          tool: "search_capabilities",
          worst_daily_p95_ms: 30,
        },
      ],
    };

    expect(getArcToolUsage(ranking).map(({ tool }) => tool)).toEqual(["arc_get_review_package"]);
    expect(getArcUsageWindow(new Date("2026-08-12T18:30:00Z"))).toEqual({
      from: "2026-07-14",
      to: "2026-08-12",
    });
  });

  it("formats contract vocabulary and honest unavailable values", () => {
    expect(formatArcLabel("arc_operational_integrity")).toBe("ARC Operational Integrity");
    expect(formatArcDate(null)).toBe("Not available");
    expect(formatArcDate("not-a-date")).toBe("not-a-date");
    expect(formatArcCount(null)).toBe("Not published");
    expect(formatArcCount(1200)).toMatch(/1[,.]200/);
    expect(
      proposalActionSummary({
        allowed_transitions: [],
        artifact_id: "artifact-1",
        available_actions: [],
        created_at: "2026-08-12T00:00:00Z",
        frozen_at: null,
        operational_integrity_state: "pending",
        proposal_id: "proposal-1",
        proposal_version: 1,
        reason_codes: [],
        reviewed_baseline_revision_id: null,
        revision_id: null,
        risk_algorithm_version: null,
        risk_classification: null,
        source_evidence_id: "source-1",
        state: "open",
      }),
    ).toBe("No actions are currently available.");
  });
});
