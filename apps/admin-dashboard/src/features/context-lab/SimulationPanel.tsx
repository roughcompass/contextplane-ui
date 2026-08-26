import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Bot, MessageSquareQuote, Quote } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";

import { SectionSurface, SummaryStrip } from "@repo/ui/layouts";
import {
  Button,
  Notice,
  RequestFailure,
  ResourcePicker,
  StatusBadge,
  useToast,
  type ResourceOption,
  type ResourcePage,
  type ResourceQuery,
} from "@repo/ui/primitives";

import {
  declarePrincipal,
  getSimulationAvailability,
  listPrincipals,
  OWNER_PRINCIPAL_MAX,
  OWNER_PRINCIPAL_MIN,
  runSimulation,
  type ContextEnvelope,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type Principal,
  type Simulation,
} from "../../shared/api";
import { CapabilityUnavailable } from "./CapabilityUnavailable";
import {
  formatContextTimestamp,
  instructionDispositionDescription,
  instructionDispositionLabel,
  instructionDispositionTone,
} from "./contextLabModel";
import { instructionsAreEditable } from "./simulationModel";

interface SimulationPanelProps {
  apiTenantId?: string;
  client: ContextplaneClient;
  envelope: ContextEnvelope | null;
  onSimulated: (simulation: Simulation) => void;
  prompt: string;
  requestContext: ContextplaneRequestOptions;
  resolverArguments: Record<string, unknown>;
  simulation: Simulation | null;
}

/**
 * Agent, instructions in force, prompt — and the answer.
 *
 * ## The resolver still does not generate
 *
 * `POST /v1/context/resolve` is unchanged by any of this. A simulation is a
 * *separate receipted operation* that resolves through the same resolver and then
 * calls a model, and the two halves stay separately addressable — which is what
 * keeps *"the retrieval was fine and the agent fumbled it"* answerable. A reader
 * who has just watched a response appear is exactly the reader who needs to know
 * which component did not produce it, which is why the sentence on the composer
 * above is amended rather than deleted.
 *
 * ## The agent is picked, never typed
 *
 * A `ResourcePicker` over `GET /v1/admin/actors`, per ADR 0018. **Undeclared
 * principals are shown as `unknown` with what they are missing, rather than
 * filtered out** — ADR 0019's dissent is that integrators skip the declaration
 * and a roster that hid its gaps would answer *"we have no agents"* to a
 * deployment that has eleven. Simulating one is refused by the *service*, not by
 * this screen: a check on a surface is a check the MCP tool does not have.
 *
 * ## Three instruction states, all rendered
 *
 * ADR 0020's third assumption. *No instructions declared* and *declared and
 * empty* are different states, and `declared_unknown` — declared but never
 * submitted — is a third that a reader can act on. Folding any pair together
 * would make partial adoption of the channel invisible.
 *
 * ## Availability is read before the action is offered
 *
 * A deployment with no provider configured is complete rather than broken:
 * prompt sets, runs, verdicts and the deterministic criteria all work. It is told
 * which setting is missing rather than handed a button that always fails.
 */
