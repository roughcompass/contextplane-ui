import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { VerifierEnrolmentPanel } from "./VerifierEnrolmentPanel";

const VERIFIER_ID = "77777777-7777-7777-7777-777777777777";
const CHALLENGE_ID = "88888888-8888-8888-8888-888888888888";

const identity = {
  allowlist_fingerprint: "sha256:abc123",
  checked_at: "2026-08-22T09:00:00Z",
  context_resolution_enabled: true,
  is_global_operator: true,
};

const challenge = {
  canonical_enrollment_bytes_base64: "Y2Fub25pY2Fs",
  enrollment_challenge_id: CHALLENGE_ID,
  expires_at: "2026-08-22T10:00:00Z",
  signing_domain: "arc.enrollment.v1",
};

const verifier = {
  approval_verifier_id: VERIFIER_ID,
  binding_kind: "exact_principal",
  credential_fingerprint: "sha256:def456",
  enrolled_at: "2026-08-22T09:05:00Z",
  evidence_types: ["artifact_activation"],
  owning_scope: "global",
  principal_issuer: "https://issuer.example",
  principal_subject: "ops@example.com",
  provider_id: null,
  revoked_at: null,
  target_tenant_id: null,
  valid_from: "2026-08-22T09:00:00Z",
  valid_to: "2027-08-22T09:00:00Z",
};

/** What the roster read answers with, for the revoke picker to offer. */
const ENROLLED = {
  created_at: "2026-08-22T09:00:00Z",
  detail: {},
  in_force: true,
  in_force_until: null,
  kind: "approval_verifier",
  object_id: VERIFIER_ID,
  scope: "tenant",
  target_tenant_id: null,
};

