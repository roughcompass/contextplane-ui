import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { QuarantinePage } from "./QuarantinePage";

const CLAIM_A = "11111111-1111-1111-1111-111111111111";
const CLAIM_B = "22222222-2222-2222-2222-222222222222";
const QUARANTINE_ID = "33333333-3333-3333-3333-333333333333";

const preview = {
  downstream: ["44444444-4444-4444-4444-444444444444"],
  matched: [CLAIM_A, CLAIM_B],
  seeds_total: 2,
  seeds_traversed: 2,
  subjects: ["55555555-5555-5555-5555-555555555555"],
  truncated: false,
};

function testClient(overrides: Record<string, unknown> = {}) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    void options;
    if (path.includes(":preview")) return { ...preview, ...overrides };
    if (path.includes(":revert")) return { quarantine_id: QUARANTINE_ID, restored_count: 1 };
    if (path === "/v1/admin/claim-quarantines") {
      return {
        matched: [CLAIM_A, CLAIM_B],
        matched_count: 2,
        quarantine_id: QUARANTINE_ID,
        selector: "connector_run",
        value: "run-42",
      };
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  return clientFromRequest(request);
}

/** Records which identifiers were reverted, so a test can assert the request. */
function quarantineClient() {
  const reverted: string[] = [];
  const request = vi.fn(async (path: string) => {
    if (path.includes(":preview")) return preview;
    if (path.includes(":revert")) {
      reverted.push(path.split("/").pop()!.replace(":revert", ""));
      return { quarantine_id: QUARANTINE_ID, restored_count: 1 };
    }
    if (path === "/v1/admin/claim-quarantines") {
      return {
        matched: [CLAIM_A, CLAIM_B],
        matched_count: 2,
        quarantine_id: QUARANTINE_ID,
        selector: "connector_run",
        value: "run-42",
      };
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  return { client: clientFromRequest(request), reverted };
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <QuarantinePage
          activeTenantName="Northstar Systems"
          apiTenantId="tenant-a"
          client={client}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function runPreview() {
  fireEvent.click(screen.getByRole("combobox", { name: /Provenance selector/u }));
  fireEvent.click(await screen.findByRole("option", { name: /Connector run/u }));
  fireEvent.change(screen.getByLabelText("Value"), { target: { value: "run-42" } });
  fireEvent.click(screen.getByRole("button", { name: /Preview what this reaches/u }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/quarantine");
});

describe("QuarantinePage", () => {
  it("previews without withholding anything", async () => {
    // A separate call rather than an apply with a flag, so a caller cannot
    // withhold content by getting a boolean wrong.
    const client = testClient();
    renderPage(client);
    await runPreview();

    expect(await screen.findByText("A preview is a point-in-time answer")).toBeVisible();
    expect(client.request).toHaveBeenCalledWith(
      "/v1/admin/claim-quarantines:preview",
      expect.objectContaining({ method: "POST" }),
    );
    expect(client.request).not.toHaveBeenCalledWith(
      "/v1/admin/claim-quarantines",
      expect.anything(),
    );
  });

  it("says a preview is point-in-time rather than presenting it as current", async () => {
    /** The first of the two properties E10-T1 says the UI must not soften: the
     * graph moves, and a screen presenting a ten-minute-old preview as current
     * causes an under-quarantine nobody notices. */
    renderPage(testClient());
    await runPreview();

    const notice = await screen.findByText("A preview is a point-in-time answer");
    expect(notice).toBeVisible();
    expect(screen.getByText(/applying later can reach a different set/u)).toBeVisible();
  });

  it("keeps the advisory downstream set apart from what would be withheld", async () => {
    /** The service keeps `matched` and `downstream` apart because they mean
     * different things; merging them here would tell an operator that applying
     * makes the downstream list disappear. */
    renderPage(testClient());
    await runPreview();

    await screen.findByText("Would be withheld");
    expect(screen.getByText(/Applying withholds/u)).toHaveTextContent(
      /Applying withholds\s*none\s*of these/u,
    );
  });

  it("says the downstream figure is a floor when the traversal was capped", async () => {
    renderPage(testClient({ seeds_total: 9, seeds_traversed: 2, truncated: true }));
    await runPreview();

    expect(
      await screen.findByText("The downstream figure is a floor, not the answer"),
    ).toBeVisible();
    expect(screen.getByText(/2 of 9 subjects were traversed/u)).toBeVisible();
  });

  it("refuses to offer an apply for a predicate that matches nothing", async () => {
    renderPage(testClient({ matched: [], downstream: [], subjects: [], seeds_total: 0 }));
    await runPreview();

    expect(await screen.findByText("This predicate matches no claim")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Withhold/u })).toBeNull();
  });

  it("requires a stated reason before it will withhold anything", async () => {
    const client = testClient();
    renderPage(client);
    await runPreview();
    await screen.findByText("Would be withheld");

    const apply = screen.getByRole("button", { name: /Withhold 2 claim/u });
    expect(apply).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Why"), {
      target: { value: "Connector run 42 asserted stale ownership." },
    });
    expect(apply).toBeEnabled();
  });

  it("offers revert as a primary action, not something tucked away", async () => {
    /** The second property E10-T1 names: an operator who cannot undo a
     * quarantine will not run one on a real incident, which makes revert's
     * discoverability part of whether the feature works. */
    const client = testClient();
    renderPage(client);
    await runPreview();
    await screen.findByText("Would be withheld");
    fireEvent.change(screen.getByLabelText("Why"), {
      target: { value: "Connector run 42 asserted stale ownership." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Withhold 2 claim/u }));

    const revert = await screen.findByRole("button", { name: "Revert this quarantine" });
    expect(revert).toBeVisible();

    fireEvent.click(revert);
    fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/admin/claim-quarantines/${QUARANTINE_ID}:revert`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("says why a restored count can be lower than what was withheld", async () => {
    /** Not a partial failure: a claim held by a second, unreverted quarantine
     * stays withheld. A screen that did not say so would read as a bug. */
    renderPage(testClient());
    await runPreview();
    await screen.findByText("Would be withheld");
    fireEvent.change(screen.getByLabelText("Why"), {
      target: { value: "Connector run 42 asserted stale ownership." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Withhold 2 claim/u }));
    fireEvent.click(await screen.findByRole("button", { name: "Revert this quarantine" }));

    const panel = screen.getByText("Restore the claims this quarantine withheld?").closest("div");
    if (!panel) throw new Error("The confirmation was not rendered.");
    expect(within(panel).getByText(/second, unreverted quarantine stays withheld/u)).toBeVisible();
  });

  it("says the identifier cannot be looked up later, because it cannot", async () => {
    // The page promised "put them back". `applied` is component state and the
    // service exposes no way to list quarantines and writes none to the audit
    // log — so a reload lost the only handle on a live quarantine, and the
    // promise held for one browser session.
    const { client } = quarantineClient();
    renderPage(client);

    await runPreview();
    await screen.findByText("Would be withheld");
    fireEvent.change(screen.getByLabelText("Why"), {
      target: { value: "Connector run 42 asserted stale ownership." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Withhold 2 claim/u }));

    expect(await screen.findByText("Keep this identifier")).toBeVisible();
    expect(screen.getByText(/no list of applied quarantines to find it in later/u)).toBeVisible();
  });

  it("restores a quarantine from an identifier somebody kept", async () => {
    const { client, reverted } = quarantineClient();
    renderPage(client);

    // Available without applying anything first — that is the point: an operator
    // returning tomorrow has the identifier and nothing else.
    const field = await screen.findByRole("textbox", { name: "Quarantine identifier" });
    expect(screen.getByRole("button", { name: "Restore what it withheld" })).toBeDisabled();
    expect(screen.getByText("Paste the identifier the apply step showed.")).toBeVisible();

    fireEvent.change(field, { target: { value: "11111111-1111-4111-8111-111111111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Restore what it withheld" }));

    await waitFor(() => expect(reverted).toEqual(["11111111-1111-4111-8111-111111111111"]));
  });
});
