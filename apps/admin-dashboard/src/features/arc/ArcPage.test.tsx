import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneRequestOptions } from "../../shared/api/client";
import { ContextplaneApiError, clientFromRequest } from "../../shared/api/client";
import { ArcPage } from "./ArcPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: null,
  actor_id: "a0000000-0000-4000-8000-000000000001",
  roles: ["admin"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "b0000000-0000-4000-8000-000000000001",
  tenant_slug: "northstar",
};

const artifact = {
  active_revision_id: null,
  artifact_id: "aa000000-0000-4000-8000-000000000001",
  created_at: "2026-08-12T10:00:00Z",
  created_by: { issuer: "contextplane", subject: identity.actor_id },
  kind: "policy",
  owning_scope: "tenant",
  slug: "production-safeguards",
  target_tenant_id: identity.tenant_id,
  title: "Production safeguards",
};

const sourceEvidence = {
  admission_method: "connector_fetch",
  admitted_at: "2026-08-12T10:02:00Z",
  connector_id: "policy-repository",
  expires_at: "2027-08-12T10:02:00Z",
  next_check_at: null,
  policy_id: "policy-admission-v1",
  source_content_bytes: 2048,
  source_content_digest: "b".repeat(64),
  source_content_type: "text/markdown",
  source_evidence_id: "ac000000-0000-4000-8000-000000000001",
  source_revision_locator: "commit:abc123",
  source_system: "policy-repository",
  status: "current",
  status_checked_at: "2026-08-12T10:02:00Z",
  verification_method: "detached_signature",
  verified_at: "2026-08-12T10:02:00Z",
  verifier_id: "ad000000-0000-4000-8000-000000000001",
};

const proposalVersion = {
  allowed_transitions: ["submitted", "withdrawn"],
  artifact_id: artifact.artifact_id,
  available_actions: ["edit", "validate", "run_semantic_tests", "confirm_reach", "submit"],
  created_at: "2026-08-12T10:05:00Z",
  frozen_at: null,
  operational_integrity_state: "verified",
  proposal_id: "ab000000-0000-4000-8000-000000000001",
  proposal_version: 1,
  reason_codes: [],
  reviewed_baseline_revision_id: null,
  revision_id: null,
  risk_algorithm_version: null,
  risk_classification: null,
  source_evidence_id: sourceEvidence.source_evidence_id,
  state: "open",
};

const receipt = {
  budget_limit_bytes: 4096,
  evaluated_at: "2026-08-12T11:00:00Z",
  integrity_state: "verified",
  mandatory_directive_count: 1,
  receipt_id: "ae000000-0000-4000-8000-000000000001",
  rendered_content_bytes: 512,
  resolution_status: "complete",
  selected: [
    {
      artifact_id: artifact.artifact_id,
      audience_redacted: false,
      directive_id: "af000000-0000-4000-8000-000000000001",
      is_mandatory: true,
      omission_reason: null,
      revision_id: "ad000000-0000-4000-8000-000000000001",
      source_locator: "policy://production",
      was_omitted: false,
    },
  ],
};

const receiptDetail = {
  complete: true,
  continuation_token: null,
  items: [{ compact_statement_plaintext: "Verify approval before deployment." }],
  page_number: 1,
  profile: "arc_detail_page_v1",
  reason_codes: [],
  receipt_id: receipt.receipt_id,
  request_digest: "d".repeat(64),
  returned_bytes: 72,
};

