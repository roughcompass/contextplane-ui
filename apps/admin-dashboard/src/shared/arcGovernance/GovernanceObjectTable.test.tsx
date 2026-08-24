import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { clientFromRequest } from "../api";
import { GovernanceObjectTable } from "./GovernanceObjectTable";

const LIVE = {
  created_at: "2026-08-22T09:00:00Z",
  detail: {},
  in_force: true,
  in_force_until: null,
  kind: "source_connector",
  object_id: "connector-a",
  scope: "global",
  target_tenant_id: null,
};

const REVOKED = { ...LIVE, in_force: false, object_id: "connector-b", scope: "tenant" };

function renderTable(request: (path: string) => Promise<unknown>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GovernanceObjectTable
        client={clientFromRequest(request)}
        collection="sourceConnectors"
        description="Every connector registered for this tenant."
        identifierLabel="Connector"
        requestContext={{}}
        title="Registered source connectors"
      />
    </QueryClientProvider>,
  );
}

describe("GovernanceObjectTable", () => {
  it("shows a revoked registration alongside a live one, with the state as a column", async () => {
    // "Source governance": a registration that was revoked is the one an
    // operator is usually looking for, and a table that hid it would answer
    // "nothing was ever registered" to the question they actually have.
    renderTable(async () => ({ items: [LIVE, REVOKED] }));

    expect(await screen.findByText("connector-a")).toBeVisible();
    expect(screen.getByText("connector-b")).toBeVisible();
    expect(screen.getByText("In force")).toBeVisible();
    expect(screen.getByText("Revoked")).toBeVisible();
  });

  it("says nothing is registered when the service returned nothing", async () => {
    renderTable(async () => ({ items: [] }));

    expect(await screen.findByText("Nothing registered")).toBeVisible();
  });

  it("says the read failed rather than showing an empty table", async () => {
    // A reader shown "nothing registered" for a request that never arrived
    // would conclude the registration was never made, and act on that.
    renderTable(async () => {
      throw new Error("service unavailable");
    });

    expect(
      await screen.findByText(/Registered source connectors could not be loaded/u),
    ).toBeVisible();
    expect(screen.queryByText("Nothing registered")).toBeNull();
  });

  it("names the identifier column for the collection it is showing", async () => {
    renderTable(async () => ({ items: [LIVE] }));

    expect(await screen.findByRole("columnheader", { name: "Connector" })).toBeVisible();
  });

  it("reads the collection's own path", async () => {
    // Source governance registers three kinds against three paths; a table
    // pointed at the wrong one renders plausible rows about the wrong thing.
    const request = vi.fn(async () => ({ items: [LIVE] }));
    renderTable(request);

    await screen.findByText("connector-a");
    expect(request).toHaveBeenCalledWith("/v1/arc/admin/source-connectors", expect.anything());
  });
});
