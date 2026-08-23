import { describe, expect, it, vi } from "vitest";

import {
  activateAgentInstruction,
  getAgentAccuracy,
  getAgentAutonomy,
  getAgentFailurePatterns,
  listAgentInstructions,
  proposeAgentInstruction,
  rollbackAgentInstruction,
} from "./agents";
import type { ContextplaneRequestOptions } from "./client";
import { clientFromRequest } from "./client";

const ACTOR = "11111111-1111-1111-1111-111111111111";
const WINDOW = { windowEnd: "2026-08-31T00:00:00Z", windowStart: "2026-08-01T00:00:00Z" };

const accuracyGroup = {
  label: "supports",
  n_adjudicated: 10,
  n_correct: 6,
  n_decided: 8,
  n_incorrect: 2,
  n_undecidable: 2,
  rate: 0.75,
};

function stub(response: unknown) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    void path;
    void options;
    return response;
  });
  return { client: clientFromRequest(request), request };
}

describe("getAgentAccuracy", () => {
  it("sends the window and breakdown, and encodes the actor into the path", async () => {
    const { client, request } = stub({
      author_actor_id: ACTOR,
      breakdown: "predicate",
      groups: [accuracyGroup],
      overall: { ...accuracyGroup, label: "overall" },
      window_end: WINDOW.windowEnd,
      window_start: WINDOW.windowStart,
    });

    const result = await getAgentAccuracy(
      client,
      "actor/with spaces",
      { ...WINDOW, breakdown: "predicate" },
      { tenantId: "tenant-a" },
    );

    expect(request).toHaveBeenCalledWith(
      "/v1/agents/actor%2Fwith%20spaces/accuracy?window_start=2026-08-01T00%3A00%3A00Z&window_end=2026-08-31T00%3A00%3A00Z&breakdown=predicate",
      { method: "GET", tenantId: "tenant-a" },
    );
    expect(result.overall.rate).toBe(0.75);
    expect(result.groups).toHaveLength(1);
  });

  it("keeps an unmeasured rate as null rather than coercing it to zero", async () => {
    // The service distinguishes "nobody adjudicated this author" from "this
    // author was always wrong". An adapter that folded null to 0 would erase
    // the distinction before any screen could honour it.
    const { client } = stub({
      author_actor_id: ACTOR,
      breakdown: "overall",
      groups: [],
      overall: { ...accuracyGroup, n_decided: 0, rate: null },
      window_end: WINDOW.windowEnd,
      window_start: WINDOW.windowStart,
    });

    const result = await getAgentAccuracy(client, ACTOR, WINDOW);

    expect(result.overall.rate).toBeNull();
  });

  it("refuses a response missing a field the contract requires", async () => {
    const { client } = stub({ author_actor_id: ACTOR, groups: [], overall: accuracyGroup });

    await expect(getAgentAccuracy(client, ACTOR, WINDOW)).rejects.toThrow(/breakdown/u);
  });
});

describe("getAgentAutonomy", () => {
  it("reads both rates and the session counts behind them", async () => {
    const { client, request } = stub({
      author_actor_id: ACTOR,
      autonomy_rate: 0.6,
      intervention_rate: 0.4,
      n_autonomous: 6,
      n_intervened: 4,
      n_sessions: 10,
      window_end: WINDOW.windowEnd,
      window_start: WINDOW.windowStart,
    });

    const result = await getAgentAutonomy(client, ACTOR, WINDOW);

    expect(request).toHaveBeenCalledWith(
      `/v1/agents/${ACTOR}/autonomy?window_start=2026-08-01T00%3A00%3A00Z&window_end=2026-08-31T00%3A00%3A00Z`,
      { method: "GET" },
    );
    expect(result.autonomy_rate).toBe(0.6);
    expect(result.n_intervened).toBe(4);
  });
});

describe("getAgentFailurePatterns", () => {
  it("carries both counts per group, and an example value of any shape", async () => {
    const { client } = stub({
      author_actor_id: ACTOR,
      groups: [
        {
          claim_category: "capability",
          examples: [{ claim_id: "claim-a", note: null, value: { nested: true } }],
          incorrect_count: 3,
          predicate: "supports",
          rate: 0.75,
          total_count: 4,
        },
      ],
      n_adjudicated: 4,
      n_incorrect: 3,
      n_intervention_sessions: 1,
      n_sessions: 5,
      report_id: "report-a",
      window_end: WINDOW.windowEnd,
      window_start: WINDOW.windowStart,
    });

    const result = await getAgentFailurePatterns(client, ACTOR, WINDOW);

    expect(result.groups[0]?.incorrect_count).toBe(3);
    expect(result.groups[0]?.total_count).toBe(4);
    // A claim value is whatever the claim carried; the contract leaves it
    // unconstrained, so the adapter passes it through rather than asserting.
    expect(result.groups[0]?.examples[0]?.value).toEqual({ nested: true });
  });
});

describe("the instruction lifecycle", () => {
  const instruction = {
    activated_at: "2026-08-02T00:00:00Z",
    author_actor_id: ACTOR,
    content: "Cite the interface version.",
    instruction_id: "instruction-a",
    motivated_by_report_id: "report-a",
    status: "active",
    superseded_at: null,
    version: 2,
  };

  it("lists an author's instructions", async () => {
    const { client, request } = stub([instruction]);

    const result = await listAgentInstructions(client, ACTOR);

    expect(request).toHaveBeenCalledWith(`/v1/agents/${ACTOR}/instructions`, { method: "GET" });
    expect(result[0]?.version).toBe(2);
  });

  it("proposes against the collection and returns the new id", async () => {
    const { client, request } = stub({ instruction_id: "instruction-b" });

    const result = await proposeAgentInstruction(client, ACTOR, {
      content: "Check the version first.",
      motivated_by_report_id: "report-a",
      version: 3,
    });

    expect(request).toHaveBeenCalledWith(`/v1/agents/${ACTOR}/instructions`, {
      body: { content: "Check the version first.", motivated_by_report_id: "report-a", version: 3 },
      method: "POST",
    });
    expect(result).toBe("instruction-b");
  });

  it("activates against the item path with the action appended, not the collection", async () => {
    // The endpoint is part of the behaviour. A POST to the collection path
    // mints a second instruction instead of activating this one, and a test
    // asserting only the method and body passes while that happens.
    const { client, request } = stub(instruction);

    await activateAgentInstruction(client, ACTOR, "instruction-a");

    expect(request).toHaveBeenCalledWith(
      `/v1/agents/${ACTOR}/instructions/instruction-a:activate`,
      { method: "POST" },
    );
  });

  it("reports a rollback that restored nothing as null rather than as a failure", async () => {
    const { client, request } = stub({ restored_instruction_id: null });

    await expect(rollbackAgentInstruction(client, ACTOR)).resolves.toBeNull();
    expect(request).toHaveBeenCalledWith(`/v1/agents/${ACTOR}/instructions:rollback`, {
      method: "POST",
    });
  });

  it("returns the restored instruction id when there was one", async () => {
    const { client } = stub({ restored_instruction_id: "instruction-old" });

    await expect(rollbackAgentInstruction(client, ACTOR)).resolves.toBe("instruction-old");
  });
});
