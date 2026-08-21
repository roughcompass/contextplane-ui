import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import { ContextplaneApiError, type ContextplaneRequestOptions } from "../../shared/api";
import {
  RelationshipAuthoringDialog,
  type RelationshipAuthoringTarget,
} from "./RelationshipAuthoringDialog";

const RELATIONSHIP_ID = "c1000000-0000-4000-8000-000000000001";
const REVISION_ID = "r1000000-0000-4000-8000-000000000001";

const EXTENSION_SET_DIGEST = "sha256:seeded-extension-set";

const binding = {
  binding: {
    binding_id: "b1000000-0000-4000-8000-000000000001",
    extension_set_digest: EXTENSION_SET_DIGEST,
    profile_revision_id: REVISION_ID,
    state: "active",
  },
  bound: true,
};

function stored(overrides: Record<string, unknown> = {}) {
  return {
    endpoints: {
      destination_entity_id: "8f9e1b3c-0000-4000-8000-000000000002",
      source_entity_id: "8f9e1b3c-0000-4000-8000-000000000001",
    },
    is_inverse: false,
    profile: {
      binding_id: binding.binding.binding_id,
      enforcement_mode: "mandatory",
      profile_revision_id: REVISION_ID,
    },
    properties: { tier: "gold" },
    provenance: {
      authority: null,
      confidence: null,
      external_record_id: null,
      external_revision: null,
      freshness_state: null,
      source_system: null,
    },
    readiness_state: "ready",
    relationship_id: RELATIONSHIP_ID,
    relationship_type: "core:depends_on",
    temporal: { effective_from: "2026-08-19T00:00:00Z", effective_to: null, recorded_at: null },
    validation: { mode: "mandatory", valid: true },
    ...overrides,
  };
}

const writeResult = {
  effect: "canonical_assertion_write",
  intent: "authorized_approval",
  profile: {
    binding_id: binding.binding.binding_id,
    enforcement_mode: "mandatory",
    profile_revision_id: REVISION_ID,
  },
  readiness_state: "ready",
  relationship_id: "c1000000-0000-4000-8000-000000000009",
  review_entry_id: null,
  staged_claim_id: null,
  validation: { mode: "mandatory", valid: true },
};

interface Harness {
  detail: () => unknown;
  etag?: string | null;
  onWrite?: (body: unknown, headers: Record<string, string> | undefined) => unknown;
}

function renderDialog(target: RelationshipAuthoringTarget, harness: Harness) {
  const calls: { body: unknown; headers?: Record<string, string>; path: string }[] = [];
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path === "/v1/profiles/conformance") return binding;
    if (options?.method === "PATCH" || options?.method === "POST") {
      calls.push({
        body: options.body,
        ...(options.headers ? { headers: { ...options.headers } } : {}),
        path,
      });
      return harness.onWrite ? harness.onWrite(options.body, options.headers) : writeResult;
    }
    return harness.detail();
  });
  const requestWithEtag = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => ({
    etag: harness.etag === undefined ? 'W/"first"' : harness.etag,
    value: await request(path, options),
  }));

  const onWritten = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RelationshipAuthoringDialog
          apiTenantId="tenant-a"
          client={{ request, requestWithEtag }}
          onClose={vi.fn()}
          onWritten={onWritten}
          target={target}
          tenantName="Northstar Systems"
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { calls, onWritten, request };
}

function precondition() {
  return new ContextplaneApiError({
    errors: [
      {
        code: "precondition_failed",
        message: "relationship changed since the If-Match ETag was issued; refetch and retry.",
        path: null,
      },
    ],
    requestId: "req-1",
    status: 412,
  });
}

beforeEach(() => {
  vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: () => "idem-key" });
});

