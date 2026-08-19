import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailsLink } from "./DetailsLink";

describe("DetailsLink", () => {
  it("provides the standard details navigation treatment", () => {
    render(<DetailsLink href="/records/record-1" />);

    const link = screen.getByRole("link", { name: "View details" });
    expect(link).toHaveAttribute("href", "/records/record-1");
    expect(link).toHaveClass("text-accent", "hover:underline");
    expect(link.querySelector("svg")).not.toBeNull();
  });

  it("accepts a specific details label", () => {
    render(<DetailsLink href="/records/record-1">Inspect record</DetailsLink>);

    expect(screen.getByRole("link", { name: "Inspect record" })).toBeVisible();
  });
});
