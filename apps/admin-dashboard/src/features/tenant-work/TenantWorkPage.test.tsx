import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { TenantWorkPage } from "./TenantWorkPage";

const notification = {
  capability_id: "capability-a",
  capability_slug: "policy-evaluation",
  change_classification: "breaking",
  event_kind: "interface.changed",
  fetch_url: "/catalog?capability=capability-a",
  notification_id: "notification-a",
  occurred_at: "2026-08-12T14:28:41Z",
  subscription_id: "subscription-a",
  tenant_id: "tenant-a",
  version_after: "2.0.0",
  version_before: "1.0.0",
};

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
  assumptions: ["Access remains available"],
  author: "actor-a",
  checkpoint_id: "checkpoint-a",
  completed_checks: ["Contract verified"],
  decisions: ["Proceed"],
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

const testSignalReceipt = {
  authority: "registered-source",
  content_digest: "sha256:signal-a",
  ingested_at: "2026-08-12T14:28:41Z",
  replayed: false,
  signal_id: "signal-a",
};

function testClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path.startsWith("/v1/notifications?")) {
      return { items: [notification], next_cursor: null };
    }
    if (path.includes(":mark-read") || options?.method === "DELETE") return undefined;
    if (path.startsWith("/v1/learning/aggregates")) return { accepted_signals: 12 };
    if (path === "/v1/learning/metrics") return [{ metric: "acceptance", value: 0.8 }];
    if (path === "/v1/signals") {
      return testSignalReceipt;
    }
    if (path === "/v1/profiles/conformance") {
      return { profile: "policy", state: "active" };
    }
    if (path.startsWith("/v1/ownership:owned-by?") || path.startsWith("/v1/ownership:owns?")) {
      return { items: [ownership] };
    }
    if (path.startsWith("/v1/ownership/assignments")) return ownership;
    if (path.endsWith("/participants")) {
      return options?.method === "POST" ? participant : { grants: [participant] };
    }
    if (path.includes("/checkpoints") || path.startsWith("/v1/checkpoints/by-digest/")) {
      return checkpoint;
    }
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
        <TenantWorkPage
          activeTenantName="Northstar Systems"
          apiTenantId="tenant-a"
          client={client}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/tenant-work");
});

