import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { ContextplaneApiError, clientFromRequest } from "../../shared/api";
import { ReceiptExplorerPanel } from "./ReceiptExplorerPanel";

const RECEIPT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const receipt = {
  cacheable: true,
  exclusion_count: 1,
  hydration_state: "hydrated",
  intent_id: null,
  item_count: 4,
  receipt_id: RECEIPT_ID,
  request_digest: "sha256:req",
  requested_by: "ops@example.com",
  resolved_at: "2026-08-22T09:00:00Z",
  state: "complete",
};

function refusal(code: string) {
  return new ContextplaneApiError({
    errors: [{ code, message: "refused", path: null }],
    requestId: "req-1",
    status: 409,
  });
}

function testClient(options: { listFails?: string; receiptState?: string } = {}) {
  const request = vi.fn(async (path: string, requestOptions?: ContextplaneRequestOptions) => {
    void requestOptions;
    if (path.startsWith("/v1/receipts/by-reference")) return { receipts: [receipt] };
    if (path.endsWith("/exclusions") || path.endsWith("/references")) {
      if (options.listFails) throw refusal(options.listFails);
      return path.endsWith("/exclusions")
        ? { exclusions: [{ block: "observed_claims", item_key: "claim-1", reason: "low_trust" }] }
        : { references: [] };
    }
    if (path.startsWith("/v1/receipts/")) {
      return { ...receipt, hydration_state: options.receiptState ?? "hydrated" };
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPanel(client: ContextplaneClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReceiptExplorerPanel client={client} requestContext={{}} />
    </QueryClientProvider>,
  );
}

function openById(client: ContextplaneClient) {
  renderPanel(client);
  fireEvent.change(screen.getByLabelText("Or open a receipt by id"), {
    target: { value: RECEIPT_ID },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open this receipt" }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/receipts");
});

describe("ReceiptExplorerPanel", () => {
  it("renders an unhydrated refusal as a state, not a failure", async () => {
    /** E11-T2's central point: an explorer that renders the 409 as an error
     * teaches its reader that the system is broken when it is being careful. */
    openById(testClient({ listFails: "receipt_not_hydrated", receiptState: "pending" }));

    expect(await screen.findByText("This receipt is still being written")).toBeVisible();
    expect(screen.getByRole("button", { name: "Re-read" })).toBeVisible();
  });

  it("keeps a withheld receipt distinct, and offers no re-read", async () => {
    /** The entry names one 409 reason; there are two. Waiting fixes the first
     * and fixes nothing about the second, so offering a re-read here would
     * leave somebody refreshing a screen that will never change. */
    openById(testClient({ listFails: "receipt_withheld" }));

    expect(await screen.findByText("This receipt's content was withheld")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Re-read" })).toBeNull();
    expect(screen.queryByText("This receipt is still being written")).toBeNull();
  });

  it("still shows the header while the lists are refused", async () => {
    /** `GET /receipts/{id}` deliberately does not refuse — it is the poll
     * surface. Folding the three reads together would make the header
     * unreadable exactly when it is the only thing that can be read. */
    openById(testClient({ listFails: "receipt_not_hydrated", receiptState: "pending" }));

    expect(await screen.findByText("pending")).toBeVisible();
    expect(screen.getByText(/4 item\(s\) served/u)).toBeVisible();
  });

  it("says an empty exclusion list is an answer when the receipt is hydrated", async () => {
    /** The distinction the refusal exists to protect: "nothing was excluded"
     * only means that when the receipt is finished being written. */
    const client = clientFromRequest(
      vi.fn(async (path: string) => {
        if (path.endsWith("/exclusions")) return { exclusions: [] };
        if (path.endsWith("/references")) return { references: [] };
        return receipt;
      }),
    );
    openById(client);

    expect(await screen.findByText(/Nothing was excluded/u)).toBeVisible();
    expect(screen.getByText(/rather than the absence of one/u)).toBeVisible();
  });

  it("lists what was withheld from the answer", async () => {
    openById(testClient());

    expect(await screen.findByText("claim-1")).toBeVisible();
    expect(screen.getByText(/from observed_claims — low_trust/u)).toBeVisible();
  });

  it("requires all four reference coordinates before searching", async () => {
    const client = testClient();
    renderPanel(client);
    const search = screen.getByRole("button", { name: /Find receipts citing this/u });
    expect(search).toBeDisabled();

    for (const [label, value] of [
      ["Source system", "backstage"],
      ["Namespace", "default"],
      ["Kind", "component"],
      ["External id", "billing-api"],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    expect(search).toBeEnabled();

    fireEvent.click(search);
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        expect.stringContaining("/v1/receipts/by-reference?"),
        expect.anything(),
      ),
    );
  });

  it("says why a partial reference is not accepted", () => {
    renderPanel(testClient());

    expect(screen.getByText(/would match across source systems/u)).toBeVisible();
  });
});
