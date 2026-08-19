import { render, screen } from "@testing-library/react";
import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("uses the same shared height for text-only and icon-labelled actions", () => {
    render(
      <>
        <Button variant="secondary">Export catalog</Button>
        <Button>
          <Plus aria-hidden="true" />
          Add capability
        </Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Export catalog" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Add capability" })).toHaveClass("h-11");
  });

  it("provides an inset action that darkens its containing surface", () => {
    render(<Button variant="inset">Retry request</Button>);

    expect(screen.getByRole("button", { name: "Retry request" })).toHaveClass(
      "bg-black/10",
      "dark:bg-black/20",
      "hover:bg-black/15",
    );
  });
});
