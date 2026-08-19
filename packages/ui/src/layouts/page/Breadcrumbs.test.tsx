import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Breadcrumbs } from "./Breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders links, non-linked ancestors, and the current page", () => {
    render(
      <Breadcrumbs
        className="custom-breadcrumbs"
        items={[
          { href: "/", label: "Tenant" },
          { label: "Catalog" },
          { href: "/catalog/capability", label: "Capability" },
        ]}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveClass(
      "custom-breadcrumbs",
    );
    expect(screen.getByRole("link", { name: "Tenant" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Catalog")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Capability")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Capability" })).toBeNull();
  });
});
