import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { AssertClaimPage } from "./AssertClaimPage";

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: "morgan@example.test",
  actor_id: "actor-a",
  roles: ["producer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "tenant-a",
  tenant_slug: "northstar",
};

const predicates = [
  {
    claim_category: "ownership",
    definition: "The team accountable for the subject.",
    deprecated_at: null,
    scope: "organization",
    value: "owned_by_team",
    value_type: "string",
  },
  {
    claim_category: "operations",
    definition: "Structured runbook metadata.",
    deprecated_at: null,
    scope: "organization",
    value: "runbook",
    value_type: "object",
  },
  {
    claim_category: "ownership",
    definition: "Superseded by owned_by_team.",
    deprecated_at: "2026-06-01T00:00:00Z",
    scope: "organization",
    value: "owned_by",
    value_type: "string",
  },
];

const receipt = {
  claim_id: "claim-asserted",
  is_contested: false,
  owning_tenant_id: identity.tenant_id,
  predicate: "owned_by_team",
  source_authority: "human_asserted",
  status: "linked",
  subject_entity_id: "entity-a",
  value: "trust-engineering",
  visibility: "tenant-shared",
};

type Responder = (path: string, options?: ContextplaneRequestOptions) => unknown;

function clientFor(assertResponder: Responder) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path === "/v1/whoami") return identity;
    if (path === "/v1/operator/claim-predicates") return predicates;
    if (path === "/v1/memory/claims") return assertResponder(path, options);
    throw new Error(`Unhandled path: ${path}`);
  });
  return { request } satisfies ContextplaneClient;
}

function renderPage(client: ContextplaneClient, apiTenantId: string | undefined = "tenant-a") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AssertClaimPage
          {...(apiTenantId ? { apiTenantId } : {})}
          activeTenantName="Northstar Systems"
          client={client}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function choosePredicate(optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: /^Predicate/ }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

function field(name: RegExp | string) {
  return screen.getByRole("textbox", { name });
}

function fillRequiredFields() {
  fireEvent.change(field(/^Subject reference/), {
    target: { value: "system:github/identity-service" },
  });
  choosePredicate("owned_by_team · Ownership");
  fireEvent.change(field(/^Value/), { target: { value: "trust-engineering" } });
  fireEvent.change(field("Reference"), { target: { value: "review-114" } });
}

function assertionCalls(client: ContextplaneClient) {
  return vi.mocked(client.request).mock.calls.filter(([path]) => path === "/v1/memory/claims");
}

beforeEach(() => {
  window.history.replaceState({}, "", "/memory/assert");
});

