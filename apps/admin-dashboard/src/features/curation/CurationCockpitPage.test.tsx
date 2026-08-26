import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** A queue whose rows offer every decision the service publishes. */
const DECIDABLE = {
  items: [
    { ...QUEUE.items[0], available_actions: ["confirm", "discard", "escalate"], reason: "contested" },
    { ...QUEUE.items[1], available_actions: ["link", "discard"], reason: "unlinked" },
  ],
  next_cursor: null,
};

/** Records every write, so a test can assert the request rather than the toast. */
function decidingClient(queue: unknown = DECIDABLE) {
  const writes: { body?: unknown; path: string }[] = [];
  const request = vi.fn(async (path: string, options?: { body?: unknown; method?: string }) => {
    if (options?.method === "POST") {
      writes.push({ body: options.body, path });
      if (path.startsWith("/v1/memory/curation-cases")) {
        return {
          case_id: "case-1",
          disposition: "confirm",
          predicate: "owned_by_team",
          status: "open",
          subject_reference: "svc/checkout",
        };
      }
      return null;
    }
    if (path.startsWith("/v1/memory/disposition-policies")) return POLICIES;
    if (path.startsWith("/v1/memory/curation-queue")) return queue;
    if (path.startsWith("/v1/capabilities")) {
      return {
        items: [
          {
            created_at: "2026-08-01T00:00:00Z",
            entity_id: "entity-checkout",
            entity_type: "capability",
            external_id: null,
            name: "checkout-service",
          },
        ],
        next_cursor: null,
      };
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  return { client: clientFromRequest(request), writes };
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

  // --- the queue can be worked, not only read ------------------------------

  it("confirms a claim from the row it is about", async () => {
    // The gap this covers: the page ranked a queue, published why each row was
    // there and listed what every disposition commits to — and had no action on
    // any row and no link off the page. A curator could see their whole queue
    // and could not touch it.
    const { client, writes } = decidingClient();
    renderPage(client);

    const row = await screen.findByRole("row", { name: /svc\/checkout/u });
    fireEvent.click(within(row).getByRole("button", { name: "Confirm this claim" }));

    // The consequence is stated before it is taken, not after.
    expect(
      within(row).getByText(/serves as asserted rather than observed/u),
    ).toBeVisible();
    fireEvent.click(
      within(row).getAllByRole("button", { name: "Confirm this claim" })[1]!,
    );

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ body: undefined, path: "/v1/memory/claims/claim-escalated:confirm" });
  });

  it("requires the reason the service requires, and says so before the click", async () => {
    const { client, writes } = decidingClient();
    renderPage(client);

    const row = await screen.findByRole("row", { name: /svc\/checkout/u });
    fireEvent.click(within(row).getByRole("button", { name: "Discard this claim" }));

    // Disabled *and* explained. DESIGN.md: a visible disabled action must say
    // what condition is missing.
    expect(within(row).getAllByRole("button", { name: "Discard this claim" })[1]!).toBeDisabled();
    expect(within(row).getByText(/Give a reason first/u)).toBeVisible();

    fireEvent.change(within(row).getByRole("textbox", { name: "Why it is being discarded" }), {
      target: { value: "Superseded by the owner's own record" },
    });
    fireEvent.click(within(row).getAllByRole("button", { name: "Discard this claim" })[1]!);

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      body: { reason: "Superseded by the owner's own record" },
      path: "/v1/memory/claims/claim-escalated:discard",
    });
  });

  it("links an unlinked claim to an entity chosen from the catalog", async () => {
    // ADR 0018, where it matters most: `link_subject` re-derives owner,
    // visibility and authority from the subject it resolves and refuses one it
    // cannot, so a text box would let a curator submit prose and read the
    // refusal afterwards.
    const { client, writes } = decidingClient();
    renderPage(client);

    const row = await screen.findByRole("row", { name: /svc\/ledger/u });
    fireEvent.click(within(row).getByRole("button", { name: "Link to a subject" }));

    expect(within(row).getAllByRole("button", { name: "Link to a subject" })[1]!).toBeDisabled();
    expect(within(row).getByText(/Choose the entity this claim is about/u)).toBeVisible();

    fireEvent.click(within(row).getByRole("button", { name: "Subject entity" }));
    fireEvent.click(await screen.findByRole("option", { name: /checkout-service/u }));
    fireEvent.click(within(row).getAllByRole("button", { name: "Link to a subject" })[1]!);

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      body: { subject_reference: "entity-checkout" },
      path: "/v1/memory/claims/claim-quiet:link",
    });
  });

  it("escalates by opening a case for the subject and predicate", async () => {
    const { client, writes } = decidingClient();
    renderPage(client);

    const row = await screen.findByRole("row", { name: /svc\/checkout/u });
    fireEvent.click(within(row).getByRole("button", { name: "Escalate for another approver" }));
    fireEvent.click(
      within(row).getAllByRole("button", { name: "Escalate for another approver" })[1]!,
    );

    await waitFor(() => expect(writes).toHaveLength(1));
    // Keyed by subject and predicate, not by claim: a contested claim is
    // contested *with* another about the same axis, and a case about one of them
    // would name half the disagreement.
    expect(writes[0]).toEqual({
      body: { predicate: "owned_by_team", subject_reference: "svc/checkout" },
      path: "/v1/memory/curation-cases",
    });
  });

  it("renders the actions the service published rather than deriving them from the reason", async () => {
    // Two rows, same page, different `reason` and different `available_actions`.
    // A screen that mapped reason to actions on this side would be a second copy
    // of a service judgement, wrong the first time a reason is added.
    const { client } = decidingClient();
    renderPage(client);

    const contested = await screen.findByRole("row", { name: /svc\/checkout/u });
    expect(within(contested).getByRole("button", { name: "Confirm this claim" })).toBeVisible();
    expect(within(contested).queryByRole("button", { name: "Link to a subject" })).toBeNull();

    const unlinked = screen.getByRole("row", { name: /svc\/ledger/u });
    expect(within(unlinked).getByRole("button", { name: "Link to a subject" })).toBeVisible();
    expect(within(unlinked).queryByRole("button", { name: "Confirm this claim" })).toBeNull();
  });

  it("names an action it cannot take rather than hiding it", async () => {
    // A curator who sees a decision they cannot take here knows to look
    // elsewhere; one who sees nothing concludes there is nothing.
    const { client } = decidingClient({
      items: [{ ...QUEUE.items[0], available_actions: ["confirm", "teleport"] }],
      next_cursor: null,
    });
    renderPage(client);

    const row = await screen.findByRole("row", { name: /svc\/checkout/u });
    expect(within(row).getByText(/also offers teleport on this row/u)).toBeVisible();
  });

  it("says a row has no decision rather than showing an empty cell", async () => {
    const { client } = decidingClient({
      items: [{ ...QUEUE.items[1], available_actions: [] }],
      next_cursor: null,
    });
    renderPage(client);

    const row = await screen.findByRole("row", { name: /svc\/ledger/u });
    expect(within(row).getByText(/offers no decision on this row/u)).toBeVisible();
  });
});
