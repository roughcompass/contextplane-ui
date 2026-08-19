import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Brand } from "./Brand";
import { BRAND } from "./constants";

describe("Brand", () => {
  it("owns the product name and visual mark in one replaceable component", () => {
    const ref = createRef<HTMLSpanElement>();

    render(
      <Brand
        ref={ref}
        className="custom-brand"
        markClassName="custom-mark"
        nameClassName="custom-name"
      />,
    );

    expect(BRAND.name).toBe("DE Context Plane");
    expect(ref.current).toHaveClass("custom-brand");
    expect(screen.getByText(BRAND.name)).toHaveClass("custom-name");
    expect(ref.current?.querySelector("svg")).toHaveClass("custom-mark");
  });
});
