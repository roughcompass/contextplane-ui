import { describe, expect, it } from "vitest";

import type { ContextBlock, ContextEnvelope, WhoAmI } from "../../shared/api";
import {
  contextBlockDescription,
  contextBlockLabel,
  contextBlockStateLabel,
  contextBlockStateTone,
  contextEnvelopeStateLabel,
  contextEnvelopeStateTone,
  contextItemSummary,
  contextItemTitle,
  displayContextValue,
  formatConfidence,
  formatContextTimestamp,
  humanizeContextField,
  identityDisplayName,
  isUuid,
  mayReportContextFeedback,
  parseIntentIds,
  returnedContextBlocks,
  shortContextIdentifier,
  totalContextItems,
  trustSummary,
  validateScope,
} from "./contextLabModel";

const canonicalBlock: ContextBlock = {
  items: [
    {
      payload: {
        entity_id: "entity-1",
        entity_type: "capability",
        matching_facts: [{ body: "Owned by Trust" }],
        name: "Customer identity resolution",
      },
      receipt_item_id: {
        block: "canonical",
        item_key: "entity-1",
        source: "catalog",
        value: "canonical-digest",
      },
      trust: null,
    },
  ],
  name: "canonical",
  reason: null,
  state: "success",
};

const observedBlock: ContextBlock = {
  items: [
    {
      payload: {
        confidence: 0.72,
        label: "Payments scope is required",
        predicate: "requires_auth_scope",
        value: "payments:write",
      },
      receipt_item_id: {
        block: "observed_claims",
        item_key: "claim-1",
        source: "living-memory",
        value: "claim-digest",
      },
      trust: {
        assertion_kind: "fact",
        attribution: null,
        authority: "tier-2-derived",
        classification: "internal",
        freshness: "2026-08-12T10:00:00Z",
        mutability: "mutable",
        source: "living-memory",
        trust: "observed",
      },
    },
  ],
  name: "observed_claims",
  reason: null,
  state: "success",
};

const envelope: ContextEnvelope = {
  arc_block_note: null,
  blocks: [
    canonicalBlock,
    { items: [], name: "arc", reason: null, state: "empty" },
    observedBlock,
    { items: [], name: "workspace", reason: "bounded", state: "degraded" },
  ],
  quality: { cacheable: false, degraded_blocks: ["workspace"], reasons: ["bounded"] },
  receipt_id: "receipt-1",
  state: "degraded",
};

