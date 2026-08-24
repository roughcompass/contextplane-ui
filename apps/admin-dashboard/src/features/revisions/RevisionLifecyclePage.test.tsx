import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import { RevisionLifecyclePage } from "./RevisionLifecyclePage";

const REVISION = {
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
  review_expires_at: null,
  revision_id: "r-1",
  revoked_at: null,
  source_revision_locator: null,
  source_system: null,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: 0 } },
  });
  const request = vi.fn(async (path: string) => {
    if (path.startsWith("/v1/arc/admin/revisions")) return { items: [REVISION], next_cursor: null };
    if (path.startsWith("/v1/arc/admin/approval-evidence")) return { items: [] };
    throw new Error(`Unexpected path: ${path}`);
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RevisionLifecyclePage
          activeTenantName="Northstar Systems"
          client={{
            request,
            requestWithEtag: async (path: string) => ({ etag: null, value: await request(path) }),
          }}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return request;
}

describe("RevisionLifecyclePage", () => {
  it("withholds both terminal acts until a revision is open", async () => {
    /** Neither act is undoable. Offering one beside an empty field invites
     * somebody to paste an identifier they have not looked at, which is exactly
     * the mistake neither can be undone from. */
    renderPage();

    expect(await screen.findByText("Choose a revision above")).toBeVisible();
    expect(screen.queryByText("The content was wrong")).toBeNull();
    expect(screen.queryByText("The rule no longer applies")).toBeNull();
  });

  it("offers the acts once a revision is chosen, against that revision", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Open" }));

    expect(screen.queryByText("Choose a revision above")).toBeNull();
    expect(screen.getByText("The content was wrong")).toBeVisible();
    expect(screen.getByText("The rule no longer applies")).toBeVisible();
    // Shown from the chosen revision rather than asked for. A text box here
    // would be a second way to name a choice already made, and the one way
    // somebody could name a different revision than the one they are looking at.
    expect(screen.getByTestId("ending-revision")).toHaveTextContent("r-1");
    expect(screen.getByTestId("attach-revision")).toHaveTextContent("deprecation-review");
    expect(screen.queryByRole("textbox", { name: "Revision" })).toBeNull();
  });

  it("keeps the argument about what each ending means", async () => {
    /** E22-T11's requirement, verbatim: the current screen states this well and
     * gives the reader nothing to state it about. The fix is context, not copy,
     * so the copy survives unchanged. */
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Open" }));

    expect(screen.getByText(/every resolution made while this revision was active/u)).toBeVisible();
    expect(
      screen.getByText(/Everything resolved while this revision was in force stands/u),
    ).toBeVisible();
  });
});
