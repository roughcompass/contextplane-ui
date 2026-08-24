import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { CurationCockpitPage } from "./CurationCockpitPage";

const POLICIES = {
  items: [
    {
      approval_authority: "curation_owner",
      disposition: "confirm",
      evidence_threshold: "one attributable source the owner accepts",
      rollback: "record a further disposition on a new case for the same axis",
      scope: "the contested claim only",
      supersession: "none: the counterpart claim is retained and stays visible",
      target_kind: null,
    },
    {
      approval_authority: "arc_approver",
      disposition: "propose_arc",
      evidence_threshold: "an attested source plus recorded human judgment",
      rollback: "revoke the activated revision",
      scope: "every agent that resolves the artifact",
      supersession: "a new revision activates; the previous revision is retained",
      target_kind: "arc_artifact",
    },
  ],
};

const QUEUE = {
  items: [
    {
      available_actions: ["link"],
      claim_id: "claim-escalated",
      confidence: 0.11,
      created_at: "2026-05-01T00:00:00Z",
      dependant_count: 12,
      escalated: true,
      human_backed: false,
      predicate: "owned_by_team",
      proposal_id: null,
      reason: "contested",
      sampling_priority: 0,
      subject_entity_id: null,
      subject_reference: "svc/checkout",
      value: "platform",
    },
    {
      available_actions: [],
      claim_id: "claim-quiet",
      confidence: 0.98,
      created_at: "2026-08-20T00:00:00Z",
      dependant_count: 0,
      escalated: false,
      human_backed: true,
      predicate: "runbook_for",
      proposal_id: null,
      reason: "unlinked",
      sampling_priority: 0,
      subject_entity_id: null,
      subject_reference: "svc/ledger",
      value: "restart",
    },
  ],
  next_cursor: null,
};

function testClient(overrides: Record<string, unknown> = {}) {
  const request = vi.fn(async (path: string) => {
    if (path.startsWith("/v1/memory/disposition-policies")) {
      return overrides.policies ?? POLICIES;
    }
    if (path.startsWith("/v1/memory/curation-queue")) {
      return overrides.queue ?? QUEUE;
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CurationCockpitPage
          activeTenantName="Northstar Systems"
          apiTenantId="tenant-a"
          client={client}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("CurationCockpitPage", () => {
  it("says what the order accounts for, and what it does not", async () => {
    // E5-T6's stated caution: a reviewer who believes a number accounts for cost
    // will defer to it. The ordering has three terms and none is a loss model,
    // so the screen has to say so where the queue is, not in a tooltip.
    renderPage(testClient());

    expect(
      await screen.findByText(/nothing here weighs what getting it wrong would cost/u),
    ).toBeVisible();
  });

  it("gives each row the reason the service ranked it there", async () => {
    renderPage(testClient());

    const escalated = await screen.findByRole("row", { name: /svc\/checkout/u });
    expect(within(escalated).getByText("Escalated")).toBeVisible();
    expect(within(escalated).getByText("Leverage 12")).toBeVisible();
    expect(within(escalated).getByText(/12 entities depend on this subject/u)).toBeVisible();
  });

  it("explains a row that nothing raised, rather than leaving the cell blank", async () => {
    renderPage(testClient());

    const quiet = await screen.findByRole("row", { name: /svc\/ledger/u });
    expect(within(quiet).getByText("Arrival order")).toBeVisible();
    // And it does not claim a leverage of zero as though that were a finding.
    expect(within(quiet).queryByText(/Leverage/u)).toBeNull();
  });

  it("shows a confidence and says it is not what ordered the row", async () => {
    // The adjacent misreading this screen has to defend against: a number beside
    // a position reads as the cause of the position. The higher-confidence claim
    // is second here precisely because confidence is not a rank term.
    renderPage(testClient());

    const quiet = await screen.findByRole("row", { name: /svc\/ledger/u });
    expect(within(quiet).getByText("0.98")).toBeVisible();
    expect(within(quiet).getAllByText("not ranked on").length).toBeGreaterThan(0);
  });

  it("shows every consequence the service publishes for a disposition", async () => {
    // All five dimensions. Dropping one would make two proposals look alike in
    // the place a reviewer decides between them.
    renderPage(testClient());

    expect(await screen.findByText("Propose arc")).toBeVisible();
    expect(screen.getByText("every agent that resolves the artifact")).toBeVisible();
    expect(screen.getByText("revoke the activated revision")).toBeVisible();
    expect(screen.getByText("an attested source plus recorded human judgment")).toBeVisible();
    expect(
      screen.getByText("a new revision activates; the previous revision is retained"),
    ).toBeVisible();
    expect(screen.getByText("arc_approver")).toBeVisible();
  });

  it("keeps the two kinds of decision apart, as the service ordered them", async () => {
    renderPage(testClient());

    expect(await screen.findByText("Decisions a curator makes")).toBeVisible();
    expect(screen.getByText("Decisions a curator proposes")).toBeVisible();
    expect(screen.getByText(/Proposes a arc artifact/u)).toBeVisible();
  });

  it("refuses to describe a decision when the service published no vocabulary", async () => {
    // Not an empty section. A screen that showed decision controls it could not
    // explain would be exactly the client-only governance gate the design
    // standard forbids.
    renderPage(testClient({ policies: { items: [] } }));

    expect(await screen.findByText("No disposition vocabulary")).toBeVisible();
    expect(
      screen.getByText(/taking one on trust is the thing it exists to prevent/u),
    ).toBeVisible();
  });

  it("says nothing was disposed when the queue could not be loaded", async () => {
    // A reviewer's next step after a failed load is not "act anyway". The
    // failure states what did not happen.
    const failing = clientFromRequest(
      vi.fn(async (path: string) => {
        if (path.startsWith("/v1/memory/disposition-policies")) return POLICIES;
        throw new Error("service unavailable");
      }),
    );
    renderPage(failing);

    expect(await screen.findByText(/do not act on a queue you could not load/u)).toBeVisible();
  });
});
