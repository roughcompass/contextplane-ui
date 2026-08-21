import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataToolbar } from "./DataToolbar";

describe("DataToolbar", () => {
  it("renders every toolbar slot and announces result changes", () => {
    render(
      <DataToolbar
        actions={<button type="button">Save view</button>}
        className="custom-toolbar"
        filters={<input aria-label="Owner" />}
        resultSummary="4 records shown"
        search={<input aria-label="Search records" />}
      />,
    );

    const action = screen.getByRole("button", { name: "Save view" });
    const resultSummary = screen.getByText("4 records shown");

    expect(action).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Owner" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Search records" })).toBeVisible();
    expect(resultSummary).toHaveAttribute("aria-live", "polite");
    expect(resultSummary.parentElement).toContainElement(action);
    expect(resultSummary.parentElement).toHaveClass(
      "flex-col",
      "sm:flex-row",
      "sm:justify-between",
    );
    expect(action.parentElement).toHaveClass("w-full", "sm:w-auto");
    expect(resultSummary.closest(".custom-toolbar")).not.toBeNull();
  });

  it("supports an empty toolbar surface", () => {
    const { container } = render(<DataToolbar />);

    expect(container.querySelectorAll("button, input, select")).toHaveLength(0);
    expect(container).toHaveTextContent("");
  });
});
