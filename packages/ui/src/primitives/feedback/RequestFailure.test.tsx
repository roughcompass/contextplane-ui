import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { RequestFailure } from "./RequestFailure";

describe("RequestFailure", () => {
  it("renders retry recovery and support correlation context", () => {
    const onRetry = vi.fn();
    const ref = createRef<HTMLDivElement>();
    render(
      <RequestFailure
        ref={ref}
        className="custom-failure"
        onRetry={onRetry}
        requestId="request-123"
        title="Sessions could not be loaded"
      >
        Existing page context remains visible.
      </RequestFailure>,
    );

    expect(ref.current).toHaveClass("custom-failure", "text-danger");
    expect(screen.getByText("Existing page context remains visible.")).toBeVisible();
    expect(screen.getByText("request-123")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry request" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("supports warning failures, custom recovery labels, and an omitted request ID", () => {
    render(
      <RequestFailure
        onRetry={() => undefined}
        retryLabel="Reconnect"
        title="Select an API tenant"
        variant="warning"
      >
        Choose a tenant before retrying.
      </RequestFailure>,
    );

    expect(screen.getByText("Select an API tenant").closest(".text-warning")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeVisible();
    expect(screen.queryByText(/Request ID:/)).toBeNull();
  });
});
