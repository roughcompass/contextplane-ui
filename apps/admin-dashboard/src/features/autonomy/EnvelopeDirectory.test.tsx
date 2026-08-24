import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { clientFromRequest } from "../../shared/api";
import { EnvelopeDirectory } from "./EnvelopeDirectory";

function binding(overrides: Record<string, unknown> = {}) {
  return {
    artifact_id: "artifact-a",
    binding_id: "binding-a",
    effective_from: "2026-08-01T00:00:00Z",
    effective_to: null,
    is_in_force: true,
    principal_issuer: "https://idp.example.com",
    principal_subject: "agent-planner-7",
    revision_id: "revision-a",
    revision_lifecycle_state: "active",
    state: "active",
    suspended_at: null,
    suspension_reason: null,
    ...overrides,
  };
}

function renderDirectory(
  responder: (path: string) => unknown,
  onOpen: (principal: { issuer: string; subject: string }) => void = vi.fn(),
) {
  const client = clientFromRequest(vi.fn(async (path: string) => responder(path)));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <EnvelopeDirectory client={client} onOpen={onOpen} requestContext={{ tenantId: "tenant-a" }} />
    </QueryClientProvider>,
  );
  return client;
}

describe("EnvelopeDirectory", () => {
  it("names principals an operator could not have named themselves", async () => {
    /** The whole reason this exists. The lookup beside it needs an exact
     * (issuer, subject) pair, and the person reaching for the control during an
     * incident is usually the one who does not have it to hand. */
    renderDirectory(() => ({
      items: [binding(), binding({ binding_id: "binding-b", principal_subject: "agent-indexer" })],
      next_cursor: null,
    }));

    expect(await screen.findByText("agent-planner-7")).toBeVisible();
    expect(screen.getByText("agent-indexer")).toBeVisible();
  });

  it("keeps suspended and revoked bindings in the list", async () => {
    /** Filtering to what is in force would hide the agent somebody switched off
     * an hour ago — the one the next responder is looking for — and would
     * answer "never governed" where the truth is "yes, until Tuesday". */
    renderDirectory(() => ({
      items: [
        binding({ is_in_force: false, state: "suspended", suspended_at: "2026-08-19T00:00:00Z" }),
        binding({
          binding_id: "binding-b",
          effective_to: "2026-08-18T00:00:00Z",
          is_in_force: false,
          principal_subject: "agent-retired",
        }),
      ],
      next_cursor: null,
    }));

    expect(await screen.findByText("Suspended")).toBeVisible();
    expect(screen.getByText("Ended")).toBeVisible();
  });

  it("shows the revision's own lifecycle beside the binding's", async () => {
    /** A binding is only checked for an active revision when it is granted, so a
     * live envelope over a revoked document is real. A table showing only the
     * green badge would report governance that is not happening. */
    renderDirectory(() => ({
      items: [binding({ revision_lifecycle_state: "revoked" })],
      next_cursor: null,
    }));

    expect(await screen.findByText("In force")).toBeVisible();
    expect(screen.getByText("revoked")).toBeVisible();
  });

  it("hands the chosen principal to the operating surface", async () => {
    const onOpen = vi.fn();
    renderDirectory(() => ({ items: [binding()], next_cursor: null }), onOpen);

    fireEvent.click(await screen.findByRole("button", { name: /Open agent-planner-7/u }));

    expect(onOpen).toHaveBeenCalledWith({
      issuer: "https://idp.example.com",
      subject: "agent-planner-7",
    });
  });

  it("carries the cursor back untouched", async () => {
    /** It happens to encode a timestamp. Decoding, comparing or storing it is
     * how a client starts depending on an ordering nobody promised it. */
    const opaque = "MjAyNi0wOC0wMXwxMTE=";
    const client = renderDirectory((path) =>
      path.includes("cursor=")
        ? { items: [binding({ binding_id: "binding-b" })], next_cursor: null }
        : { items: [binding()], next_cursor: opaque },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Next page" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/admin/envelopes/bindings/directory?cursor=${encodeURIComponent(opaque)}&limit=25`,
        expect.objectContaining({ tenantId: "tenant-a" }),
      ),
    );
  });

  it("says the directory failed rather than showing nobody as governed", async () => {
    /** "No agents governed" and "no answer" are different facts, and only one of
     * them means nothing is holding anything back. */
    renderDirectory(() => {
      throw new Error("service unavailable");
    });

    expect(await screen.findByText("Directory unavailable")).toBeVisible();
    expect(screen.queryByText("Nobody is governed yet")).toBeNull();
  });

  it("says nobody is governed when nobody is", async () => {
    renderDirectory(() => ({ items: [], next_cursor: null }));

    expect(await screen.findByText("Nobody is governed yet")).toBeVisible();
  });
});
