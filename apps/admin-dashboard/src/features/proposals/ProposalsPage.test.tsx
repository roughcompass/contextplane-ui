import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContextplaneApiError,
  clientFromRequest,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type PromotionProposal,
} from "../../shared/api";
import { ProposalsPage } from "./ProposalsPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "actor-admin",
  roles: ["admin"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "tenant-owner",
  tenant_slug: "northstar",
};

const openProposal: PromotionProposal = {
  author_tenant_id: "tenant-author",
  claim_id: "claim-open",
  created_at: "2026-08-12T10:00:00Z",
  current_value: "identity-platform",
  high_impact: true,
  high_impact_reasons: ["narrows_capability_surface"],
  owner_tenant_id: "tenant-owner",
  predicate: "owned_by_team",
  proposal_id: "proposal-open",
  proposed_value: "trust-engineering",
  state: "open",
  subject_entity_id: "subject-identity",
  target_key: "owned_by_team",
  target_kind: "attribute",
  valid_from: "2026-08-12T09:00:00Z",
  valid_to: null,
};

const lowImpactProposal: PromotionProposal = {
  ...openProposal,
  claim_id: "claim-low",
  created_at: null,
  current_value: null,
  high_impact: false,
  high_impact_reasons: [],
  predicate: "documentation_url",
  proposal_id: "proposal-page-two",
  proposed_value: { href: "https://docs.example.test/context" },
  subject_entity_id: "subject-documentation",
  target_key: "documentation_url",
};

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return clientFromRequest(
    vi.fn(async (path: string, options?: ContextplaneRequestOptions): Promise<unknown> =>
      resolver(path, options),
    ),
  );
}

function renderPage(
  client: ContextplaneClient,
  options: { apiTenantId?: string; selectedProposalId?: string | null } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const searchRef = createRef<HTMLInputElement>();
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <ProposalsPage
          {...(options.apiTenantId ? { apiTenantId: options.apiTenantId } : {})}
          activeTenantName="Northstar Systems"
          client={client}
          searchRef={searchRef}
          selectedProposalId={options.selectedProposalId ?? null}
        />
      </QueryClientProvider>,
    ),
    queryClient,
    searchRef,
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/memory/promotions");
});

