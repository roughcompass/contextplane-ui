import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SummaryStrip } from "./SummaryStrip";

describe("SummaryStrip", () => {
  it("renders stable summary items with optional detail", () => {
    render(
      <SummaryStrip
        className="custom-summary"
        items={[
          { detail: "Approved", id: "canonical", label: "Canonical", value: "184" },
          { id: "review", label: "Needs review", value: "12" },
          { detail: "Pending", id: "proposals", label: "Proposals", value: "4" },
          { detail: "Observed", id: "relationships", label: "Relationships", value: "1,248" },
        ]}
        label="Catalog summary"
      />,
    );

    expect(screen.getByRole("region", { name: "Catalog summary" })).toHaveClass("custom-summary");
    expect(screen.getByText("184")).toHaveClass("tabular-nums");
    expect(screen.getByText("Approved")).toBeVisible();
    expect(screen.queryByText("Requires review detail")).toBeNull();
    expect(screen.getByText("Relationships").parentElement).toHaveClass("sm:border-l");
  });
});
