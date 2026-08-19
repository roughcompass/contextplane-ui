import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionSurface } from "./SectionSurface";

it("associates a section with its visible title and optional slots", () => {
  render(
    <SectionSurface
      action={<button type="button">Export</button>}
      description="Approved organizational records"
      footer={<span>Updated today</span>}
      title="Capabilities"
    >
      <p>Catalog content</p>
    </SectionSurface>,
  );

  const section = screen.getByRole("region", { name: "Capabilities" });
  expect(section).toContainElement(screen.getByText("Catalog content"));
  expect(screen.getByRole("button", { name: "Export" })).toBeVisible();
  expect(screen.getByText("Updated today")).toBeVisible();
});

describe("SectionSurface", () => {
  it("keeps its description attached to the section header", () => {
    render(
      <SectionSurface description="Review supporting evidence" title="Review queue">
        <span>Queue</span>
      </SectionSurface>,
    );

    expect(screen.getByText("Review supporting evidence")).toBeVisible();
  });
});
