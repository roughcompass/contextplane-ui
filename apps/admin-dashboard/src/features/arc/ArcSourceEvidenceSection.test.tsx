import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArcSourceEvidence } from "../../shared/api/arcAuthoring";
import { ArcSourceEvidenceSection } from "./ArcSourceEvidenceSection";

function chooseOption(controlName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: new RegExp(`^${controlName}`) }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

const evidence: ArcSourceEvidence = {
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

function renderSection(overrides: Partial<ComponentProps<typeof ArcSourceEvidenceSection>> = {}) {
  const props = {
    onAdmitConnector: vi.fn(async () => evidence),
    onAdmitGraphPromotion: vi.fn(async () => evidence),
    onAdmitUpload: vi.fn(async () => evidence),
    onLookup: vi.fn(async () => evidence),
    onSelect: vi.fn(),
    selectedSource: null,
    ...overrides,
  };
  render(<ArcSourceEvidenceSection {...props} />);
  return props;
}

function change(label: string, value: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  fireEvent.change(screen.getByLabelText(new RegExp(`^${escapedLabel}`)), { target: { value } });
}

function fillAdmissionFields() {
  change("Source system", "policy-repository");
  change("Immutable revision locator", "commit:abc123");
  change("Approval locator", "approval://board/42");
  change("Approval scope", "production");
  change("Verifier ID", evidence.verifier_id);
  change("Authority issuer", "https://issuer.example");
  change("Authority subject", "policy-board");
  change("Approved at", "2026-08-12T10:00");
  change("Approval expires", "2027-08-12T10:00");
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ArcSourceEvidenceSection", () => {
  it("validates, retrieves, and copies existing evidence", async () => {
    const onLookup = vi
      .fn()
      .mockRejectedValueOnce(new Error("missing"))
      .mockResolvedValueOnce(evidence);
    const onSelect = vi.fn();
    renderSection({ onLookup, onSelect, selectedSource: { ...evidence, status: "overdue" } });

    expect(screen.getByText("overdue")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Copy source evidence ID" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(evidence.source_evidence_id);

    fireEvent.click(screen.getByRole("button", { name: "Use evidence" }));
    expect(await screen.findByText("Enter a source evidence ID.")).toBeVisible();
    change("Source evidence ID", evidence.source_evidence_id);

    fireEvent.click(screen.getByRole("button", { name: "Use evidence" }));
    expect(await screen.findByText("Evidence was not accepted")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Use evidence" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(evidence));
  });

  it("renders a revoked evidence status as unsafe", () => {
    renderSection({ selectedSource: { ...evidence, status: "revoked" } });
    expect(screen.getByText("revoked")).toBeVisible();
    expect(screen.getByText(evidence.source_content_digest)).toBeVisible();
  });

  it("requires an approved file and admits an upload with detached proof", async () => {
    const { onAdmitUpload, onSelect } = renderSection();
    fireEvent.click(screen.getByLabelText("Admit an upload"));
    fireEvent.click(screen.getByRole("button", { name: "Admit and use evidence" }));
    expect(await screen.findByText("Review the highlighted fields")).toBeVisible();
    expect(screen.getByText("Enter the source system.")).toBeVisible();

    fillAdmissionFields();
    change("Admission policy ID", "policy-admission-v1");
    change("Signature (base64)", "c2lnbmF0dXJl");
    fireEvent.click(screen.getByRole("button", { name: "Admit and use evidence" }));
    expect(await screen.findByText("Choose the approved source file.")).toBeVisible();

    const file = new File(["approved policy"], "policy.md", { type: "text/markdown" });
    fireEvent.change(screen.getByLabelText(/^Approved source file/), {
      target: { files: [file] },
    });
    expect(screen.getByText("policy.md")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Admit and use evidence" }));

    await waitFor(() => expect(onAdmitUpload).toHaveBeenCalledOnce());
    expect(onAdmitUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        body: file,
        policyId: "policy-admission-v1",
        proof: expect.objectContaining({ verification_method: "detached_signature" }),
        sourceRevisionLocator: "commit:abc123",
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(evidence);
  });

  it("admits connector evidence with an external verifier attestation", async () => {
    const { onAdmitConnector, onSelect } = renderSection();
    fireEvent.click(screen.getByLabelText("Fetch through connector"));
    fillAdmissionFields();
    change("Registered connector ID", "policy-repository");
    change("Expected content digest", "a".repeat(64));
    chooseOption("Verification method", "Verifier attestation");
    change("Provider ID", "approval-provider");
    change("Assertion format", "application/cose");
    change("Assertion (base64)", "YXNzZXJ0aW9u");
    fireEvent.click(screen.getByRole("button", { name: "Admit and use evidence" }));

    await waitFor(() => expect(onAdmitConnector).toHaveBeenCalledOnce());
    expect(onAdmitConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorId: "policy-repository",
        proof: {
          assertion_base64: "YXNzZXJ0aW9u",
          assertion_format: "application/cose",
          provider_id: "approval-provider",
          verification_method: "verifier_attestation",
        },
        sourceRevisionLocator: "commit:abc123",
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(evidence);
  });

  it("admits a promoted graph claim without asking for a proof", async () => {
    const { onAdmitGraphPromotion, onSelect } = renderSection();
    fireEvent.click(screen.getByLabelText("Cite a promoted graph claim"));

    // The proof block belongs to the two signature-backed authorities. A
    // promotion is vouched for by the journal, so asking for one here would
    // be asking the author to invent an approval the graph does not record.
    expect(screen.queryByLabelText("Verification method")).toBeNull();
    expect(screen.queryByLabelText(/Verifier ID/)).toBeNull();

    change("Promoted claim ID", "c0000000-0000-4000-8000-00000000000c");
    change("Upstream system", "bitbucket.org/acme/adr");
    change("Review by", "2026-12-01T09:00");
    fireEvent.click(screen.getByRole("button", { name: "Admit promoted claim" }));

    await waitFor(() => expect(onAdmitGraphPromotion).toHaveBeenCalledOnce());
    expect(onAdmitGraphPromotion).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: "c0000000-0000-4000-8000-00000000000c",
        sourceSystem: "bitbucket.org/acme/adr",
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(evidence);
  });

  it("requires the promoted claim's own fields before submitting", async () => {
    const { onAdmitGraphPromotion } = renderSection();
    fireEvent.click(screen.getByLabelText("Cite a promoted graph claim"));
    fireEvent.click(screen.getByRole("button", { name: "Admit promoted claim" }));

    expect(await screen.findByText("Enter a promoted claim ID.")).toBeVisible();
    expect(screen.getByText("Enter the upstream system.")).toBeVisible();
    expect(onAdmitGraphPromotion).not.toHaveBeenCalled();
  });

  it("reports a refusal without inventing a reason for it", async () => {
    const onAdmitGraphPromotion = vi.fn(async () => {
      throw new Error("refused");
    });
    renderSection({ onAdmitGraphPromotion });
    fireEvent.click(screen.getByLabelText("Cite a promoted graph claim"));
    change("Promoted claim ID", "c0000000-0000-4000-8000-00000000000c");
    change("Upstream system", "bitbucket.org/acme/adr");
    change("Review by", "2026-12-01T09:00");
    fireEvent.click(screen.getByRole("button", { name: "Admit promoted claim" }));

    expect(await screen.findByText(/did not accept this evidence/)).toBeVisible();
  });
});
