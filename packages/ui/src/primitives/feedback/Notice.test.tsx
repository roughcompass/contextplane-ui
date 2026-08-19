import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Notice } from "./Notice";

describe("Notice", () => {
  it("renders optional actions and forwards its ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Notice
        ref={ref}
        action={<button type="button">Review evidence</button>}
        className="custom-notice"
        title="Evidence available"
        variant="success"
      >
        Inspect the supporting citations.
      </Notice>,
    );

    expect(ref.current).toHaveClass("custom-notice", "text-success");
    expect(screen.getByRole("button", { name: "Review evidence" })).toBeVisible();
    expect(screen.getByText("Inspect the supporting citations.")).toBeVisible();
  });

  it("uses an alert only for danger by default and permits an explicit role", () => {
    const { rerender } = render(
      <Notice title="Request failed" variant="danger">
        Try again.
      </Notice>,
    );

    expect(screen.getByRole("alert")).toBeVisible();

    rerender(
      <Notice role="note" title="Context note" variant="warning">
        Review before acting.
      </Notice>,
    );

    expect(screen.getByRole("note")).toHaveClass("text-warning");
  });

  it("uses the informational treatment by default", () => {
    render(<Notice title="Context boundary">Canonical records only.</Notice>);

    expect(screen.getByText("Context boundary").closest("div[role]")).toBeNull();
    expect(screen.getByText("Context boundary").closest(".text-info")).not.toBeNull();
  });
});
