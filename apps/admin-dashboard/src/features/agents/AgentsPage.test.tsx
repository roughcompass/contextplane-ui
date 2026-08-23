import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { AgentsPage } from "./AgentsPage";

const ACTOR = "11111111-1111-1111-1111-111111111111";

const accuracy = {
  author_actor_id: ACTOR,
  breakdown: "predicate",
  groups: [
    {
      label: "supports",
      n_adjudicated: 10,
      n_correct: 6,
      n_decided: 8,
      n_incorrect: 2,
      n_undecidable: 2,
      rate: 0.75,
    },
  ],
  overall: {
    label: "overall",
    n_adjudicated: 10,
    n_correct: 6,
    n_decided: 8,
    n_incorrect: 2,
    n_undecidable: 2,
    rate: 0.75,
  },
  window_end: "2026-08-31T00:00:00Z",
  window_start: "2026-08-01T00:00:00Z",
};

const autonomy = {
  author_actor_id: ACTOR,
  autonomy_rate: 0.6,
  intervention_rate: 0.4,
  n_autonomous: 6,
  n_intervened: 4,
  n_sessions: 10,
  window_end: "2026-08-31T00:00:00Z",
  window_start: "2026-08-01T00:00:00Z",
};

const failures = {
  author_actor_id: ACTOR,
  groups: [
    {
      claim_category: "capability",
      examples: [],
      incorrect_count: 40,
      predicate: "busy-and-mostly-right",
      rate: 0.04,
      total_count: 1000,
    },
    {
      claim_category: "capability",
      examples: [{ claim_id: "claim-a", note: "Cited a retired version.", value: "v1" }],
      incorrect_count: 3,
      predicate: "rarely-and-mostly-wrong",
      rate: 0.75,
      total_count: 4,
    },
  ],
  n_adjudicated: 1004,
  n_incorrect: 43,
  n_intervention_sessions: 4,
  n_sessions: 10,
  report_id: "report-a",
  window_end: "2026-08-31T00:00:00Z",
  window_start: "2026-08-01T00:00:00Z",
};

const activeInstructionRow = {
  activated_at: "2026-08-02T00:00:00Z",
  author_actor_id: ACTOR,
  content: "Cite the interface version.",
  instruction_id: "instruction-active",
  motivated_by_report_id: "report-a",
  status: "active",
  superseded_at: null,
  version: 2,
};

const supersededRow = {
  ...activeInstructionRow,
  activated_at: "2026-07-01T00:00:00Z",
  instruction_id: "instruction-old",
  status: "superseded",
  version: 1,
};

const proposedRow = {
  activated_at: null,
  author_actor_id: ACTOR,
  content: "Check the version before asserting support.",
  instruction_id: "instruction-proposed",
  motivated_by_report_id: "report-a",
  status: "proposed",
  superseded_at: null,
  version: 3,
};