describe("ProposalsPage", () => {
  it("browses, searches, filters, and cursor-pages tenant promotion proposals", async () => {
    window.history.replaceState({}, "", "/memory/promotions?page_size=25");
    const accepted = { ...openProposal, proposal_id: "proposal-accepted", state: "accepted" };
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.includes("state=accepted")) return { items: [accepted], next_cursor: null };
      if (path.includes("cursor=opaque-next")) {
        return { items: [lowImpactProposal], next_cursor: null };
      }
      if (path.startsWith("/v1/memory/promotion-proposals")) {
        return { items: [openProposal], next_cursor: "opaque-next" };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    const { searchRef } = renderPage(client, { apiTenantId: "tenant-real" });

    expect(await screen.findByRole("heading", { level: 1, name: "Promotions" })).toBeVisible();
    expect(screen.getByText("Promotion proposals preserve the truth boundary")).toBeVisible();
    const section = screen.getByRole("region", { name: "Promotion proposals" });
    expect(await within(section).findByRole("link", { name: "Owned by team" })).toBeVisible();
    expect(within(section).getByText("ID …sal-open")).toBeVisible();
    expect(within(section).getByText("Value changed")).toBeVisible();
    expect(within(section).getByRole("link", { name: "View details" })).toBeVisible();
    expect(within(section).queryByRole("columnheader", { name: "Current value" })).toBeNull();
    expect(within(section).queryByRole("columnheader", { name: "Proposed value" })).toBeNull();
    expect(within(section).getByText("High impact")).toBeVisible();
    expect(searchRef.current).not.toBeNull();
    expect(within(section).queryByRole("searchbox", { name: "Search returned page" })).toBeNull();

    fireEvent.click(within(section).getByRole("button", { name: "Show filters" }));
    const search = within(section).getByRole("searchbox", { name: "Search returned page" });
    fireEvent.change(search, { target: { value: "no match" } });
    expect(within(section).getByText("No returned proposal matches this search")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("no match");
    fireEvent.click(within(section).getByRole("button", { name: "Clear search" }));

    fireEvent.click(within(section).getByRole("button", { name: "Next page" }));
    expect(await within(section).findByRole("link", { name: "Documentation url" })).toBeVisible();
    expect(within(section).getByText("No high-impact flag")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("cursor")).toBe("opaque-next");
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("cursor=opaque-next"),
      expect.objectContaining({ tenantId: "tenant-real", signal: expect.any(AbortSignal) }),
    );

    fireEvent.click(within(section).getByRole("button", { name: "First page" }));
    expect(await within(section).findByRole("link", { name: "Owned by team" })).toBeVisible();
    fireEvent.click(within(section).getByRole("combobox", { name: /^Proposal state/ }));
    fireEvent.click(screen.getByRole("option", { name: "Accepted" }));
    expect(await within(section).findByRole("link", { name: "Owned by team" })).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toBe("accepted");
  });

  it("recovers from an invalid opaque cursor without decoding it", async () => {
    window.history.replaceState({}, "", "/memory/promotions?cursor=expired-cursor");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.includes("cursor=expired-cursor")) {
        throw new ContextplaneApiError({
          errors: [{ code: "invalid_cursor", message: "invalid cursor", path: null }],
          requestId: "request-cursor",
          status: 422,
        });
      }
      if (path.startsWith("/v1/memory/promotion-proposals")) {
        return { items: [], next_cursor: null };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByText("This proposal page cursor is invalid")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to first page" }));

    expect(await screen.findByText("No open proposals")).toBeVisible();
    expect(new URL(window.location.href).searchParams.has("cursor")).toBe(false);
  });

  it("keeps independent list failures recoverable", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      throw new Error("offline");
    });
    renderPage(client);

    expect(await screen.findByText("Proposals could not be loaded")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry request" }));
    await waitFor(() =>
      expect(
        client.request.mock.calls.filter(([path]) =>
          path.startsWith("/v1/memory/promotion-proposals"),
        ),
      ).toHaveLength(2),
    );
  });

  it("explains authentication failures before exposing tenant proposal context", async () => {
    const client = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "unauthenticated", message: "authentication required", path: null }],
        requestId: "request-auth",
        status: 401,
      });
    });
    renderPage(client);

    expect(
      await screen.findByText("Connect an authenticated DE Context Plane session"),
    ).toBeVisible();
    expect(screen.getByText(/must not be placed in browser-bundled variables/i)).toBeVisible();
    expect(screen.getByText(/request-auth/)).toBeVisible();
  });

  it("shows exact proposal evidence while withholding review actions from a consumer", async () => {
    window.history.replaceState({}, "", "/memory/promotions/proposal-open?state=open");
    const consumer = { ...identity, actor_display_name: null, roles: ["consumer"] };
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return consumer;
      if (path === "/v1/memory/promotion-proposals/proposal-open") return openProposal;
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client, { selectedProposalId: "proposal-open" });

    expect(await screen.findByRole("heading", { level: 1, name: "Proposal review" })).toBeVisible();
    expect(screen.getByText("Observed claim, not canonical state")).toBeVisible();
    expect(screen.getByText("Narrows capability surface")).toBeVisible();
    expect(screen.getAllByText(/identity-platform/)).toHaveLength(2);
    expect(screen.getAllByText(/trust-engineering/)).toHaveLength(2);
    expect(screen.getByText("Field-level comparison")).toBeVisible();
    expect(
      screen.getByText("Supporting evidence and affected records are not published"),
    ).toBeVisible();
    expect(
      screen.getByText("Review actions require producer or administrator access"),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Accept proposal" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to proposals" })).toHaveAttribute(
      "href",
      "/memory/promotions?state=open",
    );
  });

  it("confirms an exact proposed value before recording acceptance", async () => {
    window.history.replaceState({}, "", "/memory/promotions/proposal-page-two");
    const client = clientFor((path, options) => {
      if (path === "/v1/whoami") return identity;
      if (
        path === "/v1/memory/promotion-proposals/proposal-page-two" &&
        options?.method === "PATCH"
      ) {
        return {
          promotion_id: "promotion-accepted",
          proposal: { ...lowImpactProposal, state: "accepted" },
        };
      }
      if (path === "/v1/memory/promotion-proposals/proposal-page-two") {
        return lowImpactProposal;
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client, { selectedProposalId: "proposal-page-two" });

    expect(await screen.findByText("No high-impact classification was reported")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Accept proposal" }));
    expect(screen.getByText("Confirm canonical promotion")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm acceptance" }));

    expect(await screen.findByText("Proposal accepted")).toBeVisible();
    expect(screen.getByText("Canonical promotion recorded")).toBeVisible();
    expect(screen.queryByText("Observed claim, not canonical state")).toBeNull();
    expect(screen.getByText(/promotion-accepted/)).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/memory/promotion-proposals/proposal-page-two",
      { body: { state: "accepted" }, method: "PATCH" },
    );
  });

  it("requires and preserves a rejection reason before recording refusal", async () => {
    const client = clientFor((path, options) => {
      if (path === "/v1/whoami") return identity;
      if (path === "/v1/memory/promotion-proposals/proposal-open" && options?.method === "PATCH") {
        return { promotion_id: null, proposal: { ...openProposal, state: "rejected" } };
      }
      if (path === "/v1/memory/promotion-proposals/proposal-open") return openProposal;
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client, { selectedProposalId: "proposal-open" });

    await screen.findByRole("heading", { level: 1, name: "Proposal review" });
    fireEvent.click(screen.getByRole("button", { name: "Reject proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
    expect(screen.getByText("Enter the service-required rejection reason.")).toBeVisible();

    const reason = screen.getByRole("textbox", { name: "Rejection reason" });
    fireEvent.change(reason, { target: { value: "  Incorrect ownership evidence  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));

    expect(await screen.findByText("Proposal rejected")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith("/v1/memory/promotion-proposals/proposal-open", {
      body: { reason: "Incorrect ownership evidence", state: "rejected" },
      method: "PATCH",
    });
  });

  it("reports concurrent decisions and tenant-hidden details honestly", async () => {
    const conflictClient = clientFor((path, options) => {
      if (path === "/v1/whoami") return identity;
      if (options?.method === "PATCH") {
        throw new ContextplaneApiError({
          errors: [{ code: "conflict", message: "already decided", path: null }],
          requestId: "request-conflict",
          status: 409,
        });
      }
      if (path === "/v1/memory/promotion-proposals/proposal-open") return openProposal;
      throw new Error(`Unhandled path: ${path}`);
    });
    const { unmount } = renderPage(conflictClient, { selectedProposalId: "proposal-open" });

    await screen.findByRole("heading", { level: 1, name: "Proposal review" });
    fireEvent.click(screen.getByRole("button", { name: "Accept proposal" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm acceptance" }));
    expect(await screen.findByText("Proposal state changed")).toBeVisible();
    expect(screen.getByText(/request-conflict/)).toBeVisible();
    unmount();

    const hiddenClient = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      throw new ContextplaneApiError({
        errors: [{ code: "not_found", message: "no such proposal", path: null }],
        requestId: null,
        status: 404,
      });
    });
    renderPage(hiddenClient, { selectedProposalId: "proposal-hidden" });

    expect(await screen.findByText("Proposal not found")).toBeVisible();
    expect(screen.getByText(/absent or belongs to another tenant/i)).toBeVisible();
  });
});
