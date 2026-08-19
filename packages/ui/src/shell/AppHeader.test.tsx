import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "./AppHeader";

const tenants = [
  { id: "tenant-a", name: "Tenant A" },
  { id: "tenant-b", name: "Tenant B" },
] as const;

describe("AppHeader", () => {
  it("runs navigation, tenant, and dark-theme controls without global search", () => {
    const headerRef = createRef<HTMLElement>();
    const gettingStartedButtonRef = createRef<HTMLButtonElement>();
    const menuButtonRef = createRef<HTMLButtonElement>();
    const onOpenGettingStarted = vi.fn();
    const onOpenNavigation = vi.fn();
    const onTenantChange = vi.fn();
    const onThemeToggle = vi.fn();

    render(
      <AppHeader
        ref={headerRef}
        activeTenantId="tenant-a"
        className="custom-header"
        gettingStartedButtonRef={gettingStartedButtonRef}
        menuButtonRef={menuButtonRef}
        onOpenGettingStarted={onOpenGettingStarted}
        onOpenNavigation={onOpenNavigation}
        onTenantChange={onTenantChange}
        onThemeToggle={onThemeToggle}
        tenants={tenants}
        theme="dark"
        user={{ initials: "MM", name: "Morgan Morris", role: "Producer" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    fireEvent.click(screen.getByRole("combobox", { name: /^Active tenant/ }));
    fireEvent.click(screen.getByRole("option", { name: "Tenant B" }));
    const gettingStartedButton = screen.getByRole("button", {
      name: "Open getting started walkthrough",
    });
    const themeButton = screen.getByRole("button", { name: "Use light theme" });
    fireEvent.click(gettingStartedButton);
    fireEvent.click(themeButton);

    expect(headerRef.current).toHaveClass("custom-header");
    expect(menuButtonRef.current).toBe(screen.getByRole("button", { name: "Open navigation" }));
    expect(gettingStartedButtonRef.current).toBe(gettingStartedButton);
    expect(
      gettingStartedButton.compareDocumentPosition(themeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "DE Context Plane" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Producer")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Search/ })).toBeNull();
    expect(onOpenNavigation).toHaveBeenCalledOnce();
    expect(onOpenGettingStarted).toHaveBeenCalledOnce();
    expect(onTenantChange).toHaveBeenCalledWith("tenant-b");
    expect(onThemeToggle).toHaveBeenCalledOnce();
  });

  it("uses defaults and disables tenant switching when no controls are available", () => {
    render(
      <AppHeader
        activeTenantId="tenant-a"
        onOpenNavigation={vi.fn()}
        tenants={tenants.slice(0, 1)}
        user={{ initials: "TC", name: "Test Consumer" }}
      />,
    );

    expect(screen.getByRole("link", { name: "DE Context Plane" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: /^Active tenant/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Use dark theme" })).toBeNull();
    expect(screen.queryByText("Producer")).toBeNull();
  });

  it("renders the light-theme control", () => {
    render(
      <AppHeader
        activeTenantId="tenant-a"
        onOpenNavigation={vi.fn()}
        onThemeToggle={vi.fn()}
        tenants={tenants}
        user={{ initials: "TC", name: "Test Consumer" }}
      />,
    );

    expect(screen.getByRole("button", { name: "Use dark theme" })).toBeVisible();
  });
});