function testClient(instructions: readonly unknown[] = [activeInstructionRow, supersededRow]) {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (path.includes("/accuracy")) return accuracy;
    if (path.includes("/autonomy")) return autonomy;
    if (path.includes("/failure-patterns")) return failures;
    if (path.includes(":rollback")) return { restored_instruction_id: "instruction-old" };
    if (path.includes(":activate")) return { ...proposedRow, status: "active" };
    if (path.endsWith("/instructions")) {
      return options?.method === "POST" ? { instruction_id: "instruction-new" } : instructions;
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AgentsPage activeTenantName="Northstar Systems" apiTenantId="tenant-a" client={client} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function loadAgent() {
  fireEvent.change(screen.getByLabelText("Agent actor UUID"), { target: { value: ACTOR } });
  fireEvent.click(screen.getByRole("button", { name: "Load agent" }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/agents");
});

describe("AgentsPage", () => {
  it("asks for an agent before reporting any figure about one", async () => {
    const client = testClient();
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Agent performance" })).toBeVisible();
    expect(screen.getByText("Choose an agent to continue")).toBeVisible();
    expect(client.request).not.toHaveBeenCalled();
  });

  it("presents accuracy and autonomy together, with the counts behind each rate", async () => {
    // Two dimensions of one question: an agent can be accurate but needy, or
    // fast and wrong, and a screen showing one without the other cannot tell
    // those apart.
    renderPage(testClient());
    loadAgent();

    // Scoped to the strip: 75.0% is also a failure-group rate further down,
    // and an unscoped query would pass on the wrong element.
    const summary = await screen.findByRole("region", { name: "Agent performance summary" });
    expect(await within(summary).findByText("75.0%")).toBeVisible();
    expect(within(summary).getByText("60.0%")).toBeVisible();
    expect(within(summary).getByText("6 of 8")).toBeVisible();
    expect(within(summary).getByText("6 of 10")).toBeVisible();
    expect(within(summary).getByText("4")).toBeVisible();
  });

  it("ranks failure patterns by rate rather than by volume", async () => {
    renderPage(testClient());
    loadAgent();

    const rows = await screen.findAllByText(/and-mostly-/u);
    expect(rows.map((node) => node.textContent)).toEqual([
      "rarely-and-mostly-wrong",
      "busy-and-mostly-right",
    ]);
  });

  it("expands a failure group to the example claims behind it", async () => {
    renderPage(testClient());
    loadAgent();

    fireEvent.click(await screen.findByRole("button", { name: "Examples (1)" }));
    expect(await screen.findByText("claim-a")).toBeVisible();
    expect(screen.getByText("Cited a retired version.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Hide examples" }));
    expect(screen.queryByText("claim-a")).toBeNull();
  });

  it("names the instruction in force by status, not by version number", async () => {
    // The proposal is version 3 and the active one is version 2. Reading the
    // highest version would name a proposal as governing live behaviour.
    renderPage(testClient([activeInstructionRow, supersededRow, proposedRow]));
    loadAgent();

    expect(await screen.findByText("Version 2 is in force")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Awaiting activation" })).toBeVisible();
  });

  it("refuses a proposal that cites no report, and says which field to fix", async () => {
    // The server has a CHECK requiring evidence. Enforcing it here first turns
    // a database refusal into a field the form will not submit without.
    const client = testClient();
    renderPage(client);
    loadAgent();
    await screen.findByText("Version 2 is in force");

    const form = screen.getByRole("button", { name: /^Propose version/u }).closest("form");
    if (!form) throw new Error("Proposal form was not rendered.");
    fireEvent.change(within(form).getByLabelText("Instruction"), {
      target: { value: "Check the version." },
    });
    fireEvent.submit(form);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose the report this instruction answers.",
    );
    expect(client.request).not.toHaveBeenCalledWith(
      `/v1/agents/${ACTOR}/instructions`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("proposes the next version citing a report chosen from this agent's own reports", async () => {
    const client = testClient();
    renderPage(client);
    loadAgent();
    await screen.findByText("Version 2 is in force");

    const form = screen.getByRole("button", { name: /^Propose version/u }).closest("form");
    if (!form) throw new Error("Proposal form was not rendered.");
    fireEvent.click(within(form).getByRole("combobox", { name: /Motivating failure report/u }));
    fireEvent.click(await screen.findByRole("option", { name: /report-a/u }));
    fireEvent.change(within(form).getByLabelText("Instruction"), {
      target: { value: "Check the version." },
    });
    fireEvent.submit(form);

    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/agents/${ACTOR}/instructions`,
        expect.objectContaining({
          body: {
            content: "Check the version.",
            motivated_by_report_id: "report-a",
            version: 3,
          },
          method: "POST",
        }),
      ),
    );
  });

  it("activates through the item path, not the collection", async () => {
    const client = testClient([activeInstructionRow, supersededRow, proposedRow]);
    renderPage(client);
    loadAgent();

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/agents/${ACTOR}/instructions/instruction-proposed:activate`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("puts rollback behind a confirmation, because it changes live agent behaviour", async () => {
    const client = testClient();
    renderPage(client);
    loadAgent();

    fireEvent.click(await screen.findByRole("button", { name: "Roll back…" }));
    expect(client.request).not.toHaveBeenCalledWith(
      expect.stringContaining(":rollback"),
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm rollback" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        `/v1/agents/${ACTOR}/instructions:rollback`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("does not offer rollback when nothing was ever activated before the current one", async () => {
    // Rollback restores the previously *active* instruction. With one
    // activation ever there is nothing behind it, and offering the action
    // would promise a result the server declines to produce.
    renderPage(testClient([activeInstructionRow, proposedRow]));
    loadAgent();

    await screen.findByText("Version 2 is in force");
    expect(screen.queryByRole("button", { name: "Roll back…" })).toBeNull();
  });

  it("stays recoverable when the agent services are unavailable", async () => {
    const request = vi.fn(async () => {
      throw new Error("service unavailable");
    });
    renderPage(clientFromRequest(request));
    loadAgent();

    expect(await screen.findByText("Accuracy unavailable")).toBeVisible();
    expect(await screen.findByText("Autonomy unavailable")).toBeVisible();
    expect(await screen.findByText("Failure patterns unavailable")).toBeVisible();
  });
});
