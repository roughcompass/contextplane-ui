import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImpactBadge } from "./ImpactBadge";

describe("ImpactBadge", () => {
  it("renders the shared high-impact treatment", () => {
    render(<ImpactBadge highImpact />);

    expect(screen.getByText("High impact")).toHaveClass("rounded-full", "bg-warning-subtle");
  });

  it("renders the shared no-flag treatment", () => {
    render(<ImpactBadge highImpact={false} />);

    expect(screen.getByText("No high-impact flag")).toHaveClass("rounded-full", "bg-surface-muted");
  });
});
