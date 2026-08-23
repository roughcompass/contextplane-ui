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

function testClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    void options;
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

  it("names the verifier list as the field that widens who may approve", () => {
    // It is one field among six and the only one that grants authority over
    // material that does not exist yet.
    renderPanel(testClient());

    expect(
      screen.getByText(/who may approve material this connector fetches/u),
    ).toBeVisible();
    expect(screen.getByText(/every future fetch, not just the next one/u)).toBeVisible();
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
    fireEvent.change(screen.getByLabelText("Allowed approval verifiers"), {
      target: { value: "verifier-a" },
    });
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

  it("will not register a connector with an empty list or a non-numeric size", () => {
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
    fireEvent.change(screen.getByLabelText("Allowed approval verifiers"), {
      target: { value: "verifier-a" },
    });
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
    fireEvent.change(screen.getByLabelText("Approval verifiers for uploads"), {
      target: { value: "verifier-a" },
    });
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
