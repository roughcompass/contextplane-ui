import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import { ContextplaneApiError, type ContextplaneClient } from "../../shared/api";
import { ContextLabPage } from "./ContextLabPage";

const actorId = "a0000000-0000-4000-8000-000000000001";
const tenantId = "b0000000-0000-4000-8000-000000000001";
const receiptId = "c0000000-0000-4000-8000-000000000001";
const entityId = "d0000000-0000-4000-8000-000000000001";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: null,
  actor_id: actorId,
  roles: ["consumer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: tenantId,
  tenant_slug: "northstar",
};

const trust = {
  assertion_kind: "fact",
  attribution: null,
  authority: "tier-2-derived",
  classification: "internal",
  freshness: "2026-08-12T09:00:00Z",
  mutability: "mutable",
  source: "living-memory",
  trust: "observed",
};

const completeEnvelope = {
  arc_block_note: "No ARC receipt was supplied, so the ARC block is empty.",
  blocks: [
    {
      items: [
        {
          payload: {
            entity_id: entityId,
            entity_type: "capability",
            external_id: "identity-resolution",
            is_active: true,
            matching_facts: [
              {
                body: "Owned by Trust engineering",
                category: "ownership_stewardship",
                fact_id: "e0000000-0000-4000-8000-000000000001",
              },
            ],
            name: "Customer identity resolution",
            score: 0.91,
          },
          receipt_item_id: {
            block: "canonical",
            item_key: entityId,
            source: "catalog",
            value: "canonical-item-digest",
          },
          trust: null,
        },
      ],
      name: "canonical",
      reason: null,
      state: "success",
    },
    { items: [], name: "arc", reason: null, state: "empty" },
    {
      items: [
        {
          payload: {
            category: "interface_contract",
            citations: [{ kind: "session_event", ref: "event-1" }],
            claim_id: "f0000000-0000-4000-8000-000000000001",
            confidence: 0.72,
            human_confirmed: false,
            label: "Authentication scope is required",
            predicate: "requires_auth_scope",
            subject_entity_id: entityId,
            valid_from: "2026-08-01T09:00:00Z",
            valid_to: null,
            value: "identity:read",
          },
          receipt_item_id: {
            block: "observed_claims",
            item_key: "f0000000-0000-4000-8000-000000000001",
            source: "living-memory",
            value: "claim-item-digest",
          },
          trust,
        },
      ],
      name: "observed_claims",
      reason: null,
      state: "success",
    },
    {
      items: [
        {
          payload: {
            completed_checks: ["migration plan reviewed"],
            digest: "sha256:checkpoint",
            goal: "Finish identity migration",
            intent_id: "10000000-0000-4000-8000-000000000001",
            next_action: "Validate rollback plan",
            open_questions: ["Does the latency target hold?"],
          },
          receipt_item_id: {
            block: "workspace",
            item_key: "20000000-0000-4000-8000-000000000001",
            source: "workspace",
            value: "workspace-item-digest",
          },
          trust: { ...trust, assertion_kind: "annotation", trust: "asserted" },
        },
      ],
      name: "workspace",
      reason: null,
      state: "success",
    },
  ],
  quality: { cacheable: true, degraded_blocks: [], reasons: [] },
  receipt_id: receiptId,
  state: "complete",
};

const receipt = {
  cacheable: true,
  intent_id: null,
  receipt_id: receiptId,
  request_digest: "sha256:request",
  requested_by: actorId,
  resolved_at: "2026-08-12T10:00:00Z",
  state: "complete",
};

function testError(code = "network_error", status = 0) {
  return new ContextplaneApiError({
    errors: [{ code, message: "request failed", path: null }],
    requestId: "request-123",
    status,
  });
}

