import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BookmarkPlus } from "lucide-react";
import { useId, useState } from "react";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, RequestFailure, SearchableSelect, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  addPrompt,
  createPromptSet,
  listExpectationPresets,
  listPromptSets,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";

/** Evaluation, with the set this prompt just joined already selected. */
function savedSetHref(setId: string): string {
  const url = new URL("/evaluation", window.location.origin);
  if (setId) url.searchParams.set("set", setId);
  return `${url.pathname}${url.search}`;
}

interface SavePromptToSetProps {
  apiTenantId?: string;
  client: ContextplaneClient;
  /** The prompt that actually resolved, not whatever is in the box now. */
  prompt: string;
  requestContext: ContextplaneRequestOptions;
  /** The scope that resolution ran under, so the saved prompt asks the same question. */
  resolverArguments: Record<string, unknown>;
}

/**
 * Keep this resolution as a prompt somebody can run again.
 *
 * ## The product told users to do this and gave them nowhere to do it
 *
 * Creating a prompt set on the Evaluation page raised a toast reading *"Add
 * prompts to it from Context Lab, where a resolution you have already looked at
 * can be saved."* Context Lab had no such action, and `addPrompt` — which has
 * existed in the API layer the whole time — was called from nowhere in this
 * application. So the evaluation journey was: create an empty set, be sent here,
 * find nothing, and run a set with no prompts in it.
 *
 * The instruction was right about where this belongs. A prompt worth keeping is
 * one somebody has just looked at the result of, which is what this screen is
 * for; asking an evaluator to retype it somewhere else would be asking them to
 * reproduce a resolution they already have.
 *
 * ## The saved request is the one that ran
 *
 * `resolverArguments` is the scope the resolution actually used, not the state of
 * the form now — those differ the moment somebody edits a field after resolving,
 * and a regression prompt that asks a slightly different question than the one
 * that revealed the problem is worse than no prompt.
 *
 * ## Expectations are chosen from what the service publishes
 *
 * The three presets carry different recall floors, classification ceilings and
 * judged criteria, and the service publishes the reasoning for each. They are
 * offered with that reasoning attached rather than as three names: choosing
 * `compliance` over `research` is a decision about what a failure will mean, and
 * a reader cannot make it from a word.
 *
 * Declared here rather than after a run, which is the service's rule and the
 * point of the whole feature — *a scenario whose required facts were written
 * after seeing what the system returned is not a test*.
 */
