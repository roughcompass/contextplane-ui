import { describe, expect, it, vi } from "vitest";

import { ContextplaneApiError, type ContextplaneClient } from "./client";
import type { ContextplaneRequestOptions } from "./client";
import { qualifiedHandle, resolveEntity } from "./entityResolution";

function clientFor(handler: (path: string, options?: ContextplaneRequestOptions) => unknown) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
    handler(path, options),
  );
  return { client: { request } satisfies ContextplaneClient, request };
}

const identity = {
  entity_id: "51485c54-ed69-459b-8dd8-30d80f62d835",
  entity_type: "capability",
  external_id: "policy-evaluation",
  name: "orders",
};

function ambiguous(entityTypes?: unknown) {
  return new ContextplaneApiError({
    errors: [
      {
        code: "identity_ambiguous",
        message: "'orders' names more than one type; qualify it as `namespace:type/name`.",
        path: null,
        ...(entityTypes === undefined ? {} : { entity_types: entityTypes }),
      },
    ],
    requestId: "req-1",
    status: 409,
  });
}

describe("resolveEntity", () => {
  it("sends the handle url-encoded and returns the resolved identity", async () => {
    const { client, request } = clientFor(() => ({ identity }));

    const result = await resolveEntity(client, "core:capability/orders", { tenantId: "tenant-a" });

    expect(request).toHaveBeenCalledWith(
      "/v1/entities:resolve?handle=core%3Acapability%2Forders",
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
    expect(result).toEqual({ identity, outcome: "resolved" });
  });

  it("reports an ambiguous name as an answer, with the types to choose between", async () => {
    const { client } = clientFor(() => {
      throw ambiguous(["service", "capability"]);
    });

    const result = await resolveEntity(client, "orders");

    expect(result).toEqual({
      candidates: ["service", "capability"],
      handle: "orders",
      outcome: "ambiguous",
    });
  });

  it("reads the candidates from the error item and never from the message", async () => {
    // The message names the types too. A caller that parsed it would pass this
    // test by accident, so the error item carries a different set.
    const { client } = clientFor(() => {
      throw ambiguous(["alpha", "beta"]);
    });

    const result = await resolveEntity(client, "orders");

    expect(result).toMatchObject({ candidates: ["alpha", "beta"] });
  });

  it("survives a service that names no candidates rather than inventing them", async () => {
    const { client } = clientFor(() => {
      throw ambiguous();
    });

    await expect(resolveEntity(client, "orders")).resolves.toMatchObject({
      candidates: [],
      outcome: "ambiguous",
    });
  });

  it("drops a non-string candidate instead of offering it as a type", async () => {
    const { client } = clientFor(() => {
      throw ambiguous(["service", 7, null]);
    });

    await expect(resolveEntity(client, "orders")).resolves.toMatchObject({
      candidates: ["service"],
    });
  });

  it("reports an unknown handle as an answer rather than an error", async () => {
    const { client } = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "http_404", message: "not found", path: null }],
        requestId: null,
        status: 404,
      });
    });

    await expect(resolveEntity(client, "nothing")).resolves.toEqual({
      handle: "nothing",
      outcome: "unknown",
    });
  });

  it("still throws for a refusal that is not an answer about the handle", async () => {
    const { client } = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "permission_denied", message: "no", path: null }],
        requestId: null,
        status: 403,
      });
    });

    await expect(resolveEntity(client, "orders")).rejects.toBeInstanceOf(ContextplaneApiError);
  });

  it("refuses a malformed resolution rather than passing it on", async () => {
    const { client } = clientFor(() => ({ identity: { entity_id: 7 } }));

    await expect(resolveEntity(client, "orders")).rejects.toThrow("entity_id is not a string");
  });
});

describe("qualifiedHandle", () => {
  it("qualifies a bare name in the platform namespace", () => {
    expect(qualifiedHandle("orders", "capability")).toBe("core:capability/orders");
  });

  it("keeps the namespace a qualified handle already carries", () => {
    expect(qualifiedHandle("northwind:service/orders", "capability")).toBe(
      "northwind:capability/orders",
    );
  });

  it("keeps a name containing a slash whole", () => {
    expect(qualifiedHandle("core:service/orders/eu", "capability")).toBe(
      "core:capability/orders/eu",
    );
  });
});