const identity: WhoAmI = {
  actor_display_name: "Morgan Morris",
  actor_email: null,
  actor_id: "a0000000-0000-4000-8000-000000000001",
  roles: ["consumer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "b0000000-0000-4000-8000-000000000001",
  tenant_slug: "northstar",
};

describe("contextLabModel", () => {
  it("validates UUID scope and parses intent identifiers without repairing them", () => {
    const valid = "a0000000-0000-4000-8000-000000000001";
    const parsed = validateScope({
      arcReceiptId: valid,
      intentIds: `${valid}, b0000000-0000-4000-8000-000000000002`,
      limit: 25,
      maxAgeSeconds: "3600",
      subjectEntityId: valid,
      workspaceTerm: " migration ",
    });

    expect(parsed.errors).toEqual({});
    expect(parsed.scope).toMatchObject({
      arcReceiptId: valid,
      intentIds: [valid, "b0000000-0000-4000-8000-000000000002"],
      maxAgeSeconds: 3600,
      workspaceTerm: "migration",
    });
    expect(parseIntentIds("one two,three")).toEqual(["one", "two", "three"]);
    expect(isUuid(valid)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);

    expect(
      validateScope({
        arcReceiptId: "bad-receipt",
        intentIds: "bad-intent",
        limit: 10,
        maxAgeSeconds: "",
        subjectEntityId: "bad-subject",
        workspaceTerm: "",
      }),
    ).toMatchObject({
      errors: {
        arcReceiptId: "Enter a valid ARC receipt UUID.",
        intentIds: expect.stringContaining("bad-intent"),
        subjectEntityId: "Enter a valid catalog entity UUID.",
      },
      scope: { maxAgeSeconds: null },
    });
  });

  it("keeps service states distinct and summarizes the returned envelope", () => {
    expect(contextBlockLabel("observed_claims")).toBe("Observed claims");
    expect(contextBlockDescription("workspace")).toMatch(/checkpoints/i);
    expect(contextBlockStateLabel("success")).toBe("Returned context");
    expect(contextBlockStateLabel("empty")).toBe("No context returned");
    expect(contextBlockStateLabel("degraded")).toBe("Partial context");
    expect(contextBlockStateLabel("failed")).toBe("Source failed");
    expect(contextBlockStateTone("success")).toBe("success");
    expect(contextBlockStateTone("empty")).toBe("neutral");
    expect(contextBlockStateTone("degraded")).toBe("warning");
    expect(contextBlockStateTone("failed")).toBe("danger");
    expect(contextEnvelopeStateLabel("complete")).toBe("Complete");
    expect(contextEnvelopeStateLabel("degraded")).toBe("Degraded");
    expect(contextEnvelopeStateLabel("blocked")).toBe("Blocked");
    expect(contextEnvelopeStateTone("complete")).toBe("success");
    expect(contextEnvelopeStateTone("degraded")).toBe("warning");
    expect(contextEnvelopeStateTone("blocked")).toBe("danger");
    expect(totalContextItems(envelope)).toBe(2);
    expect(returnedContextBlocks(envelope)).toBe(2);
  });

  it("extracts readable titles and honest summaries from each payload layer", () => {
    expect(contextItemTitle(canonicalBlock, canonicalBlock.items[0]!)).toBe(
      "Customer identity resolution",
    );
    expect(contextItemSummary(canonicalBlock, canonicalBlock.items[0]!)).toBe(
      "capability · 1 matching fact",
    );
    expect(contextItemTitle(observedBlock, observedBlock.items[0]!)).toBe(
      "Payments scope is required",
    );
    expect(contextItemSummary(observedBlock, observedBlock.items[0]!)).toBe(
      "payments:write · Confidence 72%",
    );

    const workspace: ContextBlock = {
      items: [],
      name: "workspace",
      reason: null,
      state: "empty",
    };
    const workspaceItem = {
      payload: { goal: "Finish migration", open_questions: ["SLA?"] },
      receipt_item_id: {
        block: "workspace",
        item_key: "checkpoint-1",
        source: "workspace",
        value: "workspace-digest",
      },
      trust: observedBlock.items[0]!.trust,
    };
    expect(contextItemTitle(workspace, workspaceItem)).toBe("Finish migration");
    expect(contextItemSummary(workspace, workspaceItem)).toBe("1 open question");

    const arc: ContextBlock = { items: [], name: "arc", reason: null, state: "empty" };
    const arcItem = {
      payload: { directive_id: "directive-1", is_mandatory: true },
      receipt_item_id: {
        block: "arc",
        item_key: "directive-1",
        source: "arc-receipt",
        value: "arc-digest",
      },
      trust: observedBlock.items[0]!.trust,
    };
    expect(contextItemTitle(arc, arcItem)).toBe("directive-1");
    expect(contextItemSummary(arc, arcItem)).toBe("Mandatory directive");
  });

  it("formats values, provenance, identity, and timestamps without inventing data", () => {
    expect(formatConfidence(0.875)).toBe("87.5%");
    expect(formatContextTimestamp(null)).toBe("Not reported");
    expect(formatContextTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatContextTimestamp("2026-08-12T10:00:00Z")).toMatch(/Aug 12, 2026/);
    expect(humanizeContextField("observed_claims")).toBe("Observed Claims");
    expect(displayContextValue(null)).toBe("Not set");
    expect(displayContextValue(true)).toBe("true");
    expect(displayContextValue({ value: 1 })).toBe('{\n  "value": 1\n}');
    expect(shortContextIdentifier("short")).toBe("short");
    expect(shortContextIdentifier("a-very-long-context-identifier")).toMatch(/…/);
    expect(trustSummary(null)).toBe("Canonical catalog record");
    expect(trustSummary(observedBlock.items[0]!.trust)).toBe("Observed · Fact");
    expect(identityDisplayName(identity)).toBe("Morgan Morris");
    expect(
      identityDisplayName({ ...identity, actor_display_name: null, actor_email: "a@b.test" }),
    ).toBe("a@b.test");
    expect(mayReportContextFeedback(identity)).toBe(true);
    expect(mayReportContextFeedback({ ...identity, roles: ["auditor"] })).toBe(false);
  });
});
