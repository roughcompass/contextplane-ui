import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { SessionsPage } from "./SessionsPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "a0000000-0000-4000-8000-000000000001",
  roles: ["admin"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "b0000000-0000-4000-8000-000000000001",
  tenant_slug: "northstar",
};

const sessions = [
  {
    event_count: 3,
    first_activity_at: "2026-08-12T10:00:00Z",
    last_activity_at: "2026-08-12T10:05:00Z",
    session_id: "session-alpha",
  },
  {
    event_count: 8,
    first_activity_at: "2026-08-11T09:00:00Z",
    last_activity_at: "2026-08-11T11:00:00Z",
    session_id: "support-beta",
  },
];

const events = [
  {
    body: "Which capability owns policy evaluation?",
    created_at: "2026-08-12T10:00:00Z",
    event_id: "c0000000-0000-4000-8000-000000000001",
    kind: "user_message",
    metadata: {},
    seq: 1,
    session_id: "session-alpha",
    tool_name: null,
  },
  {
    body: "Search the context graph before answering.",
    created_at: "2026-08-12T10:00:01Z",
    event_id: "c0000000-0000-4000-8000-000000000002",
    kind: "agent_action",
    metadata: { capability_slug: "policy-evaluation" },
    seq: 2,
    session_id: "session-alpha",
    tool_name: null,
  },
  {
    body: "Found one matching capability.",
    created_at: "2026-08-12T10:00:02Z",
    event_id: "c0000000-0000-4000-8000-000000000003",
    kind: "tool_invocation",
    metadata: { result_count: "1" },
    seq: 3,
    session_id: "session-alpha",
    tool_name: "search_capabilities",
  },
];

const usage = {
  days: 30,
  end: "2026-08-12",
  start: "2026-07-14",
  surfaces: [
    {
      actor_days: 21,
      calls: 120,
      distinct_actors: 7,
      distinct_actors_unavailable_reason: null,
      error_calls: 4,
      ok_calls: 116,
      payload_bytes: 2000,
      payload_tokens: 500,
      surface: "mcp",
      worst_daily_p95_ms: 412,
    },
  ],
};

const tools = {
  end: "2026-08-12",
  start: "2026-07-14",
  tools: [
    {
      actor_days: 10,
      calls: 42,
      error_calls: 2,
      ok_calls: 40,
      tool: "record_session_event",
      worst_daily_p95_ms: 220,
    },
    {
      actor_days: 12,
      calls: 90,
      error_calls: 1,
      ok_calls: 89,
      tool: "search_capabilities",
      worst_daily_p95_ms: 180,
    },
  ],
};

function clientFor(
  resolver: (path: string, options?: ContextplaneRequestOptions) => unknown | Promise<unknown>,
) {
  return {
    request: vi.fn(async (path: string, options?: ContextplaneRequestOptions): Promise<unknown> =>
      resolver(path, options),
    ),
  } satisfies ContextplaneClient;
}

function standardClient() {
  return clientFor((path) => {
    if (path === "/v1/whoami") return identity;
    if (path.startsWith("/v1/memory/sessions/session-alpha/events")) {
      return path.includes("kind=tool_invocation") ? [events[2]] : events;
    }
    if (path.startsWith("/v1/memory/sessions")) return sessions;
    if (path.startsWith("/v1/admin/usage/summary")) return usage;
    if (path.startsWith("/v1/admin/usage/tools")) return tools;
    throw new Error(`Unhandled path: ${path}`);
  });
}

function renderWithClient(
  client: ContextplaneClient,
  {
    apiTenantId,
    selectedSessionId = null,
    children,
  }: { apiTenantId?: string; selectedSessionId?: string | null; children?: ReactNode } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const searchRef = createRef<HTMLInputElement>();
  const view = render(
    <QueryClientProvider client={queryClient}>
      {children ?? (
        <SessionsPage
          activeTenantName="Northstar Systems"
          {...(apiTenantId ? { apiTenantId } : {})}
          client={client}
          searchRef={searchRef}
          selectedSessionId={selectedSessionId}
        />
      )}
    </QueryClientProvider>,
  );
  return { ...view, queryClient, searchRef };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/sessions");
});