describe("TenantWorkPage", () => {
  it("reviews tenant activity, marks notifications read, and preserves invalid signal input", async () => {
    const client = testClient();
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Tenant work" })).toBeVisible();
    expect(await screen.findByText("policy-evaluation")).toBeVisible();
    expect(screen.getByText("accepted signals")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/notifications/notification-a:mark-read",
        expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
      ),
    );

    const signalSection = screen
      .getByRole("heading", { level: 2, name: "Record external signal" })
      .closest("section");
    if (!signalSection) throw new Error("Signal section was not rendered.");
    fireEvent.change(within(signalSection).getByLabelText("Allowlisted payload"), {
      target: { value: "not-json" },
    });
    const signalForm = within(signalSection)
      .getByRole("button", { name: "Submit signal" })
      .closest("form");
    if (!signalForm) throw new Error("Signal form was not rendered.");
    fireEvent.submit(signalForm);
    expect(screen.getByText("Enter valid JSON payload data.")).toBeVisible();

    fireEvent.change(within(signalSection).getByLabelText("Registered source UUID"), {
      target: { value: "source-a" },
    });
    fireEvent.change(within(signalSection).getByLabelText("Source system"), {
      target: { value: "deployment-monitor" },
    });
    fireEvent.change(within(signalSection).getByLabelText("Source event ID"), {
      target: { value: "event-a" },
    });
    fireEvent.change(within(signalSection).getByLabelText("Producer ID"), {
      target: { value: "actor-a" },
    });
    fireEvent.change(within(signalSection).getByLabelText("Producer type"), {
      target: { value: "agent" },
    });
    fireEvent.change(within(signalSection).getByLabelText("Classification"), {
      target: { value: "restricted" },
    });
    fireEvent.change(within(signalSection).getByLabelText("Allowlisted payload"), {
      target: { value: '{"deployment":"verified"}' },
    });
    fireEvent.submit(signalForm);
    expect(await screen.findByText("Durable signal receipt")).toBeVisible();
    expect(screen.getByText("Signal ingested")).toBeVisible();

    fireEvent.click(screen.getByRole("combobox", { name: /^Status/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Read" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mark read" })).toBeNull());
  });

  it("presents sparse activity evidence and recognizes an idempotent signal replay", async () => {
    const sparseNotification = {
      ...notification,
      change_classification: null,
      version_after: null,
      version_before: null,
    };
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/v1/notifications?")) {
        return path.includes("status=all")
          ? { items: [], next_cursor: null }
          : { items: [sparseNotification], next_cursor: null };
      }
      if (path.startsWith("/v1/learning/aggregates")) return {};
      if (path === "/v1/learning/metrics") return [];
      if (path === "/v1/signals") return { ...testSignalReceipt, replayed: true };
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(clientFromRequest(request));

    expect(await screen.findByText(/No prior version/u)).toBeVisible();
    expect(screen.getByText(/No reported version/u)).toBeVisible();
    expect(screen.getAllByText("No evidence was reported.")).toHaveLength(2);

    const signalSection = screen
      .getByRole("heading", { level: 2, name: "Record external signal" })
      .closest("section");
    if (!signalSection) throw new Error("Signal section was not rendered.");
    const payload = within(signalSection).getByLabelText("Allowlisted payload");
    const form = within(signalSection)
      .getByRole("button", { name: "Submit signal" })
      .closest("form");
    if (!form) throw new Error("Signal form was not rendered.");
    fireEvent.change(payload, { target: { value: "[]" } });
    fireEvent.submit(form);
    expect(screen.getByText("Payload must be a JSON object.")).toBeVisible();
    fireEvent.change(payload, { target: { value: '{"replayed":true}' } });
    fireEvent.submit(form);
    expect(await screen.findByText("Signal replay recognized")).toBeVisible();

    fireEvent.click(screen.getByRole("combobox", { name: /^Status/ }));
    fireEvent.click(await screen.findByRole("option", { name: "All" }));
    expect(await screen.findByText(/No\s+notification is available/u)).toBeVisible();
  });

  it("finds governed ownership in both directions and exposes profile lifecycle actions", async () => {
    window.history.replaceState({}, "", "/tenant-work?task=ownership");
    const client = testClient();
    renderPage(client);

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
    expect(window.location.search).toBe("?task=ownership");
  });

  it("creates and transitions ownership before completing profile governance actions", async () => {
    window.history.replaceState({}, "", "/tenant-work?task=ownership");
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

  it("coordinates participants and appends immutable checkpoint evidence", async () => {
    window.history.replaceState({}, "", "/tenant-work?task=coordination");
    const client = testClient();
    renderPage(client);

    fireEvent.change(screen.getByLabelText("Intent UUID"), { target: { value: "intent-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Load intent" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Intent participants" }),
    ).toBeVisible();
    expect(await screen.findByText("actor-a")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Remove actor-a" }));
    expect(screen.getByText("End participation now?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(await screen.findByText("Participant removed")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Actor ID"), { target: { value: "actor-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Add participant" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/intents/intent-a/participants",
        expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
      ),
    );

    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "Roll out policy evaluation" },
    });
    fireEvent.change(screen.getByLabelText("Next action"), {
      target: { value: "Validate production" },
    });
    fireEvent.change(screen.getByLabelText(/Assumptions/u), {
      target: { value: "Access remains available, Contract is stable" },
    });
    fireEvent.change(screen.getByLabelText(/Decisions/u), { target: { value: "Proceed" } });
    fireEvent.click(screen.getByRole("button", { name: "Append checkpoint" }));

    expect(await screen.findByRole("article", { name: "Checkpoint checkpoint-a" })).toBeVisible();
    expect(screen.getByText("sha256:checkpoint-a")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Checkpoint UUID"), {
      target: { value: "checkpoint-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve checkpoint" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/intents/intent-a/checkpoints/checkpoint-a",
        expect.objectContaining({ tenantId: "tenant-a" }),
      ),
    );
    fireEvent.click(screen.getByLabelText("Digest"));
    fireEvent.change(screen.getByLabelText("Content digest"), {
      target: { value: "sha256:checkpoint-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve checkpoint" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/checkpoints/by-digest/sha256%3Acheckpoint-a",
        expect.objectContaining({ tenantId: "tenant-a" }),
      ),
    );
    expect(window.location.search).toBe("?task=coordination");
  });

  it("shows empty participation and preserves sparse immutable checkpoint evidence", async () => {
    window.history.replaceState({}, "", "/tenant-work?task=coordination");
    const sparseCheckpoint = {
      ...checkpoint,
      decisions: [],
      next_action: null,
      open_questions: [],
    };
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/participants")) return { grants: [] };
      if (path.includes("/checkpoints/")) return sparseCheckpoint;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(clientFromRequest(request));

    fireEvent.change(screen.getByLabelText("Intent UUID"), { target: { value: "intent-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Load intent" }));
    expect(await screen.findByText("No participant grant was reported.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Checkpoint UUID"), {
      target: { value: "checkpoint-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve checkpoint" }));
    const card = await screen.findByRole("article", { name: "Checkpoint checkpoint-a" });
    expect(within(card).getByText("Not recorded")).toBeVisible();
    expect(within(card).queryByText("Decisions")).toBeNull();
    expect(within(card).queryByText("Open questions")).toBeNull();
  });

  it("keeps every guided task recoverable when tenant services are unavailable", async () => {
    const request = vi.fn(async () => {
      throw new Error("service unavailable");
    });
    renderPage(clientFromRequest(request));

    expect(await screen.findByText("Notifications unavailable")).toBeVisible();
    expect(await screen.findByText("Learning evidence unavailable")).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: /Ownership & profiles/u }));
    expect(await screen.findByText("Conformance unavailable")).toBeVisible();
    expect(window.location.search).toBe("?task=ownership");

    fireEvent.click(screen.getByRole("tab", { name: /Task coordination/u }));
    fireEvent.change(screen.getByLabelText("Intent UUID"), { target: { value: "intent-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Load intent" }));
    expect(await screen.findByText("Participants unavailable")).toBeVisible();
    expect(window.location.search).toBe("?task=coordination");
  });
});
