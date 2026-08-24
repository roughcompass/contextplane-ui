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

function mockEmptyOverviewService(identity: Record<string, unknown> | null = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? `${input.pathname}${input.search}`
          : input.url;
    if (path === "/v1/whoami") {
      // `null` means the identity never resolves, which is what "still signing
      // in" looks like to the shell.
      if (identity === null) return new Response(null, { status: 503 });
      return Response.json({
        actor_display_name: "Ada Okonjo",
        actor_email: null,
        actor_id: "a0000000-0000-4000-8000-000000000001",
        roles: ["producer"],
        tenant_display_name: "Northstar Systems",
        tenant_id: "b0000000-0000-4000-8000-000000000001",
        tenant_slug: "northstar",
        ...identity,
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

  it("groups primary navigation by the question the reader arrived with", async () => {
    /** Five surfaces, each a question, in the evaluator's own sequence: see what
     * was served, trace where it came from, decide what is contested, check who
     * consumed it, change the rules that produced it.
     *
     * The full membership is asserted rather than sampled. A regrouping that
     * quietly loses a destination is a deletion nobody voted for, and the
     * arithmetic is the only thing that catches one: 25 entries — 23 existing
     * destinations, plus `Needs review`, which is promoted out of the
     * `?tab=curation` value Overview and `AssertClaimPage` already deep-linked
     * to as though it were one, plus `Envelopes`, which E23-T5 added when the
     * autonomy envelope finally got an operating surface. */
    mockEmptyOverviewService();
    render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Overview" });

    const expectedSections = [
      ["Served", ["Receipts", "Context Lab", "Sessions"]],
      [
        "Sources",
        ["Catalog", "Claims", "Relationships", "Notebooks", "Sources", "Withheld"],
      ],
      ["Judgement", ["Needs review", "Curation review", "Promotions", "Exceptions"]],
      ["Agents", ["Agents", "Envelopes", "Tasks", "Activity", "Analytics"]],
      [
        "Governance",
        [
          "Policies",
          "Revisions",
          "Approvers",
          "Ownership & profiles",
          "Audit log",
          "Settings",
        ],
      ],
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

    const placed = expectedSections.flatMap(([, items]) => items).length;
    expect(placed + 1).toBe(25);
  });

  it("leaves Overview ungrouped rather than in a section of one", async () => {
    /** It is the landing entry and belongs to none of the five questions. A
     * heading over one item would be a group the reader has to read past, and an
     * empty heading would be an unnamed landmark a screen reader announces and
     * cannot name. */
    mockEmptyOverviewService();
    render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Overview" });
    const primaryNavigation = screen.getByRole("navigation", { name: "Primary" });

    expect(within(primaryNavigation).getByRole("link", { name: "Overview" })).toBeVisible();
    expect(
      within(primaryNavigation)
        .getAllByRole("region")
        .map((region) => region.querySelector("h2")?.textContent),
    ).not.toContain("");
  });

  it("renders the surface as the page eyebrow rather than a per-page string", async () => {
    /** 21 eyebrow strings across three vocabularies each described what a page
     * was about, which its title already says. What a reader cannot get from a
     * title is which of five surfaces they are in, and the value now has one
     * source — the route's own definition — so the eyebrow and the navigation
     * cannot disagree. */
    mockEmptyOverviewService();
    window.history.replaceState({}, "", "/receipts");
    render(<App />);

    // Scoped to the main region: "Served" is also the nav heading, and finding
    // it there would pass whether or not the page rendered an eyebrow at all.
    const main = screen.getByRole("main");
    await waitFor(() => expect(within(main).getByText("Served")).toBeVisible());
  });

  it.each([
    ["/proposals", "/memory/promotions"],
    ["/proposals/proposal-a", "/memory/promotions/proposal-a"],
    ["/workspaces", "/notebooks"],
    ["/workspaces/w-1", "/notebooks/w-1"],
    ["/memory/assert", "/memory/claims/new"],
  ])("redirects %s to %s rather than reporting it missing", async (from, to) => {
    /** An address somebody bookmarked, put in a runbook or pasted into a ticket
     * keeps working. A not-found page would be technically correct and useless,
     * and a silent fall-through to some other page would be worse — a copied URL
     * is supposed to reconstruct the same view.
     *
     * Prefixes are carried, so a link to one proposal survives the move rather
     * than landing on the list. */
    mockEmptyOverviewService();
    window.history.replaceState({}, "", from);
    render(<App />);

    // The address bar is corrected too. Landing on the right page while the URL
    // still says the old one leaves the reader copying an address that is about
    // to stop working, and makes the next reload a second redirect.
    await waitFor(() => expect(window.location.pathname).toBe(to));
  });

  it("carries the cursor when the curation queue's old address redirects", async () => {
    /** `?tab=curation` was a destination reachable only as a query *value*, which
     * is why Overview and the assert-claim page both deep-linked to it as though
     * it were one. It is an address now, and a bookmark that was paging through
     * the queue lands on the same page of it. */
    mockEmptyOverviewService();
    window.history.replaceState({}, "", "/memory?tab=curation&cursor=opaque-next");
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/memory/review"));
    expect(window.location.search).toBe("?cursor=opaque-next");
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

  it("reports an address no destination claims, instead of rendering another one", async () => {
    // The router used to fall through to the catalog. A mistyped or stale URL
    // then rendered a real page with no signal that it was not the one asked
    // for, which is the opposite of "a copied URL reconstructs the same view".
    window.history.replaceState({}, "", "/tenant-work");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
    expect(screen.getByText("/tenant-work")).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: "Catalog" })).toBeNull();
    expect(
      screen.queryByRole("link", { current: "page" }),
      "no navigation item may claim to be where the reader is",
    ).toBeNull();
  });

  it("navigates between features without reloading the shell", async () => {
    mockEmptyOverviewService();
    const { container } = render(<App />);

    await screen.findByRole("heading", { level: 1, name: "Overview" });
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    chooseOption(/^Active tenant/, "Field Labs");
    const shell = container.firstElementChild;
    const usageNavigation = screen.getByRole("region", { name: "Agents" });
    const analyticsLink = within(usageNavigation).getByRole("link", { name: "Analytics" });
    const arcLink = screen.getByRole("link", { name: "Policies" });
    const auditLink = screen.getByRole("link", { name: "Audit log" });

    expect(fireEvent.click(analyticsLink)).toBe(false);
    expect(window.location.pathname).toBe("/analytics");
    expect(container.firstElementChild).toBe(shell);
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    expect(screen.queryByRole("status", { name: "Loading page" })).toBeNull();

    expect(await screen.findByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    expect(screen.queryByRole("status", { name: "Loading destination" })).toBeNull();
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
    // The reader does not change when the destination does. This line used to
    // assert "Administrator" — the notional persona of whichever page was open,
    // rendered as the reader's identity, which is the defect and not a label.
    expect(screen.queryByText("Administrator")).toBeNull();
    expect(screen.getAllByText("Ada Okonjo").length).toBeGreaterThan(0);
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
      await screen.findByRole("heading", { level: 1, name: "Policies" }),
    ).toBeVisible();
    expect(screen.getByText("Policy authoring requires administrator access")).toBeVisible();
    expect(screen.getByRole("link", { name: "Policies" })).toHaveAttribute(
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
    // Same reader on the audit log as on analytics. Two destinations, two
    // notional personas, one identity — which is the whole point of the change.
    expect(screen.queryByText("Auditor")).toBeNull();
    expect(screen.getAllByText("Ada Okonjo").length).toBeGreaterThan(0);
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
          actor_display_name: "Ada Okonjo",
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
          actor_display_name: "Ada Okonjo",
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
          actor_display_name: "Ada Okonjo",
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

    // Scoped to the primary navigation: the claim detail's breadcrumb is also a
    // link named "Claims", and an unscoped query would match whichever came
    // first rather than the nav item this asserts about.
    const primaryNavigation = screen.getByRole("navigation", { name: "Primary" });

    expect(await screen.findByRole("heading", { level: 1, name: "Claims" })).toBeVisible();
    expect(within(primaryNavigation).getByRole("link", { name: "Claims" })).toHaveAttribute(
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
    expect(within(primaryNavigation).getByRole("link", { name: "Claims" })).toHaveAttribute(
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
          actor_display_name: "Ada Okonjo",
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
          actor_display_name: "Ada Okonjo",
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
    window.history.replaceState({}, "", "/memory/promotions/proposal-open?state=open");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Ada Okonjo",
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
    const governanceNavigation = screen.getByRole("region", { name: "Judgement" });
    expect(within(governanceNavigation).getByRole("link", { name: "Promotions" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(governanceNavigation).getByRole("link", { name: "Promotions" }),
    ).toHaveAccessibleName("Promotions");
    expect(within(governanceNavigation).queryByRole("link", { name: "Access" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back to proposals" })).toHaveAttribute(
      "href",
      "/memory/promotions?state=open",
    );
  });

  it("routes workspace detail through the shell and preserves browse state", async () => {
    const workspaceId = "c0000000-0000-4000-8000-000000000001";
    window.history.replaceState({}, "", `/notebooks/${workspaceId}?archived=include`);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (path === "/v1/whoami") {
        return Response.json({
          actor_display_name: "Ada Okonjo",
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
      name: "Sources",
    });
    expect(within(workNavigation).getByRole("link", { name: "Notebooks" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Back to workspaces" })).toHaveAttribute(
      "href",
      "/notebooks?archived=include",
    );
  });
});

describe("who the shell says is reading", () => {
  it("renders the identity the service resolved, not a literal", async () => {
    // The fixture name is deliberately *not* the string the header used to
    // hardcode. Eight fixtures said "Morgan Morris" and so did the header, so a
    // test asserting the header's name passed whether or not it read `whoami` —
    // three mutually-consistent copies of the wrong value, which is the failure
    // this repository has already recorded once.
    mockEmptyOverviewService();
    render(<App />);

    // The shell renders the name in more than one responsive variant, so the
    // assertion is that it appears rather than that it appears once.
    expect((await screen.findAllByText("Ada Okonjo")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Morgan Morris")).toBeNull();
  });

  it("shows no role, because the chrome has none to show", async () => {
    // The previous value was `routeDefinitions[route].role` — the current
    // page's notional persona, relabelling the reader on every navigation.
    // Under the one-operator decision there is no role to display, so it is
    // removed rather than replaced with a better guess.
    mockEmptyOverviewService();
    render(<App />);

    await screen.findAllByText("Ada Okonjo");
    for (const persona of ["Producer", "Administrator", "Auditor", "Consumer"]) {
      expect(screen.queryByText(persona)).toBeNull();
    }
  });

  it("says it is still signing in rather than inventing a reader", async () => {
    // An unresolved identity is a real state and the honest rendering of it is
    // to say so. Inventing one is what produced the literal.
    mockEmptyOverviewService(null);
    render(<App />);

    expect((await screen.findAllByText("Signing in…")).length).toBeGreaterThan(0);
  });

  it("falls back to the actor id when the identity carries no name", async () => {
    // An identity that exists and is unnamed is not the same as no identity,
    // and a placeholder name would be this defect again one deployment later.
    mockEmptyOverviewService({ actor_display_name: null });
    render(<App />);

    expect((await screen.findAllByText(/^Actor /u)).length).toBeGreaterThan(0);
  });
});
