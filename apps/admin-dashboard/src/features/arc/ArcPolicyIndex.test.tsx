import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContextplaneClient } from "../../shared/api/client";
import { ContextplaneApiError, clientFromRequest } from "../../shared/api/client";
import type { ArcArtifactFamily } from "../../shared/api/contextplane";
import { ArcPolicyIndex } from "./ArcPolicyIndex";

const tenantId = "b0000000-0000-4000-8000-000000000001";
const tenantPolicy: ArcArtifactFamily = {
  active_revision_id: null,
  artifact_id: "aa000000-0000-4000-8000-000000000001",
  created_at: "2026-08-12T10:00:00Z",
  created_by: { issuer: "contextplane", subject: "actor-1" },
  kind: "policy",
  owning_scope: "tenant",
  slug: "production-safeguards",
  target_tenant_id: tenantId,
  title: "Production safeguards",
};
const globalStandard: ArcArtifactFamily = {
  ...tenantPolicy,
  active_revision_id: "ad000000-0000-4000-8000-000000000001",
  artifact_id: "aa000000-0000-4000-8000-000000000002",
  kind: "standard",
  owning_scope: "global",
  slug: "global-standard",
  target_tenant_id: null,
  title: "Global standard",
};

function renderIndex(
  client: ContextplaneClient,
  overrides: Partial<ComponentProps<typeof ArcPolicyIndex>> = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ArcPolicyIndex
        client={client}
        requestContext={{ tenantId }}
        searchRef={createRef<HTMLInputElement>()}
        tenantKey={tenantId}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

function pageClient(items: ArcArtifactFamily[] = [tenantPolicy, globalStandard]) {
  return clientFromRequest(vi.fn(async () => ({ items, next_cursor: null })));
}

function chooseOption(controlName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: new RegExp(`^${controlName}`) }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/arc");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ArcPolicyIndex", () => {
  it("shows active and inactive policies and exposes actions only when supplied", async () => {
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    const client = pageClient();
    renderIndex(client, {
      onCreate,
      onSelect,
      selectedPolicyId: tenantPolicy.artifact_id,
    });

    expect(await screen.findByText("Global standard")).toBeVisible();
    expect(screen.getByText("Active")).toBeVisible();
    expect(screen.getByText("Not active")).toBeVisible();
    expect(screen.getByRole("button", { name: "Selected" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Select policy" }));
    expect(onSelect).toHaveBeenCalledWith(globalStandard);
    expect(screen.queryByRole("button", { name: "New policy" })).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();

    const table = screen.getByRole("table");
    expect(within(table).getByText("Global")).toBeVisible();
    expect(within(table).getByText("Standard")).toBeVisible();
  });

  it("keeps the collection readable without authoring actions", async () => {
    renderIndex(pageClient([tenantPolicy]));

    expect(await screen.findByText(tenantPolicy.title)).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: "Action" })).toBeNull();
    expect(screen.queryByRole("button", { name: "New policy" })).toBeNull();
  });

  it("filters on the server, restores history, and clears a no-match state", async () => {
    window.history.replaceState(
      {},
      "",
      "/arc?policy_q=missing&policy_kind=policy&policy_scope=global&policy_cursor=opaque",
    );
    const client = pageClient([]);
    renderIndex(client);

    expect(await screen.findByText("No policies match")).toBeVisible();
    expect(
      screen.getByText(/Filtered by Search “missing” · Kind: Policy · Scope: Global/),
    ).toBeVisible();
    expect(
      screen.getByText(/No visible policy matches Search “missing” · Kind: Policy · Scope: Global/),
    ).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Search policies" })).toHaveValue("missing");
    expect(client.request).toHaveBeenCalledWith(
      "/v1/arc/artifacts?cursor=opaque&kind=policy&owning_scope=global&page_size=25&q=missing",
      expect.objectContaining({ tenantId }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear policy filters" }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByRole("searchbox", { name: "Search policies" })).toHaveValue("");

    chooseOption("Policy kind", "Standard");
    chooseOption("Owning scope", "Tenant");
    await waitFor(() => {
      expect(window.location.search).toContain("policy_kind=standard");
      expect(window.location.search).toContain("policy_scope=tenant");
    });

    window.history.pushState({}, "", "/arc?policy_q=restored");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "Search policies" })).toHaveValue("restored"),
    );
  });

  it("offers policy creation from a true empty collection", async () => {
    const onCreate = vi.fn();
    renderIndex(pageClient([]), { onCreate });

    expect(await screen.findByText("No policies yet")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Create first policy" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("searchbox", { name: "Search policies" })).toBeNull();
  });

  it.each([
    [
      "forbidden",
      new ContextplaneApiError({
        errors: [{ code: "forbidden", message: "forbidden", path: null }],
        requestId: "request-403",
        status: 403,
      }),
      "You do not have permission to view policies",
    ],
    [
      "missing tenant",
      new ContextplaneApiError({
        errors: [{ code: "tenant_required", message: "tenant required", path: null }],
        requestId: "request-400",
        status: 400,
      }),
      "Choose a tenant from the application header",
    ],
    [
      "service failure",
      new ContextplaneApiError({
        errors: [{ code: "unavailable", message: "temporarily unavailable", path: null }],
        requestId: "request-503",
        status: 503,
      }),
      "policy service is temporarily unavailable",
    ],
    ["unexpected failure", new Error("offline"), "Policies could not be loaded"],
  ])("explains and retries a %s collection error", async (_name, error, expected) => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ items: [], next_cursor: null });
    renderIndex(clientFromRequest(request));

    expect(await screen.findByText(new RegExp(expected))).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry request" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});