export function SavePromptToSet({
  apiTenantId,
  client,
  prompt,
  requestContext,
  resolverArguments,
}: SavePromptToSetProps) {
  const noteId = useId();
  const newSetId = useId();
  // Preselected from the address when Evaluation linked here naming a set. That
  // link exists because the empty-set notice there used to be prose — "add one
  // from Context Lab" — leaving a reader to navigate away, remember which of
  // their sets was empty, and find it again in a list here.
  const [setId, setSetId] = useState(() => new URLSearchParams(window.location.search).get("set") ?? "");
  const [newSetName, setNewSetName] = useState("");
  const [note, setNote] = useState("");
  const [preset, setPreset] = useState("balanced");
  const [saved, setSaved] = useState<string | null>(null);
  const [savedSetId, setSavedSetId] = useState("");
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const tenantKey = apiTenantId ?? "current";

  const sets = useQuery({
    queryFn: () => listPromptSets(client, requestContext),
    queryKey: ["evaluation", "prompt-sets", tenantKey],
  });
  const presets = useQuery({
    queryFn: () => listExpectationPresets(client, requestContext),
    queryKey: ["evaluation", "expectation-presets", tenantKey],
  });

  const chosenPreset = presets.data?.find((entry) => entry.name === preset) ?? null;
  const creatingNew = setId === "";

  const save = useMutation({
    mutationFn: async () => {
      const target = creatingNew
        ? await createPromptSet(client, { name: newSetName.trim() }, requestContext)
        : { name: sets.data?.find((entry) => entry.set_id === setId)?.name ?? "", set_id: setId };
      await addPrompt(
        client,
        {
          ...(chosenPreset ? { expectations: chosenPreset.expectations } : {}),
          ...(note.trim() ? { intentNote: note.trim() } : {}),
          request: { ...resolverArguments, query: prompt },
          setId: target.set_id,
        },
        requestContext,
      );
      return target;
    },
    onSuccess: (target) => {
      setSaved(target.name);
      setSavedSetId(target.set_id);
      setNote("");
      setNewSetName("");
      showToast({
        message: `It is in "${target.name}" with the ${preset} expectations and the scope this resolution ran under.`,
        title: "Prompt saved",
        variant: "success",
      });
      void queryClient.invalidateQueries({ queryKey: ["evaluation", "prompt-sets", tenantKey] });
    },
  });

  const blocked = creatingNew && newSetName.trim().length === 0;

  return (
    <SectionSurface
      description="A prompt worth keeping is one you have just seen the result of. It is saved with the scope this resolution ran under, so it asks the same question when it runs again."
      title="Save this prompt for later runs"
    >
      <div className="space-y-4">
        <div>
          {/* `SearchableSelect`, not a native control: the repository lints for it,
              and a tenant with fifty prompt sets is one an evaluator has to search
              rather than scroll. */}
          <SearchableSelect
            emptyLabel="Create a new set…"
            id={newSetId}
            label="Prompt set"
            onValueChange={setSetId}
            options={(sets.data ?? []).map((entry) => ({
              label: `${entry.name} · ${entry.prompt_count} prompt${entry.prompt_count === 1 ? "" : "s"}`,
              value: entry.set_id,
            }))}
            searchPlaceholder="Search prompt sets"
            value={setId}
          />
          {creatingNew ? (
            <input
              aria-label="New set name"
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              onChange={(event) => setNewSetName(event.target.value)}
              placeholder="Ownership questions"
              value={newSetName}
            />
          ) : null}
        </div>

        <fieldset>
          <legend className="text-xs font-medium text-foreground">What a run must satisfy</legend>
          {/* The service's own reasoning, attached to each option. Choosing
              `compliance` over `research` is a decision about what a failure will
              mean, and a reader cannot make it from a word. */}
          <div className="mt-2 space-y-2">
            {(presets.data ?? []).map((entry) => (
              <label className="flex gap-2 text-xs" key={entry.name}>
                <input
                  checked={preset === entry.name}
                  className="mt-1"
                  name="expectation-preset"
                  onChange={() => setPreset(entry.name)}
                  type="radio"
                  value={entry.name}
                />
                <span>
                  <span className="font-medium text-foreground">{entry.name}</span>
                  <span className="mt-0.5 block leading-5 text-muted-foreground">
                    {entry.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="text-xs font-medium text-foreground" htmlFor={noteId}>
            What this prompt is checking (optional)
          </label>
          <input
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            id={noteId}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ownership questions must reach the owning team, not a neighbour"
            value={note}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The question a later reader arrives with.
          </p>
        </div>

        {save.isError ? (
          <RequestFailure onRetry={() => save.mutate()} title="The prompt was not saved">
            {save.error.message}
          </RequestFailure>
        ) : null}

        <div className="space-y-1">
          <Button disabled={save.isPending || blocked} onClick={() => save.mutate()} variant="secondary">
            <BookmarkPlus aria-hidden="true" className="size-4" />
            {save.isPending ? "Saving…" : "Save this prompt"}
          </Button>
          {blocked ? (
            <p className="text-xs text-muted-foreground">Name the new set first.</p>
          ) : null}
          {/* Persistent, not a toast that vanishes: DESIGN.md asks that a write
              be reported near its result, and "did that save?" is the question a
              disappearing confirmation leaves behind. */}
          {saved && !save.isPending ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-success">
              <StatusBadge tone="success">Saved</StatusBadge>
              <span>in {saved}.</span>
              {/* A link rather than the words "run it from Evaluation", which is
                  the same defect this feature was built to fix — an instruction
                  to go somewhere, with no way to go. It names the set, so the
                  reader lands on the one they just added to. */}
              <a
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                href={savedSetHref(savedSetId)}
              >
                Run it from Evaluation
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </SectionSurface>
  );
}
