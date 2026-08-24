import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContextplaneApiError,
  clientFromRequest,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { AuditPage } from "./AuditPage";

const firstRow = {
  action: "proposal.approve",
  actor_id: "8e4b7719-629d-4c86-b6c3-4fc442f8b19d",
  after_jsonb: { lifecycle: "ga", version: "v3.4" },
  audit_id: "13a66dca-7731-470c-b6e9-d49e8451c98e",
  before_jsonb: { lifecycle: "beta", version: "v3.3" },
  error_code: null,
  request_id: "req-01J5AFM8T79J2Y2M7TH7NV93FJ",
  target_id: "51485c54-ed69-459b-8dd8-30d80f62d835",
  target_type: "capability",
  ts: "2026-08-12T14:28:41Z",
};

const failedRow = {
  ...firstRow,
  action: "interface.update",
  after_jsonb: { version: "v2.2" },
  audit_id: "86be763c-04c7-43d8-88c4-464a2dfc5068",
  before_jsonb: { version: "v2.1" },
  error_code: "precondition_failed",
  request_id: "req-failed",
  target_id: "4c8558e8-9ab7-4fe9-b6bb-7c2d5273876b",
  target_type: "interface",
};

const clipboardWrite = vi.fn<(value: string) => Promise<void>>();

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return clientFromRequest(
    vi.fn(async (path: string, options?: ContextplaneRequestOptions) => resolver(path, options)),
  );
}

