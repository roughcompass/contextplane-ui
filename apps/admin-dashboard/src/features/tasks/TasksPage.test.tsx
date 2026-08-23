import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@repo/ui/primitives";

import type { ContextplaneClient, ContextplaneRequestOptions } from "../../shared/api";
import { clientFromRequest } from "../../shared/api";
import { TasksPage } from "./TasksPage";

const participant = {
  actor_id: "actor-a",
  expires_at: null,
  granted_at: "2026-08-12T14:28:41Z",
  granted_by: "actor-admin",
  intent_id: "intent-a",
  resolver_version: "1",
  role: "contributor",
};

const checkpoint = {
  assumptions: ["Access remains available"],
  author: "actor-a",
  checkpoint_id: "checkpoint-a",
  completed_checks: ["Contract verified"],
  decisions: ["Proceed"],
  digest: "sha256:checkpoint-a",
  goal: "Roll out policy evaluation",
  intent_id: "intent-a",
  next_action: "Validate production",
  open_questions: ["Who signs off?"],
  predecessor_id: null,
  recorded_at: "2026-08-12T14:28:41Z",
  retention_policy: "tenant-default",
  sequence: 1,
};

function testClient() {
  const request = vi.fn(async (path: string, options?: ContextplaneRequestOptions) => {
    if (options?.method === "DELETE") return undefined;
    if (path.endsWith("/participants")) {
      return options?.method === "POST" ? participant : { grants: [participant] };
    }
    if (path.includes("/checkpoints") || path.startsWith("/v1/checkpoints/by-digest/")) {
      return checkpoint;
    }
    throw new Error(`Unexpected path: ${path}`);
  });
  return clientFromRequest(request);
}

function renderPage(client: ContextplaneClient) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TasksPage activeTenantName="Northstar Systems" apiTenantId="tenant-a" client={client} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/tasks");
});

describe("TasksPage", () => {
  it("coordinates participants and appends immutable checkpoint evidence", async () => {
    const client = testClient();
    renderPage(client);

    expect(await screen.findByRole("heading", { level: 1, name: "Tasks" })).toBeVisible();

    fireEvent.change(screen.getByLabelText("Intent UUID"), { target: { value: "intent-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Load intent" }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Intent participants" }),
    ).toBeVisible();
    expect(await screen.findByText("actor-a")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Remove actor-a" }));
    expect(screen.getByText("End participation now?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(await screen.findByText("Participant removed")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Actor ID"), { target: { value: "actor-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Add participant" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/intents/intent-a/participants",
        expect.objectContaining({ method: "POST", tenantId: "tenant-a" }),
      ),
    );

    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "Roll out policy evaluation" },
    });
    fireEvent.change(screen.getByLabelText("Next action"), {
      target: { value: "Validate production" },
    });
    fireEvent.change(screen.getByLabelText(/Assumptions/u), {
      target: { value: "Access remains available, Contract is stable" },
    });
    fireEvent.change(screen.getByLabelText(/Decisions/u), { target: { value: "Proceed" } });
    fireEvent.click(screen.getByRole("button", { name: "Append checkpoint" }));

    expect(await screen.findByRole("article", { name: "Checkpoint checkpoint-a" })).toBeVisible();
    expect(screen.getByText("sha256:checkpoint-a")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Checkpoint UUID"), {
      target: { value: "checkpoint-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve checkpoint" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/intents/intent-a/checkpoints/checkpoint-a",
        expect.objectContaining({ tenantId: "tenant-a" }),
      ),
    );
    fireEvent.click(screen.getByLabelText("Digest"));
    fireEvent.change(screen.getByLabelText("Content digest"), {
      target: { value: "sha256:checkpoint-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve checkpoint" }));
    await waitFor(() =>
      expect(client.request).toHaveBeenCalledWith(
        "/v1/checkpoints/by-digest/sha256%3Acheckpoint-a",
        expect.objectContaining({ tenantId: "tenant-a" }),
      ),
    );
  });

  it("shows empty participation and preserves sparse immutable checkpoint evidence", async () => {
    const sparseCheckpoint = {
      ...checkpoint,
      decisions: [],
      next_action: null,
      open_questions: [],
    };
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/participants")) return { grants: [] };
      if (path.includes("/checkpoints/")) return sparseCheckpoint;
      throw new Error(`Unexpected path: ${path}`);
    });
    renderPage(clientFromRequest(request));

    fireEvent.change(screen.getByLabelText("Intent UUID"), { target: { value: "intent-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Load intent" }));
    expect(await screen.findByText("No participant grant was reported.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Checkpoint UUID"), {
      target: { value: "checkpoint-a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retrieve checkpoint" }));
    const card = await screen.findByRole("article", { name: "Checkpoint checkpoint-a" });
    expect(within(card).getByText("Not recorded")).toBeVisible();
    expect(within(card).queryByText("Decisions")).toBeNull();
    expect(within(card).queryByText("Open questions")).toBeNull();
  });

  it("stays recoverable when the task services are unavailable", async () => {
    const request = vi.fn(async () => {
      throw new Error("service unavailable");
    });
    renderPage(clientFromRequest(request));

    fireEvent.change(screen.getByLabelText("Intent UUID"), { target: { value: "intent-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Load intent" }));
    expect(await screen.findByText("Participants unavailable")).toBeVisible();
  });
});