export function SimulationPanel({
  apiTenantId,
  client,
  envelope,
  onSimulated,
  prompt,
  requestContext,
  resolverArguments,
  simulation,
}: SimulationPanelProps) {
  const [actorId, setActorId] = useState("");
  const queryClient = useQueryClient();
  const rosterKey = useMemo(() => ["principals", apiTenantId ?? "current"], [apiTenantId]);

  const availability = useQuery({
    queryFn: () => getSimulationAvailability(client, requestContext),
    queryKey: ["simulation", "availability", apiTenantId ?? "current"],
  });

  // One roster read, shared. The picker needs options and this screen needs the
  // selected row itself -- whether anybody has declared it is the difference
  // between an action that works and one that is refused -- and two independent
  // fetches would let the button and the warning disagree about the same
  // principal.
  const roster = useQuery({
    queryFn: () => listPrincipals(client, { pageSize: 100 }, requestContext),
    queryKey: rosterKey,
  });

  const principals = useMemo(
    () => principalSource(queryClient, rosterKey, client, requestContext),
    [client, queryClient, requestContext, rosterKey],
  );

  const selected = roster.data?.items.find((principal) => principal.actor_id === actorId) ?? null;
  // Both halves, because they fail for different reasons and the service checks
  // both: a principal nobody declared, and one declared as something a
  // simulation cannot stand in for.
  const simulatable = selected !== null && selected.is_declared && selected.actor_kind === SIMULATABLE_KIND;
  const blocked = selected !== null && !simulatable;

  const simulate = useMutation({
    mutationFn: () =>
      runSimulation(
        client,
        { prompt, request: resolverArguments, simulatedActorId: actorId },
        requestContext,
      ),
    onSuccess: onSimulated,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!actorId || !prompt.trim()) return;
    simulate.mutate();
  }

  const unavailable = availability.data !== undefined && !availability.data.available;

  return (
    <SectionSurface
      description="Resolve as a declared agent and then answer from the five-block envelope. The resolver still does not generate: it retrieves, and a separate receipted operation calls the model — so 'the retrieval was fine and the agent fumbled it' stays a question you can answer."
      title="Simulate an agent"
    >
      {unavailable ? (
        <CapabilityUnavailable
          operatorNote={
            <>
              <p>
                Set <code>SIMULATION_PROVIDER</code> to <code>anthropic</code> or{" "}
                <code>openai</code>, and <code>SIMULATION_API_KEY</code> to a key for it.
              </p>
              <p>
                To grade the answers too, set <code>JUDGE_PROVIDER</code> to the{" "}
                <em>other</em> family and <code>JUDGE_API_KEY</code> to a key for that one. The
                service refuses a judge from the same family as the agent, because a model scores
                its own family higher than a third party does.
              </p>
            </>
          }
          stillWorks="You can still resolve context, save prompts into sets, run them and record verdicts. Required-fact recall, boundary violations and precision are computed without any model, so they are unaffected."
          summary="Answering a prompt needs a language model, and this deployment has none configured."
          title="This deployment cannot generate an agent answer"
        />
      ) : null}

      <form className="space-y-4" noValidate onSubmit={submit}>
        <ResourcePicker
          disabled={unavailable}
          emptyMessage="No principals in this tenant yet."
          label="Simulate as"
          load={principals.load}
          onValueChange={setActorId}
          resolve={principals.resolve}
          searchPlaceholder="Search principals by name"
          value={actorId}
        />
        <p className="text-xs text-muted-foreground">
          Undeclared principals are listed rather than hidden — a roster that hid what it does not
          know would answer &ldquo;we have no agents&rdquo; to a deployment that has eleven. Pick one
          and you can declare it here.
        </p>

        {blocked && selected ? (
          <DeclareAgent
            client={client}
            onDeclared={() => {
              void queryClient.invalidateQueries({ queryKey: rosterKey });
            }}
            principal={selected}
            requestContext={requestContext}
          />
        ) : null}

        {envelope ? <InstructionsInForce envelope={envelope} /> : null}

        {simulate.isError ? (
          <RequestFailure onRetry={() => simulate.mutate()} title="The simulation did not run">
            {simulate.error.message}
          </RequestFailure>
        ) : null}

        {/* Disabled *and* explained. A control that refuses without saying why
            teaches a reader that the screen is broken; the sentence beside it is
            what makes the same state read as a prerequisite instead. */}
        <div className="space-y-1">
          <Button
            disabled={unavailable || simulate.isPending || !actorId || !prompt.trim() || blocked}
            type="submit"
          >
            {simulate.isPending ? "Answering…" : "Simulate this prompt"}
          </Button>
          {blocked ? (
            <p className="text-xs text-muted-foreground">
              Declare this principal above and it becomes available.
            </p>
          ) : null}
          {!blocked && !actorId ? (
            <p className="text-xs text-muted-foreground">Choose which agent to answer as.</p>
          ) : null}
          {!blocked && actorId && !prompt.trim() ? (
            <p className="text-xs text-muted-foreground">Enter a prompt above first.</p>
          ) : null}
        </div>
      </form>

      {simulation ? <ResponsePane simulation={simulation} /> : null}
    </SectionSurface>
  );
}

