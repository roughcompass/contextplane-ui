import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchableSelect } from "./SearchableSelect";

const options = [
  { label: "Capability created", value: "capability.create" },
  { label: "Proposal approved", value: "proposal.approve" },
  { label: "Proposal rejected", value: "proposal.reject" },
];

describe("SearchableSelect", () => {
  it("filters options and selects one with the keyboard", async () => {
    const onValueChange = vi.fn();
    render(
      <SearchableSelect
        emptyLabel="All actions"
        label="Action"
        onValueChange={onValueChange}
        options={options}
        value=""
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Action All actions" }));
    const search = await screen.findByRole("combobox", { name: "Search Action" });
    await waitFor(() => expect(search).toHaveFocus());

    fireEvent.change(search, { target: { value: "rejected" } });
    expect(screen.queryByRole("option", { name: "Proposal approved" })).toBeNull();
    expect(screen.getByRole("option", { name: "Proposal rejected" })).toBeVisible();
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("proposal.reject");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("supports pointer selection, empty results, and escape dismissal", async () => {
    const onValueChange = vi.fn();
    render(
      <SearchableSelect
        emptyLabel="All actions"
        emptyMessage="No actions found"
        label="Action"
        onValueChange={onValueChange}
        options={options}
        value="proposal.approve"
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Action Proposal approved" });
    expect(trigger).toHaveClass("cursor-pointer");
    fireEvent.click(trigger);
    const search = await screen.findByRole("combobox", { name: "Search Action" });
    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.getByText("No actions found")).toBeVisible();
    fireEvent.keyDown(search, { key: "Escape" });

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("supports required, hidden-label, and disabled dropdowns", () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <SearchableSelect
        allowEmpty={false}
        disabled
        hideLabel
        label="Active tenant"
        onValueChange={onValueChange}
        options={[
          { label: "Tenant A", value: "tenant-a" },
          { label: "Tenant B", value: "tenant-b" },
        ]}
        value="tenant-b"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Active tenant Tenant B" })).toBeDisabled();

    rerender(
      <SearchableSelect
        allowEmpty={false}
        hideLabel
        label="Active tenant"
        onValueChange={onValueChange}
        options={[
          { label: "Tenant A", value: "tenant-a" },
          { label: "Tenant B", value: "tenant-b" },
        ]}
        value="tenant-b"
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Active tenant Tenant B" }));
    expect(screen.queryByRole("option", { name: "Select an option" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Tenant A" }));
    expect(onValueChange).toHaveBeenCalledWith("tenant-a");
  });
});
