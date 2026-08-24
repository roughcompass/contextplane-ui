import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { ActivityPage } from "./ActivityPage";

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
    if (path === "/v1/signals") return testSignalReceipt;
    // The two collections the signal form's pickers read. Both existed before
    // this screen called them.
    if (path === "/v1/admin/memory-sources") {
      return [
        {
          authority_tier: "declared",
          breach_count: 0,
          breaker_open_until: null,
          ingest_ceiling: 100,
          may_provision_entities: false,
          source_id: "source-a",
          tenant_id: "tenant-a",
          window_seconds: 60,
        },
      ];
    }
    if (path.startsWith("/v1/admin/actors")) {
      return {
        items: [
          {
            actor_id: "actor-a",
            actor_kind: "human",
            created_at: "2026-08-01T00:00:00Z",
            declared_at: "2026-08-01T00:00:00Z",
            declared_by: "actor-a",
            display_name: "Ada Okonjo",
            is_declared: true,
            oidc_subject: "ada",
            owner_principal: null,
          },
        ],
        next_cursor: null,
      };
    }
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
        <ActivityPage activeTenantName="Northstar Systems" apiTenantId="tenant-a" client={client} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/activity");
});

describe("ActivityPage", () => {
  it("reviews tenant activity, marks notifications read, and preserves invalid signal input", async () => {
    const client = testClient();
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
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

    // Chosen from the registered sources: a signal attributed to one that does
    // not exist is refused at ingest.
    fireEvent.click(within(signalSection).getByRole("button", { name: "Registered source" }));
    fireEvent.click(await screen.findByRole("option", { name: /source-a/u }));
    fireEvent.change(within(signalSection).getByLabelText("Source system"), {
      target: { value: "deployment-monitor" },
    });
    fireEvent.change(within(signalSection).getByLabelText("Source event ID"), {
      target: { value: "event-a" },
    });
    fireEvent.click(within(signalSection).getByRole("button", { name: "Producer" }));
    fireEvent.click(await screen.findByRole("option", { name: /Ada Okonjo/u }));
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

  it("stays recoverable when the activity services are unavailable", async () => {
    const request = vi.fn(async () => {
      throw new Error("service unavailable");
    });
    renderPage(clientFromRequest(request));

    expect(await screen.findByText("Notifications unavailable")).toBeVisible();
    expect(await screen.findByText("Learning evidence unavailable")).toBeVisible();
  });
});
