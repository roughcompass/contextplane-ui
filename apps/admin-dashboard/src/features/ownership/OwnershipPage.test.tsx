import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { OwnershipPage } from "./OwnershipPage";

const ownership = {
  confidence: 0.9,
  derivation_method: "declared",
  effective_from: "2026-08-12T14:28:41Z",
  effective_to: null,
  is_pending: false,
  owned_target_id: "target-a",
  owned_target_kind: "capability",
  owner_principal: "actor-a",
  ownership_assignment_id: "assignment-a",
  provenance_id: "provenance-a",
  recorded_at: "2026-08-12T14:28:41Z",
  recorded_by: "actor-admin",
  replaced_by_assignment_id: null,
  revocation_reason: null,
  role: "owner",
  scope: "tenant",
  source: "manual",
  validation_state: "validated",
};

function testClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (options?.method === "DELETE") return undefined;
    if (path === "/v1/profiles/conformance") {
      return { profile: "policy", state: "active" };
    }
    if (path.startsWith("/v1/ownership:owned-by?") || path.startsWith("/v1/ownership:owns?")) {
      return { items: [ownership] };
    }
    if (path.startsWith("/v1/ownership/assignments")) return ownership;
    if (path.startsWith("/v1/profiles/")) return { state: "accepted" };
    throw new Error(`Unexpected path: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <OwnershipPage
          activeTenantName="Northstar Systems"
          apiTenantId="tenant-a"
          client={client}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/ownership");
});

describe("OwnershipPage", () => {
  it("finds governed ownership in both directions and exposes profile lifecycle actions", async () => {
    const client = testClient();
    renderPage(client);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ownership & profiles" }),
    ).toBeVisible();
    expect(await screen.findByText("Service-reported conformance")).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Assign ownership" })).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Profile publishing and binding lifecycle",
      }),
    ).toBeVisible();

    const searchSection = screen
      .getByRole("heading", { level: 2, name: "Find ownership" })
      .closest("section");
    if (!searchSection) throw new Error("Ownership search section was not rendered.");
    fireEvent.change(within(searchSection).getByLabelText("Target kind"), {
      target: { value: "capability" },
    });
    fireEvent.change(within(searchSection).getByLabelText("Target UUID"), {
      target: { value: "target-a" },
    });
    fireEvent.click(within(searchSection).getByRole("button", { name: "Search ownership" }));
    expect(await screen.findByRole("button", { name: "Manage state" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Manage state" }));
    expect(screen.getAllByText(/assignment-a/u).length).toBeGreaterThan(0);

    fireEvent.click(within(searchSection).getByLabelText("Targets owned by principal"));
    fireEvent.change(within(searchSection).getByLabelText("Owner principal"), {
      target: { value: "actor-a" },
    });
    fireEvent.click(within(searchSection).getByRole("button", { name: "Search ownership" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        expect.stringContaining("/v1/ownership:owns?"),
        expect.objectContaining({ tenantId: "tenant-a" }),
      ),
    );
  });

  it("creates and transitions ownership before completing profile governance actions", async () => {
    const client = testClient();
    renderPage(client);
    await screen.findByText("Service-reported conformance");

    const assignmentSection = screen
      .getByRole("heading", { level: 2, name: "Assign ownership" })
      .closest("section");
    if (!assignmentSection) throw new Error("Assignment section was not rendered.");
    fireEvent.change(within(assignmentSection).getByLabelText("Owner principal"), {
      target: { value: "actor-a" },
    });
    fireEvent.change(within(assignmentSection).getByLabelText("Target kind"), {
      target: { value: "capability" },
    });
    fireEvent.change(within(assignmentSection).getByLabelText("Target UUID"), {
      target: { value: "target-a" },
    });
    fireEvent.change(within(assignmentSection).getByLabelText("Profile revision UUID"), {
      target: { value: "revision-a" },
    });
    fireEvent.click(
      within(assignmentSection).getByRole("button", { name: "Create draft assignment" }),
    );
    expect(await screen.findByText("Ownership assigned")).toBeVisible();

    const transitionSection = screen
      .getByRole("heading", { level: 2, name: "Review assignment state" })
      .closest("section");
    if (!transitionSection) throw new Error("Transition section was not rendered.");
    fireEvent.change(within(transitionSection).getByLabelText("Reason"), {
      target: { value: "Reviewed against the active profile" },
    });
    fireEvent.click(
      within(transitionSection).getByRole("button", { name: "Transition assignment" }),
    );
    expect(await screen.findByText("Ownership updated")).toBeVisible();

    const revisionForm = screen.getByText("Publish core revision").closest("form");
    if (!revisionForm) throw new Error("Revision form was not rendered.");
    fireEvent.change(within(revisionForm).getByLabelText("Profile family"), {
      target: { value: "capability" },
    });
    fireEvent.change(within(revisionForm).getByLabelText("Profile name"), {
      target: { value: "governed-capability" },
    });
    fireEvent.change(within(revisionForm).getByLabelText("Semantic version"), {
      target: { value: "2.0.0" },
    });
    fireEvent.change(within(revisionForm).getByLabelText("Compatibility"), {
      target: { value: "breaking" },
    });
    fireEvent.click(within(revisionForm).getByRole("button", { name: "Publish revision" }));
    expect((await screen.findAllByText("Profile revision published")).length).toBeGreaterThan(0);

    const extensionForm = screen.getByText("Publish tenant extension").closest("form");
    if (!extensionForm) throw new Error("Extension form was not rendered.");
    fireEvent.change(within(extensionForm).getByLabelText("Namespace"), {
      target: { value: "northstar" },
    });
    fireEvent.change(within(extensionForm).getByLabelText("Target core revision UUID"), {
      target: { value: "revision-a" },
    });
    fireEvent.click(within(extensionForm).getByRole("button", { name: "Publish extension" }));
    expect((await screen.findAllByText("Profile extension published")).length).toBeGreaterThan(0);

    const planForm = screen.getByText("Plan profile binding").closest("form");
    if (!planForm) throw new Error("Binding plan form was not rendered.");
    fireEvent.change(within(planForm).getByLabelText("Profile revision UUID"), {
      target: { value: "revision-a" },
    });
    fireEvent.change(within(planForm).getByLabelText("Effective from"), {
      target: { value: "2026-08-13T12:00" },
    });
    fireEvent.change(within(planForm).getByLabelText("Reason"), {
      target: { value: "Reviewed rollout" },
    });
    fireEvent.click(within(planForm).getByRole("button", { name: "Plan binding" }));
    expect((await screen.findAllByText("Profile binding planned")).length).toBeGreaterThan(0);

    const actionForm = screen.getByText("Advance binding state").closest("form");
    if (!actionForm) throw new Error("Binding action form was not rendered.");
    fireEvent.change(within(actionForm).getByLabelText("Binding UUID"), {
      target: { value: "binding-a" },
    });
    fireEvent.click(within(actionForm).getByRole("combobox", { name: /^Action/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Activate" }));
    fireEvent.change(within(actionForm).getByLabelText("Reason"), {
      target: { value: "Validation passed" },
    });
    fireEvent.click(within(actionForm).getByRole("button", { name: "Run binding action" }));
    expect((await screen.findAllByText("Profile binding updated")).length).toBeGreaterThan(0);
    expect(client.request).toHaveBeenCalledWith(
      "/v1/profiles/bindings/binding-a/activate",
      expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
    );
  });

  it("stays recoverable when the profile services are unavailable", async () => {
    const request = vi.fn(async () => {
      throw new Error("service unavailable");
    });
    renderPage(clientFromRequest(request));

    expect(await screen.findByText("Conformance unavailable")).toBeVisible();
  });
});
