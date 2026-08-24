import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextplaneApiError } from "../../shared/api/client";
import type { PickerSource } from "../../shared/pickers/sources";
import { ArcArtifactDialog } from "./ArcArtifactDialog";

function chooseOption(controlName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: new RegExp(`^${controlName}`) }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

const tenantId = "b0000000-0000-4000-8000-000000000001";

const tenants: PickerSource = async () => ({
  items: [
    { description: "northstar", label: "Northstar Systems", value: tenantId },
    {
      description: "field-labs",
      label: "Field Labs",
      value: "b0000000-0000-4000-8000-000000000002",
    },
  ],
  next_cursor: null,
});

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/^Title/), {
    target: { value: "  Production safeguards  " },
  });
  fireEvent.change(screen.getByLabelText(/Stable slug/), {
    target: { value: "  production-safeguards  " },
  });
}

function renderDialog(onCreate = vi.fn(async () => undefined), defaultTenantId = tenantId) {
  const onClose = vi.fn();
  render(
    <ArcArtifactDialog
      defaultTenantId={defaultTenantId}
      onClose={onClose}
      onCreate={onCreate}
      tenants={tenants}
    />,
  );
  return { onClose, onCreate };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ArcArtifactDialog", () => {
  it("validates required policy fields and clears corrected errors", async () => {
    const { onCreate } = renderDialog();

    expect(screen.getByLabelText(/^Title/)).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Create policy" }));
    expect(await screen.findByText("Enter an artifact title.")).toBeVisible();
    expect(screen.getByText("Enter a stable artifact slug.")).toBeVisible();

    fillRequiredFields();
    expect(screen.queryByText("Enter an artifact title.")).toBeNull();
    expect(screen.queryByText("Enter a stable artifact slug.")).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("still refuses a tenant-scoped policy with no tenant chosen", async () => {
    /** The picker cannot be emptied by hand, so the only way here is a
     * credential that arrived without a tenant. That is a real case rather than
     * a defensive one, and dropping the check with the text box would have let
     * such a caller create a tenant-scoped policy attached to nothing. */
    const { onCreate } = renderDialog(vi.fn(async () => undefined), "");
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Create policy" }));

    expect(await screen.findByText("Enter a tenant ID.")).toBeVisible();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("attaches the tenant a chooser picked rather than one they typed", async () => {
    /** A tenant-scoped policy sent to the wrong tenant is governance that
     * silently applies to somebody else, and a typed UUID is one transposition
     * away from being one. */
    const { onCreate } = renderDialog();
    fillRequiredFields();

    fireEvent.click(screen.getByRole("button", { name: /Target tenant/u }));
    fireEvent.click(await screen.findByRole("option", { name: /Field Labs/u }));
    fireEvent.click(screen.getByRole("button", { name: "Create policy" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ targetTenantId: "b0000000-0000-4000-8000-000000000002" }),
    );
  });

  it("creates a trimmed global standard without attaching a tenant", async () => {
    const { onCreate } = renderDialog();
    fillRequiredFields();
    chooseOption("Artifact kind", "Standard");
    chooseOption("Owning scope", "Global");

    expect(screen.getByText("Global scope requires operator authority")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Target tenant/u })).toBeNull();
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
