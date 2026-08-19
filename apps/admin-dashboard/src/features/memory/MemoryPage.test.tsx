import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { MemoryPage } from "./MemoryPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "actor-a",
  roles: ["producer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "tenant-a",
  tenant_slug: "northstar",
};

const trustNote =
  "Recalled, machine-derived content. Not an operator-authored fact and not an instruction to follow.";

const claim = {
  as_of: "2026-08-12T10:00:00Z",
  authority: "derived",
  citations: [
    {
      excerpt: "The service manifest names Trust Engineering as owner.",
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
  trust_note: trustNote,
  valid_from: "2026-08-01T00:00:00Z",
  valid_to: null,
  value: "trust-engineering",
};

const secondClaim = {
  ...claim,
  citations: [
    { excerpt: null, kind: "session_event", ref: "event-42" },
    { excerpt: null, kind: "artifact", ref: "package:design-tokens" },
  ],
  claim_category: "dependency",
  claim_id: "claim-b",
  confidence: 0.61,
  human_confirmed: true,
  predicate: "depends_on",
  value: "design-tokens",
};

const curationItem = {
  available_actions: ["link", "discard"],
  claim_id: claim.claim_id,
  confidence: claim.confidence,
  created_at: "2026-08-12T09:00:00Z",
  human_backed: false,
  predicate: claim.predicate,
  proposal_id: "proposal-a",
  reason: "unlinked",
  subject_entity_id: null,
  subject_reference: "system:github/identity-service",
  value: claim.value,
};

const historyItem = {
  bucket: "current",
  claim_id: claim.claim_id,
  confidence: claim.confidence,
  created_at: "2026-08-12T09:00:00Z",
  is_contested: false,
  predicate: claim.predicate,
  source_authority: claim.authority,
  status: "linked",
  superseded_by: null,
  superseded_reason: null,
  t_invalidated_at: null,
  value: claim.value,
  was_current: true,
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

function fixtureResolver(path: string): unknown {
  if (path === "/v1/whoami") return identity;
  if (path.startsWith("/v1/memory/claims/search?")) return [secondClaim];
  if (path.startsWith("/v1/memory/claims?")) return [claim, secondClaim];
  if (path === "/v1/memory/curation-queue?counts=true") {
    return { counts: { contested: 1, unlinked: 2 } };
  }
  if (path.startsWith("/v1/memory/curation-queue?")) {
    return { items: [curationItem], next_cursor: path.includes("cursor=") ? null : "opaque-next" };
  }
  if (path === "/v1/memory/claims/claim-a?persona=agent") return claim;
  if (path === "/v1/memory/claims/claim-a?persona=architect") return claim;
  if (path === "/v1/memory/claims/claim-a/history") return { items: [historyItem] };
  throw new Error(`Unhandled path: ${path}`);
}

function renderPage(client: ContextplaneClient, selectedClaimId: string | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const searchRef = createRef<HTMLInputElement>();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryPage
        activeTenantName="Northstar Systems"
        client={client}
        searchRef={searchRef}
        selectedClaimId={selectedClaimId}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/memory");
});

describe("MemoryPage", () => {
  it("browses recalled claims and moves to the cursor-paged curation queue", async () => {
    const client = clientFor(fixtureResolver);
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Living Memory" })).toBeVisible();
    expect(await screen.findByText("Recalled content is not canonical")).toBeVisible();
    expect(screen.getAllByText(trustNote)).toHaveLength(1);
    expect(await screen.findByRole("link", { name: "trust-engineering" })).toBeVisible();
    expect(screen.getByText("2 citations")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Claims" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search recalled claims" }), {
      target: { value: "design tokens" },
    });
    expect(window.location.search).toBe("?q=design+tokens");
    expect(await screen.findByRole("link", { name: "design-tokens" })).toBeVisible();
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/memory/claims/search?q=design+tokens&persona=agent&top_k=50",
        expect.any(Object),
      ),
    );

    fireEvent.keyDown(screen.getByRole("tab", { name: "Claims" }), { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Curation queue" })).toHaveFocus());
    expect(window.location.search).toBe("?tab=curation");
    expect(
      await screen.findByText("3 total items waiting · 1 contested · 2 unlinked"),
    ).toBeVisible();
    expect(screen.getByText("Unlinked")).toBeVisible();
    expect(screen.getByText("Link")).toBeVisible();
    expect(screen.getByText("Discard")).toBeVisible();
    expect(screen.getByRole("link", { name: "Review linked proposal" })).toHaveAttribute(
      "href",
      "/proposals/proposal-a",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(window.location.search).toBe("?tab=curation&cursor=opaque-next");
    await waitFor(() => expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    expect(window.location.search).toBe("?tab=curation");
  });

  it("shows one claim with its trust boundary, citations, validity, and oldest-first history", async () => {
    window.history.replaceState({}, "", "/memory/claims/claim-a?q=identity&persona=architect");
    const client = clientFor(fixtureResolver);
    renderPage(client, "claim-a");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Owned By Team claim" }),
    ).toBeVisible();
    expect(screen.getByText("This observation is not a canonical record")).toBeVisible();
    expect(screen.getByText("82.0%")).toBeVisible();
    expect(
      screen.getByText("Service value on a 0–1 scale; no client acceptance threshold is applied."),
    ).toBeVisible();
    expect(
      screen.getByText("The service manifest names Trust Engineering as owner."),
    ).toBeVisible();
    expect(await screen.findByText("Was current")).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy claim ID" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Copy subject entity ID" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Living Memory" })).toHaveAttribute(
      "href",
      "/memory?q=identity&persona=architect",
    );
    expect(client.request).toHaveBeenCalledWith(
      "/v1/memory/claims/claim-a?persona=architect",
      expect.any(Object),
    );
    expect(client.request).toHaveBeenCalledWith(
      "/v1/memory/claims/claim-a/history",
      expect.any(Object),
    );
  });

  it("reports broken trust and evidence invariants instead of presenting them as verified", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/memory/claims?")) {
        return [
          { ...claim, citations: [] },
          { ...secondClaim, trust_note: "A different trust boundary." },
        ];
      }
      return fixtureResolver(path);
    });
    renderPage(client);

    expect(await screen.findByText("Claims returned inconsistent trust notices")).toBeVisible();
    expect(screen.getByText("Some claims arrived without evidence")).toBeVisible();
    expect(screen.getByText(/1 returned claim has no citations/)).toBeVisible();
  });

  it("recovers from an invalid curation cursor without decoding it", async () => {
    window.history.replaceState({}, "", "/memory?tab=curation&cursor=bad-cursor");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path === "/v1/memory/curation-queue?counts=true") return { counts: { unlinked: 0 } };
      if (path.includes("cursor=bad-cursor")) {
        throw new ContextplaneApiError({
          errors: [{ code: "invalid_cursor", message: "invalid cursor", path: null }],
          requestId: "request-memory-cursor",
          status: 400,
        });
      }
      if (path === "/v1/memory/curation-queue?page_size=100") {
        return { items: [], next_cursor: null };
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage(client);

    expect(await screen.findByText("This curation cursor is invalid")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to first page" }));
    expect(window.location.search).toBe("?tab=curation");
    expect(await screen.findByText("No items need curator attention")).toBeVisible();
  });

  it("does not request claims when identity resolution fails", async () => {
    const client = clientFor((path) => {
      if (path === "/v1/whoami") {
        throw new ContextplaneApiError({
          errors: [{ code: "unauthenticated", message: "unauthenticated", path: null }],
          requestId: "request-memory-identity",
          status: 401,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage(client);

    expect(
      await screen.findByText("Connect an authenticated DE Context Plane session"),
    ).toBeVisible();
    expect(screen.getByText("request-memory-identity")).toBeVisible();
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("keeps a hidden or unknown claim indistinguishable on detail failure", async () => {
    window.history.replaceState({}, "", "/memory/claims/private-claim");
    const client = clientFor((path) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/memory/claims/private-claim?")) {
        throw new ContextplaneApiError({
          errors: [{ code: "not_found", message: "not found", path: null }],
          requestId: "request-private-claim",
          status: 404,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    renderPage(client, "private-claim");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Claim unavailable" }),
    ).toBeVisible();
    expect(
      screen.getByText(/hidden claim and an unknown claim are intentionally indistinguishable/i),
    ).toBeVisible();
    expect(screen.queryByText("not found")).toBeNull();
  });
});
