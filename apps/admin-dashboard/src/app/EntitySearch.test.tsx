import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ContextplaneApiError, type ContextplaneClient } from "../shared/api";
import type { ContextplaneRequestOptions } from "../shared/api";
import { EntitySearch } from "./EntitySearch";

const identity = {
  entity_id: "51485c54-ed69-459b-8dd8-30d80f62d835",
  entity_type: "capability",
  external_id: null,
  name: "orders",
};

function ambiguous(entityTypes: readonly string[]) {
  return new ContextplaneApiError({
    errors: [
      {
        code: "identity_ambiguous",
        entity_types: [...entityTypes],
        message: "'orders' names more than one type.",
        path: null,
      },
    ],
    requestId: "req-1",
    status: 409,
  });
}

function renderSearch(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown,
  onResolved = vi.fn(),
) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
    resolver(path, options),
  );
  const client = { request } satisfies ContextplaneClient;
  render(<EntitySearch apiTenantId="tenant-a" client={client} onResolved={onResolved} />);
  return { onResolved, request };
}

function search(handle: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Resolve an entity handle" }), {
    target: { value: handle },
  });
  fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
}

describe("EntitySearch", () => {
  it("resolves a handle and reports the entity it landed on", async () => {
    const { onResolved, request } = renderSearch(() => ({ identity }));

    search("core:capability/orders");

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(identity.entity_id));
    expect(request).toHaveBeenCalledWith(
      "/v1/entities:resolve?handle=core%3Acapability%2Forders",
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
  });

  it("offers the qualifying types instead of picking one", async () => {
    const { onResolved } = renderSearch(() => {
      throw ambiguous(["capability", "service"]);
    });

    search("orders");

    expect(await screen.findByText("That name belongs to more than one type")).toBeVisible();
    expect(screen.getByRole("button", { name: "capability" })).toBeVisible();
    expect(screen.getByRole("button", { name: "service" })).toBeVisible();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("re-asks with the handle qualified when a type is chosen", async () => {
    let refuse = true;
    const { onResolved, request } = renderSearch(() => {
      if (refuse) {
        refuse = false;
        throw ambiguous(["capability", "service"]);
      }
      return { identity };
    });

    search("orders");
    fireEvent.click(await screen.findByRole("button", { name: "capability" }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(identity.entity_id));
    expect(request).toHaveBeenLastCalledWith(
      "/v1/entities:resolve?handle=core%3Acapability%2Forders",
      expect.anything(),
    );
  });

  it("keeps the namespace a qualified handle already carried when re-asking", async () => {
    let refuse = true;
    const { request } = renderSearch(() => {
      if (refuse) {
        refuse = false;
        throw ambiguous(["capability"]);
      }
      return { identity };
    });

    search("northwind:service/orders");
    fireEvent.click(await screen.findByRole("button", { name: "capability" }));

    await waitFor(() =>
      expect(request).toHaveBeenLastCalledWith(
        "/v1/entities:resolve?handle=northwind%3Acapability%2Forders",
        expect.anything(),
      ),
    );
  });

  it("tells the operator to qualify it themselves when the service names no types", async () => {
    renderSearch(() => {
      throw ambiguous([]);
    });

    search("orders");

    expect(await screen.findByText(/This deployment did not name the types/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "capability" })).not.toBeInTheDocument();
  });

  it("distinguishes an unknown handle from a hidden one without guessing which", async () => {
    renderSearch(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "http_404", message: "not found", path: null }],
        requestId: null,
        status: 404,
      });
    });

    search("nothing-called-this");

    expect(await screen.findByText("No entity by that handle")).toBeVisible();
    expect(screen.getByText(/stays hidden rather than being reported as missing/)).toBeVisible();
  });

  it("names the credential when the tenant refuses the read", async () => {
    renderSearch(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "permission_denied", message: "no", path: null }],
        requestId: "req-9",
        status: 403,
      });
    });

    search("orders");

    expect(await screen.findByText("The handle was not resolved")).toBeVisible();
    expect(screen.getByText(/cannot resolve entities in this tenant/)).toBeVisible();
    expect(screen.getByText("Request ID: req-9")).toBeVisible();
  });

  it("does not send an empty handle", () => {
    const { request } = renderSearch(() => ({ identity }));

    fireEvent.change(screen.getByRole("searchbox", { name: "Resolve an entity handle" }), {
      target: { value: "   " },
    });

    expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });

  it("clears a stale answer as soon as the handle is edited", async () => {
    renderSearch(() => {
      throw ambiguous(["capability", "service"]);
    });

    search("orders");
    expect(await screen.findByText("That name belongs to more than one type")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Resolve an entity handle" }), {
      target: { value: "orders-2" },
    });

    expect(screen.queryByText("That name belongs to more than one type")).not.toBeInTheDocument();
  });
});
