import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { DetailLayout } from "./DetailLayout";

it("composes primary content with persistent decision context", () => {
  render(
    <DetailLayout aside={<p>Decision context</p>} className="custom-detail-layout">
      <p>Primary content</p>
    </DetailLayout>,
  );

  expect(screen.getByText("Primary content")).toBeVisible();
  expect(screen.getByRole("complementary")).toContainElement(screen.getByText("Decision context"));
  expect(screen.getByText("Primary content").closest(".custom-detail-layout")).not.toBeNull();
});