describe("RelationshipAuthoringDialog — creating", () => {
  it("sends the bound profile revision, because it is the only one a client can read", async () => {
    const { calls } = renderDialog({ mode: "create" }, { detail: () => stored() });
    await screen.findByRole("heading", { level: 2, name: "Create relationship" });

    fireEvent.change(screen.getByRole("textbox", { name: /Relationship type/ }), {
      target: { value: "core:depends_on" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Source entity ID/ }), {
      target: { value: "src-1" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Destination entity ID/ }), {
      target: { value: "dst-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create relationship$/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.path).toBe("/v1/relationships");
    expect(calls[0]?.body).toMatchObject({
      idempotency_key: "idem-key",
      intent: "observation",
      subject_type: "core:depends_on",
      target_revision: {
        binding_revision: EXTENSION_SET_DIGEST,
        profile_revision: REVISION_ID,
      },
    });
  });

  it("sends no If-Match on a create, because there is no row to be stale against", async () => {
    const { calls } = renderDialog({ mode: "create" }, { detail: () => stored() });
    await screen.findByRole("heading", { level: 2, name: "Create relationship" });

    fireEvent.change(screen.getByRole("textbox", { name: /Relationship type/ }), {
      target: { value: "core:depends_on" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Source entity ID/ }), {
      target: { value: "src-1" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Destination entity ID/ }), {
      target: { value: "dst-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create relationship$/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.headers).toBeUndefined();
  });

  it("refuses an authorized approval that names no approval", async () => {
    const { calls } = renderDialog({ mode: "create" }, { detail: () => stored() });
    await screen.findByRole("heading", { level: 2, name: "Create relationship" });

    fireEvent.change(screen.getByRole("combobox", { name: /Intent/ }), {
      target: { value: "authorized_approval" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Relationship type/ }), {
      target: { value: "core:depends_on" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Source entity ID/ }), {
      target: { value: "src-1" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Destination entity ID/ }), {
      target: { value: "dst-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Create relationship$/ }));

    expect(
      await screen.findByText("An authorized approval must name the approval it rests on."),
    ).toBeVisible();
    expect(calls).toHaveLength(0);
  });

  it("says so when no profile is bound, rather than writing against nothing", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/v1/profiles/conformance") return { binding: null, bound: false };
      return stored();
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ToastProvider>
          <RelationshipAuthoringDialog
            client={{
              request,
              requestWithEtag: async (path) => ({ etag: null, value: await request(path) }),
            }}
            onClose={vi.fn()}
            onWritten={vi.fn()}
            target={{ mode: "create" }}
            tenantName="Northstar Systems"
          />
        </ToastProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("No profile is bound")).toBeVisible();
  });
});

describe("RelationshipAuthoringDialog — superseding", () => {
  it("prefills from the stored row and locks the assertion's identity", async () => {
    renderDialog({ mode: "edit", relationshipId: RELATIONSHIP_ID }, { detail: () => stored() });

    expect(await screen.findByRole("textbox", { name: /Relationship type/ })).toHaveValue(
      "core:depends_on",
    );
    expect(screen.getByRole("textbox", { name: /Relationship type/ })).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: /Source entity ID/ })).toHaveAttribute("readonly");
    expect(screen.getByRole("combobox", { name: /Intent/ })).toBeDisabled();
  });

  it("sends the validator the read handed back", async () => {
    const { calls } = renderDialog(
      { mode: "edit", relationshipId: RELATIONSHIP_ID },
      { detail: () => stored() },
    );
    await screen.findByRole("textbox", { name: /Relationship type/ });

    fireEvent.change(screen.getByRole("textbox", { name: /Approval reference/ }), {
      target: { value: "review-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Supersede relationship$/ }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.path).toBe(`/v1/relationships/${RELATIONSHIP_ID}`);
    expect(calls[0]?.headers).toEqual({ "If-Match": 'W/"first"' });
  });

  it("keeps the draft and shows the newer state when the row moved underneath", async () => {
    let attempts = 0;
    const { calls, onWritten } = renderDialog(
      { mode: "edit", relationshipId: RELATIONSHIP_ID },
      {
        detail: () =>
          attempts === 0
            ? stored()
            : stored({ properties: { tier: "silver" }, readiness_state: "pending" }),
        onWrite: () => {
          attempts += 1;
          throw precondition();
        },
      },
    );
    await screen.findByRole("textbox", { name: /Relationship type/ });

    const properties = screen.getByRole("textbox", { name: /Properties/ });
    fireEvent.change(properties, { target: { value: '{"tier":"bronze"}' } });
    fireEvent.change(screen.getByRole("textbox", { name: /Approval reference/ }), {
      target: { value: "review-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Supersede relationship$/ }));

    const notice = await screen.findByText("This relationship changed while you were editing");
    expect(notice).toBeVisible();
    // The draft survived. This is the whole point of the 412 handling.
    expect(properties).toHaveValue('{"tier":"bronze"}');
    expect(onWritten).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(screen.getByText("pending")).toBeVisible();
  });

  it("lets the operator take the newer state instead of their draft", async () => {
    let attempts = 0;
    renderDialog(
      { mode: "edit", relationshipId: RELATIONSHIP_ID },
      {
        detail: () => (attempts === 0 ? stored() : stored({ properties: { tier: "silver" } })),
        onWrite: () => {
          attempts += 1;
          throw precondition();
        },
      },
    );
    await screen.findByRole("textbox", { name: /Relationship type/ });

    fireEvent.change(screen.getByRole("textbox", { name: /Properties/ }), {
      target: { value: '{"tier":"bronze"}' },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Approval reference/ }), {
      target: { value: "review-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Supersede relationship$/ }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Replace my draft with the newer state" }),
    );

    expect(screen.getByRole("textbox", { name: /Properties/ })).toHaveValue(
      JSON.stringify({ tier: "silver" }, null, 2),
    );
    expect(
      screen.queryByText("This relationship changed while you were editing"),
    ).not.toBeInTheDocument();
  });

  it("branches on the code, so an ordinary refusal is not read as a conflict", async () => {
    renderDialog(
      { mode: "edit", relationshipId: RELATIONSHIP_ID },
      {
        detail: () => stored(),
        onWrite: () => {
          throw new ContextplaneApiError({
            errors: [{ code: "permission_denied", message: "no", path: null }],
            requestId: null,
            status: 403,
          });
        },
      },
    );
    await screen.findByRole("textbox", { name: /Relationship type/ });

    fireEvent.change(screen.getByRole("textbox", { name: /Approval reference/ }), {
      target: { value: "review-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Supersede relationship$/ }));

    expect(
      await screen.findByText("The current credential cannot write relationships in this tenant."),
    ).toBeVisible();
    expect(
      screen.queryByText("This relationship changed while you were editing"),
    ).not.toBeInTheDocument();
  });

  it("reports a detail read that failed rather than offering an empty form", async () => {
    renderDialog(
      { mode: "edit", relationshipId: RELATIONSHIP_ID },
      {
        detail: () => {
          throw new ContextplaneApiError({
            errors: [{ code: "http_404", message: "gone", path: null }],
            requestId: null,
            status: 404,
          });
        },
      },
    );

    expect(await screen.findByText("Relationship unavailable")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /Properties/ })).not.toBeInTheDocument();
  });

  it("refuses properties that are not a JSON object", async () => {
    const { calls } = renderDialog(
      { mode: "edit", relationshipId: RELATIONSHIP_ID },
      { detail: () => stored() },
    );
    await screen.findByRole("textbox", { name: /Relationship type/ });

    fireEvent.change(screen.getByRole("textbox", { name: /Properties/ }), {
      target: { value: "[1,2]" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Approval reference/ }), {
      target: { value: "review-9" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Supersede relationship$/ }));

    expect(await screen.findByText("Properties must be a JSON object.")).toBeVisible();
    expect(calls).toHaveLength(0);
  });
});
