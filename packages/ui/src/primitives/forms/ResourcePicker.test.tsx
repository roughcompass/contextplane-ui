import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResourcePicker, type ResourcePage, type ResourceQuery } from "./ResourcePicker";

const FIRST_PAGE: ResourcePage = {
  items: [
    { description: "team-payments", label: "Checkout service", value: "11111111-1111-1111-1111-111111111111" },
    { label: "Ledger service", value: "22222222-2222-2222-2222-222222222222" },
  ],
  next_cursor: "opaque-next",
};

const SECOND_PAGE: ResourcePage = {
  items: [{ label: "Notifications service", value: "33333333-3333-3333-3333-333333333333" }],
  next_cursor: null,
};

function loader(pages: readonly ResourcePage[] = [FIRST_PAGE, SECOND_PAGE]) {
  const calls: ResourceQuery[] = [];
  const load = vi.fn(async (query: ResourceQuery): Promise<ResourcePage> => {
    calls.push(query);
    return query.cursor === null ? pages[0]! : pages[1]!;
  });
  return { calls, load };
}

async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Component" }));
  expect(await screen.findByRole("option", { name: /Checkout service/u })).toBeVisible();
}

describe("ResourcePicker", () => {
  it("shows names rather than the identifier the field is for", async () => {
    // The whole point of ADR 0018: a reader cannot type a value they have no
    // way to obtain, so the control shows them what exists by name.
    const { load } = loader();
    render(<ResourcePicker label="Component" load={load} onValueChange={vi.fn()} value="" />);

    await open();

    expect(screen.getByRole("option", { name: /Checkout service/u })).toBeVisible();
    expect(screen.queryByText("11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("returns the identifier when a record is chosen", async () => {
    const onValueChange = vi.fn();
    const { load } = loader();
    render(<ResourcePicker label="Component" load={load} onValueChange={onValueChange} value="" />);

    await open();
    fireEvent.click(screen.getByRole("option", { name: /Checkout service/u }));

    expect(onValueChange).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111");
  });

  it("searches at the service rather than filtering the page it happens to hold", async () => {
    // Filtering client-side would report "no match" about a collection it never
    // asked, which is worse than not searching at all.
    const { calls, load } = loader();
    render(<ResourcePicker label="Component" load={load} onValueChange={vi.fn()} value="" />);

    await open();
    fireEvent.change(screen.getByRole("textbox", { name: "Component search" }), {
      target: { value: "ledger" },
    });

    await waitFor(() => expect(calls.some((call) => call.search === "ledger")).toBe(true));
  });

  it("pages with the cursor and returns it unchanged", async () => {
    // A cursor is the service's own bookmark. Decoding one is how a client
    // starts depending on an ordering nobody promised it.
    const { calls, load } = loader();
    render(<ResourcePicker label="Component" load={load} onValueChange={vi.fn()} value="" />);

    await open();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("option", { name: /Notifications service/u })).toBeVisible();
    expect(calls.at(-1)?.cursor).toBe("opaque-next");
    // And the first page's rows are still there: paging appends rather than
    // replacing, so a reader does not lose what they were looking at.
    expect(screen.getByRole("option", { name: /Checkout service/u })).toBeVisible();
  });

  it("stops offering more when the service says there is none", async () => {
    const { load } = loader();
    render(<ResourcePicker label="Component" load={load} onValueChange={vi.fn()} value="" />);

    await open();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("option", { name: /Notifications service/u });

    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("names a value that was already set", async () => {
    // A value arriving from a URL or a previous session would otherwise render
    // as the identifier this control exists to stop showing people.
    const { load } = loader();
    const resolve = vi.fn(async () => ({ label: "Checkout service", value: "already-set" }));
    render(
      <ResourcePicker
        label="Component"
        load={load}
        onValueChange={vi.fn()}
        resolve={resolve}
        value="already-set"
      />,
    );

    expect(await screen.findByRole("button", { name: "Component" })).toHaveTextContent(
      "Checkout service",
    );
    expect(resolve).toHaveBeenCalledWith("already-set");
  });

  it("resolves a pasted identifier instead of rejecting it", async () => {
    // ADR 0018's dissent, answered: an operator with the UUID already on their
    // clipboard keeps their fast path, and gains a check — they see which
    // record they pasted before they act on it.
    const onValueChange = vi.fn();
    const resolve = vi.fn(async (value: string) => ({ label: "Pasted service", value }));
    const load = vi.fn(async (): Promise<ResourcePage> => ({ items: [], next_cursor: null }));
    render(
      <ResourcePicker
        label="Component"
        load={load}
        onValueChange={onValueChange}
        resolve={resolve}
        value=""
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Component" }));
    const search = await screen.findByRole("textbox", { name: "Component search" });
    fireEvent.change(search, { target: { value: "44444444-4444-4444-4444-444444444444" } });
    fireEvent.keyDown(search, { key: "Enter" });

    await waitFor(() =>
      expect(onValueChange).toHaveBeenCalledWith("44444444-4444-4444-4444-444444444444"),
    );
    expect(resolve).toHaveBeenCalledWith("44444444-4444-4444-4444-444444444444");
  });

  it("says the list failed to load rather than saying there is no match", async () => {
    // A reader shown "no match" for a request that never arrived would conclude
    // the record does not exist.
    const load = vi.fn(async (): Promise<ResourcePage> => {
      throw new Error("service unavailable");
    });
    render(<ResourcePicker label="Component" load={load} onValueChange={vi.fn()} value="" />);

    fireEvent.click(screen.getByRole("button", { name: "Component" }));

    expect(await screen.findByText(/could not be loaded/u)).toBeVisible();
    expect(screen.queryByText(/No match/u)).toBeNull();
  });

  it("says nothing matched when the service returned nothing", async () => {
    const load = vi.fn(async (): Promise<ResourcePage> => ({ items: [], next_cursor: null }));
    render(<ResourcePicker label="Component" load={load} onValueChange={vi.fn()} value="" />);

    fireEvent.click(screen.getByRole("button", { name: "Component" }));

    expect(await screen.findByText(/No match/u)).toBeVisible();
  });

  it("opens from the keyboard and closes on Escape", async () => {
    const { load } = loader();
    render(<ResourcePicker label="Component" load={load} onValueChange={vi.fn()} value="" />);
    const trigger = screen.getByRole("button", { name: "Component" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const search = await screen.findByRole("textbox", { name: "Component search" });

    fireEvent.keyDown(search, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it("asks for nothing while it is closed", () => {
    // The picker is on screens with many fields. Loading every collection on
    // mount would issue a dozen requests for lists nobody opened.
    const { load } = loader();
    render(<ResourcePicker label="Component" load={load} onValueChange={vi.fn()} value="" />);

    expect(load).not.toHaveBeenCalled();
  });

  it("cannot be opened when disabled", () => {
    const { load } = loader();
    render(<ResourcePicker disabled label="Component" load={load} onValueChange={vi.fn()} value="" />);

    fireEvent.click(screen.getByRole("button", { name: "Component" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
