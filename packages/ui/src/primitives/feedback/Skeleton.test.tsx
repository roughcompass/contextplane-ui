import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("stays decorative and respects reduced-motion utility behavior", () => {
    const { container } = render(<Skeleton className="h-6" data-state="loading" />);
    const skeleton = container.firstElementChild;

    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton).toHaveAttribute("data-state", "loading");
    expect(skeleton).toHaveClass("motion-safe:animate-pulse", "h-6");
  });

  it("supports a stronger treatment on muted surfaces", () => {
    const { container } = render(<Skeleton tone="strong" />);

    expect(container.firstElementChild).toHaveClass("bg-border");
    expect(container.firstElementChild).not.toHaveClass("bg-surface-muted");
  });
});
