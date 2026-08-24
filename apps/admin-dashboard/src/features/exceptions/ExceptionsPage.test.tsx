import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import { clientFromRequest } from "../../shared/api";
import { ExceptionsPage } from "./ExceptionsPage";

const EXCEPTION = {
  created_at: "2026-08-20T09:00:00Z",
  detail: { has_statement: true },
  in_force: true,
  in_force_until: "2026-12-31T00:00:00Z",
  kind: "arc_exception",
  object_id: "exception-a",
  scope: "tenant",
  target_tenant_id: null,
};

const REVOKED = { ...EXCEPTION, in_force: false, object_id: "exception-b" };

function renderPage(items: readonly unknown[] = [EXCEPTION]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  const request = vi.fn(async (path: string) => {
    if (path.startsWith("/v1/arc/admin/exceptions")) return { items };
    throw new Error(`Unexpected path: ${path}`);
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ExceptionsPage
          activeTenantName="Northstar Systems"
          client={clientFromRequest(request)}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return request;
}

describe("ExceptionsPage", () => {
  it("shows the register the page used to say could not be built", async () => {
    /** An exception is *defined* as a documented deviation, and one nobody can
     * read is a deviation that was not documented. The read that makes this
     * possible was in the committed contract, and its own description says an
     * exception "was invisible from the moment it was granted" until it existed.
     * Nothing called it. */
    renderPage();

    expect(await screen.findByText("exception-a")).toBeVisible();
    expect(screen.queryByText("This screen cannot show what is already in force")).toBeNull();
  });

  it("keeps a revoked exception in the register", async () => {
    /** A deviation that is no longer in force still explains why something was
     * permitted while it stood, which is the question an auditor arrives with. */
    renderPage([EXCEPTION, REVOKED]);

    expect(await screen.findByText("exception-b")).toBeVisible();
    expect(screen.getByText("Revoked")).toBeVisible();
  });

  it("reads the exceptions path and not another governance collection", async () => {
    /** Six collections share one response shape, so a table pointed at the wrong
     * one renders plausible rows about the wrong thing. */
    const request = renderPage();

    await screen.findByText("exception-a");
    expect(request).toHaveBeenCalledWith("/v1/arc/admin/exceptions", expect.anything());
  });

  it("still says what a permanent deviation is", async () => {
    /** The grant form's own warning, which is true and stays: the service does
     * not require an expiry, so the screen is the only thing that can say what
     * leaving it blank means. */
    renderPage();

    expect(
      await screen.findByText("With no end date, this is a permanent deviation"),
    ).toBeVisible();
  });
});