function renderAuditPage(client: ContextplaneClient) {
  const searchRef = createRef<HTMLInputElement>();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return {
    searchRef,
    ...render(
      <QueryClientProvider client={queryClient}>
        <AuditPage
          activeTenantName="Northstar Systems"
          apiTenantId="tenant-a"
          client={client}
          searchRef={searchRef}
        />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/audit");
  clipboardWrite.mockReset();
  clipboardWrite.mockResolvedValue();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
});

describe("AuditPage", () => {
  it("renders service history and expands before-and-after evidence", async () => {
    const client = clientFor(() => ({ items: [firstRow, failedRow], next_cursor: null }));
    renderAuditPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Audit Log" })).toBeVisible();
    expect(screen.getByText("Showing 2 service-recorded entries")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "View change" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "View change" })[0]!);

    const change = screen.getByLabelText("Change recorded by proposal.approve");
    expect(within(change).getByLabelText("Before JSON")).toHaveTextContent('"lifecycle": "beta"');
    expect(within(change).getByLabelText("After JSON")).toHaveTextContent('"lifecycle": "ga"');
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("/v1/admin/audit?"),
      expect.objectContaining({ method: "GET", tenantId: "tenant-a" }),
    );
  });

  it("applies every filter to URL-addressable service state without requesting per keystroke", async () => {
    const client = clientFor(() => ({ items: [firstRow], next_cursor: null }));
    const { searchRef } = renderAuditPage(client);
    await screen.findByRole("heading", { level: 1, name: "Audit Log" });
    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));

    const actor = screen.getByRole("searchbox", { name: "Actor ID" });
    expect(searchRef.current).toBe(actor);
    fireEvent.change(actor, { target: { value: "actor-a" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Action" }), {
      target: { value: "proposal.approve" },
    });
    fireEvent.change(screen.getByRole("searchbox", { name: "Target type" }), {
      target: { value: "proposal" },
    });
    fireEvent.change(screen.getByRole("searchbox", { name: "Target ID" }), {
      target: { value: "target-a" },
    });
    expect(client.request).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(client.request).toHaveBeenCalledTimes(2));

    const parameters = new URL(window.location.href).searchParams;
    expect(parameters.get("actor_id")).toBe("actor-a");
    expect(parameters.get("action")).toBe("proposal.approve");
    expect(parameters.get("target_type")).toBe("proposal");
    expect(parameters.get("target_id")).toBe("target-a");
  });

  it("paginates with an opaque cursor and restores service history on popstate", async () => {
    const cursor = "opaque+/cursor==";
    const client = clientFor((path) => ({
      items: [firstRow],
      next_cursor: path.includes("cursor=") ? null : cursor,
    }));
    renderAuditPage(client);
    await screen.findByRole("heading", { level: 1, name: "Audit Log" });

    fireEvent.click(screen.getByRole("button", { name: "Older entries" }));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("cursor")).toBe(cursor),
    );
    expect(await screen.findByRole("button", { name: "Newest entries" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Newest entries" }));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.has("cursor")).toBe(false),
    );
  });

  it("recovers from an invalid cursor while preserving filters", async () => {
    window.history.replaceState({}, "", "/audit?action=proposal.approve&cursor=expired");
    const client = clientFor((path) => {
      if (path.includes("cursor=")) {
        throw new ContextplaneApiError({
          errors: [{ code: "invalid_cursor", message: "expired", path: null }],
          requestId: "request-a",
          status: 422,
        });
      }
      return { items: [firstRow], next_cursor: null };
    });
    renderAuditPage(client);

    expect(await screen.findByText("This audit page link is no longer valid")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to newest entries" }));

    await screen.findByText("Showing 1 service-recorded entries");
    const parameters = new URL(window.location.href).searchParams;
    expect(parameters.get("action")).toBe("proposal.approve");
    expect(parameters.get("cursor")).toBeNull();
  });

  it("copies correlation identifiers and reveals failed service evidence", async () => {
    const client = clientFor(() => ({ items: [firstRow, failedRow], next_cursor: null }));
    renderAuditPage(client);
    await screen.findByRole("heading", { level: 1, name: "Audit Log" });

    fireEvent.click(screen.getAllByRole("button", { name: /Copy request ID/ })[0]!);
    await waitFor(() => expect(screen.getByText("Request ID copied")).toBeInTheDocument());
    expect(clipboardWrite).toHaveBeenCalledWith("req-01J5AFM8T79J2Y2M7TH7NV93FJ");

    expect(screen.queryByText("precondition_failed")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "View change" })[1]!);
    expect(screen.getByRole("heading", { name: "Failure detail" })).toBeVisible();
    expect(screen.getByText("precondition_failed")).toBeVisible();
  });

  it("distinguishes no data from filtered no-match and preserves filters on failure", async () => {
    const emptyClient = clientFor(() => ({ items: [], next_cursor: null }));
    const firstRender = renderAuditPage(emptyClient);
    expect(await screen.findByText("No audit history is available yet")).toBeVisible();
    firstRender.unmount();

    window.history.replaceState({}, "", "/audit?action=proposal.reject");
    const filteredClient = clientFor(() => ({ items: [], next_cursor: null }));
    const secondRender = renderAuditPage(filteredClient);
    expect(await screen.findByText("No audit entries match these filters")).toBeVisible();
    secondRender.unmount();

    const failedClient = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "unavailable", message: "private detail", path: null }],
        requestId: "request-b",
        status: 503,
      });
    });
    renderAuditPage(failedClient);
    expect(await screen.findByText("Audit history unavailable")).toBeVisible();
    expect(screen.getByText("Request ID:")).toBeVisible();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });

  it("does not call this history immutable, because it is not", async () => {
    /** E10-T4's standard, and ADR-0012's precedent: never reach for the
     * stronger word. `audit_log` is an ordinary table — no hash chain, no
     * signature, no append-only trigger — and `audit/emit.py` swallows its own
     * write failures by design so a failed audit row cannot roll back the
     * mutation it describes. The page said "Immutable history" and "This
     * history is append-only", and an auditor is precisely the reader who
     * would act on either. */
    renderAuditPage(clientFor(() => ({ items: [], next_cursor: null })));

    expect(await screen.findByText(/What the service recorded/u)).toBeVisible();
    expect(screen.getByText(/not cryptographically chained/u)).toBeVisible();
    expect(
      screen.getByText(/a missing row is not evidence that an action did not occur/u),
    ).toBeVisible();
    expect(screen.queryByText(/immutable/iu)).toBeNull();
  });
});
