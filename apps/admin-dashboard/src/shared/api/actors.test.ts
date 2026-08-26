import { describe, expect, it, vi } from "vitest";

import { clientFromRequest, declarePrincipal, listPrincipals } from "./index";

const DECLARED = {
  actor_id: "actor-1",
  actor_kind: "agent",
  created_at: "2026-08-01T00:00:00Z",
  declared_at: "2026-08-12T10:00:00Z",
  declared_by: "actor-operator",
  display_name: "Support triage agent",
  is_declared: true,
  oidc_subject: "agent-alpha",
  owner_principal: "platform-team@example.com",
};

type Recorded = (path: string, options?: Record<string, unknown>) => Promise<unknown>;

function stub(payload: unknown) {
  // Typed through an alias rather than by naming unused parameters: a test needs
  // to assert on the *options* the caller sent, and an untyped
  // `vi.fn(async () => …)` records calls with no arguments — so `calls[0][1]` is
  // a type error rather than the request body.
  const request = vi.fn<Recorded>(async () => payload);
  return { client: clientFromRequest(request), request };
}

describe("principal roster", () => {
  it("returns undeclared rows rather than filtering them out", async () => {
    // ADR 0019's dissent, at the layer that could most easily have hidden it: a
    // roster that dropped what it did not know would answer "we have no agents"
    // to a deployment that has eleven.
    const { client } = stub({
      items: [
        DECLARED,
        {
          ...DECLARED,
          actor_id: "actor-2",
          actor_kind: "unknown",
          declared_at: null,
          declared_by: null,
          is_declared: false,
          owner_principal: null,
        },
      ],
      next_cursor: null,
    });

    const page = await listPrincipals(client);

    expect(page.items).toHaveLength(2);
    expect(page.items[1]).toMatchObject({
      declared_at: null,
      is_declared: false,
      owner_principal: null,
    });
  });
});

describe("declarePrincipal", () => {
  it("posts the kind and owner to the principal's own route", async () => {
    const { client, request } = stub(DECLARED);

    const declared = await declarePrincipal(
      client,
      { actorId: "actor-1", actorKind: "agent", ownerPrincipal: "platform-team@example.com" },
      { tenantId: "tenant-a" },
    );

    expect(request).toHaveBeenCalledWith("/v1/admin/actors/actor-1/declare", {
      body: { actor_kind: "agent", owner_principal: "platform-team@example.com" },
      method: "POST",
      tenantId: "tenant-a",
    });
    expect(declared.is_declared).toBe(true);
    expect(declared.actor_kind).toBe("agent");
  });

  it("trims the owner, because a trailing space is not accountability", async () => {
    const { client, request } = stub(DECLARED);

    await declarePrincipal(client, {
      actorId: "actor-1",
      actorKind: "human",
      ownerPrincipal: "  platform-team@example.com  ",
    });

    expect(request.mock.calls[0]![1]).toMatchObject({
      body: { actor_kind: "human", owner_principal: "platform-team@example.com" },
    });
  });

  it("sends no idempotency key, because declaring is not creating", async () => {
    // The route is keyed by `actor_id` and re-declaring overwrites, so a retried
    // request cannot mint a second principal. A key here would imply it could.
    const { client, request } = stub(DECLARED);

    await declarePrincipal(client, {
      actorId: "actor-1",
      actorKind: "agent",
      ownerPrincipal: "platform-team",
    });

    expect(request.mock.calls[0]![1]).not.toHaveProperty("headers");
  });

  it("parses a declaration that recorded no owner rather than assuming one", async () => {
    // Every nullable field on the row is nullable on the way back too. A parser
    // that required them would throw on a shape the service is entitled to send.
    const { client } = stub({
      ...DECLARED,
      declared_at: null,
      declared_by: null,
      is_declared: false,
      oidc_subject: null,
      owner_principal: null,
    });

    const declared = await declarePrincipal(client, {
      actorId: "actor-1",
      actorKind: "agent",
      ownerPrincipal: "platform-team",
    });

    expect(declared).toMatchObject({
      declared_at: null,
      declared_by: null,
      is_declared: false,
      oidc_subject: null,
      owner_principal: null,
    });
  });
});
