import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import { ContextplaneApiError, type ContextplaneClient } from "../../shared/api";
import { TenantOperationDialog } from "./TenantOperationDialog";
import type { TenantOperationDefinition } from "./tenantOperations";

const operation: TenantOperationDefinition = {
  confirmationRequired: true,
  group: "catalog",
  id: "delete-entity",
  method: "DELETE",
  path: "/v1/tenants/{tenant_id}/entities/{entity_id}",
  pathParameters: ["tenant_id", "entity_id"],
  queryParameters: [{ defaultValue: "reviewed", name: "reason" }],
  title: "Delete entity",
};

function renderDialog(client: ContextplaneClient, onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TenantOperationDialog
          apiTenantId="tenant-a"
          client={client}
          onClose={onClose}
          operation={operation}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

describe("TenantOperationDialog", () => {
  it("preserves a high-impact draft across an ETag conflict and safely retries", async () => {
    let attempts = 0;
    const request = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new ContextplaneApiError({
          errors: [{ code: "precondition_failed", message: "stale", path: null }],
          requestId: "request-412",
          status: 412,
        });
      }
      return undefined;
    });
    renderDialog({ request });

    const dialog = screen.getByRole("dialog", { name: "Delete entity" });
    expect(within(dialog).getByText("High impact")).toBeVisible();
    expect(within(dialog).getByLabelText("Tenant id")).toHaveValue("tenant-a");
    fireEvent.change(within(dialog).getByLabelText("Entity id"), {
      target: { value: "entity/a" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "superseded & reviewed" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^If-Match precondition/u), {
      target: { value: '"revision-7"' },
    });

    const submit = within(dialog).getByRole("button", { name: "Confirm and run" });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Type CONFIRM to enable this operation"), {
      target: { value: "CONFIRM" },
    });
    fireEvent.click(submit);

    expect(await within(dialog).findByText("Newer state is available")).toBeVisible();
    expect(within(dialog).getByText("Request ID: request-412")).toBeVisible();
    expect(within(dialog).getByLabelText("Entity id")).toHaveValue("entity/a");
    fireEvent.click(submit);

    expect(await within(dialog).findByText("Operation completed")).toBeVisible();
    fireEvent.click(within(dialog).getByText("View structured service response"));
    expect(within(dialog).getByText("No response body")).toBeVisible();
    expect(request).toHaveBeenLastCalledWith(
      "/v1/tenants/tenant-a/entities/entity%2Fa?reason=superseded+%26+reviewed",
      expect.objectContaining({
        headers: { "If-Match": '"revision-7"' },
        method: "DELETE",
        tenantId: "tenant-a",
      }),
    );
  });

  it("maps an unexpected service failure without exposing raw details", async () => {
    const request = vi.fn(async () => {
      throw new Error("sensitive upstream detail");
    });
    const onClose = renderDialog({ request });
    const dialog = screen.getByRole("dialog", { name: "Delete entity" });
    fireEvent.change(within(dialog).getByLabelText("Entity id"), {
      target: { value: "entity-a" },
    });
    fireEvent.change(within(dialog).getByLabelText("Type CONFIRM to enable this operation"), {
      target: { value: "CONFIRM" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm and run" }));

    expect(await within(dialog).findByText("Request failed")).toBeVisible();
    expect(within(dialog).queryByText("sensitive upstream detail")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close operation" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
