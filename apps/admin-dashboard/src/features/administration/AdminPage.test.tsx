import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { AdminPage } from "./AdminPage";

const administrator = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "actor-admin",
  roles: ["admin"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "tenant-a",
  tenant_slug: "northstar",
};

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return {
    request: vi.fn(async (path: string, options?: ContextplaneRequestOptions) =>
      resolver(path, options),
    ),
  } satisfies ContextplaneClient;
}

function renderPage(client: ContextplaneClient, apiTenantId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AdminPage
          {...(apiTenantId ? { apiTenantId } : {})}
          activeTenantName="Northstar Systems"
          client={client}
          searchRef={{ current: null }}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function operationRow(title: string): HTMLElement {
  const row = screen
    .getAllByText(title)
    .map((element) => element.closest("tr"))
    .find((element): element is HTMLTableRowElement => element !== null);
  if (!row) throw new Error(`Operation row not found for ${title}`);
  return row;
}

describe("AdminPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/administration");
  });

  it("presents the complete tenant and operator contract by user job", async () => {
    const client = clientFor((path) => (path === "/v1/whoami" ? administrator : {}));
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Administration" })).toBeVisible();
    expect(screen.getByText("72")).toBeVisible();
    expect(screen.getByText("58")).toBeVisible();
    expect(screen.getByText("14")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Service operations" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByText("Inspect operational health")).toHaveLength(2);
  });

  it("runs a tenant-scoped read operation and presents structured results", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return administrator;
      if (path === "/v1/admin/operational-health") {
        return { status: "healthy", workers: { extraction: "ready" } };
      }
      return {};
    });
    renderPage(client, "tenant-a");

    await screen.findByRole("heading", { level: 1, name: "Administration" });
    fireEvent.click(
      within(operationRow("Inspect operational health")).getByRole("button", {
        name: "Configure query",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run query" }));

    expect(await screen.findByText("Operation completed")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/admin/operational-health",
      expect.objectContaining({ method: "GET", tenantId: "tenant-a" }),
    );
    fireEvent.click(screen.getByText("View structured service response"));
    expect(screen.getByText(/"status": "healthy"/)).toBeVisible();
  });

  it("blocks a destructive operation until the target and explicit confirmation are supplied", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return administrator;
      if (path.startsWith("/v1/admin/actors/")) return { status: "purged" };
      return {};
    });
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Administration" });
    fireEvent.click(screen.getByRole("tab", { name: "Privacy controls" }));
    fireEvent.click(
      within(operationRow("Erase an actor's personal data")).getByRole("button", {
        name: "Review operation",
      }),
    );

    const submit = screen.getByRole("button", { name: "Confirm and run" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Actor id"), { target: { value: "actor-a" } });
    fireEvent.change(screen.getByLabelText("Type CONFIRM to enable this operation"), {
      target: { value: "CONFIRM" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/admin/actors/actor-a/personal-data",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("keeps pending backend schema endpoints discoverable but not actionable", async () => {
    const client = clientFor((path) => (path === "/v1/whoami" ? administrator : {}));
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Administration" });
    fireEvent.click(screen.getByRole("tab", { name: "Graph schema" }));

    const row = operationRow("Register a relationship property schema");
    expect(within(row).getByText("API implementation pending")).toBeVisible();
    expect(within(row).getByRole("button", { name: "Unavailable in service" })).toBeDisabled();
  });

  it("does not expose arbitrary backend error text", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return administrator;
      throw new ContextplaneApiError({
        errors: [{ code: "internal", message: "secret database detail", path: null }],
        requestId: "request-a",
        status: 503,
      });
    });
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Administration" });
    fireEvent.click(
      within(operationRow("Inspect operational health")).getByRole("button", {
        name: "Configure query",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Run query" }));

    expect(await screen.findByText("Service unavailable")).toBeVisible();
    expect(screen.getByText("Request ID: request-a")).toBeVisible();
    expect(screen.queryByText("secret database detail")).not.toBeInTheDocument();
  });

  it("does not request an admin endpoint for a non-administrator", async () => {
    const client = clientFor((path) =>
      path === "/v1/whoami" ? { ...administrator, roles: ["viewer"] } : {},
    );
    renderPage(client);

    expect(await screen.findByText("Administrator access is required")).toBeVisible();
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Inspect operational health")).not.toBeInTheDocument();
  });
});
