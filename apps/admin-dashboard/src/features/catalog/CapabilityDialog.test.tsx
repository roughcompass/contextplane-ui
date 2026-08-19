import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { CapabilityDialog } from "./CapabilityDialog";

const capability = {
  attributes: { owner: "Trust engineering" },
  created_at: "2026-08-12T14:28:41Z",
  entity_id: "capability-a",
  entity_type: "capability",
  external_id: "policy-evaluation",
  lifecycle: "ga",
  name: "Policy evaluation",
};

function testClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path.includes("/preview-version")) {
      return {
        affected_consumers: [
          {
            entity_id: "consumer-a",
            name: "Checkout",
            tenant_id: "tenant-b",
            version_pin: "2.0.0",
          },
        ],
        changes: [{ path: "$.required", type: "added" }],
        diff_classification: "breaking",
        proposed_version: "3.0.0",
        release_notes_scaffold: "Review required fields.",
      };
    }
    if (path.includes("/interface")) {
      return options?.method === "PUT"
        ? undefined
        : {
            capability_id: "capability-a",
            ingested_at: "2026-08-12T14:28:41Z",
            interface_canonical: { operations: ["evaluate"] },
            interface_format: "json_schema",
            interface_source: { type: "object" },
          };
    }
    if (path.includes("/artifacts")) {
      return {
        items: [
          {
            body: "Verified contract",
            body_format: "markdown",
            category: "runbook",
            created_at: "2026-08-12T14:28:41Z",
            created_by_display_name: "Morgan Morris",
            fact_id: "artifact-a",
            title: "Operations runbook",
          },
        ],
        next_cursor: null,
      };
    }
    if (path.includes("/adoptions")) {
      if (options?.method === "POST") {
        return {
          adoption_id: "adoption-a",
          consumer_tenant_id: "tenant-b",
          intent: "Production policy checks",
          provider_capability_id: "capability-a",
          version_pin: "2.0.0",
        };
      }
      if (options?.method === "DELETE") return undefined;
      return {
        items: [
          {
            adoption_id: "adoption-a",
            consumer_tenant_id: "tenant-b",
            intent: "Production policy checks",
            provider_capability_id: "capability-a",
            version_pin: "2.0.0",
          },
        ],
      };
    }
    if (path.includes("/subscriptions")) {
      if (options?.method === "POST") {
        return {
          capability_id: "capability-a",
          digest_window: "PT1H",
          event_kinds: ["interface.changed"],
          is_enabled: true,
          subscription_id: "subscription-a",
          webhook_url: "https://hooks.example.test/contextplane",
        };
      }
      if (options?.method === "DELETE" || options?.method === "PATCH") return undefined;
      return {
        items: [
          {
            capability_id: "capability-a",
            digest_window: "PT1H",
            event_kinds: ["interface.changed"],
            is_enabled: true,
            subscription_id: "subscription-a",
            webhook_url: null,
          },
        ],
      };
    }
    if (path.startsWith("/v1/subscriptions/")) return undefined;
    if (path.endsWith("/visibility") || path.endsWith("/lifecycle")) return capability;
    if (path === "/v1/capabilities/capability-a") {
      return options?.method === "DELETE" ? undefined : capability;
    }
    if (path.startsWith("/v1/capabilities/capability-a?")) return capability;
    throw new Error(`Unexpected path: ${path}`);
  });
  return { request } satisfies ContextplaneClient;
}

function renderDialog(client: ContextplaneClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CapabilityDialog
          apiTenantId="tenant-a"
          client={client}
          onClose={vi.fn()}
          onCreated={vi.fn()}
          target={{ capabilityId: "capability-a", mode: "detail" }}
          tenantName="Northstar Systems"
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/catalog?capability=capability-a");
});

