import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import { clientFromRequest } from "../../shared/api";
import { EvaluationPage } from "./EvaluationPage";

const tenantId = "b0000000-0000-4000-8000-000000000001";
const setId = "50000000-0000-4000-8000-000000000001";
const runId = "60000000-0000-4000-8000-000000000001";
const olderRunId = "60000000-0000-4000-8000-000000000002";
const itemId = "70000000-0000-4000-8000-000000000001";
const promptId = "80000000-0000-4000-8000-000000000001";
const fingerprint = `sha256:${"a".repeat(64)}`;
const otherFingerprint = `sha256:${"b".repeat(64)}`;

const promptSet = {
  created_at: "2026-08-25T09:00:00Z",
  description: "Questions a support agent asks",
  name: "Support triage",
  prompt_count: 1,
  retired_at: null,
  set_id: setId,
};

const prompt = {
  expectations: { min_recall: 0.9, require_groundedness: true, require_relevance: true },
  intent_note: "Whether the runbook is reachable",
  position: 0,
  prompt_id: promptId,
  request: { limit: 25, query: "how do I drain the dead-letter queue?" },
};

const runHeader = {
  finished_at: "2026-08-25T10:05:00Z",
  items: [],
  prompt_count: 1,
  resolver_fingerprint: fingerprint,
  run_id: runId,
  set_id: setId,
  started_at: "2026-08-25T10:00:00Z",
};

const olderRunHeader = { ...runHeader, run_id: olderRunId, started_at: "2026-08-24T10:00:00Z" };

const runDetail = {
  ...runHeader,
  items: [
    {
      duration_ms: 1250,
      envelope_state: "complete",
      failure: null,
      item_id: itemId,
      position: 0,
      prompt_id: promptId,
      receipt_id: "90000000-0000-4000-8000-000000000001",
      verdicts: [],
    },
  ],
};

const erroredRunDetail = {
  ...runHeader,
  items: [
    {
      duration_ms: 40,
      envelope_state: null,
      failure: "RuntimeError: the canonical arm is unavailable",
      item_id: itemId,
      position: 0,
      prompt_id: promptId,
      receipt_id: null,
      verdicts: [],
    },
  ],
};

type Handler = (
  path: string,
  options?: { body?: unknown; method?: string; tenantId?: string },
) => unknown;

const defaultHandler: Handler = (path, options) => {
  if (path === "/v1/evaluation/prompt-sets" && options?.method === "GET") {
    return { items: [promptSet] };
  }
  if (path === `/v1/evaluation/prompt-sets/${setId}/prompts`) return { items: [prompt] };
  if (path === `/v1/evaluation/prompt-sets/${setId}/runs` && options?.method === "GET") {
    return { items: [runHeader] };
  }
  if (path === `/v1/evaluation/runs/${runId}`) return runDetail;
  throw new Error(`unexpected request: ${options?.method ?? "GET"} ${path}`);
};

