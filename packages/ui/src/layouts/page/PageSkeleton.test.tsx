import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageSkeleton } from "./PageSkeleton";

describe("PageSkeleton", () => {
  it("announces loading while keeping placeholder geometry decorative", () => {
    const { container } = render(<PageSkeleton className="route-skeleton" controls={2} rows={3} />);
    const status = screen.getByRole("status", { name: "Loading page" });

    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveClass("route-skeleton");
    expect(container.querySelectorAll('[aria-hidden="true"]')).not.toHaveLength(0);
    expect(container.querySelectorAll("section > div:nth-child(2) > div")).toHaveLength(2);
    expect(container.querySelectorAll("section > div:last-child > div")).toHaveLength(4);
  });
});
