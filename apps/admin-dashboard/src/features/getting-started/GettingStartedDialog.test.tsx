import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GettingStartedDialog } from "./GettingStartedDialog";

describe("GettingStartedDialog", () => {
  it("shows how DE Context Plane grounds autonomous delivery without claiming to execute it", () => {
    const onClose = vi.fn();
    render(<GettingStartedDialog activeTenantName="Northstar Systems" onClose={onClose} />);

    const dialog = screen.getByRole("dialog", {
      name: "Getting started with DE Context Plane",
    });
    expect(dialog).toHaveAttribute("open");
    expect(
      screen.getByRole("heading", { name: "Getting started with DE Context Plane" }),
    ).toHaveFocus();
    expect(
      within(dialog).getByText("Autonomous delivery needs more than code generation."),
    ).toBeVisible();
    expect(
      within(dialog).getByText("Context is the foundation, not the whole delivery system"),
    ).toBeVisible();
    expect(within(dialog).getByText("Step 1 of 6")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Back" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    expect(
      within(dialog).getByText("Agents and people need the same operating context."),
    ).toBeVisible();
    expect(within(dialog).getByText("Agent platform teams")).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(
      within(dialog).getByText("Autonomous delivery needs more than code generation."),
    ).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "DE Context Plane's role" }));
    expect(within(dialog).getByText("Canonical catalog")).toBeVisible();
    expect(within(dialog).getByText("DE Context Plane is not the delivery engine")).toBeVisible();
    expect(within(dialog).getByText(/It does not plan work, edit code/)).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Agent access" }));
    expect(within(dialog).getByText(/Model Context Protocol \(MCP\) server/)).toBeVisible();
    expect(within(dialog).getByText("search_capabilities")).toBeVisible();
    expect(within(dialog).getByText("add_workspace_entry")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delivery workflow" }));
    expect(within(dialog).getByText(/1\. Ground the intent/)).toBeVisible();
    expect(within(dialog).getByText(/3\. Execute through delivery systems/)).toBeVisible();
    expect(within(dialog).getByText(/outside DE Context Plane/)).toBeVisible();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "Walkthrough section" }), {
      target: { value: "5" },
    });
    expect(within(dialog).getByText("Ground the next delivery task.")).toBeVisible();
    expect(within(dialog).getByText("You are exploring Northstar Systems")).toBeVisible();
    expect(
      within(dialog).getByRole("link", { name: "Ground a task in Context Lab" }),
    ).toHaveAttribute("href", "/context-lab");

    fireEvent.click(within(dialog).getByRole("button", { name: "Finish walkthrough" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes from the dialog cancel event", () => {
    const onClose = vi.fn();
    render(<GettingStartedDialog activeTenantName="Field Labs" onClose={onClose} />);

    const dialog = screen.getByRole("dialog", {
      name: "Getting started with DE Context Plane",
    });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