function renderPage(handler: Handler = defaultHandler) {
  const request = vi.fn(async (path: string, options) => handler(path, options));
  const client = clientFromRequest(request);
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  render(
    <EvaluationPage activeTenantName="Northstar Systems" apiTenantId={tenantId} client={client} />,
    { wrapper: Wrapper },
  );
  return { request };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the evaluation surface", () => {
  it("lands on the set list rather than on a form", async () => {
    renderPage();

    expect(await screen.findByText("Support triage")).toBeVisible();
    // Creating a set is reached from the list, not offered as the landing state:
    // a screen whose first offer is a form asks somebody to name something
    // before they have seen what exists.
    expect(screen.queryByLabelText("Set name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New set" })).toBeVisible();
  });

  it("reads run headers without their items, and loads items only when a run is opened", async () => {
    const { request } = renderPage();

    fireEvent.click(await screen.findByText("Support triage"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Run set/ })).toBeVisible());

    // The run list is rendered and the detail read has not happened.
    expect(request).not.toHaveBeenCalledWith(`/v1/evaluation/runs/${runId}`, expect.anything());

    fireEvent.click(await screen.findByText(/Aug 25, 2026/));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(`/v1/evaluation/runs/${runId}`, {
        method: "GET",
        tenantId,
      }),
    );
  });

  it("counts an errored prompt rather than dropping it, and says why it stays", async () => {
    renderPage((path, options) => {
      if (path === `/v1/evaluation/runs/${runId}`) return erroredRunDetail;
      return defaultHandler(path, options);
    });

    fireEvent.click(await screen.findByText("Support triage"));
    fireEvent.click(await screen.findByText(/Aug 25, 2026/));

    expect(await screen.findByText(/the canonical arm is unavailable/)).toBeVisible();
    // The reason appears twice deliberately — once on the section that explains
    // the rule and once on the item that is an instance of it — so both are
    // asserted rather than one being matched by accident.
    expect(
      screen.getAllByText(/dropping it is how a number improves without anything improving/),
    ).toHaveLength(2);
    const errored = screen.getByText("Errored").closest("div");
    expect(errored).not.toBeNull();
    expect(within(errored as HTMLElement).getByText("1")).toBeVisible();
  });

  it("reports judged out of total rather than a percentage over the reviewed subset", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("Support triage"));
    fireEvent.click(await screen.findByText(/Aug 25, 2026/));

    expect(await screen.findByText("0 of 1")).toBeVisible();
  });

  it("requires a reason for anything but a right verdict, before the request is made", async () => {
    const { request } = renderPage();

    fireEvent.click(await screen.findByText("Support triage"));
    fireEvent.click(await screen.findByText(/Aug 25, 2026/));

    fireEvent.click(await screen.findByRole("button", { name: "Wrong" }));
    const record = screen.getByRole("button", { name: "Record verdict" });
    expect(record).toBeDisabled();
    expect(screen.getByLabelText("Why (required)")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Why (required)"), {
      target: { value: "the runbook was not served" },
    });
    expect(screen.getByRole("button", { name: "Record verdict" })).toBeEnabled();
    expect(request).not.toHaveBeenCalledWith(
      `/v1/evaluation/runs/items/${itemId}/verdict`,
      expect.anything(),
    );
  });

  it("does not require a reason for a right verdict", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("Support triage"));
    fireEvent.click(await screen.findByText(/Aug 25, 2026/));

    fireEvent.click(await screen.findByRole("button", { name: "Right" }));
    expect(screen.getByLabelText("Why (optional)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Record verdict" })).toBeEnabled();
  });

  it("records a verdict against the run item, not the run", async () => {
    const { request } = renderPage((path, options) => {
      if (path === `/v1/evaluation/runs/items/${itemId}/verdict`) {
        return { note: null, recorded_at: "2026-08-25T11:00:00Z", recorded_by: "r1", verdict: "right" };
      }
      return defaultHandler(path, options);
    });

    fireEvent.click(await screen.findByText("Support triage"));
    fireEvent.click(await screen.findByText(/Aug 25, 2026/));
    fireEvent.click(await screen.findByRole("button", { name: "Right" }));
    fireEvent.click(screen.getByRole("button", { name: "Record verdict" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(`/v1/evaluation/runs/items/${itemId}/verdict`, {
        body: { note: null, verdict: "right" },
        method: "POST",
        tenantId,
      }),
    );
  });

  it("shows what a prompt was checking beside its resolution", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("Support triage"));
    fireEvent.click(await screen.findByText(/Aug 25, 2026/));

    expect(await screen.findByText("Checking: Whether the runbook is reachable")).toBeVisible();
  });

  it("run comparison is not offered until two runs exist", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("Support triage"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Run set/ })).toBeVisible());

    expect(screen.queryByRole("button", { name: /Compare runs/ })).not.toBeInTheDocument();
  });

  it("run comparison refuses two runs from different deployments", async () => {
    renderPage((path, options) => {
      if (path === `/v1/evaluation/prompt-sets/${setId}/runs` && options?.method === "GET") {
        return { items: [runHeader, { ...olderRunHeader, resolver_fingerprint: otherFingerprint }] };
      }
      if (path === `/v1/evaluation/runs/${runId}`) return runDetail;
      if (path === `/v1/evaluation/runs/${olderRunId}`) {
        return { ...runDetail, resolver_fingerprint: otherFingerprint, run_id: olderRunId };
      }
      return defaultHandler(path, options);
    });

    fireEvent.click(await screen.findByText("Support triage"));
    fireEvent.click(await screen.findByRole("button", { name: /Compare runs/ }));

    expect(await screen.findByText(/These two runs are not comparable/)).toBeVisible();
    expect(
      screen.getByText(/evidence the configuration changed, not evidence about retrieval quality/),
    ).toBeVisible();
  });

  it("run comparison names what moved between two comparable runs", async () => {
    renderPage((path, options) => {
      if (path === `/v1/evaluation/prompt-sets/${setId}/runs` && options?.method === "GET") {
        return { items: [runHeader, olderRunHeader] };
      }
      if (path === `/v1/evaluation/runs/${runId}`) {
        return {
          ...runDetail,
          items: [
            {
              ...runDetail.items[0],
              verdicts: [
                { note: null, recorded_at: "2026-08-25T11:00:00Z", recorded_by: "r1", verdict: "right" },
              ],
            },
          ],
        };
      }
      if (path === `/v1/evaluation/runs/${olderRunId}`) {
        return {
          ...runDetail,
          items: [
            {
              ...runDetail.items[0],
              verdicts: [
                { note: "missed it", recorded_at: "2026-08-24T11:00:00Z", recorded_by: "r1", verdict: "wrong" },
              ],
            },
          ],
          run_id: olderRunId,
        };
      }
      return defaultHandler(path, options);
    });

    fireEvent.click(await screen.findByText("Support triage"));
    fireEvent.click(await screen.findByRole("button", { name: /Compare runs/ }));

    expect(await screen.findByText("Verdict improved")).toBeVisible();
    expect(screen.getByText("Wrong → Right")).toBeVisible();
    expect(screen.getByText("Better")).toBeVisible();
  });

  it("says a set holds no prompts rather than offering a run that would resolve nothing", async () => {
    renderPage((path, options) => {
      if (path === `/v1/evaluation/prompt-sets/${setId}/prompts`) return { items: [] };
      if (path === `/v1/evaluation/prompt-sets/${setId}/runs` && options?.method === "GET") {
        return { items: [] };
      }
      return defaultHandler(path, options);
    });

    fireEvent.click(await screen.findByText("Support triage"));

    expect(await screen.findByText("This set holds no prompts yet")).toBeVisible();
    expect(screen.getByRole("button", { name: /Run set/ })).toBeDisabled();
  });

  it("surfaces a failed read with a retry rather than an empty list", async () => {
    renderPage((path) => {
      if (path === "/v1/evaluation/prompt-sets") throw new Error("the service is unavailable");
      return { items: [] };
    });

    expect(await screen.findByText("Prompt sets could not be read")).toBeVisible();
  });

  it("marks a retired set as readable and not writable", async () => {
    renderPage((path, options) => {
      if (path === "/v1/evaluation/prompt-sets" && options?.method === "GET") {
        return { items: [{ ...promptSet, retired_at: "2026-08-25T12:00:00Z" }] };
      }
      return defaultHandler(path, options);
    });

    expect(await screen.findByText("Retired")).toBeVisible();
  });

  it("creates a set from the list and selects it", async () => {
    const created = { ...promptSet, name: "Escalation prompts", prompt_count: 0, set_id: setId };
    const { request } = renderPage((path, options) => {
      if (path === "/v1/evaluation/prompt-sets" && options?.method === "POST") return created;
      return defaultHandler(path, options);
    });

    await screen.findByText("Support triage");
    fireEvent.click(screen.getByRole("button", { name: "New set" }));
    fireEvent.change(screen.getByLabelText("Set name"), { target: { value: "Escalation prompts" } });
    fireEvent.click(screen.getByRole("button", { name: "Create set" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("/v1/evaluation/prompt-sets", {
        body: { description: null, name: "Escalation prompts" },
        method: "POST",
        tenantId,
      }),
    );
  });

  it("links an empty set to the place a prompt comes from, naming the set", async () => {
    // The dead end this closes: the notice read "Add one from Context Lab" as
    // prose, on the screen showing an empty set, with nothing to click. A reader
    // had to navigate away, remember which of their sets was empty, resolve a
    // prompt and find the set again in a list.
    const empty = { ...promptSet, name: "Empty set", prompt_count: 0, set_id: "set-empty" };
    renderPage((path) => {
      if (path === "/v1/evaluation/prompt-sets") return { items: [empty] };
      if (path.endsWith("/prompts")) return { items: [] };
      if (path.endsWith("/runs")) return { items: [] };
      return defaultHandler(path);
    });

    fireEvent.click(await screen.findByRole("button", { name: /Empty set/ }));

    const link = await screen.findByRole("link", { name: /Resolve a prompt for this set/ });
    expect(link).toHaveAttribute("href", "/context-lab?set=set-empty");
    // The set is named, so the link is not "go and figure out which one".
    expect(screen.getByText(/already chosen/)).toBeVisible();
  });
});
