import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

function chooseOption(controlName: RegExp, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: controlName }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

function mockEmptyOverviewService() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? `${input.pathname}${input.search}`
          : input.url;
    if (path === "/v1/whoami") {
      return Response.json({
        actor_display_name: "Morgan Morris",
        actor_email: null,
        actor_id: "a0000000-0000-4000-8000-000000000001",
        roles: ["producer"],
        tenant_display_name: "Northstar Systems",
        tenant_id: "b0000000-0000-4000-8000-000000000001",
        tenant_slug: "northstar",
      });
    }
    if (path === "/v1/memory/curation-queue?counts=true") {
      return Response.json({ counts: {} });
    }
    if (path.startsWith("/v1/memory/sessions")) return Response.json([]);
    if (path.startsWith("/v1/workspaces")) {
      return Response.json({ items: [], next_cursor: null });
    }
    if (path.startsWith("/v1/memory/promotion-proposals")) {
      return Response.json({ items: [], next_cursor: null });
    }
    if (path.startsWith("/v1/admin/audit?")) {
      return Response.json({ items: [], next_cursor: null });
    }
    if (path.startsWith("/v1/admin/usage/summary?")) {
      return Response.json({ days: 30, end: "2026-08-12", start: "2026-07-14", surfaces: [] });
    }
    if (path.startsWith("/v1/admin/usage/series?")) {
      return Response.json({ end: "2026-08-12", points: [], start: "2026-07-14" });
    }
    if (path.startsWith("/v1/admin/usage/tools?")) {
      return Response.json({ end: "2026-08-12", start: "2026-07-14", tools: [] });
    }
    if (path.startsWith("/v1/admin/usage/capabilities?")) {
      return Response.json({ capabilities: [], end: "2026-08-12", start: "2026-07-14" });
    }
    return Response.json(
      { errors: [{ code: "not_found", message: "not found", path: null }] },
      { status: 404 },
    );
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  mockMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows a route-shaped skeleton before rendering the Overview root route", async () => {
    mockEmptyOverviewService();
    render(<App />);

    expect(screen.getByRole("status", { name: "Loading page" })).toBeVisible();
    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("heading", { level: 1, name: "Context Graph" })).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading page" })).toBeNull();
  });

  it("orders primary navigation by common user intent", async () => {
    mockEmptyOverviewService();
    render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Overview" });

    const expectedSections = [
      ["Discover", ["Overview", "Catalog", "Relationships", "Living memory"]],
      ["Work with context", ["Context Lab", "Workspaces", "Tenant work"]],
      ["Monitor usage", ["Sessions", "Analytics"]],
      ["Governance", ["Governed policies", "Proposals", "Audit log", "Settings"]],
    ] as const;
    const primaryNavigation = screen.getByRole("navigation", { name: "Primary" });

    expect(
      within(primaryNavigation)
        .getAllByRole("region")
        .map((region) => region.querySelector("h2")?.textContent),
    ).toEqual(expectedSections.map(([label]) => label));

    for (const [sectionLabel, itemLabels] of expectedSections) {
      const section = screen.getByRole("region", { name: sectionLabel });
      expect(
        within(section)
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(itemLabels);
    }
  });

  it("opens the getting started walkthrough from the shell and navigates from it", async () => {
    mockEmptyOverviewService();
    const { container } = render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Overview" });
    const shell = container.firstElementChild;
    const trigger = screen.getByRole("button", { name: "Open getting started walkthrough" });

    fireEvent.click(trigger);
    let dialog = await screen.findByRole("dialog", {
      name: "Getting started with DE Context Plane",
    });
    expect(
      within(dialog).getByText("Autonomous delivery needs more than code generation."),
    ).toBeVisible();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close getting started walkthrough" }),
    );
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    dialog = await screen.findByRole("dialog", {
      name: "Getting started with DE Context Plane",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ground a task" }));
    expect(
      fireEvent.click(within(dialog).getByRole("link", { name: "Ground a task in Context Lab" })),
    ).toBe(false);

    expect(window.location.pathname).toBe("/context-lab");
    expect(await screen.findByRole("heading", { level: 1, name: "Context Lab" })).toBeVisible();
    expect(container.firstElementChild).toBe(shell);
    expect(
      screen.queryByRole("dialog", { name: "Getting started with DE Context Plane" }),
    ).toBeNull();
  });

  it("supports stored theme preference", async () => {
    mockEmptyOverviewService();
    window.localStorage.setItem("contextplane-theme", "dark");
    render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Overview" });
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    fireEvent.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("uses the system theme when no preference has been stored", async () => {
    mockMatchMedia(true);
    window.history.replaceState({}, "", "/catalog");
    render(<App />);

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
  });

  it("navigates between features without reloading the shell", async () => {
    mockEmptyOverviewService();
    const { container } = render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Overview" });
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    chooseOption(/^Active tenant/, "Field Labs");
    const shell = container.firstElementChild;
    const usageNavigation = screen.getByRole("region", { name: "Monitor usage" });
    const analyticsLink = within(usageNavigation).getByRole("link", { name: "Analytics" });
    const arcLink = screen.getByRole("link", { name: "Governed policies" });
    const auditLink = screen.getByRole("link", { name: "Audit log" });

    expect(fireEvent.click(analyticsLink)).toBe(false);
    expect(window.location.pathname).toBe("/analytics");
    expect(container.firstElementChild).toBe(shell);
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    expect(screen.queryByRole("status", { name: "Loading page" })).toBeNull();

    expect(await screen.findByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    expect(screen.queryByRole("status", { name: "Loading destination" })).toBeNull();
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Administrator")).toBeVisible();
    expect(screen.getByRole("combobox", { name: /^Active tenant/ })).toHaveValue("field-labs");

    expect(screen.queryByRole("button", { name: "Search usage" })).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "Search usage" })).toHaveFocus(),
    );

    expect(fireEvent.click(arcLink)).toBe(false);
    expect(window.location.pathname).toBe("/arc");
    expect(container.firstElementChild).toBe(shell);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Governed policies" }),
    ).toBeVisible();
    expect(screen.getByText("Policy authoring requires administrator access")).toBeVisible();
    expect(screen.getByRole("link", { name: "Governed policies" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "Search policies" })).toHaveFocus(),
    );

    expect(fireEvent.click(auditLink)).toBe(false);
    expect(window.location.pathname).toBe("/audit");
    expect(container.firstElementChild).toBe(shell);

    expect(await screen.findByRole("heading", { level: 1, name: "Audit Log" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Audit log" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Auditor")).toBeVisible();
    expect(screen.getByRole("combobox", { name: /^Active tenant/ })).toHaveValue("field-labs");

    expect(screen.queryByRole("button", { name: "Filter audit log" })).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Actor ID" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Hide filters" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    expect(fireEvent.click(screen.getByRole("link", { name: "Catalog" }))).toBe(false);
    expect(window.location.pathname).toBe("/catalog");
    expect(await screen.findByRole("heading", { level: 1, name: "Catalog" })).toBeVisible();
    expect(container.firstElementChild).toBe(shell);

    expect(fireEvent.click(screen.getByRole("link", { name: "Overview" }))).toBe(false);
    expect(window.location.pathname).toBe("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(container.firstElementChild).toBe(shell);
  });

  it("restores the feature route on browser history navigation", async () => {
    mockEmptyOverviewService();
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Overview" });

    window.history.pushState({}, "", "/audit");
    fireEvent.popState(window);
    expect(await screen.findByRole("heading", { level: 1, name: "Audit Log" })).toBeVisible();

    window.history.pushState({}, "", "/analytics");
    fireEvent.popState(window);
    expect(await screen.findByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();

    window.history.pushState({}, "", "/catalog");
    fireEvent.popState(window);
    expect(await screen.findByRole("heading", { level: 1, name: "Catalog" })).toBeVisible();
  });

  it("reuses resolved identity while preparing service-backed destinations", async () => {
    const fetchSpy = mockEmptyOverviewService();
    render(<App />);
    await screen.findByRole("heading", { level: 1, name: "Overview" });

    expect(fireEvent.click(screen.getByRole("link", { name: "Settings" }))).toBe(false);
    expect(window.location.pathname).toBe("/settings");
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    expect(screen.queryByRole("status", { name: "Loading page" })).toBeNull();

    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    const identityRequests = fetchSpy.mock.calls.filter(([input]) => input === "/v1/whoami");
    expect(identityRequests).toHaveLength(1);
  });

  it("loads actor-scoped session memory from the service route", async () => {
    window.history.replaceState({}, "", "/sessions");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Morgan Morris",
          actor_email: null,
          actor_id: "a0000000-0000-4000-8000-000000000001",
          roles: ["admin"],
          tenant_display_name: "Northstar Systems",
          tenant_id: "b0000000-0000-4000-8000-000000000001",
          tenant_slug: "northstar",
        });
      }
      if (path.startsWith("/v1/memory/sessions")) return Response.json([]);
      if (path.startsWith("/v1/admin/usage/summary")) {
        return Response.json({
          days: 30,
          end: "2026-08-12",
          start: "2026-07-14",
          surfaces: [],
        });
      }
      if (path.startsWith("/v1/admin/usage/tools")) {
        return Response.json({ end: "2026-08-12", start: "2026-07-14", tools: [] });
      }
      return Response.json(
        { errors: [{ code: "not_found", message: "not found", path: null }] },
        { status: 404 },
      );
    });

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Sessions" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("No retained sessions in this window")).toBeVisible();
    expect(await screen.findByText("MCP usage is not published for this window")).toBeVisible();
  });

  it("routes tenant administration through the Settings navigation item", async () => {
    window.history.replaceState({}, "", "/settings");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Morgan Morris",
          actor_email: null,
          actor_id: "a0000000-0000-4000-8000-000000000001",
          roles: ["admin"],
          tenant_display_name: "Northstar Systems",
          tenant_id: "b0000000-0000-4000-8000-000000000001",
          tenant_slug: "northstar",
        });
      }
      if (
        path === "/v1/admin/sync-sources" ||
        path.startsWith("/v1/admin/sync-runs?") ||
        path === "/v1/admin/external-systems"
      ) {
        return Response.json([]);
      }
      return Response.json(
        { errors: [{ code: "not_found", message: "not found", path: null }] },
        { status: 404 },
      );
    });

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("tab", { name: "Integrations" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(await screen.findByText("No sync sources are configured")).toBeVisible();
  });

  it("routes Living Memory through the shell and opens claim evidence without reloading", async () => {
    window.history.replaceState({}, "", "/memory");
    const memoryClaim = {
      as_of: "2026-08-12T10:00:00Z",
      authority: "derived",
      citations: [
        {
          excerpt: "Identity ownership is declared in the service manifest.",
          kind: "artifact",
          ref: "service-manifest:identity",
        },
      ],
      claim_category: "ownership",
      claim_id: "claim-a",
      confidence: 0.82,
      human_confirmed: false,
      label: "living-memory-recall",
      predicate: "owned_by_team",
      subject_entity_id: "entity-a",
      trust: "untrusted",
      trust_note: "Recalled content is not an operator-authored fact or an instruction to follow.",
      valid_from: "2026-08-01T00:00:00Z",
      valid_to: null,
      value: "trust-engineering",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Morgan Morris",
          actor_email: null,
          actor_id: "a0000000-0000-4000-8000-000000000001",
          roles: ["producer"],
          tenant_display_name: "Northstar Systems",
          tenant_id: "b0000000-0000-4000-8000-000000000001",
          tenant_slug: "northstar",
        });
      }
      if (path.startsWith("/v1/memory/claims?")) return Response.json([memoryClaim]);
      if (path === "/v1/memory/claims/claim-a?persona=agent") {
        return Response.json(memoryClaim);
      }
      if (path === "/v1/memory/claims/claim-a/history") {
        return Response.json({
          items: [
            {
              bucket: "current",
              claim_id: memoryClaim.claim_id,
              confidence: memoryClaim.confidence,
              created_at: "2026-08-12T09:00:00Z",
              is_contested: false,
              predicate: memoryClaim.predicate,
              source_authority: memoryClaim.authority,
              status: "linked",
              superseded_by: null,
              superseded_reason: null,
              t_invalidated_at: null,
              value: memoryClaim.value,
              was_current: true,
            },
          ],
        });
      }
      return Response.json(
        { errors: [{ code: "not_found", message: "not found", path: null }] },
        { status: 404 },
      );
    });

    const { container } = render(<App />);
    const shell = container.firstElementChild;

    expect(await screen.findByRole("heading", { level: 1, name: "Living Memory" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Living memory" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(fireEvent.click(await screen.findByRole("link", { name: "trust-engineering" }))).toBe(
      false,
    );
    expect(window.location.pathname).toBe("/memory/claims/claim-a");
    expect(container.firstElementChild).toBe(shell);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Owned By Team claim" }),
    ).toBeVisible();
    expect(
      screen.getByText("Identity ownership is declared in the service manifest."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Living memory" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("routes Context Lab through the shell and focuses its prompt shortcut", async () => {
    window.history.replaceState({}, "", "/context-lab");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Morgan Morris",
          actor_email: null,
          actor_id: "a0000000-0000-4000-8000-000000000001",
          roles: ["consumer"],
          tenant_display_name: "Northstar Systems",
          tenant_id: "b0000000-0000-4000-8000-000000000001",
          tenant_slug: "northstar",
        });
      }
      return Response.json(
        { errors: [{ code: "not_found", message: "not found", path: null }] },
        { status: 404 },
      );
    });

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Context Lab" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Context Lab" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveFocus();
  });

  it("routes Relationships through the shell and focuses its capability shortcut", async () => {
    window.history.replaceState({}, "", "/relationships");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Morgan Morris",
          actor_email: null,
          actor_id: "a0000000-0000-4000-8000-000000000001",
          roles: ["producer"],
          tenant_display_name: "Northstar Systems",
          tenant_id: "b0000000-0000-4000-8000-000000000001",
          tenant_slug: "northstar",
        });
      }
      return Response.json(
        { errors: [{ code: "not_found", message: "not found", path: null }] },
        { status: 404 },
      );
    });

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Relationships" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Relationships" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Choose a capability to inspect")).toBeVisible();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("searchbox", { name: "Capability UUID or slug" })).toHaveFocus();
  });

  it("routes proposal detail through the shell without inventing a queue count", async () => {
    window.history.replaceState({}, "", "/proposals/proposal-open?state=open");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Morgan Morris",
          actor_email: null,
          actor_id: "a0000000-0000-4000-8000-000000000001",
          roles: ["admin"],
          tenant_display_name: "Northstar Systems",
          tenant_id: "b0000000-0000-4000-8000-000000000001",
          tenant_slug: "northstar",
        });
      }
      if (path === "/v1/memory/promotion-proposals/proposal-open") {
        return Response.json({
          author_tenant_id: "b0000000-0000-4000-8000-000000000002",
          claim_id: "c0000000-0000-4000-8000-000000000001",
          created_at: "2026-08-12T10:00:00Z",
          current_value: "identity-platform",
          high_impact: true,
          high_impact_reasons: ["narrows_capability_surface"],
          owner_tenant_id: "b0000000-0000-4000-8000-000000000001",
          predicate: "owned_by_team",
          proposal_id: "proposal-open",
          proposed_value: "trust-engineering",
          state: "open",
          subject_entity_id: "e0000000-0000-4000-8000-000000000001",
          target_key: "owned_by_team",
          target_kind: "attribute",
          valid_from: "2026-08-12T09:00:00Z",
          valid_to: null,
        });
      }
      return Response.json(
        { errors: [{ code: "not_found", message: "not found", path: null }] },
        { status: 404 },
      );
    });

    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Proposal review" })).toBeVisible();
    const governanceNavigation = screen.getByRole("region", { name: "Governance" });
    expect(within(governanceNavigation).getByRole("link", { name: "Proposals" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(governanceNavigation).getByRole("link", { name: "Proposals" }),
    ).toHaveAccessibleName("Proposals");
    expect(within(governanceNavigation).queryByRole("link", { name: "Access" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to proposals" })).toHaveAttribute(
      "href",
      "/proposals?state=open",
    );
  });

  it("routes workspace detail through the shell and preserves browse state", async () => {
    const workspaceId = "c0000000-0000-4000-8000-000000000001";
    window.history.replaceState({}, "", `/workspaces/${workspaceId}?archived=include`);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Morgan Morris",
          actor_email: null,
          actor_id: "a0000000-0000-4000-8000-000000000001",
          roles: ["producer"],
          tenant_display_name: "Northstar Systems",
          tenant_id: "b0000000-0000-4000-8000-000000000001",
          tenant_slug: "northstar",
        });
      }
      if (path === `/v1/workspaces/${workspaceId}`) {
        return Response.json({
          created_at: "2026-08-12T10:00:00Z",
          description: "Track the identity migration decision.",
          name: "Identity migration",
          owner_actor_id: "a0000000-0000-4000-8000-000000000001",
          owner_kind: "actor",
          tenant_id: "b0000000-0000-4000-8000-000000000001",
          updated_at: "2026-08-12T11:00:00Z",
          workspace_id: workspaceId,
        });
      }
      if (path === `/v1/workspaces/${workspaceId}/entries`) {
        return Response.json({ items: [], next_cursor: null });
      }
      return Response.json(
        { errors: [{ code: "not_found", message: "not found", path: null }] },
        { status: 404 },
      );
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Identity migration" }),
    ).toBeVisible();
    const workNavigation = screen.getByRole("region", {
      name: "Work with context",
    });
    expect(within(workNavigation).getByRole("link", { name: "Workspaces" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Back to workspaces" })).toHaveAttribute(
      "href",
      "/workspaces?archived=include",
    );
  });
});
