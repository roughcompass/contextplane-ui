import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextplaneApiError } from "../../shared/api/client";
import { ArcArtifactDialog } from "./ArcArtifactDialog";

function chooseOption(controlName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: new RegExp(`^${controlName}`) }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

const tenantId = "b0000000-0000-4000-8000-000000000001";

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/^Title/), {
    target: { value: "  Production safeguards  " },
  });
  fireEvent.change(screen.getByLabelText(/Stable slug/), {
    target: { value: "  production-safeguards  " },
  });
}

function renderDialog(onCreate = vi.fn(async () => undefined)) {
  const onClose = vi.fn();
  render(<ArcArtifactDialog defaultTenantId={tenantId} onClose={onClose} onCreate={onCreate} />);
  return { onClose, onCreate };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ArcArtifactDialog", () => {
  it("validates required policy and tenant fields and clears corrected errors", async () => {
    const { onCreate } = renderDialog();

    expect(screen.getByLabelText(/^Title/)).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Create policy" }));
    expect(await screen.findByText("Enter an artifact title.")).toBeVisible();
    expect(screen.getByText("Enter a stable artifact slug.")).toBeVisible();

    fillRequiredFields();
    expect(screen.queryByText("Enter an artifact title.")).toBeNull();
    expect(screen.queryByText("Enter a stable artifact slug.")).toBeNull();
    fireEvent.change(screen.getByLabelText("Target tenant ID"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Create policy" }));
    expect(await screen.findByText("Enter a tenant ID.")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Target tenant ID/), { target: { value: tenantId } });
    expect(screen.queryByText("Enter a tenant ID.")).toBeNull();
  });

  it("creates a trimmed global standard without attaching a tenant", async () => {
    const { onCreate } = renderDialog();
    fillRequiredFields();
    chooseOption("Artifact kind", "Standard");
    chooseOption("Owning scope", "Global");

    expect(screen.getByText("Global scope requires operator authority")).toBeVisible();
    expect(screen.queryByLabelText("Target tenant ID")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create policy" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "standard",
        owningScope: "global",
        slug: "production-safeguards",
        targetTenantId: null,
        title: "Production safeguards",
      }),
    );
    expect(screen.getByText("Creating…")).toBeInTheDocument();
  });

  it("closes from an explicit cancel action", () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "permission denial",
      new ContextplaneApiError({
        errors: [{ code: "forbidden", message: "forbidden", path: null }],
        requestId: "request-403",
        status: 403,
      }),
      "Only an authorized administrator",
    ],
    [
      "duplicate policy",
      new ContextplaneApiError({
        errors: [{ code: "conflict", message: "conflict", path: null }],
        requestId: "request-409",
        status: 409,
      }),
      "That policy already exists",
    ],
    [
      "invalid service fields",
      new ContextplaneApiError({
        errors: [{ code: "invalid", message: "invalid", path: null }],
        requestId: "request-422",
        status: 422,
      }),
      "The service rejected one or more artifact fields",
    ],
    [
      "other service error",
      new ContextplaneApiError({
        errors: [{ code: "unavailable", message: "try later", path: null }],
        requestId: "request-503",
        status: 503,
      }),
      "try later",
    ],
    ["unexpected failure", new Error("offline"), "The policy could not be created"],
  ])("explains a %s and permits another attempt", async (_name, error, expected) => {
    const onCreate = vi.fn().mockRejectedValue(error);
    renderDialog(onCreate);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Create policy" }));

    expect(await screen.findByText(new RegExp(expected))).toBeVisible();
    expect(screen.getByRole("button", { name: "Create policy" })).toBeEnabled();
  });
});
