import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

const navigation = [
  {
    id: "catalog",
    label: "Catalog",
    items: [
      { href: "/catalog", label: "Capabilities" },
      { href: "/memory", label: "Living memory" },
    ],
  },
] as const;

const tenants = [{ id: "tenant-a", name: "Tenant A" }] as const;

function renderShell() {
  return render(
    <AppShell
      activeHref="/catalog"
      activeTenantId="tenant-a"
      navigation={navigation}
      tenants={tenants}
      user={{ initials: "TC", name: "Test Consumer" }}
    >
      <h1>Catalog page</h1>
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("provides landmark navigation and a skip link", () => {
    renderShell();

    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: "Capabilities" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks one destination current when two share a path prefix", () => {
    /** Prefix matching is what makes `/catalog/abc` light up "Catalog", and it
     * broke the moment two destinations sat in a parent/child relationship:
     * `/memory/review` matched both "Needs review" and "Living memory", so two
     * items claimed `aria-current="page"` in two different sections and a
     * screen reader announced the reader as being in two places at once.
     *
     * The longest match wins, computed across sections rather than within one,
     * because the pair that collided was split across two. */
    render(
      <AppShell
        activeHref="/memory/review"
        activeTenantId="tenant-a"
        navigation={[
          { id: "sources", items: [{ href: "/memory", label: "Living memory" }], label: "Sources" },
          {
            id: "judgement",
            items: [{ href: "/memory/review", label: "Needs review" }],
            label: "Judgement",
          },
        ]}
        tenants={tenants}
        user={{ initials: "TC", name: "Test Consumer" }}
      >
        <h1>Review</h1>
      </AppShell>,
    );

    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(
      within(primary)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent),
    ).toEqual(["Needs review"]);
  });

  it("still marks the list current from a detail address beneath it", () => {
    /** The behaviour the prefix rule exists for, kept: a reader on one
     * capability is still in the Catalog. */
    render(
      <AppShell
        activeHref="/catalog/capability-a"
        activeTenantId="tenant-a"
        navigation={navigation}
        tenants={tenants}
        user={{ initials: "TC", name: "Test Consumer" }}
      >
        <h1>One capability</h1>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Capabilities" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows the active tenant and signed-in user", () => {
    renderShell();

    expect(screen.getByRole("combobox", { name: /^Active tenant/ })).toHaveValue("tenant-a");
    expect(screen.getByText("Test Consumer")).toBeVisible();
  });

  it("moves focus into mobile navigation and restores it after switching tenants", async () => {
    const onTenantChange = vi.fn();

    render(
      <AppShell
        activeHref="/catalog"
        activeTenantId="tenant-a"
        navigation={navigation}
        onTenantChange={onTenantChange}
        tenants={[...tenants, { id: "tenant-b", name: "Tenant B" }]}
        user={{ initials: "TC", name: "Test Consumer" }}
      >
        <h1>Catalog page</h1>
      </AppShell>,
    );

    const menuButton = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(menuButton);

    const dialog = screen.getByRole("dialog", { name: "Primary navigation" });
    expect(within(dialog).getByRole("button", { name: "Close navigation" })).toHaveFocus();

    fireEvent.click(within(dialog).getByRole("combobox", { name: /^Active tenant/ }));
    fireEvent.click(within(dialog).getByRole("option", { name: "Tenant B" }));

    expect(onTenantChange).toHaveBeenCalledWith("tenant-b");
    await waitFor(() => expect(menuButton).toHaveFocus());
    expect(dialog).not.toHaveAttribute("open");
  });

  it("renders a shell-wide search surface when one is supplied", () => {
    render(
      <AppShell
        activeHref="/catalog"
        activeTenantId="tenant-a"
        navigation={navigation}
        search={<input aria-label="Resolve an entity handle" type="search" />}
        tenants={tenants}
        user={{ initials: "TC", name: "Test Consumer" }}
      >
        <h1>Catalog page</h1>
      </AppShell>,
    );

    expect(screen.getByRole("searchbox", { name: "Resolve an entity handle" })).toBeVisible();
  });

  it("renders the header without one, so the slot stays optional", () => {
    render(
      <AppShell
        activeHref="/catalog"
        activeTenantId="tenant-a"
        navigation={navigation}
        tenants={tenants}
        user={{ initials: "TC", name: "Test Consumer" }}
      >
        <h1>Catalog page</h1>
      </AppShell>,
    );

    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^Active tenant/ })).toBeVisible();
  });
});