function defaultHandler(path: string, options?: { body?: unknown }): unknown {
  if (path === "/v1/whoami") return identity;
  if (path === "/v1/context/resolve") return completeEnvelope;
  if (path === `/v1/receipts/${receiptId}`) return receipt;
  if (path === `/v1/receipts/${receiptId}/exclusions`) {
    return {
      exclusions: [
        {
          block: "observed_claims",
          item_key: "claim-withheld",
          reason: "The lifecycle scope did not match this claim.",
        },
      ],
    };
  }
  if (path === `/v1/receipts/${receiptId}/references`) {
    return {
      references: [
        {
          classification: "internal",
          external_id: "build-42",
          kind: "build",
          source_namespace: "acme/platform",
          source_system: "control-plane",
        },
      ],
    };
  }
  if (path === "/v1/context/feedback") {
    const body = options?.body as { rating?: string; receipt_item_id?: string };
    return {
      content_digest: "sha256:feedback",
      created_at: "2026-08-12T10:05:00Z",
      feedback_id: "30000000-0000-4000-8000-000000000001",
      kind: "item_specific",
      learning_eligible: true,
      rating: body.rating,
      receipt_id: receiptId,
      receipt_item_id: body.receipt_item_id,
      replayed: false,
    };
  }
  throw testError("not_found", 404);
}

