import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders an explanation, icon, action, and forwarded ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <EmptyState
        ref={ref}
        action={<button type="button">Clear filters</button>}
        className="custom-empty"
        description="Adjust the search or owner filter."
        icon={Inbox}
        title="No records match"
      />,
    );

    expect(ref.current).toHaveClass("custom-empty", "py-12");
    expect(ref.current?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("No records match")).toBeVisible();
    expect(screen.getByText("Adjust the search or owner filter.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeVisible();
  });

  it("keeps compact no-match messages free of decorative placeholders", () => {
    const { container } = render(<EmptyState title="No sessions match this ID" />);

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
