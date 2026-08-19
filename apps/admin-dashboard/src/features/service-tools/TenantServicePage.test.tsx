import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { TenantServicePage } from "./TenantServicePage";

function testClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path === "/v1/whoami") {
      return {
        actor_display_name: "Morgan Morris",
        actor_email: null,
        actor_id: "actor-a",
        roles: ["producer"],
        tenant_display_name: "Northstar Systems",
        tenant_id: "tenant-a",
        tenant_slug: "northstar",
      };
    }
    if (options?.method === "GET") return { items: [], next_cursor: null };
    return { accepted: true };
  });
  return { request } satisfies ContextplaneClient;
}

function renderPage(client: ReturnType<typeof testClient>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TenantServicePage
          activeTenantName="Northstar Systems"
          apiTenantId="tenant-a"
          client={client}
          searchRef={createRef<HTMLInputElement>()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/service-tools");
});

describe("TenantServicePage", () => {
  it("presents all contract operations by tenant job and keeps search state recoverable", async () => {
    const client = testClient();
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Service Tools" })).toBeVisible();
    const catalogTab = await screen.findByRole("tab", { name: "Catalog records" });
    expect(screen.getByText("160")).toBeVisible();
    expect(catalogTab).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "Relationships and impact" }));
    expect(window.location.search).toBe("?domain=relationships");
    expect(
      screen.getByRole("heading", { level: 2, name: "Relationships and impact" }),
    ).toBeVisible();

    const search = screen.getByRole("searchbox", { name: "Search Relationships and impact" });
    fireEvent.change(search, { target: { value: "no matching operation" } });
    expect(screen.getByText("No tenant operation matches")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(client.request).toHaveBeenCalledWith(
      "/v1/whoami",
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
  });

  it("configures exact queries and preserves safe write drafts before execution", async () => {
    const client = testClient();
    renderPage(client);
    await screen.findByRole("heading", { level: 1, name: "Service Tools" });

    const search = await screen.findByRole("searchbox", { name: "Search Catalog records" });
    fireEvent.change(search, { target: { value: "List capabilities" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Configure query" })[0]!);

    let dialog = screen.getByRole("dialog", { name: "List capabilities" });
    fireEvent.change(within(dialog).getByLabelText("Cursor"), {
      target: { value: "opaque+/cursor==" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Run query" }));
    expect(await within(dialog).findByText("Operation completed")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("cursor=opaque%2B%2Fcursor%3D%3D"),
      expect.objectContaining({ method: "GET", tenantId: "tenant-a" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Close operation" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "List capabilities" })).toBeNull(),
    );

    fireEvent.change(search, { target: { value: "Create capability" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Review operation" })[0]!);
    dialog = screen.getByRole("dialog", { name: "Create capability" });
    fireEvent.change(within(dialog).getByLabelText(/^Request body/u), {
      target: { value: "not-json" },
    });
    fireEvent.change(within(dialog).getByLabelText("Type CONFIRM to enable this operation"), {
      target: { value: "CONFIRM" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and run" }));

    expect(within(dialog).getByText("Enter valid JSON before continuing.")).toBeVisible();
    expect(within(dialog).getByLabelText(/^Request body/u)).toHaveValue("not-json");
  });
});
