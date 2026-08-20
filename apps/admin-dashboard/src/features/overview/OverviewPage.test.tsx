import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { OverviewPage } from "./OverviewPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: null,
  actor_id: "actor-a",
  roles: ["producer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "tenant-a",
  tenant_slug: "northstar",
};

function proposal(
  proposalId: string,
  state: "accepted" | "amended" | "open",
  predicate: string,
  highImpact = false,
) {
  return {
    author_tenant_id: "tenant-a",
    claim_id: `claim-${proposalId}`,
    created_at: "2026-08-12T10:00:00Z",
    current_value: "platform",
    high_impact: highImpact,
    high_impact_reasons: highImpact ? ["blast_radius"] : [],
    owner_tenant_id: "tenant-a",
    predicate,
    proposal_id: proposalId,
    proposed_value: "trust-engineering",
    state,
    subject_entity_id: `entity-${proposalId}`,
    target_key: `entity-${proposalId}`,
    target_kind: "capability",
    valid_from: "2026-08-12T10:00:00Z",
    valid_to: null,
  };
}

const recentSession = {
  event_count: 7,
  first_activity_at: "2026-08-12T09:00:00Z",
  last_activity_at: "2026-08-12T11:00:00Z",
  session_id: "session-resume",
};

const recentWorkspace = {
  archived_at: null,
  created_at: "2026-08-11T09:00:00Z",
  created_by: "actor-a",
  description: "Incident follow-up context",
  name: "Trust review",
  owner_actor_id: "actor-a",
  owner_kind: "actor",
  t_invalidated_at: null,
  tenant_id: "tenant-a",
  updated_at: "2026-08-12T12:00:00Z",
  workspace_id: "workspace-resume",
};

function servicePayload(path: string): unknown {
  if (path === "/v1/whoami") return identity;
  if (path === "/v1/memory/curation-queue?counts=true") {
    return { counts: { contested: 2, unlinked: 3 } };
  }
  if (path.startsWith("/v1/memory/sessions")) return [recentSession];
  if (path.startsWith("/v1/workspaces")) {
    return { items: [recentWorkspace], next_cursor: null };
  }
  if (path.includes("state=open")) {
    return {
      items: [proposal("open-high", "open", "owned_by_team", true)],
      next_cursor: "opaque-next",
    };
  }
  if (path.includes("state=accepted")) {
    return {
      items: [proposal("accepted-one", "accepted", "retention_policy")],
      next_cursor: null,
    };
  }
  if (path.includes("state=amended")) {
    return {
      items: [proposal("amended-one", "amended", "support_tier")],
      next_cursor: null,
    };
  }
  throw new Error(`Unexpected request: ${path}`);
}

function renderOverview(
  request: (path: string, options?: ContextplaneRequestOptions) => Promise<unknown> = async (
    path,
  ) => servicePayload(path),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const client: ContextplaneClient = clientFromRequest(vi.fn(request));
  render(
    <QueryClientProvider client={queryClient}>
      <OverviewPage activeTenantName="Northstar Systems" apiTenantId="tenant-a" client={client} />
    </QueryClientProvider>,
  );
  return { client, queryClient };
}

describe("OverviewPage", () => {
  it("orients the actor with concise previews and destination links", async () => {
    renderOverview();

    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    expect(screen.getByText("Morgan Morris")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Resume work" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Governed outcomes" })).toBeVisible();

    expect(await screen.findByText("Owned by team")).toBeVisible();
    expect(screen.getByText("5 items waiting")).toBeVisible();
    expect(screen.getByText("session-resume")).toBeVisible();
    expect(screen.getByText("Trust review")).toBeVisible();
    expect(screen.getByText("Retention policy")).toBeVisible();
    expect(screen.getByText("Support tier")).toBeVisible();

    expect(screen.getByRole("link", { name: "Open proposal queue" })).toHaveAttribute(
      "href",
      "/proposals",
    );
    expect(screen.getByRole("link", { name: "Open curation queue" })).toHaveAttribute(
      "href",
      "/memory?tab=curation",
    );
    expect(screen.getByRole("link", { name: "Open all sessions" })).toHaveAttribute(
      "href",
      "/sessions",
    );
    expect(screen.getByRole("link", { name: "Open all workspaces" })).toHaveAttribute(
      "href",
      "/workspaces",
    );
    expect(screen.getByRole("link", { name: "Open audit log" })).toHaveAttribute("href", "/audit");

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("preserves successful sections while retrying one failed source", async () => {
    let curationAttempts = 0;
    renderOverview(async (path) => {
      if (path === "/v1/memory/curation-queue?counts=true" && curationAttempts++ === 0) {
        throw new ContextplaneApiError({
          errors: [{ code: "service_unavailable", message: "down", path: null }],
          requestId: "request-curation",
          status: 503,
        });
      }
      return servicePayload(path);
    });

    expect(await screen.findByText("Curation counts is unavailable")).toBeVisible();
    expect(screen.getByText("session-resume")).toBeVisible();
    expect(screen.getByText("Trust review")).toBeVisible();
    expect(screen.getByText("request-curation")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Retry request" }));
    expect(await screen.findByText("5 items waiting")).toBeVisible();
    expect(screen.queryByText("Curation counts is unavailable")).toBeNull();
  });

  it("distinguishes published empty states from request failures", async () => {
    renderOverview(async (path) => {
      if (path === "/v1/whoami") return identity;
      if (path === "/v1/memory/curation-queue?counts=true") return { counts: {} };
      if (path.startsWith("/v1/memory/sessions")) return [];
      if (path.startsWith("/v1/workspaces")) return { items: [], next_cursor: null };
      if (path.startsWith("/v1/memory/promotion-proposals")) {
        return { items: [], next_cursor: null };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    expect(await screen.findByText("No open proposals were returned")).toBeVisible();
    expect(screen.getByText("No curation items are waiting")).toBeVisible();
    expect(screen.getByText("No retained sessions were returned")).toBeVisible();
    expect(screen.getByText("No active workspaces were returned")).toBeVisible();
    expect(screen.getByText("No governed outcomes were returned")).toBeVisible();
  });

  it("renders an authenticated recovery state when identity cannot be resolved", async () => {
    renderOverview(async () => {
      throw new ContextplaneApiError({
        errors: [{ code: "unauthenticated", message: "missing token", path: null }],
        requestId: "request-identity",
        status: 401,
      });
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    expect(screen.getByText("Connect an authenticated DE Context Plane session")).toBeVisible();
    expect(screen.getByText("request-identity")).toBeVisible();
  });

  it("refreshes only overview queries", async () => {
    const { client } = renderOverview();

    const refresh = await screen.findByRole("button", { name: "Refresh overview" });
    const requestsBefore = vi.mocked(client.request).mock.calls.length;
    fireEvent.click(refresh);

    await waitFor(() => {
      expect(vi.mocked(client.request).mock.calls.length).toBeGreaterThan(requestsBefore);
    });
  });
});