describe("CapabilityDialog", () => {
  it("moves through governed evidence, interface, connections, and version impact tasks", async () => {
    const client = testClient();
    renderDialog(client);

    const dialog = await screen.findByRole("dialog", { name: "Policy evaluation" });
    expect(within(dialog).getAllByText("capability")[0]).toBeVisible();
    expect(within(dialog).getByRole("heading", { name: "Capability attributes" })).toBeVisible();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Artifacts" }));
    expect(await within(dialog).findByText("Operations runbook")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Operations runbook" }));
    expect(within(dialog).getByText("Delete this artifact?")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep" }));

    fireEvent.click(within(dialog).getByRole("tab", { name: "Interface" }));
    expect(
      await within(dialog).findByRole("heading", { name: "Declared interface" }),
    ).toBeVisible();
    expect(await within(dialog).findByText("json_schema")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Adoption & subscriptions" }));
    expect(await within(dialog).findByText("Production policy checks")).toBeVisible();
    expect(within(dialog).getByText("interface.changed")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove adoption adoption-a" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm remove" }));
    expect(await screen.findByText("Adoption removed")).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText("Adoption intent"), {
      target: { value: "Reviewed production dependency" },
    });
    fireEvent.change(within(dialog).getByLabelText("Version pin"), {
      target: { value: "2.x" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record adoption" }));
    expect(await screen.findByText("Capability adopted")).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText(/^Event kinds/u), {
      target: { value: "interface.changed, ,lifecycle.changed" },
    });
    fireEvent.change(within(dialog).getByLabelText("Webhook URL"), {
      target: { value: "https://hooks.example.test/contextplane" },
    });
    fireEvent.change(within(dialog).getByLabelText("HMAC secret reference"), {
      target: { value: "tenant-a-hook" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create subscription" }));
    expect(await screen.findByText("Subscription created")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Pause" }));
    expect(await screen.findByText("Subscription updated")).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete subscription subscription-a" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByText("Subscription deleted")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Version impact" }));
    fireEvent.change(within(dialog).getByLabelText("Proposed version"), {
      target: { value: "3.0.0" },
    });
    fireEvent.change(within(dialog).getByLabelText("Proposed interface"), {
      target: { value: '{"type":"object"}' },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview version impact" }));

    expect(await within(dialog).findByRole("heading", { name: "Impact result" })).toBeVisible();
    expect(within(dialog).getByText("Checkout")).toBeVisible();
    expect(window.location.search).toContain("panel=impact");
    expect(client.request).toHaveBeenCalledWith(
      "/v1/subscriptions/subscription-a",
      expect.objectContaining({
        body: { is_enabled: false },
        method: "PATCH",
        tenantId: "tenant-a",
      }),
    );
  });

  it("distinguishes empty canonical state from failures and preserves invalid impact drafts", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.includes("/interface")) {
        throw new ContextplaneApiError({
          errors: [{ code: "not_found", message: "not found", path: null }],
          requestId: "request-interface",
          status: 404,
        });
      }
      if (path.includes("/preview-version")) throw new Error("preview unavailable");
      if (path.includes("/artifacts")) return { items: [], next_cursor: null };
      if (path.includes("/adoptions") || path.includes("/subscriptions")) return { items: [] };
      if (path.startsWith("/v1/capabilities/capability-a?")) {
        return { ...capability, external_id: null };
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderDialog({ request });

    const dialog = await screen.findByRole("dialog", { name: "Policy evaluation" });
    expect(within(dialog).getAllByText("Not assigned")).toHaveLength(1);

    fireEvent.click(within(dialog).getByRole("tab", { name: "Artifacts" }));
    expect(await within(dialog).findByText("No artifacts yet")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Interface" }));
    expect(await within(dialog).findByText("No interface published")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Adoption & subscriptions" }));
    expect(
      await within(dialog).findByText("No active adoption has been recorded for this capability."),
    ).toBeVisible();
    expect(
      within(dialog).getByText("No subscription is configured for the current tenant."),
    ).toBeVisible();

    fireEvent.click(within(dialog).getByRole("tab", { name: "Version impact" }));
    fireEvent.change(within(dialog).getByLabelText("Proposed version"), {
      target: { value: "3.0.0" },
    });
    fireEvent.change(within(dialog).getByLabelText("Proposed interface"), {
      target: { value: "not-json" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview version impact" }));
    expect(within(dialog).getByText("Enter valid JSON for the proposed interface.")).toBeVisible();
    expect(within(dialog).getByLabelText("Proposed interface")).toHaveValue("not-json");
  });

  it("validates and completes governed overview changes before confirmed deletion", async () => {
    const client = testClient();
    const { unmount } = renderDialog(client);
    const dialog = await screen.findByRole("dialog", { name: "Policy evaluation" });

    fireEvent.change(within(dialog).getByLabelText("Attributes JSON"), {
      target: { value: "[]" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save attributes" }));
    expect(within(dialog).getByText("Attributes must be a JSON object.")).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Attributes JSON"), {
      target: { value: '{"owner":"Platform assurance"}' },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save attributes" }));
    expect(await within(dialog).findByText(/Capability attributes were updated/u)).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText("New visibility"), {
      target: { value: "tenant-shared" },
    });
    fireEvent.change(within(dialog).getByLabelText("Shared tenant UUIDs"), {
      target: { value: "tenant-b, , tenant-c" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Change visibility" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/capabilities/capability-a/visibility",
        expect.objectContaining({
          body: { shared_with_tenants: ["tenant-b", "tenant-c"], visibility: "tenant-shared" },
          method: "PATCH",
        }),
      ),
    );

    fireEvent.change(within(dialog).getByLabelText("New lifecycle state"), {
      target: { value: "deprecated" },
    });
    fireEvent.change(within(dialog).getByLabelText("Successor capability UUID or “none”"), {
      target: { value: "" },
    });
    const lifecycleForm = within(dialog)
      .getByRole("button", { name: "Change lifecycle" })
      .closest("form");
    if (!lifecycleForm) throw new Error("Lifecycle form was not rendered.");
    fireEvent.submit(lifecycleForm);
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/capabilities/capability-a/lifecycle",
        expect.objectContaining({
          body: { new_state: "deprecated", successor: "none" },
          method: "PATCH",
        }),
      ),
    );

    const deleteButton = within(dialog).getByRole("button", { name: "Delete capability" });
    expect(deleteButton).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Type Policy evaluation to confirm"), {
      target: { value: "Policy evaluation" },
    });
    fireEvent.click(deleteButton);
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/capabilities/capability-a",
        expect.objectContaining({ method: "DELETE", tenantId: "tenant-a" }),
      ),
    );
    unmount();
  });

  it("keeps connection reads recoverable and rejected connection drafts editable", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.startsWith("/v1/capabilities/capability-a?")) return capability;
      if (path.includes("/adoptions") || path.includes("/subscriptions")) {
        throw new Error("connection service unavailable");
      }
      throw new Error(`Unexpected path: ${path}`);
    });
    renderDialog({ request });
    const dialog = await screen.findByRole("dialog", { name: "Policy evaluation" });
    fireEvent.click(within(dialog).getByRole("tab", { name: "Adoption & subscriptions" }));

    expect(await within(dialog).findByText("Adoptions unavailable")).toBeVisible();
    expect(await within(dialog).findByText("Subscriptions unavailable")).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("Adoption intent"), {
      target: { value: "Keep this dependency draft" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record adoption" }));
    expect(await within(dialog).findByText("Adoption was not recorded")).toBeVisible();
    expect(within(dialog).getByLabelText("Adoption intent")).toHaveValue(
      "Keep this dependency draft",
    );

    fireEvent.change(within(dialog).getByLabelText(/^Event kinds/u), {
      target: { value: "interface.changed" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create subscription" }));
    expect(await within(dialog).findByText("Subscription was not created")).toBeVisible();
    expect(within(dialog).getByLabelText(/^Event kinds/u)).toHaveValue("interface.changed");
  });
});
