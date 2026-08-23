import { describe, expect, it, vi } from "vitest";

import type { ContextplaneRequestOptions } from "./client";
import { clientFromRequest } from "./client";
import {
  addIntentParticipant,
  appendIntentCheckpoint,
  getIntentCheckpoint,
  getIntentCheckpointByDigest,
  listIntentParticipants,
  removeIntentParticipant,
} from "./intents";


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


describe("task participants and checkpoints API", () => {
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

});
