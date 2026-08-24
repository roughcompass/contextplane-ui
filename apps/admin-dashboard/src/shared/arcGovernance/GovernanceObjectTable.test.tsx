import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

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

function renderTable(
  request: (path: string, options?: { method?: string }) => Promise<unknown>,
  { revocable }: { revocable?: "connector" | "upload-policy" } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <GovernanceObjectTable
          client={clientFromRequest(request)}
          collection="sourceConnectors"
          description="Every connector registered for this tenant."
          identifierLabel="Connector"
          requestContext={{}}
          {...(revocable ? { revocable } : {})}
          title="Registered source connectors"
        />
      </ToastProvider>
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

describe("GovernanceObjectTable revocation", () => {
  it("offers no revoke on a collection this screen does not own the ending of", async () => {
    /** Approval evidence and verifiers are ended from their own screens, where
     * the argument about what revoking means is already made. A button here
     * would be the same act with the warning removed. */
    renderTable(async () => ({ items: [LIVE] }));

    await screen.findByText("connector-a");
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("offers revoke only on a registration still in force", async () => {
    /** Revoking one already revoked is a no-op the service refuses, and offering
     * it invites the attempt. */
    renderTable(async () => ({ items: [LIVE, REVOKED] }), { revocable: "connector" });

    await screen.findByText("connector-a");
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
  });

  it("says what revoking does and does not do before it happens", async () => {
    /** A reader who thinks revoking undoes what a grant already permitted will
     * revoke to undo something and find they have not. */
    renderTable(async () => ({ items: [LIVE] }), { revocable: "connector" });

    await screen.findByText("connector-a");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(screen.getByText(/every future admission/u)).toBeVisible();
    expect(screen.getByText(/does not unmake anything already admitted/u)).toBeVisible();
  });

  it("will not revoke without a reason", async () => {
    renderTable(async () => ({ items: [LIVE] }), { revocable: "connector" });

    await screen.findByText("connector-a");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(screen.getByRole("button", { name: "Revoke this registration" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "credential rotated" } });
    expect(screen.getByRole("button", { name: "Revoke this registration" })).toBeEnabled();
  });

  it("revokes through the item path, not the collection that registers", async () => {
    /** E19-T7's defect: the collection path registers, so a revoke sent there
     * would mint a second record instead of ending one. Asserting the body alone
     * would pass while it happened. */
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/revoke")) return {};
      return { items: [LIVE] };
    });
    renderTable(request, { revocable: "connector" });

    await screen.findByText("connector-a");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "credential rotated" } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke this registration" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/v1/arc/admin/source-connectors/connector-a/revoke",
        expect.objectContaining({ body: { reason: "credential rotated" }, method: "POST" }),
      ),
    );
  });

  it("sends an upload policy's revocation to the upload-policy path", async () => {
    /** Two kinds, two paths, and the kind is what chooses. A connector's path
     * would revoke nothing and report success on a policy that still stands. */
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/revoke")) return {};
      return { items: [LIVE] };
    });
    renderTable(request, { revocable: "upload-policy" });

    await screen.findByText("connector-a");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "superseded" } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke this registration" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/v1/arc/admin/source-upload-policies/connector-a/revoke",
        expect.anything(),
      ),
    );
  });

  it("says the revocation failed rather than reporting it as done", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/revoke")) throw new Error("the grant is already revoked");
      return { items: [LIVE] };
    });
    renderTable(request, { revocable: "connector" });

    await screen.findByText("connector-a");
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.change(screen.getByLabelText("Why"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke this registration" }));

    expect(await screen.findByText("Could not revoke")).toBeVisible();
    expect(screen.getByText("the grant is already revoked")).toBeVisible();
  });
});