/**
 * The instruction block, as the reader of a simulation needs it.
 *
 * Shown from the fifth block rather than from a separate read, because the block
 * *is* what the agent was told — and it inherits provenance, trust class, the
 * receipt and suppression by being one.
 */
function InstructionsInForce({ envelope }: { envelope: ContextEnvelope }) {
  const block = envelope.blocks.find((entry) => entry.name === "instructions");
  const disposition = envelope.instruction_disposition;

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-foreground">Instructions in force</span>
        <StatusBadge tone={instructionDispositionTone(disposition)}>
          {instructionDispositionLabel(disposition)}
        </StatusBadge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {instructionDispositionDescription(disposition)}
      </p>

      {(block?.items.length ?? 0) === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {envelope.instruction_block_note ??
            "No correction applied to this resolution, which is different from none being available."}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {block?.items.map((item) => (
            <li className="text-xs" key={item.receipt_item_id.value}>
              <p className="text-foreground">
                {typeof item.payload.body === "string" ? item.payload.body : "(no body)"}
              </p>
              <p className="text-muted-foreground">
                Scope: {typeof item.payload.scope === "string" ? item.payload.scope : "not reported"}
                {item.payload.contradicts === true ? " · contradicts the declared set" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {instructionsAreEditable(disposition) ? null : (
        <p className="mt-2 text-xs text-muted-foreground">
          There is nothing to edit for this run: a correction can only be weighed against a declared
          set the product has actually seen. Proposing a real instruction version is not this
          screen&apos;s job and stays gated on a stored failure-pattern report.
        </p>
      )}
    </div>
  );
}

/**
 * What the model said, and what each assertion rested on.
 *
 * **Citations are facts about the run, not an inference over prose.** The model
 * was required to name the `receipt_item_id` values it used, through a forced
 * tool call, so *cited* and *ignored* are recorded rather than recovered by
 * string-matching an answer against an envelope.
 *
 * **An assertion citing nothing keeps its row**, and so does a citation naming
 * something that was never served. Both are findings; dropping either would
 * delete the finding.
 */
function ResponsePane({ simulation }: { simulation: Simulation }) {
  const usage = simulation.usage;
  return (
    <div className="mt-6 space-y-4">
      <SummaryStrip
        items={[
          { id: "model", label: "Answered by", value: `${simulation.provider_id} · ${simulation.model_id}` },
          {
            detail: "Reported by the provider, never estimated. An absent count means nobody could report — not that the call was free.",
            id: "tokens",
            label: "Tokens",
            value:
              usage.prompt_tokens === null
                ? "Not reported"
                : `${usage.prompt_tokens} in · ${usage.completion_tokens ?? 0} out`,
          },
          {
            detail: "Paired with the token figure, because `limit` is the only lever the product offers when a run comes back too large.",
            id: "served",
            label: "Items served",
            value: String(usage.served_item_count),
          },
          {
            id: "answered",
            label: "Answered at",
            value: formatContextTimestamp(simulation.created_at),
          },
        ]}
        label="Simulation"
      />

      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MessageSquareQuote className="size-4" />
          The answer
        </h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{simulation.answer}</p>
      </div>

      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Quote className="size-4" />
          Assertions and what they rest on
        </h3>
        {simulation.assertions.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            The answer made no assertions. That is a real state — an answer that asserts nothing
            cannot fail groundedness, and cannot pass it either.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {simulation.assertions.map((assertion) => (
              <li className="space-y-1 py-2" key={assertion.position}>
                <p className="text-sm text-foreground">{assertion.text}</p>
                {assertion.citations.length === 0 ? (
                  <p className="text-xs text-warning">
                    Rests on nothing that was served — either a fact the graph does not hold, or a
                    groundedness failure.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {assertion.citations.map((citation) => (
                      <li key={citation.receipt_item_id}>
                        <StatusBadge tone={citation.was_served ? "neutral" : "danger"}>
                          {citation.receipt_item_id.slice(0, 12)}…
                          {citation.was_served ? "" : " · never served"}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {simulation.uncited_served_ids.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Bot className="mt-0.5 size-3.5 shrink-0" />
          {simulation.uncited_served_ids.length} served{" "}
          {simulation.uncited_served_ids.length === 1 ? "item was" : "items were"} cited by no
          assertion. That could mean the scope was too wide, or that the agent ignored them — the
          improvement surface below offers both readings rather than choosing.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The principal roster, as a picker source.
 *
 * Undeclared principals are rendered with what they are missing rather than
 * filtered out, per ADR 0019 assumption 2 — and the *service* refuses to
 * simulate one, so the screen does not have to pretend they do not exist.
 */
/**
 * The picker's options, read through the same cache entry the panel reads.
 *
 * `fetchQuery` rather than a bare call: the panel needs the selected row to know
 * whether simulating it is even possible, and a second independent request would
 * let the option list and the warning beside it describe different states of the
 * same principal — most visibly right after a declaration, when one has refreshed
 * and the other has not.
 */
function principalSource(
  queryClient: QueryClient,
  rosterKey: readonly unknown[],
  client: ContextplaneClient,
  context: ContextplaneRequestOptions,
) {
  const read = () =>
    queryClient.fetchQuery({
      queryFn: () => listPrincipals(client, { pageSize: 100 }, context),
      queryKey: rosterKey,
    });

  async function load(query: ResourceQuery): Promise<ResourcePage> {
    const page = await read();
    const term = query.search.trim().toLowerCase();
    const options = page.items
      .filter((principal) =>
        term === ""
          ? true
          : `${principal.display_name} ${principal.oidc_subject ?? ""}`.toLowerCase().includes(term),
      )
      .map(toOption);
    return { items: options, next_cursor: null };
  }

  async function resolve(value: string): Promise<ResourceOption | null> {
    const page = await read();
    const found = page.items.find((principal) => principal.actor_id === value);
    return found ? toOption(found) : null;
  }

  return { load, resolve };
}

//: What a simulation can stand in for. `human` is declarable and not simulatable:
//: a simulation models an agent answering, and standing in for a person is a
//: different claim than this feature makes.
const SIMULATABLE_KIND = "agent";

/**
 * The prerequisite, resolved where it blocks rather than somewhere else.
 *
 * Context Lab refuses to simulate a principal nobody has declared, and it is
 * right to: ADR 0019 holds that an agent is declared and never inferred, because
 * a person in an IDE and an unattended agent arrive over the same transport. But
 * the refusal was a *server* error rendered verbatim, and it ended *"declare it
 * through POST /v1/admin/actors/{actor_id}/declare with actor_kind='agent'
 * first"* — an HTTP call, shown to somebody sitting in a dashboard that had no
 * declare action anywhere in it. The task could not be finished without leaving
 * for a terminal.
 *
 * So it is finished here. Two reasons this is not a competing primary action:
 * it only exists while the primary one is blocked, and it is the *same* decision
 * the reader is already making — they picked this principal to stand in for an
 * agent, and declaring it is saying so.
 *
 * The kind is not offered as a choice. The reader is on the simulate screen
 * having chosen who to simulate, so `agent` is the only answer consistent with
 * what they are doing, and a dropdown whose other option guarantees a refusal is
 * a worse question than no question. Declaring a principal `human` belongs on a
 * roster screen, where that is a thing somebody might mean.
 *
 * The owner is asked because the service requires it and because the reason is
 * worth passing on: a principal whose owner is unrecorded is one nobody is
 * accountable for.
 */
function DeclareAgent({
  client,
  onDeclared,
  principal,
  requestContext,
}: {
  client: ContextplaneClient;
  onDeclared: () => void;
  principal: Principal;
  requestContext: ContextplaneRequestOptions;
}) {
  const ownerId = useId();
  const [owner, setOwner] = useState("");
  const { showToast } = useToast();
  const name = principal.display_name || principal.oidc_subject || principal.actor_id;

  const declare = useMutation({
    mutationFn: () =>
      declarePrincipal(
        client,
        { actorId: principal.actor_id, actorKind: SIMULATABLE_KIND, ownerPrincipal: owner },
        requestContext,
      ),
    onSuccess: (declared) => {
      showToast({
        message: `${name} is an agent owned by ${declared.owner_principal ?? owner}. Re-declaring later overwrites it.`,
        title: "Declared",
        variant: "success",
      });
      setOwner("");
      onDeclared();
    },
  });

  const trimmed = owner.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < OWNER_PRINCIPAL_MIN;
  const tooLong = trimmed.length > OWNER_PRINCIPAL_MAX;
  const invalid = tooShort || tooLong;

  return (
    <Notice
      title={
        principal.is_declared
          ? `${name} is declared a ${principal.actor_kind}, which a simulation cannot stand in for`
          : `Nobody has said what ${name} is`
      }
      variant="info"
    >
      <p>
        {principal.is_declared
          ? "A simulation models an agent answering a prompt. Declaring this principal an agent is what makes that a claim somebody made rather than one this screen inferred."
          : "An agent is declared, never inferred — a person in an IDE and an unattended agent reach this service over the same transport, so nothing about the connection says which one arrived."}
      </p>

      <div className="mt-3">
        <label className="text-xs font-medium text-foreground" htmlFor={ownerId}>
          Who to talk to about it
        </label>
        <input
          aria-describedby={`${ownerId}-help`}
          aria-invalid={invalid}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          id={ownerId}
          maxLength={OWNER_PRINCIPAL_MAX}
          onChange={(event) => setOwner(event.target.value)}
          placeholder="platform-team@example.com"
          value={owner}
        />
        <p className="mt-1 text-xs text-muted-foreground" id={`${ownerId}-help`}>
          {tooShort
            ? `At least ${OWNER_PRINCIPAL_MIN} characters.`
            : tooLong
              ? `At most ${OWNER_PRINCIPAL_MAX} characters.`
              : "A team, a rotation or a person. A principal whose owner is unrecorded is one nobody is accountable for."}
        </p>
      </div>

      {declare.isError ? (
        <div className="mt-2">
          <RequestFailure onRetry={() => declare.mutate()} title="The declaration was not recorded">
            {declare.error.message}
          </RequestFailure>
        </div>
      ) : null}

      <div className="mt-3">
        <Button
          disabled={declare.isPending || trimmed.length < OWNER_PRINCIPAL_MIN || tooLong}
          onClick={() => declare.mutate()}
          size="compact"
          variant="secondary"
        >
          {declare.isPending ? "Declaring…" : "Declare as an agent"}
        </Button>
      </div>
    </Notice>
  );
}

function toOption(principal: Principal): ResourceOption {
  const name = principal.display_name || principal.oidc_subject || principal.actor_id;
  // The description says what is *not known*, which is the field a roster reader
  // needs: `actor_kind` alone cannot tell a declared human from a principal
  // nobody has spoken about.
  const description = principal.is_declared
    ? `${principal.actor_kind} · owner ${principal.owner_principal ?? "not recorded"}`
    : "unknown — nobody has declared what this is; pick it to declare it";
  return { description, label: name, value: principal.actor_id };
}
