import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "./Toast";
import { useToast } from "./ToastContext";

function ToastControls() {
  const { showToast } = useToast();
  return (
    <>
      <button
        onClick={() =>
          showToast({
            duration: 0,
            message: "Capability Observation is now enabled.",
            title: "Extraction strategy updated",
          })
        }
        type="button"
      >
        Show success
      </button>
      <button
        onClick={() =>
          showToast({
            message: "The service refused the write.",
            title: "Update failed",
            variant: "danger",
          })
        }
        type="button"
      >
        Show failure
      </button>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("announces and dismisses a persistent success toast", () => {
    render(
      <ToastProvider>
        <ToastControls />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    const notifications = screen.getByRole("region", { name: "Notifications" });
    const toast = within(notifications).getByRole("status");
    expect(toast).toHaveTextContent("Extraction strategy updated");
    expect(toast).toHaveTextContent("Capability Observation is now enabled.");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Extraction strategy updated" }));
    expect(within(notifications).queryByRole("status")).toBeNull();
  });

  it("uses an alert for danger and removes it after the default duration", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastControls />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show failure" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Update failed");

    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
