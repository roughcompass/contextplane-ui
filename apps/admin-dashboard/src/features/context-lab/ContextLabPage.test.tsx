import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import { ContextplaneApiError, clientFromRequest } from "../../shared/api";
import { ContextLabPage } from "./ContextLabPage";

function chooseOption(controlName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: new RegExp(`^${controlName}`) }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

const actorId = "a0000000-0000-4000-8000-000000000001";
const tenantId = "b0000000-0000-4000-8000-000000000001";
const receiptId = "c0000000-0000-4000-8000-000000000001";
const entityId = "d0000000-0000-4000-8000-000000000001";
const agentActorId = "e1000000-0000-4000-8000-000000000001";
const undeclaredActorId = "e1000000-0000-4000-8000-000000000002";
const simulationId = "f0000000-0000-4000-8000-000000000001";

const simulationBody = {
  answer: "Drain it through the runbook.",
  assertions: [
    {
      citations: [{ receipt_item_id: "served-1", was_served: true }],
      position: 0,
      text: "The runbook drains the queue.",
    },
    { citations: [], position: 1, text: "It takes four minutes." },
  ],
  created_at: "2026-08-12T10:10:00Z",
  duration_ms: 900,
  envelope_state: "complete",
  instruction_disposition: "not_declared",
  model_id: "claude-sonnet-5",
  prompt: "Who owns identity resolution?",
  provider_id: "anthropic",
  receipt_id: receiptId,
  run_item_id: null,
  simulated_actor_id: agentActorId,
  simulation_id: simulationId,
  uncited_served_ids: ["served-2"],
  usage: {
    cached_prompt_tokens: 0,
    completion_tokens: 40,
    prompt_tokens: 220,
    served_item_count: 2,
    source: "provider_reported",
  },
};

const judgementBody = {
  confidence: 0.72,
  confidence_is_calibrated: false,
  created_at: "2026-08-12T10:11:00Z",
  criterion: "groundedness",
  evidence: ["the runbook drains it"],
  is_disputed: false,
  judge_model_id: "gpt-judge-2026",
  judge_provider_id: "openai",
  judgement_id: "f1000000-0000-4000-8000-000000000001",
  panel_position: 0,
  prompt_template_hash: "a".repeat(64),
  reasoning: "The first assertion cites served-1, which supports it. The second cites nothing.",
  reviews: [],
  rubric_version: "agent-response-judge v1.0.0",
  simulation_id: simulationId,
  verdict: "fail",
};

const scoreBody = {
  blocks: [],
  prompt_id: null,
  rubric_version: "context-envelope-judge v2.0.0",
  unassertable:
    "this simulation was run interactively and belongs to no prompt, so nothing was declared in advance to score it against.",
};

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
            fused_rank_score: 0.91,
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
    { items: [], name: "instructions", reason: null, state: "empty" },
  ],
  instruction_block_note:
    "the instructions block is empty because the request declared no instruction set",
  instruction_disposition: "not_declared",
  quality: { cacheable: true, degraded_blocks: [], reasons: [] },
  receipt_id: receiptId,
  state: "complete",
};

