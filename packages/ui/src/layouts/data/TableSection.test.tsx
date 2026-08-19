import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TableSection } from "./TableSection";

describe("TableSection", () => {
  it("renders the shared table header without filter disclosure when filters are absent", () => {
    render(
      <TableSection
        description="Service-provided totals for the selected window."
        footer={<span>Updated today</span>}
        title="Usage by surface"
      >
        <table>
          <caption>Usage totals</caption>
          <tbody>
            <tr>
              <td>MCP</td>
            </tr>
          </tbody>
        </table>
      </TableSection>,
    );

    const section = screen.getByRole("region", { name: "Usage by surface" });
    expect(
      within(section).getByText("Service-provided totals for the selected window."),
    ).toBeVisible();
    expect(within(section).getByRole("table", { name: "Usage totals" })).toBeVisible();
    expect(within(section).getByText("Updated today")).toBeVisible();
    expect(within(section).queryByRole("button", { name: /filters/i })).toBeNull();
  });

  it("owns an accessible filter disclosure beside other table actions", () => {
    render(
      <TableSection
        action={<button type="button">Columns</button>}
        filters={<input aria-label="Owner" />}
        title="Context graph records"
      >
        <span>Records</span>
      </TableSection>,
    );

    const section = screen.getByRole("region", { name: "Context graph records" });
    const heading = within(section).getByRole("heading", { name: "Context graph records" });
    const columns = within(section).getByRole("button", { name: "Columns" });
    const showFilters = within(section).getByRole("button", { name: "Show filters" });
    const filtersId = showFilters.getAttribute("aria-controls");

    expect(heading.parentElement?.parentElement).toContainElement(columns);
    expect(heading.parentElement?.parentElement).toContainElement(showFilters);
    expect(showFilters).toHaveAttribute("aria-expanded", "false");
    expect(filtersId).not.toBeNull();
    if (!filtersId) throw new Error("Filter disclosure is missing aria-controls.");
    expect(document.getElementById(filtersId)).toHaveAttribute("hidden");
    expect(within(section).queryByRole("textbox", { name: "Owner" })).toBeNull();

    fireEvent.click(showFilters);

    const hideFilters = within(section).getByRole("button", { name: "Hide filters" });
    expect(hideFilters).toHaveAttribute("aria-expanded", "true");
    expect(within(section).getByRole("textbox", { name: "Owner" })).toBeVisible();

    fireEvent.click(hideFilters);
    expect(within(section).getByRole("button", { name: "Show filters" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("supports controlled filter visibility", () => {
    const onFiltersVisibleChange = vi.fn();
    const { rerender } = render(
      <TableSection
        filters={<input aria-label="Action" />}
        filtersVisible={false}
        onFiltersVisibleChange={onFiltersVisibleChange}
        title="Audit entries"
      >
        <span>Entries</span>
      </TableSection>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show filters" }));
    expect(onFiltersVisibleChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("textbox", { name: "Action" })).toBeNull();

    rerender(
      <TableSection
        filters={<input aria-label="Action" />}
        filtersVisible
        onFiltersVisibleChange={onFiltersVisibleChange}
        title="Audit entries"
      >
        <span>Entries</span>
      </TableSection>,
    );

    expect(screen.getByRole("button", { name: "Hide filters" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Action" })).toBeVisible();
  });
});
