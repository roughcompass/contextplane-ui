import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { ExceptionGrantPanel } from "./ExceptionGrantPanel";

const EXCEPTION_ID = "99999999-9999-9999-9999-999999999999";

function testClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    void options;
    if (path.endsWith("/revoke")) return { exception_id: EXCEPTION_ID, status: "revoked" };
    if (path === "/v1/arc/admin/exceptions") {
      return { exception_id: EXCEPTION_ID, status: "granted" };
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
        <ExceptionGrantPanel client={client} requestContext={{}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function fillGrantForm(until?: string) {
  const values: readonly [string, string][] = [
    ["Higher-scope directive", "directive-a"],
    ["Higher-scope revision", "revision-a"],
    ["Lower-scope kind", "domain"],
    ["Effective from", "2026-08-22T09:00"],
    ["Exception statement", "Retention floor does not apply to the sandbox domain."],
    ["Justification", "Sandbox data is synthetic and regenerated nightly."],
    ["Evidence", "evidence-a"],
    ["Approval verifier", "verifier-a"],
    ["Approving principal", "ops@example.com"],
    ["Approving role", "governance-owner"],
    ["Approved payload digest", "sha256:aaa"],
    ["Audit log reference", "audit-a"],
    ["Approval timestamp", "2026-08-21T17:30"],
  ];
  for (const [label, value] of values) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  if (until !== undefined) {
    fireEvent.change(screen.getByLabelText("Effective until (optional)"), {
      target: { value: until },
    });
  }
}

beforeEach(() => {
  window.history.replaceState({}, "", "/exceptions");
});

describe("ExceptionGrantPanel", () => {
  it("no longer says the register cannot be built", () => {
    /** It could. `GET /v1/arc/admin/exceptions` is the register the service made
     * and nothing called, and its own description says an exception "was
     * invisible from the moment it was granted" until it existed.
     *
     * This test asserted the opposite for as long as the sentence was here,
     * which is why the sweep reads tests too: a false claim with a test behind
     * it is one somebody has to argue with rather than notice. */
    renderPanel(testClient());

    expect(screen.queryByText("This screen cannot show what is already in force")).toBeNull();
    expect(screen.queryByText(/only to grant and revoke them/u)).toBeNull();
    expect(screen.queryByText(/no way to read exceptions back/u)).toBeNull();
  });

  it("says what an exception with no end date actually is, before offering one", () => {
    // The service does not require an expiry, so the screen is the only thing
    // that can say what leaving it blank means.
    renderPanel(testClient());

    expect(screen.getByText("With no end date, this is a permanent deviation")).toBeVisible();
    expect(screen.getByText(/policy change wearing a smaller word/u)).toBeVisible();
  });

  it("stops saying so once an end date is given", () => {
    renderPanel(testClient());
    fireEvent.change(screen.getByLabelText("Effective until (optional)"), {
      target: { value: "2027-01-01T00:00" },
    });

    expect(screen.queryByText("With no end date, this is a permanent deviation")).toBeNull();
  });

  it("does not present the form as making an approval", () => {
    /** Every field in the envelope names something that already exists. A screen
     * that read as an approval would invite someone to grant an exception that
     * nobody approved. */
    renderPanel(testClient());

    expect(
      screen.getByText("This form transcribes an approval, it does not make one"),
    ).toBeVisible();
    expect(screen.getByText(/Nothing typed here approves anything/u)).toBeVisible();
  });

  it("omits effective_until entirely when blank, rather than sending null", async () => {
    /** An absent field is the contract's own way of saying "no end". Sending a
     * default would turn a permanent deviation into a lapsing one. */
    const client = testClient();
    renderPanel(client);
    fillGrantForm();
    fireEvent.click(screen.getByRole("button", { name: /Grant this exception/u }));

    await waitFor(() => expect(client.request).toHaveBeenCalled());
    const [, options] = vi.mocked(client.request).mock.calls[0] ?? [];
    const body = (options as { body: Record<string, unknown> }).body;
    expect("effective_until" in body).toBe(false);
    expect(body.effective_from).toBe(new Date("2026-08-22T09:00").toISOString());
  });

  it("refuses a descriptor that is not a JSON object", async () => {
    renderPanel(testClient());
    fillGrantForm();
    fireEvent.change(screen.getByLabelText("Replacement conflict descriptor (JSON object)"), {
      target: { value: "[1, 2]" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Grant this exception/u }));

    expect(
      await screen.findByText("The replacement conflict descriptor must be a JSON object."),
    ).toBeVisible();
  });

  it("says the granted id will not be shown again", async () => {
    renderPanel(testClient());
    fillGrantForm();
    fireEvent.click(screen.getByRole("button", { name: /Grant this exception/u }));

    expect(await screen.findByText("Record this identifier now")).toBeVisible();
    expect(screen.getByText(EXCEPTION_ID)).toBeVisible();
  });

  it("revokes through the item path, not the collection that grants", async () => {
    const client = testClient();
    renderPanel(client);
    fireEvent.change(screen.getByLabelText("Exception id"), { target: { value: EXCEPTION_ID } });
    fireEvent.change(screen.getByLabelText("Reason code"), { target: { value: "superseded" } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke this exception" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/admin/exceptions/${EXCEPTION_ID}/revoke`,
        expect.objectContaining({ body: { reason_code: "superseded" }, method: "POST" }),
      ),
    );
  });

  it("will not grant until every required field is filled", () => {
    renderPanel(testClient());
    expect(screen.getByRole("button", { name: /Grant this exception/u })).toBeDisabled();

    fillGrantForm();
    expect(screen.getByRole("button", { name: /Grant this exception/u })).toBeEnabled();
  });
});