describe("SessionsPage", () => {
  it("shows actor-private sessions with server-computed usage and session-tool activity", async () => {
    const client = standardClient();
    const { searchRef } = renderWithClient(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
    expect(screen.getByText("Session replay is private to the resolved actor")).toBeVisible();
    const usageSummary = await screen.findByRole("region", { name: "Tenant MCP usage summary" });
    expect(usageSummary).toHaveTextContent("120");
    expect(within(usageSummary).getByText("7")).toBeVisible();

    const sessionSection = await screen.findByRole("region", { name: "Your retained sessions" });
    expect(
      await within(sessionSection).findByRole("link", { name: "session-alpha" }),
    ).toHaveAttribute("href", expect.stringContaining("/sessions/session-alpha"));
    expect(within(sessionSection).getByRole("button", { name: "Show filters" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(within(sessionSection).queryByRole("searchbox", { name: "Session ID" })).toBeNull();
    expect(searchRef.current).not.toBeNull();

    fireEvent.click(within(sessionSection).getByRole("button", { name: "Show filters" }));
    const search = within(sessionSection).getByRole("searchbox", { name: "Session ID" });
    fireEvent.change(search, { target: { value: "support" } });
    expect(within(sessionSection).getByRole("link", { name: "support-beta" })).toBeVisible();
    expect(within(sessionSection).queryByRole("link", { name: "session-alpha" })).toBeNull();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("support");

    fireEvent.click(within(sessionSection).getByRole("button", { name: "Clear search" }));
    expect(within(sessionSection).getByRole("link", { name: "session-alpha" })).toBeVisible();

    const toolTable = screen.getByRole("table", { name: "Usage of session-memory MCP tools" });
    expect(within(toolTable).getByText("record_session_event")).toBeVisible();
    expect(within(toolTable).queryByText("search_capabilities")).toBeNull();
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("/v1/memory/sessions?since="),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("renders a flat sequence-stable replay with kind filtering and structural metadata", async () => {
    window.history.replaceState({}, "", "/sessions/session-alpha");
    const client = standardClient();
    renderWithClient(client, { selectedSessionId: "session-alpha" });

    expect(await screen.findByRole("heading", { level: 1, name: "Session replay" })).toBeVisible();
    expect(await screen.findByText("Which capability owns policy evaluation?")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Session summary" })).toHaveTextContent(
        "Recorded events3",
      ),
    );
    expect(screen.getByText("Search the context graph before answering.")).toBeVisible();
    expect(screen.getByText("search_capabilities")).toBeVisible();
    expect(screen.getByText("Replay follows the service sequence")).toBeVisible();
    expect(screen.getByText("Actor-scoped")).toBeVisible();

    const agentAction = screen.getByRole("article", { name: "Agent action" });
    fireEvent.click(within(agentAction).getByText("View structural metadata"));
    expect(screen.getByText("capability_slug")).toBeVisible();

    fireEvent.click(screen.getByRole("combobox", { name: /^Event kind/ }));
    fireEvent.click(screen.getByRole("option", { name: "Tool invocations" }));

    await waitFor(() =>
      expect(screen.queryByText("Which capability owns policy evaluation?")).toBeNull(),
    );
    expect(await screen.findByText("Found one matching capability.")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("kind")).toBe("tool_invocation");
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("kind=tool_invocation"),
      expect.any(Object),
    );
  });

  it("keeps replay available for a non-admin while omitting tenant-wide usage", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return { ...identity, roles: ["consumer"] };
      if (path.startsWith("/v1/memory/sessions")) return [];
      throw new Error(`Admin endpoint should not be called: ${path}`);
    });
    renderWithClient(client);

    expect(await screen.findByText("Tenant usage requires administrator access")).toBeVisible();
    expect(await screen.findByText("No retained sessions in this window")).toBeVisible();
    expect(screen.queryByText("Tenant MCP usage")).toBeNull();
    expect(client.request).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/admin/usage"),
      expect.anything(),
    );
  });

  it("restores tenant-scoped list filters without inventing unavailable usage", async () => {
    window.history.replaceState({}, "", "/sessions?window=7-days&limit=50&q=missing");
    const unavailableUsage = {
      ...usage,
      days: 7,
      start: "2026-08-06",
      surfaces: [
        {
          ...usage.surfaces[0],
          distinct_actors: null,
          distinct_actors_unavailable_reason: "Outside raw-event retention",
          worst_daily_p95_ms: null,
        },
      ],
    };
    const client = clientFor((path) => {
      if (path === "/v1/whoami") {
        return { ...identity, actor_display_name: null };
      }
      if (path.startsWith("/v1/memory/sessions")) return sessions;
      if (path.startsWith("/v1/admin/usage/summary")) return unavailableUsage;
      if (path.startsWith("/v1/admin/usage/tools")) {
        return {
          ...tools,
          tools: tools.tools.filter((tool) => tool.tool === "search_capabilities"),
        };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderWithClient(client, { apiTenantId: "tenant-real" });

    expect(await screen.findByText("No returned session matches this ID")).toBeVisible();
    expect(screen.getByText("morgan@example.test")).toBeVisible();
    const usageSummary = screen.getByRole("region", { name: "Tenant MCP usage summary" });
    expect(within(usageSummary).getAllByText("Not available")).toHaveLength(2);
    expect(within(usageSummary).getByText("Outside raw-event retention")).toBeVisible();
    expect(screen.getByText("No session-memory tool activity is published")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("limit=50"),
      expect.objectContaining({ tenantId: "tenant-real", signal: expect.any(AbortSignal) }),
    );
  });

  it("loads later replay events with the immutable sequence cursor", async () => {
    window.history.replaceState(
      {},
      "",
      "/sessions/session-alpha?kind=tool_invocation&q=alpha&window=7-days&limit=50",
    );
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...events[2],
      body: `Tool event ${index + 1}`,
      event_id: `event-${index + 1}`,
      metadata: index === 0 ? { result_count: 1 } : {},
      seq: index + 1,
    }));
    const laterEvent = {
      ...events[2],
      body: "Later event from the next sequence page",
      event_id: "event-101",
      seq: 101,
    };
    const client = clientFor((path) => {
      if (path === "/v1/whoami") {
        return { ...identity, actor_display_name: null, actor_email: null };
      }
      if (path.startsWith("/v1/memory/sessions/session-alpha/events")) {
        return path.includes("cursor=100") ? [laterEvent] : firstPage;
      }
      if (path.startsWith("/v1/memory/sessions")) return sessions;
      throw new Error(`Unhandled path: ${path}`);
    });
    renderWithClient(client, { selectedSessionId: "session-alpha" });

    expect(await screen.findByText("Tool event 100")).toBeVisible();
    expect(screen.getByText("a0000000-0000-…0000001")).toBeVisible();
    expect(screen.getByText("result_count")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sessions" })).toHaveAttribute(
      "href",
      "/sessions?q=alpha&window=7-days&limit=50",
    );

    fireEvent.click(screen.getByRole("button", { name: "Load later events" }));

    expect(await screen.findByText("Later event from the next sequence page")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("cursor=100"),
      expect.any(Object),
    );
  });

  it("consolidates independent list failures into one recovery action", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      throw new Error("service offline");
    });
    renderWithClient(client);

    expect(await screen.findByText("Session memory could not be loaded")).toBeVisible();
    expect(screen.getAllByText("Session memory could not be loaded")).toHaveLength(1);
    const retry = screen.getByRole("button", { name: "Retry request" });
    fireEvent.click(retry);

    await waitFor(() =>
      expect(client.request.mock.calls.filter(([path]) => path !== "/v1/whoami")).toHaveLength(6),
    );
  });

  it("keeps successful sections visible when one session request fails", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/memory/sessions")) return sessions;
      if (path.startsWith("/v1/admin/usage/summary")) throw new Error("summary offline");
      if (path.startsWith("/v1/admin/usage/tools")) return tools;
      throw new Error(`Unhandled path: ${path}`);
    });
    renderWithClient(client);

    expect(await screen.findByText("Session memory could not be loaded")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Retry request" })).toHaveLength(1);
    expect(await screen.findByRole("link", { name: "session-alpha" })).toBeVisible();
    expect(screen.getByRole("table", { name: "Usage of session-memory MCP tools" })).toBeVisible();
  });

  it("explains authentication failures without asking for a token in the browser", async () => {
    const client = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code: "unauthenticated", message: "authentication required", path: null }],
        requestId: "request-auth",
        status: 401,
      });
    });
    renderWithClient(client);

    expect(
      await screen.findByText("Connect an authenticated DE Context Plane session"),
    ).toBeVisible();
    expect(screen.queryByText("Identity unresolved")).not.toBeInTheDocument();
    expect(screen.getByText(/never place access tokens in Vite-bundled variables/i)).toBeVisible();
    expect(screen.getByText(/request-auth/)).toBeVisible();
  });
});
