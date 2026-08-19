import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { AnalyticsPage } from "./AnalyticsPage";

const summary = {
  days: 30,
  end: "2026-08-12",
  start: "2026-07-14",
  surfaces: [
    {
      actor_days: 20,
      calls: 90,
      distinct_actors: null,
      distinct_actors_unavailable_reason: "outside raw-event retention",
      error_calls: 4,
      ok_calls: 86,
      payload_bytes: 1200,
      payload_tokens: 300,
      surface: "mcp",
      worst_daily_p95_ms: 320,
    },
    {
      actor_days: 10,
      calls: 40,
      distinct_actors: 6,
      error_calls: 2,
      ok_calls: 38,
      payload_bytes: 800,
      payload_tokens: null,
      surface: "rest",
      worst_daily_p95_ms: 180,
    },
  ],
};

const series = {
  end: summary.end,
  points: [
    {
      calls: 12,
      day: "2026-08-12",
      distinct_actors: 3,
      error_calls: 1,
      ok_calls: 11,
      p50_ms: 40,
      p95_ms: 90,
      p99_ms: null,
      surface: "mcp",
    },
  ],
  start: summary.start,
};

const tools = {
  end: summary.end,
  start: summary.start,
  tools: [
    {
      actor_days: 5,
      calls: 20,
      error_calls: 1,
      ok_calls: 19,
      tool: "search_capabilities",
      worst_daily_p95_ms: 210,
    },
  ],
};

const capabilities = {
  capabilities: [{ actor_days: 4, calls: 9, capability_id: "capability-a" }],
  end: summary.end,
  start: summary.start,
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

function successfulClient() {
  return clientFor((path) => {
    if (path.startsWith("/v1/admin/usage/summary?")) return summary;
    if (path.startsWith("/v1/admin/usage/series?")) return series;
    if (path.startsWith("/v1/admin/usage/tools?")) return tools;
    if (path.startsWith("/v1/admin/usage/capabilities?")) return capabilities;
    throw new Error(`Unexpected request: ${path}`);
  });
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsPage
        activeTenantName="Northstar Systems"
        apiTenantId="tenant-a"
        client={client}
        searchRef={{ current: null }}
      />
    </QueryClientProvider>,
  );
}

describe("AnalyticsPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/analytics?from=2026-07-14&to=2026-08-12");
  });

  it("renders all four service usage APIs without inventing unavailable values", async () => {
    const client = successfulClient();
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    expect(screen.getByText("130")).toBeVisible();
    expect(screen.getByText("search_capabilities")).toBeVisible();
    expect(screen.getByText("capability-a")).toBeVisible();
    expect(screen.getByText("outside raw-event retention")).toBeVisible();
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
    expect(client.request).toHaveBeenCalledTimes(4);
    expect(client.request).toHaveBeenCalledWith(
      expect.stringContaining("/v1/admin/usage/summary?"),
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
  });

  it("applies a validated, URL-addressable reporting window", async () => {
    const client = successfulClient();
    renderPage(client);
    await screen.findByRole("heading", { level: 1, name: "Analytics" });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-08-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply window" }));

    await waitFor(() => expect(client.request.mock.calls.length).toBeGreaterThanOrEqual(8));
    const parameters = new URL(window.location.href).searchParams;
    expect(parameters.get("from")).toBe("2026-08-01");
    expect(parameters.get("to")).toBe("2026-08-10");
  });

  it("validates the date range before changing service state", async () => {
    const client = successfulClient();
    renderPage(client);
    await screen.findByRole("heading", { level: 1, name: "Analytics" });

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-08-12" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply window" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a valid start date");
    expect(client.request).toHaveBeenCalledTimes(4);
  });

  it("searches tool and capability rankings while preserving the service aggregates", async () => {
    const client = successfulClient();
    renderPage(client);
    await screen.findByRole("heading", { level: 1, name: "Analytics" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Search usage" }), {
      target: { value: "capability-a" },
    });

    expect(screen.getByText("capability-a")).toBeVisible();
    expect(screen.getByText("No MCP tools match this search")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("q")).toBe("capability-a");
  });

  it("degrades partially when a ranking endpoint is unavailable", async () => {
    const client = clientFor((path) => {
      if (path.startsWith("/v1/admin/usage/summary?")) return summary;
      if (path.startsWith("/v1/admin/usage/series?")) return series;
      if (path.startsWith("/v1/admin/usage/capabilities?")) return capabilities;
      throw new ContextplaneApiError({
        errors: [{ code: "unavailable", message: "private detail", path: null }],
        requestId: "request-a",
        status: 503,
      });
    });
    renderPage(client);

    expect(await screen.findByText("Tool rankings unavailable")).toBeVisible();
    expect(screen.getByText("capability-a")).toBeVisible();
    expect(screen.getByText("130")).toBeVisible();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
});