function createClient({
  nextCursor = null,
  roles = ["admin"],
}: { nextCursor?: string | null; roles?: string[] } = {}) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path === "/v1/whoami") return { ...identity, roles };
    if (path.startsWith("/v1/admin/usage/tools")) {
      return {
        end: "2026-08-12",
        start: "2026-07-14",
        tools: [
          {
            actor_days: 3,
            calls: 12,
            error_calls: 1,
            ok_calls: 11,
            tool: "arc_get_review_package",
            worst_daily_p95_ms: 80,
          },
          {
            actor_days: 2,
            calls: 4,
            error_calls: 0,
            ok_calls: 4,
            tool: "search_capabilities",
            worst_daily_p95_ms: 20,
          },
        ],
      };
    }
    // E23-T4's two pickers: the receipt field chooses from what the detail read
    // would serve, and the target-tenant field from this credential's own
    // memberships.
    if (path === "/v1/receipts" || path.startsWith("/v1/receipts?")) {
      return {
        items: [
          {
            exclusion_count: 0,
            intent_id: null,
            item_count: 4,
            receipt_id: receipt.receipt_id,
            requested_by: "actor-a",
            resolved_at: "2026-08-12T14:28:41Z",
            state: "hydrated",
          },
        ],
        next_before: null,
      };
    }
    if (path === "/v1/tenants") {
      return {
        items: [
          {
            display_name: "Northstar Systems",
            is_current: true,
            is_provisioned: true,
            roles: ["admin"],
            tenant_id: identity.tenant_id,
            tenant_slug: "northstar",
          },
        ],
      };
    }
    if (path === "/v1/arc/artifacts" && options?.method === "POST") return artifact;
    if (path.startsWith("/v1/arc/artifacts?") && options?.method === undefined) {
      return { items: [artifact], next_cursor: nextCursor };
    }
    if (path === `/v1/arc/artifacts/${artifact.artifact_id}`) return artifact;
    if (path === `/v1/arc/sources/${sourceEvidence.source_evidence_id}`) return sourceEvidence;
    if (path === `/v1/arc/artifacts/${artifact.artifact_id}/proposals`) return proposalVersion;
    if (path === `/v1/arc/proposals/${proposalVersion.proposal_id}/versions/1`) {
      return proposalVersion;
    }
    if (
      path === `/v1/arc/proposals/${proposalVersion.proposal_id}/versions/1` &&
      options?.method === "PATCH"
    ) {
      return proposalVersion;
    }
    if (path === `/v1/arc/receipts/${receipt.receipt_id}`) return receipt;
    if (path === `/v1/arc/receipts/${receipt.receipt_id}/explain`) {
      return {
        ...receipt,
        blocked_reasons: [],
        budget: { budget_limit_bytes: 4096, rendered_content_bytes: 512 },
        degraded_reasons: [],
        events: [],
      };
    }
    if (path === `/v1/arc/receipts/${receipt.receipt_id}/detail`) return receiptDetail;
    throw new Error(`Unexpected request: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPage(client = createClient()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ArcPage
          activeTenantName="Northstar Systems"
          apiTenantId={identity.tenant_id}
          client={client}
          searchRef={createRef<HTMLInputElement>()}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return client;
}

async function loadArtifactAndSource() {
  expect(await screen.findByText(artifact.title)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Select policy" }));
  fireEvent.change(screen.getByLabelText("Source evidence ID"), {
    target: { value: sourceEvidence.source_evidence_id },
  });
  fireEvent.click(screen.getByRole("button", { name: "Use evidence" }));
  expect(await screen.findByRole("heading", { name: "Open a draft revision" })).toBeVisible();
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  window.history.replaceState({}, "", "/arc");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

describe("ArcPage", () => {
  it("restores a focused policy area from the URL and browser history", async () => {
    window.history.replaceState({}, "", "/arc?view=runtime");
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Runtime receipt evidence" }),
    ).toBeVisible();
    window.history.replaceState({}, "", "/arc?view=usage");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Policy tool usage" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Usage" })).toHaveAttribute("aria-current", "page");
  });

  it("resumes a bookmarked proposal and its approved source evidence by ID", async () => {
    window.history.replaceState(
      {},
      "",
      `/arc?artifact=${artifact.artifact_id}&proposal=${proposalVersion.proposal_id}`,
    );
    const client = renderPage();

    expect(
      await screen.findByRole("heading", { name: "4. Write the directive candidate" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: artifact.title })).toBeVisible();
    expect(screen.getByText("Draft Open")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      `/v1/arc/artifacts/${artifact.artifact_id}`,
      expect.objectContaining({ tenantId: identity.tenant_id }),
    );
    expect(client.request).toHaveBeenCalledWith(
      `/v1/arc/proposals/${proposalVersion.proposal_id}/versions/1`,
      expect.objectContaining({ tenantId: identity.tenant_id }),
    );
    expect(client.request).toHaveBeenCalledWith(
      `/v1/arc/sources/${sourceEvidence.source_evidence_id}`,
      expect.objectContaining({ tenantId: identity.tenant_id }),
    );
  });

  it("provides a dedicated lifecycle walkthrough and opens a source-bound draft", async () => {
    const client = renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Policies" }),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "How it works" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "How it works" }));
    const guide = await screen.findByRole("dialog", { name: "How governed policies work" });
    expect(
      within(guide).getByRole("heading", { name: "How governed policies work" }),
    ).toBeVisible();
    expect(within(guide).getByText("From approved source to active policy")).toBeVisible();
    expect(within(guide).getByText("Choose policy")).toBeVisible();
    expect(within(guide).getByText("Runtime is per decision")).toBeVisible();
    expect(within(guide).getByText("Usage is aggregate")).toBeVisible();
    expect(window.location.search).not.toContain("view=walkthrough");
    fireEvent.click(within(guide).getByRole("button", { name: "Start authoring" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await loadArtifactAndSource();
    fireEvent.click(screen.getByRole("button", { name: "Open draft revision" }));

    expect(
      await screen.findByRole("heading", { name: "4. Write the directive candidate" }),
    ).toBeVisible();
    expect(window.location.search).toContain(`proposal=${proposalVersion.proposal_id}`);
    expect(client.request).toHaveBeenCalledWith(
      `/v1/arc/artifacts/${artifact.artifact_id}/proposals`,
      expect.objectContaining({
        body: { source_evidence_id: sourceEvidence.source_evidence_id },
        method: "POST",
      }),
    );
  });

  it("browses, searches, and selects policies from the server collection", async () => {
    const client = renderPage(createClient({ nextCursor: "opaque-next-page" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Choose a policy" })).toBeVisible();
    expect(await screen.findByText(artifact.title)).toBeVisible();
    expect(screen.getByRole("button", { name: "Create policy" })).toBeVisible();
    expect(
      within(screen.getByRole("button", { name: "Write policy" })).getByText("4"),
    ).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/arc/artifacts?page_size=25",
      expect.objectContaining({ tenantId: identity.tenant_id }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        expect.stringContaining("cursor=opaque-next-page"),
        expect.objectContaining({ tenantId: identity.tenant_id }),
      ),
    );
    expect(window.location.search).toContain("policy_cursor=opaque-next-page");
    fireEvent.click(await screen.findByRole("button", { name: "Back to first page" }));

    fireEvent.change(await screen.findByRole("searchbox", { name: "Search policies" }), {
      target: { value: "production" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search policies" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/arc/artifacts?page_size=25&q=production",
        expect.objectContaining({ tenantId: identity.tenant_id }),
      ),
    );
    expect(window.location.search).toContain("policy_q=production");
    expect(window.location.search).not.toContain("policy_cursor=");

    fireEvent.click(await screen.findByRole("button", { name: "Select policy" }));
    expect(await screen.findByLabelText("Source evidence ID")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create policy" })).toBeNull();
    expect(window.location.search).toContain(`artifact=${artifact.artifact_id}`);
    expect(window.location.search).toContain("step=evidence");
  });

  it("authors structured directive semantics and provenance without requiring raw candidate JSON", async () => {
    const client = renderPage();
    await loadArtifactAndSource();
    fireEvent.click(screen.getByRole("button", { name: "Open draft revision" }));
    expect(
      await screen.findByRole("heading", { name: "4. Write the directive candidate" }),
    ).toBeVisible();
    expect(await screen.findByLabelText(/Directive statement/)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Source approval evidence digest/), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.change(screen.getByLabelText("Source anchor"), {
      target: { value: "section-4.2" },
    });
    fireEvent.change(screen.getByLabelText(/Directive statement/), {
      target: { value: "Verify approval before deployment." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save candidate" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/proposals/${proposalVersion.proposal_id}/versions/1`,
        expect.objectContaining({
          body: expect.objectContaining({
            field_provenance: expect.arrayContaining([
              expect.objectContaining({
                field_path: "directives[0].compact_statement_plaintext",
                provenance_class: "source_backed",
                source_evidence_id: sourceEvidence.source_evidence_id,
              }),
            ]),
            semantics: expect.objectContaining({
              artifact_id: artifact.artifact_id,
              directives: expect.arrayContaining([
                expect.objectContaining({
                  compact_statement_plaintext: "Verify approval before deployment.",
                  directive_type: "citation_only",
                  source_anchor: "section-4.2",
                }),
              ]),
              source_content_digest: sourceEvidence.source_content_digest,
            }),
          }),
          method: "PATCH",
        }),
      ),
    );
    expect(screen.queryByLabelText(/Proposal patch JSON/)).toBeNull();
  });

  it("loads only policy-tool totals in the usage area and explains their limits", async () => {
    const client = renderPage();

    expect(
      client.request.mock.calls.some(([path]) => String(path).startsWith("/v1/admin/usage/tools")),
    ).toBe(false);
    fireEvent.click(await screen.findByRole("link", { name: "Usage" }));
    expect(await screen.findByText("How to read this usage view")).toBeVisible();
    expect(await screen.findByText("ARC Get Review Package")).toBeVisible();
    expect(screen.queryByText("Search Capabilities")).toBeNull();
    expect(screen.getByText("Per-policy execution counts are not published")).toBeVisible();
  });

  it("creates a tenant policy and keeps non-admin sessions read-only", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Create policy" }));
    const dialog = await screen.findByRole("dialog", { name: "Create policy" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create policy" }));
    expect(within(dialog).getByText("Enter an artifact title.")).toBeVisible();
    expect(within(dialog).getByText("Enter a stable artifact slug.")).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText(/^Title/), {
      target: { value: artifact.title },
    });
    fireEvent.change(within(dialog).getByLabelText(/Stable slug/), {
      target: { value: artifact.slug },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create policy" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    cleanup();
    window.history.replaceState({}, "", "/arc");
    renderPage(createClient({ roles: ["producer"] }));
    expect(await screen.findByText("Policy authoring requires administrator access")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create policy" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Usage" }));
    expect(await screen.findByText("Usage is restricted")).toBeVisible();
  });

  it("retrieves receipt explanation and audited just-in-time detail", async () => {
    const client = renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Runtime evidence" }));
    fireEvent.click(await screen.findByRole("button", { name: /Resolution receipt/u }));
    fireEvent.click(await screen.findByRole("option", { name: /2026-08-12/u }));
    fireEvent.click(screen.getByRole("button", { name: "Load receipt" }));
    expect(await screen.findByText("policy://production")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Explain selection" }));
    expect(await screen.findByText("View complete receipt explanation")).toBeVisible();

    fireEvent.click(screen.getByText("Request authorized directive or source detail"));
    fireEvent.change(screen.getByLabelText("Context handle"), {
      target: { value: "runtime-context-handle" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve detail" }));
    expect(await screen.findByText(/Verify approval before deployment/)).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      `/v1/arc/receipts/${receipt.receipt_id}/detail`,
      expect.objectContaining({
        body: expect.objectContaining({
          context_handle: "runtime-context-handle",
          request_kind: "directive",
          selector: {},
        }),
        method: "POST",
      }),
    );
  });

  it("links receipt-detail validation guidance to the fields that need correction", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("link", { name: "Runtime evidence" }));
    fireEvent.click(await screen.findByRole("button", { name: /Resolution receipt/u }));
    fireEvent.click(await screen.findByRole("option", { name: /2026-08-12/u }));
    fireEvent.click(screen.getByRole("button", { name: "Load receipt" }));
    await screen.findByText("policy://production");
    fireEvent.click(screen.getByText("Request authorized directive or source detail"));

    fireEvent.click(screen.getByRole("button", { name: "Retrieve detail" }));
    const contextInput = screen.getByLabelText(/^Context handle/);
    expect(contextInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter the context handle from the consuming workflow.")).toBeVisible();

    fireEvent.change(contextInput, { target: { value: "runtime-context-handle" } });
    fireEvent.change(screen.getByLabelText("Selector (JSON object)"), {
      target: { value: "[]" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve detail" }));
    const selectorInput = screen.getByLabelText(/^Selector \(JSON object\)/);
    expect(selectorInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a valid JSON object, such as {}.")).toBeVisible();
  });

  it("clears stale draft context before another policy is selected", async () => {
    window.history.replaceState(
      {},
      "",
      `/arc?artifact=${artifact.artifact_id}&proposal=${proposalVersion.proposal_id}`,
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "4. Write the directive candidate" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Change policy" }));
    fireEvent.click(await screen.findByText("Open directly by policy ID"));
    fireEvent.click(screen.getByRole("button", { name: "Load policy" }));

    await waitFor(() => {
      expect(window.location.search).not.toContain("proposal=");
      expect(window.location.search).not.toContain("source=");
      expect(window.location.search).toContain("step=identity");
    });
  });

  it("reports absent policies without hiding runtime evidence areas", async () => {
    const client = createClient();
    client.request.mockImplementation(async (path: string) => {
      if (path === "/v1/whoami") return identity;
      if (path.startsWith("/v1/admin/usage/tools")) {
        return { end: "2026-08-12", start: "2026-07-14", tools: [] };
      }
      throw new ContextplaneApiError({
        errors: [{ code: "not_found", message: "not found", path: null }],
        requestId: "request-arc-404",
        status: 404,
      });
    });
    renderPage(client);

    fireEvent.click(await screen.findByRole("link", { name: "Usage" }));
    expect(await screen.findByText("No policy tool calls")).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Author policy" }));
    fireEvent.click(await screen.findByText("Open directly by policy ID"));
    fireEvent.change(await screen.findByLabelText("Policy ID"), {
      target: { value: "missing-artifact" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load policy" }));
    expect(await screen.findByText("Policy unavailable")).toBeVisible();
    expect(screen.getAllByText("Request ID:").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("link", { name: "Runtime evidence" }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Runtime receipt evidence" }),
    ).toBeVisible();
  });
});
