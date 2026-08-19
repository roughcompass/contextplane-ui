import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "./Switch";

describe("Switch", () => {
  it("exposes its checked state and requests the inverse state", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        checked
        checkedLabel="Enabled"
        label="Catalog extraction strategy"
        onCheckedChange={onCheckedChange}
        uncheckedLabel="Disabled"
      />,
    );

    const control = screen.getByRole("switch", { name: "Catalog extraction strategy" });
    expect(control).toBeChecked();
    expect(control).toHaveTextContent("Enabled");

    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("uses a button target and does not change while disabled", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        checked={false}
        disabled
        label="Tenant email detection pattern"
        onCheckedChange={onCheckedChange}
      />,
    );

    const control = screen.getByRole("switch", { name: "Tenant email detection pattern" });
    expect(control).not.toBeChecked();
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute("type", "button");

    fireEvent.click(control);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
