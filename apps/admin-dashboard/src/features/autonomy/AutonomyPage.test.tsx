import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { AutonomyPage } from "./AutonomyPage";

const BINDING_ID = "33333333-3333-3333-3333-333333333333";
const REVISION_ID = "44444444-4444-4444-4444-444444444444";

const inForce = {
  artifact_id: "55555555-5555-5555-5555-555555555555",
  binding_id: BINDING_ID,
  effective_from: "2026-08-01T00:00:00Z",
  effective_to: null,
  is_in_force: true,
  principal_issuer: "https://idp.example.com",
  principal_subject: "agent-planner-7",
  revision_id: REVISION_ID,
  revision_lifecycle_state: "active",
  state: "active",
  suspended_at: null,
  suspension_reason: null,
};

type Responder = (path: string, options?: ContextplaneRequestOptions) => unknown;

function testClient(responder: Responder) {
  return clientFromRequest(vi.fn(async (path: string, options?: ContextplaneRequestOptions) => responder(path, options)));
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AutonomyPage activeTenantName="Northstar Systems" apiTenantId="tenant-a" client={client} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function lookUp() {
  fireEvent.change(screen.getByLabelText("Issuer"), {
    target: { value: "https://idp.example.com" },
  });
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "agent-planner-7" } });
  fireEvent.click(screen.getByRole("button", { name: "Look up envelope" }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/autonomy");
});

describe("AutonomyPage", () => {
  it("suspends an envelope and offers the way back as a peer of the way out", async () => {
    /** E10-T1's second non-negotiable, carried verbatim: revert is not a
     * secondary action. An operator who cannot see how to undo a suspension
     * will not run one on a real incident, so reinstate must be a button on
     * this screen and not an item behind a menu. */
    let current: unknown = inForce;
    const client = testClient((path, options) => {
      if (path.includes("/suspend")) {
        current = { ...inForce, is_in_force: false, suspended_at: "2026-08-19T12:00:00Z" };
        return { binding_id: BINDING_ID, status: "suspended" };
      }
      if (path.includes("/reinstate")) {
        current = inForce;
        return { binding_id: BINDING_ID, status: "reinstated" };
      }
      if (path.startsWith("/v1/arc/admin/envelopes/bindings?")) return current;
      throw new Error(`Unexpected path: ${path} ${JSON.stringify(options)}`);
    });
    renderPage(client);

    lookUp();
    expect(await screen.findByText("In force")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Suspend this envelope/u }));
    fireEvent.change(screen.getByLabelText("Why"), {
      target: { value: "Incident 4412 — asserting ownership it cannot substantiate." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm suspend" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/admin/envelopes/bindings/${BINDING_ID}/suspend`,
        expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
      ),
    );

    expect(await screen.findByText("Suspended")).toBeVisible();
    // Not in a menu, not behind a disclosure: a button, on the screen.
    expect(screen.getByRole("button", { name: /Reinstate this envelope/u })).toBeVisible();
  });

  it("refuses to act without a stated reason", async () => {
    const client = testClient((path) => {
      if (path.startsWith("/v1/arc/admin/envelopes/bindings?")) return inForce;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    lookUp();
    expect(await screen.findByText("In force")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Suspend this envelope/u }));

    expect(screen.getByRole("button", { name: "Confirm suspend" })).toBeDisabled();
    expect(client.request).not.toHaveBeenCalledWith(
      expect.stringContaining("/suspend"),
      expect.anything(),
    );
  });

  it("says a principal is ungoverned rather than showing it as suspended", async () => {
    /** The distinction the control rests on. `null` means nobody has governed
     * this agent — nothing is holding it back — and an operator who reads that
     * as a suspension concludes the opposite of the truth and stops looking. */
    const client = testClient((path) => {
      if (path.startsWith("/v1/arc/admin/envelopes/bindings?")) return null;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    lookUp();

    expect(await screen.findByText("This principal is ungoverned")).toBeVisible();
    expect(screen.queryByText("Suspended")).toBeNull();
    // Nothing to suspend, so nothing offers to.
    expect(screen.queryByRole("button", { name: /Suspend this envelope/u })).toBeNull();
  });

  it("says the reading failed rather than reporting the agent as ungoverned", async () => {
    /** The same failure as the intent list's, with a sharper cost: a reader
     * shown "no envelope" for a request that never arrived would conclude an
     * agent is unconstrained and go looking for a control that is already
     * there — or, worse, grant a second one. */
    const client = testClient(() => {
      throw new Error("service unavailable");
    });
    renderPage(client);

    lookUp();

    expect(await screen.findByText("Envelope unavailable")).toBeVisible();
    expect(screen.queryByText("This principal is ungoverned")).toBeNull();
  });

  it("warns when a live binding governs by a revision that is no longer in force", async () => {
    /** A binding is only checked for an active revision at grant time, so this
     * is reachable: an agent governed by a document somebody superseded weeks
     * ago. A screen that showed a green envelope over it would be reporting
     * governance that is not happening. */
    const client = testClient((path) => {
      if (path.startsWith("/v1/arc/admin/envelopes/bindings?")) {
        return { ...inForce, revision_lifecycle_state: "superseded" };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    lookUp();

    expect(await screen.findByText("In force against a revision that is not")).toBeVisible();
  });

  it("states how old the reading is rather than implying it is current", async () => {
    /** E10-T1's first non-negotiable, translated from a preview to a reading.
     * Somebody else can suspend or revoke between the read and the act, and a
     * screen that says nothing about age is a screen asserting currency. */
    const client = testClient((path) => {
      if (path.startsWith("/v1/arc/admin/envelopes/bindings?")) return inForce;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    lookUp();

    expect(await screen.findByText(/Read just now/u)).toBeVisible();
    expect(screen.getByRole("button", { name: "Re-read" })).toBeVisible();
  });

  it("does not offer reinstating a revoked binding", async () => {
    /** A revocation closed the interval. Offering reinstate would promise an
     * operator a way back that the service will refuse, during the incident
     * where they are counting on it. */
    const client = testClient((path) => {
      if (path.startsWith("/v1/arc/admin/envelopes/bindings?")) {
        return { ...inForce, effective_to: "2026-08-18T00:00:00Z", is_in_force: false };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(client);

    lookUp();

    expect(await screen.findByText("This binding was revoked")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Reinstate this envelope/u })).toBeNull();
  });
});
