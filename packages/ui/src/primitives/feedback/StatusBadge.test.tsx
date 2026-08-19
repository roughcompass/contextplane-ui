import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge, type StatusTone } from "./StatusBadge";

const tones: readonly StatusTone[] = ["neutral", "info", "success", "warning", "danger"];

describe("StatusBadge", () => {
  it.each(tones)("renders text and icon treatment for the %s tone", (tone) => {
    render(<StatusBadge tone={tone}>{tone}</StatusBadge>);

    const badge = screen.getByText(tone);
    expect(badge.querySelector("svg")).not.toBeNull();
    expect(badge).toHaveClass(`text-${tone === "neutral" ? "muted" : tone}`);
  });

  it("uses the neutral tone by default", () => {
    render(<StatusBadge>Unknown</StatusBadge>);

    expect(screen.getByText("Unknown")).toHaveClass("text-muted");
  });
});
