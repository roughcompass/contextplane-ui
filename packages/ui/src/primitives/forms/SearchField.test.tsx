import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { SearchField } from "./SearchField";

describe("SearchField", () => {
  it("labels, controls, and forwards its input ref", () => {
    const onChange = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(
      <SearchField
        ref={ref}
        className="w-72"
        controlClassName="custom-control"
        inputClassName="custom-input"
        label="Search records"
        onChange={onChange}
        placeholder="Capability, interface, or owner"
        value=""
      />,
    );

    const input = screen.getByRole("searchbox", { name: "Search records" });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute("placeholder", "Capability, interface, or owner");
    expect(input).toHaveClass("custom-input");
    expect(input.closest("span")).toHaveClass("custom-control", "min-h-11");
    expect(input.closest("label")).toHaveClass("w-72");

    fireEvent.change(input, { target: { value: "identity" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("can visually hide its persistent label without removing the accessible name", () => {
    render(<SearchField hideLabel label="Search sessions" defaultValue="session-1" />);

    expect(screen.getByText("Search sessions")).toHaveClass("sr-only");
    expect(screen.getByRole("searchbox", { name: "Search sessions" })).toHaveValue("session-1");
  });
});
