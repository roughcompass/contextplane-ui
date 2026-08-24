import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { RevisionLifecyclePanel } from "./RevisionLifecyclePanel";

const REVISION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EVIDENCE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** What the evidence roster answers with, for the revoke picker to offer. */
const FILED_EVIDENCE = {
  created_at: "2026-08-22T09:00:00Z",
  detail: {},
  in_force: true,
  in_force_until: null,
  kind: "approval_evidence",
  object_id: EVIDENCE_ID,
  scope: "tenant",
  target_tenant_id: null,
};

function testClient() {
  const request = vi.fn(async (path: string) => {
    // The collection lists on GET and the item path revokes on POST. Keying on
    // the path alone would answer the roster read with a revocation response.
    if (path.startsWith("/v1/arc/admin/approval-evidence?")) return { items: [FILED_EVIDENCE] };
    if (path.includes("/approval-evidence") && path.includes("/revisions/")) {
      return { evidence_id: EVIDENCE_ID, revision_id: REVISION_ID, status: "attached" };
    }
    if (path.includes("/approval-evidence/")) {
      return { evidence_id: EVIDENCE_ID, revision_id: null, status: "revoked" };
    }
    if (path.endsWith("/revoke")) {
      return { evidence_id: null, revision_id: REVISION_ID, status: "revoked" };
    }
    if (path.endsWith("/invalidate")) {
      return { evidence_id: null, revision_id: REVISION_ID, status: "invalidated" };
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPanel(client: ContextplaneClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RevisionLifecyclePanel client={client} requestContext={{}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function fillEnding() {
  fireEvent.change(screen.getByLabelText("Revision", { selector: "#ending-revision" }), {
    target: { value: REVISION_ID },
  });
  fireEvent.change(screen.getByLabelText("Reason", { selector: "#ending-reason" }), {
    target: { value: "Superseded by revision 12." },
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/revisions");
});

describe("RevisionLifecyclePanel", () => {
  it("says neither ending can be undone, rather than sorting them by that", () => {
    /** The entry asks which is reversible. Neither is — both terminal, and
     * `test_a_revoked_revision_cannot_be_reactivated` holds it in the service.
     * A screen offering "the reversible one" would be offering a fiction. */
    renderPanel(testClient());

    expect(screen.getByText("Neither of these can be undone")).toBeVisible();
    expect(screen.getByText(/a revoked revision cannot be reactivated/u)).toBeVisible();
  });

  it("distinguishes them by what each says about the time the revision was in force", () => {
    /** Where they actually differ. Only invalidation reaches backwards. */
    renderPanel(testClient());

    expect(screen.getByText("The rule no longer applies")).toBeVisible();
    expect(screen.getByText(/Everything resolved while this revision was in force stands/u)).toBeVisible();

    expect(screen.getByText("The content was wrong")).toBeVisible();
    expect(screen.getByText(/every resolution made while this revision was active is now in question/u)).toBeVisible();
  });

  it("will not act until one of the two has been chosen", () => {
    /** The bodies are identical, so a default would be a silent choice between
     * two opposite statements. */
    renderPanel(testClient());
    fillEnding();

    expect(screen.getByRole("button", { name: "Revoke this revision" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: /The rule no longer applies/u }));
    expect(screen.getByRole("button", { name: "Revoke this revision" })).toBeEnabled();
  });

  it("sends a revocation to the revoke path", async () => {
    const client = testClient();
    renderPanel(client);
    fillEnding();
    fireEvent.click(screen.getByRole("radio", { name: /The rule no longer applies/u }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke this revision" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/admin/revisions/${REVISION_ID}/revoke`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("sends an invalidation to the invalidate path, with the same body", async () => {
    /** The path is the entire difference between these two acts. A test
     * asserting only the body would pass with them swapped. */
    const client = testClient();
    renderPanel(client);
    fillEnding();
    fireEvent.click(screen.getByRole("radio", { name: /The content was wrong/u }));
    fireEvent.click(screen.getByRole("button", { name: "Invalidate this revision" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/admin/revisions/${REVISION_ID}/invalidate`,
        expect.objectContaining({
          body: { reason: "Superseded by revision 12." },
          method: "POST",
        }),
      ),
    );
    expect(client.request).not.toHaveBeenCalledWith(
      `/v1/arc/admin/revisions/${REVISION_ID}/revoke`,
      expect.anything(),
    );
  });

  it("names the choice back before it is made", () => {
    renderPanel(testClient());
    fillEnding();
    fireEvent.click(screen.getByRole("radio", { name: /The content was wrong/u }));

    expect(
      screen.getByText(/everything decided under it is now in question/u),
    ).toBeVisible();
  });

  it("attaches evidence to the revision path", async () => {
    const client = testClient();
    renderPanel(client);
    fireEvent.change(screen.getByLabelText("Revision", { selector: "#attach-revision" }), {
      target: { value: REVISION_ID },
    });
    fireEvent.change(screen.getByLabelText("Evidence", { selector: "#attach-evidence" }), {
      target: { value: EVIDENCE_ID },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach this evidence" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/admin/revisions/${REVISION_ID}/approval-evidence`,
        expect.objectContaining({ body: { evidence_id: EVIDENCE_ID }, method: "POST" }),
      ),
    );
  });

  it("withdraws an approval keyed by the evidence, not by a revision", async () => {
    /** The evidence is the subject: one approval may be cited by more than one
     * revision, and withdrawing it is a statement about the approval. */
    const client = testClient();
    renderPanel(client);
    // Chosen from what is filed, not typed. An evidence id is minted by the
    // approval path and never shown to the person who later withdraws one.
    fireEvent.click(screen.getByRole("button", { name: "Evidence" }));
    fireEvent.click(await screen.findByRole("option", { name: new RegExp(EVIDENCE_ID, "u") }));
    fireEvent.change(screen.getByLabelText("Reason", { selector: "#revoke-evidence-reason" }), {
      target: { value: "Signed by a key since rotated." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Withdraw this approval" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/admin/approval-evidence/${EVIDENCE_ID}/revoke`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
