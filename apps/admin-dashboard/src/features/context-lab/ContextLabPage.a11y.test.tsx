import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { createRef, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import { clientFromRequest } from "../../shared/api";
import { ContextLabPage } from "./ContextLabPage";

/**
 * WCAG checks over the journey this dashboard exists for.
 *
 * `.develop/DESIGN.md` makes *"WCAG 2.2 AA … the release baseline"* and asks for
 * keyboard and screen-reader testing **"in addition to automated accessibility
 * checks"**. There were no automated checks — no axe, no equivalent, nothing —
 * so the sentence referred to a step that did not exist and the baseline was
 * asserted rather than measured.
 *
 * This measures it on one page, deliberately: Context Lab is the surface the
 * product is *for*, and it now carries most of what was added recently — a
 * blocked action with an inline remedy, a prompt-saving form with a radio group,
 * a judged score with review controls. A violation here is a violation in the
 * patterns those were built from.
 *
 * Scoped to the rules that describe a real barrier rather than the full ruleset:
 * `color-contrast` cannot be evaluated in jsdom (no layout, no computed paint),
 * and reporting it as passing would be worse than not running it — DESIGN.md
 * asks for contrast to be checked *"in a real browser — not inferred from markup
 * or class names"*, which this is not a substitute for.
 */

const identity = {
  actor_display_name: "Morgan Morris",
  actor_email: null,
  actor_id: "a0000000-0000-4000-8000-000000000001",
  roles: ["consumer"],
  tenant_display_name: "Northstar Systems",
  tenant_id: "b0000000-0000-4000-8000-000000000001",
  tenant_slug: "northstar",
};

/** Rules jsdom can actually decide. Contrast and layout need a real browser. */
const RUNNABLE = {
  rules: {
    "color-contrast": { enabled: false },
    region: { enabled: false },
  },
};

function handler(path: string): unknown {
  if (path === "/v1/whoami") return identity;
  if (path === "/v1/evaluation/expectation-presets") {
    return {
      items: [
        {
          description: "Both judged criteria must pass.",
          envelope_rubric_version: "context-envelope-judge v2.0.0",
          expectations: { preset: "balanced" },
          judge_rubric_version: "agent-response-judge v1.0.0",
          name: "balanced",
        },
      ],
    };
  }
  if (path === "/v1/evaluation/prompt-sets") {
    return {
      items: [
        {
          created_at: "2026-08-01T00:00:00Z",
          description: null,
          name: "Ownership questions",
          prompt_count: 2,
          retired_at: null,
          set_id: "set-1",
        },
      ],
    };
  }
  if (path === "/v1/evaluation/simulations/availability") {
    return {
      available: true,
      judge_model: "gpt-judge",
      judge_provider: "openai",
      simulation_model: "claude-sonnet-5",
      simulation_provider: "anthropic",
    };
  }
  if (path.startsWith("/v1/admin/actors")) {
    return {
      items: [
        {
          actor_id: "e1000000-0000-4000-8000-000000000002",
          actor_kind: "unknown",
          created_at: "2026-08-01T00:00:00Z",
          declared_at: null,
          declared_by: null,
          display_name: "Nobody declared this",
          is_declared: false,
          oidc_subject: "mystery",
          owner_principal: null,
        },
      ],
      next_cursor: null,
    };
  }
  if (path.startsWith("/v1/capabilities")) {
    return {
      items: [
        {
          created_at: "2026-08-01T00:00:00Z",
          entity_id: "d0000000-0000-4000-8000-000000000001",
          entity_type: "capability",
          external_id: null,
          name: "identity-resolution",
        },
      ],
      next_cursor: null,
    };
  }
  if (path.startsWith("/v1/receipts")) return { items: [], next_cursor: null };
  if (path === "/v1/context/resolve") {
    return {
      arc_block_note: null,
      blocks: [
        { items: [], name: "canonical", reason: null, state: "empty" },
        { items: [], name: "arc", reason: null, state: "empty" },
        { items: [], name: "observed_claims", reason: null, state: "empty" },
        { items: [], name: "workspace", reason: null, state: "empty" },
        { items: [], name: "instructions", reason: null, state: "empty" },
      ],
      instruction_block_note: null,
      instruction_disposition: "not_declared",
      quality: { cacheable: true, degraded_blocks: [], reasons: [] },
      receipt_id: "c0000000-0000-4000-8000-000000000001",
      state: "complete",
    };
  }
  return { items: [], next_cursor: null };
}

function renderPage() {
  const client = clientFromRequest(vi.fn(async (path: string) => handler(path)));
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const searchRef = createRef<HTMLInputElement>();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  return render(
    <ContextLabPage
      activeTenantName="Northstar Systems"
      apiTenantId={identity.tenant_id}
      client={client}
      searchRef={searchRef}
    />,
    { wrapper: Wrapper },
  );
}

async function violations(container: HTMLElement) {
  const result = await axe.run(container, RUNNABLE);
  return result.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`);
}

/**
 * Controls whose only accessible name is their placeholder.
 *
 * DESIGN.md: *"Associate every control with a persistent label, help, and error
 * text. **Placeholder text is never the label.**"* axe does not enforce that —
 * its `label` rule is satisfied by any accessible name, and a placeholder
 * supplies one, so an input with a placeholder and no label passes. Verified
 * rather than assumed: removing a `<label htmlFor>` while leaving the
 * placeholder produced no axe violation at all.
 *
 * The rule exists because a placeholder disappears the moment somebody types.
 * A reader who looks away mid-form is left with a box of text and nothing
 * saying what it is, and a screen-reader user re-reading the field hears the
 * value instead of the question.
 */
function placeholderOnlyLabels(container: HTMLElement): string[] {
  const controls = container.querySelectorAll<HTMLElement>("input, textarea, select");
  const offenders: string[] = [];
  for (const control of controls) {
    if (control.getAttribute("type") === "hidden") continue;
    const placeholder = control.getAttribute("placeholder");
    if (!placeholder) continue;
    const labelled =
      control.getAttribute("aria-label") ||
      control.getAttribute("aria-labelledby") ||
      (control.id && container.querySelector(`label[for="${CSS.escape(control.id)}"]`)) ||
      control.closest("label");
    if (!labelled) offenders.push(`${control.tagName.toLowerCase()}[placeholder="${placeholder}"]`);
  }
  return offenders;
}

describe("Context Lab accessibility", () => {
  it("has no violations before a prompt is resolved", async () => {
    const { container } = renderPage();
    await screen.findByRole("textbox", { name: "Prompt" });

    expect(await violations(container)).toEqual([]);
  });

  it("labels every control with something that survives typing", async () => {
    // The repository's rule, which axe does not check: a placeholder is not a
    // label, because it disappears the moment somebody types into the field.
    const { container } = renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    await screen.findByRole("heading", { level: 2, name: /Save this prompt for later runs/ });

    expect(placeholderOnlyLabels(container)).toEqual([]);
  });

  it("has no violations once the envelope and its actions are on screen", async () => {
    // The state that matters: the panels added recently all appear after a
    // resolution, so the empty page passing says little about them.
    const { container } = renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    await screen.findByRole("heading", { level: 2, name: /Save this prompt for later runs/ });

    expect(await violations(container)).toEqual([]);
  });

  it("has no violations while an action is blocked and offering its remedy", async () => {
    // A blocked control with an inline form beside it is the densest thing on
    // this page: a disabled button, a live explanation, a labelled field and a
    // second action, all describing one decision.
    const { container } = renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Prompt" }), {
      target: { value: "Who owns identity resolution?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resolve context" }));
    fireEvent.click(await screen.findByRole("button", { name: "Simulate as" }));
    fireEvent.click(await screen.findByRole("option", { name: /Nobody declared this/ }));
    await screen.findByText(/Nobody has said what Nobody declared this is/);

    expect(await violations(container)).toEqual([]);
  });
});