const receipt = {
  cacheable: true,
  exclusion_count: 1,
  hydration_state: "hydrated",
  intent_id: null,
  item_count: 2,
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
  // The two collections the scope pickers read. Both existed before this screen
  // called them — the catalog since the beginning, the receipt listing since
  // E23-T1.
  if (path.startsWith("/v1/capabilities")) {
    return {
      items: [
        {
          created_at: "2026-08-01T00:00:00Z",
          entity_id: entityId,
          entity_type: "capability",
          external_id: null,
          name: "identity-resolution",
        },
      ],
      next_cursor: null,
    };
  }
  if (path.startsWith("/v1/receipts?") || path === "/v1/receipts") {
    return { items: [], next_before: null };
  }
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
  if (path === "/v1/evaluation/simulations/availability") {
    return {
      available: true,
      judge_model: "gpt-judge",
      judge_provider: "openai",
      simulation_model: "",
      simulation_provider: "anthropic",
    };
  }
  if (path.startsWith("/v1/admin/actors")) {
    return {
      items: [
        {
          actor_id: agentActorId,
          actor_kind: "agent",
          created_at: "2026-08-01T00:00:00Z",
          declared_at: "2026-08-01T00:00:00Z",
          declared_by: actorId,
          display_name: "Support triage agent",
          is_declared: true,
          oidc_subject: "agent-alpha",
          owner_principal: "platform@example.com",
        },
        {
          actor_id: undeclaredActorId,
          actor_kind: "unknown",
          created_at: "2026-08-01T00:00:00Z",
          declared_at: null,
          declared_by: null,
          display_name: "Nobody declared this",
          is_declared: false,
          oidc_subject: "mystery",
          owner_principal: null,
        },
      ],
      next_cursor: null,
    };
  }
  if (path === "/v1/evaluation/simulations") return simulationBody;
  if (path === `/v1/evaluation/simulations/${simulationId}/judgements`) {
    return { items: [judgementBody] };
  }
  if (path === `/v1/evaluation/simulations/${simulationId}/score`) return scoreBody;
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

function renderPageWithSpy(
  handler: (
    path: string,
    options?: { body?: unknown; method?: string; tenantId?: string },
  ) => unknown = defaultHandler,
) {
  const request = vi.fn(async (path: string, options) => handler(path, options));
  const client = clientFromRequest(request);
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
  return { request };
}

function renderPage(
  handler: (
    path: string,
    options?: { body?: unknown; method?: string; tenantId?: string },
  ) => unknown = defaultHandler,
) {
  const client = clientFromRequest(vi.fn(async (path: string, options) => handler(path, options)));
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
    // Chosen from the catalog rather than typed: a reader asking what context an
    // agent would get about an entity is looking the entity up.
    fireEvent.click(screen.getByRole("button", { name: "Subject entity" }));
    fireEvent.click(await screen.findByRole("option", { name: /identity-resolution/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "Workspace term" }), {
      target: { value: "identity migration" },
    });
    chooseOption("Maximum items per source", "50 items");
    chooseOption("Evidence freshness", "Past day");
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
    // The denominator counts the envelope's blocks rather than restating a
    // number. It read "3 of 4" for a release after the service began returning
    // five, and this assertion is what held it there — the fixture below returns
    // five blocks, so a hardcoded "4" is now a failure rather than a passing
    // description of something untrue.
    expect(screen.getByText("3 of 5")).toBeVisible();
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
  it("keeps the resolver's own boundary on the screen once a simulation is possible", async () => {
    renderPage();

    // Amended rather than deleted. A reader who has just watched a response
    // appear is exactly the reader who needs to know which component did not
    // produce it.
    expect(
      await screen.findByText(/The resolver retrieves context only/),
    ).toBeVisible();
    expect(screen.getByText(/simulation is a separate receipted operation/)).toBeVisible();
  });

  it("lists undeclared principals rather than filtering them out", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));

    expect(await screen.findByRole("option", { name: /Support triage agent/ })).toBeVisible();
    // ADR 0019's dissent, on screen: a roster that hid what it does not know
    // would answer "we have no agents" to a deployment that has eleven.
    expect(screen.getByRole("option", { name: /Nobody declared this/ })).toBeVisible();
    expect(screen.getByText(/simulating it is refused/)).toBeVisible();
  });

  it("runs a simulation and shows what each assertion rested on", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    expect(await screen.findByText("Drain it through the runbook.")).toBeVisible();
    expect(screen.getByText("The runbook drains the queue.")).toBeVisible();
    // An assertion citing nothing keeps its row and says so: dropping it would
    // delete the finding.
    expect(screen.getByText(/Rests on nothing that was served/)).toBeVisible();
    expect(screen.getByText(/220 in · 40 out/)).toBeVisible();
  });

  it("shows all three instruction states rather than two", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    expect(await screen.findByText("No instructions declared")).toBeVisible();
    expect(
      screen.getByText(/Send one to receive governed corrections/),
    ).toBeVisible();
  });

  it("renders the score pane with all five criteria and marks the unfitted judge unproven", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    expect(await screen.findByText("Required-fact recall")).toBeVisible();
    expect(screen.getByText("Boundary violations")).toBeVisible();
    expect(screen.getByText("Precision")).toBeVisible();
    expect(screen.getByText("Groundedness")).toBeVisible();
    expect(screen.getByText("Answer relevance")).toBeVisible();

    // ADR 0026's corollary: an unexamined number must not acquire an
    // authoritative look. Awaited because the judged rows arrive from their own
    // read — the flag comes from the service rather than being inferred here.
    expect(await screen.findByText("Unproven")).toBeVisible();
    expect(
      screen.getByText(/has not been fitted against human confirmations/),
    ).toBeVisible();
  });

  it("groups the score by what each criterion implicates", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    expect(await screen.findByText("Implicates memory")).toBeVisible();
    expect(screen.getByText("Implicates governance")).toBeVisible();
    expect(screen.getByText("Implicates the agent")).toBeVisible();
  });

  it("says the deterministic three are unassertable rather than showing zeros", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    expect(await screen.findAllByText("Not assertable")).toHaveLength(3);
    expect(
      screen.getAllByText(/nothing was declared in advance to score it against/)[0],
    ).toBeVisible();
  });

  it("offers the improvement surface several observations at once, unranked", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    expect(await screen.findByText("Ways to improve this")).toBeVisible();
    // The user's correction, on screen. Awaited because the observation set
    // fills in when the receipt trace resolves — the surface reads the run's
    // record rather than guessing ahead of it.
    expect(await screen.findByText(/These are observations, not a diagnosis/)).toBeVisible();
    expect(screen.getByText(/A failing run does not have/)).toBeVisible();
    // The receipt's exclusion is one of them, and it links out rather than
    // rebuilding quarantine.
    expect(screen.getByText("The receipt records an exclusion")).toBeVisible();
    expect(screen.getByRole("link", { name: /Withheld/ })).toBeVisible();
  });

  it("names more than one thing each observation could point at", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    expect(await screen.findByText("Ways to improve this")).toBeVisible();
    expect((await screen.findAllByText("What this could point at")).length).toBeGreaterThan(0);
    expect(screen.getByText(/governance withheld it/)).toBeVisible();
  });

  it("leads with what still works when simulation is unavailable, and buries the variables", async () => {
    renderPage((path, options) => {
      if (path === "/v1/evaluation/simulations/availability") {
        return {
          available: false,
          judge_model: "",
          judge_provider: "noop",
          simulation_model: "",
          simulation_provider: "noop",
        };
      }
      return defaultHandler(path, options);
    });

    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));

    expect(
      await screen.findByText("This deployment cannot generate an agent answer"),
    ).toBeVisible();
    // What the reader can do now comes before what is missing, and it is stated
    // in product terms rather than configuration ones.
    expect(screen.getByText(/You can still resolve context, save prompts into sets/)).toBeVisible();
    expect(screen.getByText(/needs a language model, and this deployment has none/)).toBeVisible();

    // Environment variables are deployment diagnostics, so they sit behind a
    // disclosure addressed to the person who can act on them — present, and not
    // the first thing an evaluator reads.
    const disclosure = screen.getByText("For whoever runs this deployment").closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure!.open).toBe(false);
    expect(within(disclosure!).getByText("SIMULATION_PROVIDER")).toBeInTheDocument();
    expect(within(disclosure!).getByText("SIMULATION_API_KEY")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Simulate this prompt" })).toBeDisabled();
  });
  it("records a review beside the judge's verdict rather than replacing it", async () => {
    const { request } = renderPageWithSpy((path, options) => {
      if (path === "/v1/evaluation/judgements/f1000000-0000-4000-8000-000000000001/review") {
        return {
          note: "the cited item says nothing of the kind",
          observed_confidence: null,
          reviewed_at: "2026-08-12T10:20:00Z",
          reviewed_by: actorId,
          verdict: "overruled",
        };
      }
      return defaultHandler(path, options);
    });

    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    fireEvent.click(await screen.findByRole("button", { name: "Overrule" }));
    // Overruling needs a reason, and the form says so before the request.
    expect(screen.getByRole("button", { name: "Record review" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Why (required)"), {
      target: { value: "the cited item says nothing of the kind" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        "/v1/evaluation/judgements/f1000000-0000-4000-8000-000000000001/review",
        {
          body: {
            note: "the cited item says nothing of the kind",
            observed_confidence: null,
            verdict: "overruled",
          },
          method: "POST",
          tenantId,
        },
      ),
    );
  });

  it("does not require a reason to confirm a judge", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(screen.getByLabelText("Why (optional)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Record review" })).toBeEnabled();
  });

  it("offers unsure and still asks why, because it says something about the reviewer", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    fireEvent.click(await screen.findByRole("button", { name: "Unsure" }));
    expect(screen.getByLabelText("Why (required)")).toBeVisible();
  });

  it("shows a reviewer disagreement as a state rather than as a replaced verdict", async () => {
    renderPage((path, options) => {
      if (path === `/v1/evaluation/simulations/${simulationId}/judgements`) {
        return {
          items: [
            {
              ...judgementBody,
              is_disputed: true,
              reviews: [
                {
                  note: "the cited item says nothing of the kind",
                  observed_confidence: null,
                  reviewed_at: "2026-08-12T10:20:00Z",
                  reviewed_by: actorId,
                  verdict: "overruled",
                },
              ],
            },
          ],
        };
      }
      return defaultHandler(path, options);
    });

    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    expect(await screen.findByText("Reviewer disagrees")).toBeVisible();
    // The judge's own verdict survives beside it.
    expect(screen.getByText("Fail")).toBeVisible();
  });

  it("hides the judge action and says why when no judge is configured", async () => {
    renderPage((path, options) => {
      if (path === "/v1/evaluation/simulations/availability") {
        return {
          available: true,
          judge_model: "",
          judge_provider: "noop",
          simulation_model: "",
          simulation_provider: "anthropic",
        };
      }
      return defaultHandler(path, options);
    });

    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Support triage agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate this prompt" }));

    expect(
      await screen.findByText("Two of the five criteria cannot be graded here"),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /Judge the answer/ })).toBeNull();
    // The three that need no judge are still there, and the notice says so
    // before it says anything about configuration.
    expect(screen.getByText("Required-fact recall")).toBeVisible();
    expect(screen.getByText(/computed by a program with no model in the loop/)).toBeVisible();
    expect(screen.getByText("For whoever runs this deployment")).toBeVisible();
  });
});
