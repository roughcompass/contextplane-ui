import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { PageContainer, PageHeader, type PageWidth } from "./Page";

describe("PageHeader", () => {
  it("applies the shared page-title, overline, and description typography", () => {
    render(
      <PageHeader
        description="Discover approved organizational capabilities."
        eyebrow="Canonical context graph"
        title="Context Graph"
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Context Graph" })).toHaveClass(
      "capitalize",
    );
    expect(screen.getByText("Canonical context graph")).toHaveClass(
      "tracking-[0.04em]",
      "uppercase",
    );
    expect(screen.getByText("Discover approved organizational capabilities.")).toHaveClass(
      "text-base",
      "leading-6",
    );
  });

  it("renders breadcrumbs, metadata, actions, and a forwarded ref", () => {
    const ref = createRef<HTMLElement>();
    render(
      <PageHeader
        ref={ref}
        actions={<button type="button">Create capability</button>}
        breadcrumbs={[{ href: "/", label: "Tenant" }, { label: "Context Graph" }]}
        className="custom-header"
        metadata={<span>Contract current</span>}
        title="Context Graph"
      />,
    );

    expect(ref.current).toHaveClass("custom-header");
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    expect(screen.getByText("Contract current")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create capability" })).toBeVisible();
  });

  it("supports a title-only header", () => {
    render(<PageHeader title="Overview" />);

    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  });
});

describe("PageContainer", () => {
  it.each<[PageWidth | undefined, string]>([
    [undefined, "max-w-[1200px]"],
    ["narrow", "max-w-[600px]"],
    ["settings", "max-w-[800px]"],
    ["standard", "max-w-[1200px]"],
    ["full", "max-w-none"],
  ])("uses the %s width tier", (width, expectedClass) => {
    const { container } = render(
      <PageContainer {...(width ? { width } : {})}>Page content</PageContainer>,
    );

    expect(container.firstElementChild).toHaveClass(expectedClass);
  });
});