describe("AssertClaimPage", () => {
  it("records one claim with its evidence and reports it as an observation, not a fact", async () => {
    const client = clientFor(() => receipt);
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Record claim" })).toBeVisible();
    expect(screen.getByText("An asserted claim is an observation, not a fact")).toBeVisible();

    fillRequiredFields();
    fireEvent.change(field("Excerpt"), {
      target: { value: "Confirmed in the August ownership review." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));

    // The outcome is stated twice on purpose: an inline receipt that persists and a
    // transient toast. Both must say the same thing.
    expect(await screen.findAllByText("Recorded as an observation")).toHaveLength(2);
    expect(
      screen.getAllByText(/reaches the canonical graph only through promotion review/),
    ).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Inspect the stored claim" })).toHaveAttribute(
      "href",
      "/memory/claims/claim-asserted",
    );

    const [path, options] = assertionCalls(client)[0] ?? [];
    expect(path).toBe("/v1/memory/claims");
    expect(options).toMatchObject({
      body: {
        evidence: [
          {
            excerpt: "Confirmed in the August ownership review.",
            kind: "curator",
            ref: "review-114",
          },
        ],
        predicate: "owned_by_team",
        subject_reference: "system:github/identity-service",
        value: "trust-engineering",
        visibility: "tenant-shared",
      },
      method: "POST",
      tenantId: "tenant-a",
    });
    expect(options?.headers?.["Idempotency-Key"]).toEqual(expect.any(String));
  });

  it("warns when the service stored an assertion it could not attach to a subject", async () => {
    const client = clientFor(() => ({ ...receipt, status: "unlinked", subject_entity_id: null }));
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Record claim" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));

    expect(await screen.findAllByText("Stored, but not attached to a subject")).toHaveLength(2);
    expect(screen.getAllByText(/until a curator links it/)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Open the curation queue" })).toHaveAttribute(
      "href",
      "/memory?tab=curation",
    );
  });

  it("switches value entry to JSON for a structured predicate and blocks unparseable input", async () => {
    const client = clientFor(() => receipt);
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Record claim" });
    fireEvent.change(field(/^Subject reference/), {
      target: { value: "system:github/identity-service" },
    });
    choosePredicate("runbook · Operations");

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Value entry JSON" })).toBeVisible(),
    );
    fireEvent.change(field(/^Value/), { target: { value: "{oops}" } });
    fireEvent.change(field("Reference"), { target: { value: "runbook-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));

    expect(
      await screen.findByText("Enter valid JSON, or switch the value to plain text."),
    ).toBeVisible();
    expect(assertionCalls(client)).toHaveLength(0);
    expect(field(/^Value/)).toHaveValue("{oops}");
  });

  it("attaches a rejected field to its control and keeps the draft for correction", async () => {
    const client = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [
          {
            code: "unknown_subject",
            message: "No entity matches this reference.",
            path: "$.subject_reference",
          },
        ],
        requestId: "req-1",
        status: 422,
      });
    });
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Record claim" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));

    expect(await screen.findByText("No entity matches this reference.")).toBeVisible();
    expect(screen.getByText("Assertion was not recorded")).toBeVisible();
    expect(field(/^Subject reference/)).toHaveAttribute("aria-invalid", "true");
    expect(field(/^Subject reference/)).toHaveValue("system:github/identity-service");
  });

  it("reuses the idempotency key for an unchanged retry and mints a new one after an edit", async () => {
    let attempt = 0;
    const client = clientFor(() => {
      attempt += 1;
      if (attempt === 1) {
        throw new ContextplaneApiError({ errors: [], requestId: null, status: 503 });
      }
      return receipt;
    });
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Record claim" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));
    expect(await screen.findByText("Assertion was not recorded")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));
    expect(await screen.findAllByText("Recorded as an observation")).not.toHaveLength(0);

    const keys = assertionCalls(client).map(([, options]) => options?.headers?.["Idempotency-Key"]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);

    fireEvent.change(field(/^Value/), { target: { value: "platform-team" } });
    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));
    await waitFor(() => expect(assertionCalls(client)).toHaveLength(3));

    const editedKey = assertionCalls(client)[2]?.[1]?.headers?.["Idempotency-Key"];
    expect(editedKey).not.toBe(keys[0]);
  });

  it("keeps deprecated predicates selectable and says why they are still listed", async () => {
    const client = clientFor(() => receipt);
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Record claim" });
    expect(
      screen.getByText(
        "Deprecated predicates stay listed because existing claims still reference them.",
      ),
    ).toBeVisible();

    choosePredicate("owned_by (deprecated)");
    expect(
      await screen.findByText(/This predicate is deprecated; existing claims still reference it\./),
    ).toBeVisible();
  });

  it("requires at least one citation and adds further ones on request", async () => {
    const client = clientFor(() => receipt);
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Record claim" });
    expect(screen.getByRole("button", { name: "Remove citation 1" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add evidence" }));
    expect(await screen.findByText("Citation 2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove citation 1" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));
    expect(
      (await screen.findAllByText("Enter the reference this citation points at.")).length,
    ).toBe(2);
    expect(assertionCalls(client)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Remove citation 2" }));
    await waitFor(() => expect(screen.queryByText("Citation 2")).toBeNull());
    expect(screen.getByRole("button", { name: "Remove citation 1" })).toBeDisabled();
  });

  it.each([
    [401, "unauthenticated", /The session is no longer authenticated\./],
    [403, "forbidden", /cannot assert claims in this tenant/],
    [429, "rate_limited", /a retry cannot create a second claim/],
  ])("explains recovery for a %i rejection", async (status, code, expected) => {
    const client = clientFor(() => {
      throw new ContextplaneApiError({
        errors: [{ code, message: "Rejected.", path: null }],
        requestId: null,
        status,
      });
    });
    renderPage(client);

    await screen.findByRole("heading", { level: 1, name: "Record claim" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Record claim" }));

    expect(await screen.findByText("Assertion was not recorded")).toBeVisible();
    expect(screen.getByText(expected)).toBeVisible();
  });

  it("still renders the form when the calling identity cannot be resolved", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/v1/whoami") throw new Error("identity unavailable");
      if (path === "/v1/operator/claim-predicates") return predicates;
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage({ request } satisfies ContextplaneClient, undefined);

    expect(await screen.findByText("Identity unavailable")).toBeVisible();
    // Breadcrumbs fall back to the shell's tenant name rather than showing nothing.
    expect(screen.getByRole("link", { name: "Northstar Systems" })).toBeVisible();
    expect(field(/^Subject reference/)).toBeVisible();
  });

  it("falls back to free-text predicate entry when the ontology cannot be read", async () => {
    let attempt = 0;
    const request = vi.fn(async (path: string) => {
      if (path === "/v1/whoami") return identity;
      if (path === "/v1/operator/claim-predicates") {
        attempt += 1;
        if (attempt === 1) throw new Error("ontology unavailable");
        return predicates;
      }
      throw new Error(`Unhandled path: ${path}`);
    });
    renderPage({ request } satisfies ContextplaneClient);

    await screen.findByRole("heading", { level: 1, name: "Record claim" });
    // The ontology is operator-scoped, so a principal who may assert claims can still be
    // unable to read it. The form must stay usable rather than dead-ending on a picker.
    expect(await screen.findByText(/The predicate ontology could not be loaded/)).toBeVisible();
    fireEvent.change(field(/^Predicate/), { target: { value: "owned_by_team" } });
    expect(field(/^Predicate/)).toHaveValue("owned_by_team");

    fireEvent.click(screen.getByRole("button", { name: "Retry loading predicates" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: /^Predicate/ })).toBeEnabled());
  });
});