function renderPage(
  handler: (
    path: string,
    options?: { body?: unknown; method?: string; tenantId?: string },
  ) => unknown = defaultHandler,
) {
  const client = {
    request: vi.fn(async (path: string, options) => handler(path, options)),
  } satisfies ContextplaneClient;
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const searchRef = createRef<HTMLInputElement>();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );

  render(
    <ContextLabPage
      activeTenantName="Northstar Systems"
      apiTenantId={tenantId}
      client={client}
      searchRef={searchRef}
    />,
    { wrapper: Wrapper },
  );
  return { client, searchRef };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextLabPage", () => {
  it("orients the user, validates the prompt, and offers runnable examples", async () => {
    const { searchRef } = renderPage();

    expect(await screen.findByRole("heading", { level: 1, name: "Context Lab" })).toBeVisible();
    expect(screen.getByText("Evaluation workspace")).toBeVisible();
    expect(screen.getByText("See what the resolver would supply")).toBeVisible();
    expect(screen.getByText("Canonical catalog")).toBeVisible();
    expect(screen.getByText("Observed claims")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a prompt to resolve");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Which capability owns customer identity resolution?",
      }),
    );
    expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveValue(
      "Which capability owns customer identity resolution?",
    );
    await waitFor(() => expect(searchRef.current).toHaveFocus());
  });

  it("resolves scoped context, traces the receipt, and records item relevance", async () => {
    const { client } = renderPage();
    await screen.findByRole("heading", { level: 1, name: "Context Lab" });

    fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByText("Refine resolution scope"));
    fireEvent.change(screen.getByRole("textbox", { name: "Subject entity UUID" }), {
      target: { value: entityId },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace term" }), {
      target: { value: "identity migration" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Maximum items per source" }), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Evidence freshness" }), {
      target: { value: "86400" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Context returned for “Who owns identity resolution?”",
      }),
    ).toBeVisible();
    expect(screen.getAllByText("Customer identity resolution")[0]).toBeVisible();
    expect(screen.getAllByText("Authentication scope is required")[0]).toBeVisible();
    expect(screen.getAllByText("Finish identity migration")[0]).toBeVisible();
    expect(screen.getByText("3 of 4")).toBeVisible();
    expect(await screen.findByText("sha256:request")).toBeVisible();
    expect(screen.getByText("The lifecycle scope did not match this claim.")).toBeVisible();
    expect(screen.getByText(/control-plane\/acme\/platform\/build\/build-42/)).toBeVisible();

    expect(client.request).toHaveBeenCalledWith("/v1/context/resolve", {
      body: {
        limit: 50,
        max_age_s: 86400,
        query: "Who owns identity resolution?",
        subject_entity_id: entityId,
        workspace_term: "identity migration",
      },
      method: "POST",
      tenantId,
    });

    const canonicalItem = screen
      .getAllByText("Customer identity resolution")[0]!
      .closest("details");
    expect(canonicalItem).not.toBeNull();
    fireEvent.click(canonicalItem!.querySelector("summary")!);
    expect(within(canonicalItem!).getByText("Canonical source")).toBeVisible();
    expect(within(canonicalItem!).getByText("Receipt item digest")).toBeVisible();
    fireEvent.click(within(canonicalItem!).getByRole("button", { name: "Relevant" }));

    expect(await screen.findByText("Feedback recorded as Relevant.")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith("/v1/context/feedback", {
      body: expect.objectContaining({
        idempotency_key: expect.stringMatching(/^context-lab-/),
        kind: "item_specific",
        rating: "relevant",
        receipt_id: receiptId,
        receipt_item_id: "canonical-item-digest",
        reporter_id: actorId,
        reporter_type: "human",
      }),
      method: "POST",
      tenantId,
    });
  });

  it("keeps returned context visible and consolidates failed trace reads", async () => {
    const degraded = {
      ...completeEnvelope,
      blocks: completeEnvelope.blocks.map((block) =>
        block.name === "workspace"
          ? { ...block, items: [], reason: "workspace recall timed out", state: "failed" }
          : block,
      ),
      quality: {
        cacheable: false,
        degraded_blocks: ["workspace"],
        reasons: ["workspace recall timed out"],
      },
      state: "degraded",
    };
    const { client } = renderPage((path, options) => {
      if (path === "/v1/context/resolve") return degraded;
      if (path.endsWith("/exclusions") || path.endsWith("/references")) throw testError();
      return defaultHandler(path, options);
    });

    await screen.findByRole("heading", { level: 1, name: "Context Lab" });
    fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), {
      target: { value: "Trace deployment context" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    expect(await screen.findByText("This context is incomplete")).toBeVisible();
    expect(screen.getAllByText("Customer identity resolution")[0]).toBeVisible();
    expect(screen.getAllByText("workspace recall timed out")[0]).toBeVisible();
    expect(await screen.findAllByText("Some trace details are unavailable")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Retry trace" })).toHaveLength(1);
    expect(screen.getByText("sha256:request")).toBeVisible();

    const callsBeforeRetry = client.request.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Retry trace" }));
    await waitFor(() => expect(client.request.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
  });

  it("warns against relying on blocked envelopes and omits feedback for auditors", async () => {
    const blocked = {
      ...completeEnvelope,
      blocks: completeEnvelope.blocks.map((block) =>
        block.name === "canonical"
          ? { ...block, items: [], reason: "catalog unavailable", state: "failed" }
          : block,
      ),
      quality: {
        cacheable: false,
        degraded_blocks: ["canonical"],
        reasons: ["catalog unavailable"],
      },
      state: "blocked",
    };
    renderPage((path, options) => {
      if (path === "/v1/whoami") return { ...identity, roles: ["auditor"] };
      if (path === "/v1/context/resolve") return blocked;
      return defaultHandler(path, options);
    });

    await screen.findByRole("heading", { level: 1, name: "Context Lab" });
    fireEvent.change(screen.getByRole("textbox", { name: "Prompt" }), {
      target: { value: "Trace identity context" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    expect(await screen.findByText("Do not rely on this context")).toBeVisible();
    const observedItem = screen
      .getAllByText("Authentication scope is required")[0]!
      .closest("details");
    expect(observedItem).not.toBeNull();
    fireEvent.click(observedItem!.querySelector("summary")!);
    expect(
      within(observedItem!).getByText(
        "This actor can inspect evaluation state but cannot write context feedback.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Relevant" })).toBeNull();
  });

  it("shows identity failures without exposing an unusable prompt form", async () => {
    renderPage((path) => {
      if (path === "/v1/whoami") throw testError("unauthenticated", 401);
      return defaultHandler(path);
    });

    expect(
      await screen.findByText("Connect an authenticated DE Context Plane session"),
    ).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Prompt" })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry request" })).toBeVisible();
  });
});
