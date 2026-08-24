import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { clientFromRequest } from "../../shared/api";
import { RevisionIndexPanel } from "./RevisionIndexPanel";

const ACTIVE = {
  activated_at: "2026-08-20T09:00:00Z",
  approval_evidence_id: "e-1",
  artifact_id: "a-1",
  artifact_kind: "policy",
  artifact_slug: "deprecation-review",
  content_digest: "sha256:aaa",
  created_at: "2026-08-19T09:00:00Z",
  effective_from: "2026-08-20T09:00:00Z",
  effective_until: null,
  has_approval_evidence: true,
  is_draft: false,
  is_terminal: false,
  lifecycle_state: "active",
  resolutions_under_revision: 42,
  review_expired: false,
  review_expires_at: "2027-08-20T09:00:00Z",
  revision_id: "r-1",
  revoked_at: null,
  source_revision_locator: null,
  source_system: null,
};

const DRAFT = {
  ...ACTIVE,
  approval_evidence_id: null,
  artifact_slug: "incident-retro",
  has_approval_evidence: false,
  is_draft: true,
  lifecycle_state: "draft",
  resolutions_under_revision: null,
  revision_id: "r-2",
};

function renderPanel(
  request: (path: string) => Promise<unknown>,
  onSelect: (revision: unknown) => void = vi.fn(),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RevisionIndexPanel
        client={clientFromRequest(request)}
        onSelect={onSelect}
        requestContext={{}}
        selectedRevisionId={null}
      />
    </QueryClientProvider>,
  );
}

describe("RevisionIndexPanel", () => {
  it("lists revisions by the artifact they belong to rather than by identifier", async () => {
    /** A UUID is not a thing a reader recognises, and this screen's two acts are
     * both irreversible. */
    renderPanel(async () => ({ items: [ACTIVE, DRAFT], next_cursor: null }));

    expect(await screen.findByText("deprecation-review")).toBeVisible();
    expect(screen.getByText("incident-retro")).toBeVisible();
  });

  it("shows how many resolutions rest on a revision", async () => {
    /** Invalidating says "everything decided under it is now in question". How
     * much that is, the service knows and the screen did not say — so somebody
     * was accepting a consequence of unstated size. */
    renderPanel(async () => ({ items: [ACTIVE], next_cursor: null }));

    expect(await screen.findByText("42")).toBeVisible();
  });

  it("says an uncounted revision is uncounted rather than showing zero", async () => {
    /** Rendering absent as `0` would tell a reader that invalidating this one
     * costs nothing, which is a stronger claim than the service made. */
    renderPanel(async () => ({ items: [DRAFT], next_cursor: null }));

    expect(await screen.findByText("Not counted")).toBeVisible();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("reports approval as the three facts the service gives, not as a verdict", async () => {
    /** Whether a revision may activate is ARC's decision, taken against rules
     * this dashboard does not hold. A verdict computed here would be a second
     * authority disagreeing with the first exactly when it matters. */
    const expired = { ...ACTIVE, review_expired: true, revision_id: "r-3" };
    renderPanel(async () => ({ items: [ACTIVE, DRAFT, expired], next_cursor: null }));

    expect(await screen.findByText("Filed")).toBeVisible();
    expect(screen.getByText("None filed")).toBeVisible();
    expect(screen.getByText("Filed, review expired")).toBeVisible();
    expect(screen.queryByText(/can be activated/iu)).toBeNull();
    expect(screen.queryByText(/eligible/iu)).toBeNull();
  });

  it("hands the whole revision to its caller rather than an identifier", async () => {
    /** The forms below need the revision, not its id: showing the reader what
     * they are about to end is the point of choosing it from a list. */
    const onSelect = vi.fn();
    renderPanel(async () => ({ items: [ACTIVE], next_cursor: null }), onSelect);

    fireEvent.click(await screen.findByRole("button", { name: "Open" }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ revision_id: "r-1" }));
  });

  it("filters at the service and drops the cursor when the filter changes", async () => {
    /** A cursor belongs to the previous filter's ordering; carrying it across
     * would page through a list the service never returned. */
    const paths: string[] = [];
    const request = vi.fn(async (path: string) => {
      paths.push(path);
      return { items: [ACTIVE], next_cursor: "opaque-next" };
    });
    renderPanel(request);

    await screen.findByText("deprecation-review");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(paths.some((path) => path.includes("cursor=opaque-next"))).toBe(true));

    fireEvent.click(screen.getByRole("combobox", { name: /Lifecycle state/u }));
    fireEvent.click(await screen.findByRole("option", { name: "Draft" }));

    await waitFor(() => {
      const latest = paths.at(-1) ?? "";
      expect(latest).toContain("lifecycle_state=draft");
      expect(latest).not.toContain("cursor=");
    });
  });

  it("returns the cursor unchanged rather than decoding it", async () => {
    const paths: string[] = [];
    const request = vi.fn(async (path: string) => {
      paths.push(path);
      return { items: [ACTIVE], next_cursor: "opaque/next+value" };
    });
    renderPanel(request);

    await screen.findByText("deprecation-review");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() =>
      expect(paths.at(-1)).toContain(`cursor=${encodeURIComponent("opaque/next+value")}`),
    );
  });

  it("says the list failed rather than reporting that no revision exists", async () => {
    /** A reader shown "no revisions" for a request that never arrived would
     * conclude none exist — and the two terminal acts are exactly the wrong
     * thing to reach for on that belief. */
    renderPanel(async () => {
      throw new Error("service unavailable");
    });

    expect(await screen.findByText(/Revisions could not be loaded/u)).toBeVisible();
    expect(screen.queryByText("Nothing here")).toBeNull();
  });

  it("says nothing matches when the service returned nothing", async () => {
    renderPanel(async () => ({ items: [], next_cursor: null }));

    expect(await screen.findByText("Nothing here")).toBeVisible();
  });
});