function testClient(identityOverrides: Record<string, unknown> = {}) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path === "/v1/arc/admin/operator-identity") return { ...identity, ...identityOverrides };
    if (path.endsWith("/enrollment-challenges")) return challenge;
    // The same path serves two operations, and the method is what tells them
    // apart: the collection enrols on POST and lists on GET. A fake that keyed
    // on the path alone would answer the roster read with an enrolment
    // response, which is the divergence that made this test fail honestly.
    if (path.startsWith("/v1/arc/admin/approval-verifiers?") || path === "/v1/arc/admin/approval-verifiers") {
      return options?.method === "POST" ? verifier : { items: [ENROLLED] };
    }
    if (path.endsWith("/revoke")) return { ...verifier, revoked_at: "2026-08-22T11:00:00Z" };
    throw new Error(`Unexpected path: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPanel(client: ContextplaneClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <VerifierEnrolmentPanel client={client} requestContext={{}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function fillExactPrincipalForm() {
  fireEvent.click(screen.getByRole("combobox", { name: /Owning scope/u }));
  fireEvent.click(await screen.findByRole("option", { name: /Global/u }));
  fireEvent.click(screen.getByRole("combobox", { name: /Binding kind/u }));
  fireEvent.click(await screen.findByRole("option", { name: /Exact principal/u }));
  fireEvent.change(screen.getByLabelText("Principal issuer"), {
    target: { value: "https://issuer.example" },
  });
  fireEvent.change(screen.getByLabelText("Principal subject"), {
    target: { value: "ops@example.com" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Artifact activation" }));
  fireEvent.change(screen.getByLabelText("Public key (base64)"), { target: { value: "cHVibGlj" } });
  fireEvent.change(screen.getByLabelText("Valid from"), {
    target: { value: "2026-08-22T09:00" },
  });
  fireEvent.change(screen.getByLabelText("Valid to"), { target: { value: "2027-08-22T09:00" } });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/verifiers");
});

describe("VerifierEnrolmentPanel", () => {
  it("does not imply enrolling a verifier is separated from approving with it", async () => {
    /** The entry's central finding. Actor separation is enforced across
     * submitter, approver and activator by the proposal lifecycle, and nowhere
     * between enrolment and use — so a screen that looked like it carried the
     * same rule would be asserting a control that does not exist. */
    renderPanel(testClient());

    expect(
      await screen.findByText("Enrolling is not separated from approving"),
    ).toBeVisible();
    expect(screen.getByText(/may later approve with it/u)).toBeVisible();
    expect(screen.getByText(/would be a service change/u)).toBeVisible();
  });

  it("never asks for a private key, and says where the signing happens", async () => {
    renderPanel(testClient());
    await fillExactPrincipalForm();

    expect(screen.getByLabelText("Public key (base64)")).toBeVisible();
    expect(screen.queryByLabelText(/private key/iu)).toBeNull();
    expect(screen.getByText(/Nothing on this screen asks for, generates or transports/u)).toBeVisible();
  });

  it("requesting a challenge enrols nothing", async () => {
    // Two calls rather than one because the signature is produced elsewhere. A
    // single-call enrolment would have had to accept the private key to manage.
    const client = testClient();
    renderPanel(client);
    await fillExactPrincipalForm();
    fireEvent.click(screen.getByRole("button", { name: /Request a signing challenge/u }));

    await screen.findByText("Sign these bytes where the key lives");
    expect(client.request).not.toHaveBeenCalledWith(
      "/v1/arc/admin/approval-verifiers",
      expect.anything(),
    );
  });

  it("says the verifier id will not be shown again, because nothing lists them", async () => {
    /** There is no list endpoint. This render is the only place the id appears,
     * and an operator who does not record it has to recover it from the audit
     * log to revoke later. */
    const client = testClient();
    renderPanel(client);
    await fillExactPrincipalForm();
    fireEvent.click(screen.getByRole("button", { name: /Request a signing challenge/u }));
    fireEvent.change(await screen.findByLabelText("Detached signature (base64)"), {
      target: { value: "c2ln" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Complete enrolment/u }));

    expect(await screen.findByText("Record this identifier now")).toBeVisible();
    expect(screen.getByText(/no directory of enrolled verifiers/u)).toBeVisible();
    expect(screen.getByText(VERIFIER_ID)).toBeVisible();
  });

  it("offers only the fields the chosen binding kind allows", async () => {
    /** `exact_principal` forbids the provider pair and `provider_delegated`
     * forbids the principal pair, so showing all four invites a refusal naming
     * a field the operator was handed. */
    renderPanel(testClient());
    fireEvent.click(screen.getByRole("combobox", { name: /Binding kind/u }));
    fireEvent.click(await screen.findByRole("option", { name: /Exact principal/u }));

    expect(screen.getByLabelText("Principal issuer")).toBeVisible();
    expect(screen.queryByLabelText("Provider")).toBeNull();

    fireEvent.click(screen.getByRole("combobox", { name: /Binding kind/u }));
    fireEvent.click(await screen.findByRole("option", { name: /Provider delegated/u }));

    expect(screen.getByLabelText("Provider")).toBeVisible();
    expect(screen.queryByLabelText("Principal issuer")).toBeNull();
  });

  it("says a deployment that cannot sign receipts cannot, before a write is attempted", async () => {
    renderPanel(testClient({ context_resolution_enabled: false }));

    expect(await screen.findByText("This deployment cannot sign receipts")).toBeVisible();
    expect(screen.getByText(/answers 503/u)).toBeVisible();
  });

  it("says global enrolment will be refused when the caller is not an operator", async () => {
    renderPanel(testClient({ is_global_operator: false }));

    expect(await screen.findByText("Not a deployment operator")).toBeVisible();
    expect(screen.getByText(/Global-scope enrolment will be refused/u)).toBeVisible();
  });

  it("revokes through the item path, not the collection that enrols", async () => {
    /** The E19-T7 defect: the collection path enrols, so a revoke sent there
     * would attempt the opposite operation from one wrong URL. Asserting the
     * body alone would pass while it happened. */
    const client = testClient();
    renderPanel(client);
    // Chosen from the roster rather than typed. ADR 0018, and it matters most
    // here: revoking the wrong verifier ends the wrong person's authority.
    fireEvent.click(screen.getByRole("button", { name: "Approval verifier" }));
    fireEvent.click(await screen.findByRole("option", { name: new RegExp(VERIFIER_ID, "u") }));
    fireEvent.change(screen.getByLabelText("Reason code"), { target: { value: "key_rotated" } });
    fireEvent.click(screen.getByRole("button", { name: "Revoke this verifier" }));

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/arc/admin/approval-verifiers/${VERIFIER_ID}/revoke`,
        expect.objectContaining({ body: { reason_code: "key_rotated" }, method: "POST" }),
      ),
    );
  });

  it("offers enrolled verifiers by name rather than asking for a UUID", async () => {
    /** ADR 0018: a reader cannot type a value they have no way to obtain. This
     * field asked for one, and the roster read that would have supplied it was
     * in the committed contract the whole time. */
    renderPanel(testClient());

    fireEvent.click(screen.getByRole("button", { name: "Approval verifier" }));

    expect(await screen.findByRole("option", { name: new RegExp(VERIFIER_ID, "u") })).toBeVisible();
    expect(screen.queryByLabelText("Approval verifier id")).toBeNull();
  });

  it("offers only verifiers still in force", async () => {
    /** Revoking one already revoked is a no-op the service refuses, and
     * offering it invites the attempt. The picker asks for the live set; the
     * table below the form is where a revoked one is still visible. */
    const client = testClient();
    renderPanel(client);

    fireEvent.click(screen.getByRole("button", { name: "Approval verifier" }));
    await screen.findByRole("option", { name: new RegExp(VERIFIER_ID, "u") });

    expect(client.request).toHaveBeenCalledWith(
      "/v1/arc/admin/approval-verifiers?in_force_only=true",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("will not request a challenge until the conditional halves are complete", async () => {
    renderPanel(testClient());
    const submit = screen.getByRole("button", { name: /Request a signing challenge/u });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole("combobox", { name: /Binding kind/u }));
    fireEvent.click(await screen.findByRole("option", { name: /Exact principal/u }));
    expect(screen.getByText(/a principal issuer/u)).toBeVisible();

    await fillExactPrincipalForm();
    expect(screen.getByRole("button", { name: /Request a signing challenge/u })).toBeEnabled();
  });
});
