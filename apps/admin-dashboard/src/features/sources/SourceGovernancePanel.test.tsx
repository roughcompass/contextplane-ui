import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { SourceGovernancePanel } from "./SourceGovernancePanel";

const connector = {
  allowed_hosts: ["policy.example.com"],
  allowed_media_types: ["application/pdf"],
  allowed_schemes: ["https"],
  allowed_verifier_ids: ["verifier-a"],
  connector_id: "connector-a",
  max_bytes: 1048576,
  owning_scope: "global",
  registered_at: "2026-08-22T09:00:00Z",
};

/** What the verifier roster answers with, for the authority picker to offer. */
const ENROLLED_VERIFIER = {
  created_at: "2026-08-22T09:00:00Z",
  detail: {},
  in_force: true,
  in_force_until: null,
  kind: "approval_verifier",
  object_id: "verifier-a",
  scope: "global",
  target_tenant_id: null,
};

/** One connector already granting `verifier-a` authority, so the count is real. */
const REGISTERED_CONNECTOR = {
  created_at: "2026-08-22T09:00:00Z",
  detail: { allowed_verifier_ids: ["verifier-a"] },
  in_force: true,
  in_force_until: null,
  kind: "source_connector",
  object_id: "connector-existing",
  scope: "global",
  target_tenant_id: null,
};

function testClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    // Each collection path serves two operations, and the **method** is what
    // tells them apart -- not the query string. A fake that matched on `?`
    // would answer a registration when the read stopped narrowing, which is a
    // divergence between the double and the service that only shows up later.
    if (options?.method === "GET") {
      const [collection] = path.split("?");
      if (collection === "/v1/arc/admin/approval-verifiers") return { items: [ENROLLED_VERIFIER] };
      if (collection === "/v1/arc/admin/source-connectors") return { items: [REGISTERED_CONNECTOR] };
      if (collection === "/v1/arc/admin/source-upload-policies") return { items: [] };
      throw new Error(`Unexpected read: ${path}`);
    }
    if (path === "/v1/arc/admin/source-connectors") return connector;
    if (path === "/v1/arc/admin/source-upload-policies") {
      return {
        allowed_media_types: ["application/pdf"],
        allowed_verifier_ids: ["verifier-a"],
        max_bytes: 2048,
        owning_scope: "tenant",
        policy_id: "policy-a",
        registered_at: "2026-08-22T09:00:00Z",
      };
    }
    if (path === "/v1/arc/admin/observation-replay-corpora") {
      return {
        approved_at: "2026-08-22T09:00:00Z",
        corpus_digest: "sha256:corpus",
        generator_version: "2.1.0",
        owning_scope: "global",
      };
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
        <SourceGovernancePanel client={client} requestContext={{}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function chooseScope(name: RegExp, option: RegExp) {
  fireEvent.click(screen.getByRole("combobox", { name }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/sources");
});

describe("SourceGovernancePanel", () => {
  it("says these are standing grants, not settings that apply to one change", () => {
    /** E10-T10's own point: these are the highest-blast-radius controls in the
     * group and the least obviously so. Nothing about registering a connector
     * looks like it changes what governance concludes. */
    renderPanel(testClient());

    expect(screen.getByText("These are standing grants, not one-off settings")).toBeVisible();
    expect(screen.getByText(/every future admission through it/u)).toBeVisible();
  });

  it("no longer claims a registration cannot be read back", () => {
    /** The notice used to end "None of them can be read back afterwards, so what
     * is registered here is not visible anywhere else." That was false when it
     * was written — the five list endpoints were in the committed contract and
     * nothing had called them — and E22-T5 builds the tables that make it
     * obviously so. The true half of the notice, asserted above, survives:
     * removing the whole thing would drop a real warning with a false one. */
    renderPanel(testClient());

    expect(screen.queryByText(/cannot be read back/u)).toBeNull();
    expect(screen.queryByText(/not visible anywhere else/u)).toBeNull();
  });

  it("names the verifier list as the field that widens who may approve", () => {
    // It is one field among six and the only one that grants authority over
    // material that does not exist yet.
    renderPanel(testClient());

    expect(
      screen.getByText(/who may approve material this connector fetches/u),
    ).toBeVisible();
    expect(screen.getByText(/every future fetch, not just the next one/u)).toBeVisible();
  });

  it("offers enrolled verifiers rather than asking for a list of UUIDs", async () => {
    /** ADR 0018's worst case: a comma-separated list of server-assigned
     * identifiers, on the widest field of the form. */
    renderPanel(testClient());

    fireEvent.click(screen.getByRole("button", { name: "Allowed approval verifiers" }));

    expect(await screen.findByRole("option", { name: /verifier-a/u })).toBeVisible();
  });

  it("says how much authority a candidate verifier already holds", async () => {
    /** E22-T5's own claim, that the verifier argument gets stronger once
     * verifiers are readable: the form can show what each candidate would be
     * added to. A verifier already on six connectors is a broadly trusted
     * credential and one on none is a first grant, and the two deserve
     * different hesitation. */
    renderPanel(testClient());

    fireEvent.click(screen.getByRole("button", { name: "Allowed approval verifiers" }));

    expect(await screen.findByText(/Already approves for 1 registration/u)).toBeVisible();
  });

  it("drops a verifier from the offer once it has been chosen", async () => {
    /** The picker is single-value and this field is not. Offering a chosen
     * verifier again would let one credential be named twice in a list the
     * service reads as a set. */
    renderPanel(testClient());

    fireEvent.click(screen.getByRole("button", { name: "Allowed approval verifiers" }));
    fireEvent.click(await screen.findByRole("option", { name: /verifier-a/u }));

    expect(screen.getByRole("listitem")).toHaveTextContent("verifier-a");
    fireEvent.click(screen.getByRole("button", { name: "Allowed approval verifiers" }));
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /verifier-a/u })).toBeNull(),
    );
  });

  it("lets a chosen verifier be taken back off", async () => {
    renderPanel(testClient());

    fireEvent.click(screen.getByRole("button", { name: "Allowed approval verifiers" }));
    fireEvent.click(await screen.findByRole("option", { name: /verifier-a/u }));
    fireEvent.click(screen.getByRole("button", { name: "Remove verifier-a" }));

    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("says a regenerated corpus is a different corpus", () => {
    renderPanel(testClient());

    expect(screen.getByText(/different digest and needs its own approval/u)).toBeVisible();
  });

  it("splits the list fields on commas and drops blanks", async () => {
    const client = testClient();
    renderPanel(client);
    chooseScope(/Connector scope/u, /Global/u);
    fireEvent.change(screen.getByLabelText("Connector"), { target: { value: "connector-a" } });
    fireEvent.change(screen.getByLabelText("Allowed schemes"), { target: { value: "https, " } });
    fireEvent.change(screen.getByLabelText("Allowed hosts"), {
      target: { value: "policy.example.com,  docs.example.com , " },
    });
    fireEvent.change(screen.getByLabelText("Allowed media types"), {
      target: { value: "application/pdf" },
    });
    // Chosen from the roster rather than typed: ADR 0018, and the field
    // this one replaced was a comma-separated list of UUIDs.
    fireEvent.click(screen.getByRole("button", { name: "Allowed approval verifiers" }));
    fireEvent.click(await screen.findByRole("option", { name: /verifier-a/u }));
    fireEvent.change(screen.getByLabelText("Maximum bytes"), { target: { value: "1048576" } });
    fireEvent.click(screen.getByRole("button", { name: "Register this connector" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/arc/admin/source-connectors",
        expect.objectContaining({
          body: expect.objectContaining({
            allowed_hosts: ["policy.example.com", "docs.example.com"],
            allowed_schemes: ["https"],
            max_bytes: 1048576,
          }),
          method: "POST",
        }),
      ),
    );
  });

  it("will not register a connector with an empty list or a non-numeric size", async () => {
    /** Every list here is required by the contract, and an empty one would be a
     * connector that can fetch nothing or that nobody may approve. */
    renderPanel(testClient());
    const submit = screen.getByRole("button", { name: "Register this connector" });
    expect(submit).toBeDisabled();

    chooseScope(/Connector scope/u, /Global/u);
    fireEvent.change(screen.getByLabelText("Connector"), { target: { value: "connector-a" } });
    fireEvent.change(screen.getByLabelText("Allowed schemes"), { target: { value: "https" } });
    fireEvent.change(screen.getByLabelText("Allowed hosts"), { target: { value: "a.example" } });
    fireEvent.change(screen.getByLabelText("Allowed media types"), { target: { value: "text/plain" } });
    // Chosen from the roster rather than typed: ADR 0018, and the field
    // this one replaced was a comma-separated list of UUIDs.
    fireEvent.click(screen.getByRole("button", { name: "Allowed approval verifiers" }));
    fireEvent.click(await screen.findByRole("option", { name: /verifier-a/u }));
    fireEvent.change(screen.getByLabelText("Maximum bytes"), { target: { value: "lots" } });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Maximum bytes"), { target: { value: "2048" } });
    expect(submit).toBeEnabled();
  });

  it("sends each registration to its own route", async () => {
    /** Three collections, three paths. The E19-T7 defect is a body sent to the
     * wrong one, which a test asserting only the body would not catch. */
    const client = testClient();
    renderPanel(client);

    fireEvent.change(screen.getByLabelText("Policy"), { target: { value: "policy-a" } });
    fireEvent.change(screen.getByLabelText("Uploadable media types"), {
      target: { value: "application/pdf" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approval verifiers for uploads" }));
    fireEvent.click(await screen.findByRole("option", { name: /verifier-a/u }));
    fireEvent.change(screen.getByLabelText("Maximum upload bytes"), { target: { value: "2048" } });
    chooseScope(/Upload policy scope/u, /Tenant/u);
    fireEvent.click(screen.getByRole("button", { name: "Register this upload policy" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/arc/admin/source-upload-policies",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("approves a corpus by digest and generator version", async () => {
    const client = testClient();
    renderPanel(client);

    chooseScope(/Corpus scope/u, /Global/u);
    fireEvent.change(screen.getByLabelText("Corpus digest"), {
      target: { value: "sha256:corpus" },
    });
    fireEvent.change(screen.getByLabelText("Generator version"), { target: { value: "2.1.0" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve this corpus" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/arc/admin/observation-replay-corpora",
        expect.objectContaining({
          body: { corpus_digest: "sha256:corpus", generator_version: "2.1.0", owning_scope: "global" },
          method: "POST",
        }),
      ),
    );
  });
});
