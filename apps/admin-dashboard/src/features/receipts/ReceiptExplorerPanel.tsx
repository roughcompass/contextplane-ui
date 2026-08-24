import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { EmptyState, SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, ResourcePicker, StatusBadge } from "@repo/ui/primitives";

import {
  findReceiptsByReference,
  getContextReceipt,
  getContextReceiptExclusions,
  getContextReceiptReferences,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { receiptSource } from "../../shared/pickers/sources";
import { SERVABILITY_COPY, servabilityFromError } from "./receiptServability";

interface ReceiptExplorerPanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const fieldClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

interface ReferenceForm {
  external_id: string;
  kind: string;
  source_namespace: string;
  source_system: string;
}

const EMPTY_REFERENCE: ReferenceForm = {
  external_id: "",
  kind: "",
  source_namespace: "",
  source_system: "",
};

export function ReceiptExplorerPanel({ client, requestContext }: ReceiptExplorerPanelProps) {
  const [reference, setReference] = useState<ReferenceForm>(EMPTY_REFERENCE);
  const [lookup, setLookup] = useState<ReferenceForm | null>(null);
  const [receiptId, setReceiptId] = useState("");

  // Built once per tenant, rebuilding the context inside: the page constructs it
  // fresh each render, so depending on the object would re-request per keystroke.
  const tenantId = requestContext.tenantId;
  const receipts = useMemo(
    () => receiptSource(client, tenantId ? { tenantId } : {}),
    [client, tenantId],
  );
  const [selected, setSelected] = useState("");

  const referenceComplete = Object.values(reference).every((value) => value.trim() !== "");

  const searchQuery = useQuery({
    enabled: lookup !== null,
    queryFn: () => findReceiptsByReference(client, lookup as ReferenceForm, 25, requestContext),
    queryKey: ["receipts-by-reference", lookup],
  });

  const receiptQuery = useQuery({
    enabled: selected !== "",
    queryFn: () => getContextReceipt(client, selected, requestContext),
    queryKey: ["receipt", selected],
  });

  // Separate queries rather than one: the service refuses these two reads for a
  // receipt it has not finished writing, while `GET /receipts/{id}` deliberately
  // still answers — it is the poll surface. Folding them together would make the
  // header unreadable exactly when it is the only thing that can be read.
  const exclusionsQuery = useQuery({
    enabled: selected !== "",
    queryFn: () => getContextReceiptExclusions(client, selected, requestContext),
    queryKey: ["receipt-exclusions", selected],
    retry: false,
  });

  const referencesQuery = useQuery({
    enabled: selected !== "",
    queryFn: () => getContextReceiptReferences(client, selected, requestContext),
    queryKey: ["receipt-references", selected],
    retry: false,
  });

  const servability =
    servabilityFromError(exclusionsQuery.error) ?? servabilityFromError(referencesQuery.error);

  function submitLookup(event: FormEvent) {
    event.preventDefault();
    if (referenceComplete) {
      setLookup({
        external_id: reference.external_id.trim(),
        kind: reference.kind.trim(),
        source_namespace: reference.source_namespace.trim(),
        source_system: reference.source_system.trim(),
      });
    }
  }

  function field(key: keyof ReferenceForm, label: string, id: string) {
    return (
      <label className="text-xs font-medium text-muted" htmlFor={id}>
        {label}
        <input
          className={fieldClassName}
          id={id}
          onChange={(event) =>
            setReference((previous) => ({ ...previous, [key]: event.target.value }))
          }
          value={reference[key]}
        />
      </label>
    );
  }

  return (
    <div className="space-y-6">
      <SectionSurface
        description="A receipt records what one resolution served and what it withheld. Find one by the reference it cited, or open it by id."
        title="Find a receipt"
      >
        <form className="space-y-3 px-6 py-4" onSubmit={submitLookup}>
          <div className="grid gap-3 md:grid-cols-4">
            {field("source_system", "Source system", "reference-system")}
            {field("source_namespace", "Namespace", "reference-namespace")}
            {field("kind", "Kind", "reference-kind")}
            {field("external_id", "External id", "reference-external-id")}
          </div>
          {/* All four are required by the service, and the reason is worth
              stating: a partial reference matches across source systems and
              returns receipts about a different thing that shares a name. */}
          <p className="text-xs text-muted">
            All four coordinates are required. A partial reference would match across source systems
            and return receipts about something else that happens to share a name.
          </p>
          <Button disabled={!referenceComplete || searchQuery.isFetching} type="submit">
            <Search aria-hidden="true" className="size-4" />
            Find receipts citing this
          </Button>
        </form>

        <div className="border-t border-border-subtle px-6 py-4">
          {/* Chosen from recent resolutions, which E23-T1 made listable. A
              receipt id is minted by a resolution and shown to whoever triggered
              it, so a reader arriving later to ask what was served had no way to
              obtain one — the find-by-reference path above is for somebody who
              holds the work item instead.

              A withheld receipt is absent from the list, not offered and then
              refused: the service decides that, and offering one would disclose
              that a resolution exists from the surface allowed to say so. */}
          <ResourcePicker
            label="Or open a recent resolution"
            load={receipts}
            onValueChange={setReceiptId}
            searchPlaceholder="Search recent resolutions"
            value={receiptId}
          />
          <Button
            className="mt-3"
            disabled={receiptId.trim() === ""}
            onClick={() => setSelected(receiptId.trim())}
            variant="secondary"
          >
            Open this receipt
          </Button>
        </div>

        {lookup && searchQuery.data ? (
          <div className="border-t border-border-subtle px-6 py-4">
            {searchQuery.data.length === 0 ? (
              <EmptyState
                description="No resolution has cited this reference, or none is visible to you."
                title="No receipt cites this reference"
              />
            ) : (
              <ul className="space-y-2">
                {searchQuery.data.map((receipt) => (
                  <li key={receipt.receipt_id}>
                    <button
                      className="w-full rounded-md border border-border px-3 py-2 text-left hover:border-accent"
                      onClick={() => setSelected(receipt.receipt_id)}
                      type="button"
                    >
                      <code className="text-xs">{receipt.receipt_id}</code>
                      <span className="ml-2 text-xs text-muted">
                        {receipt.item_count} item(s), {receipt.exclusion_count} excluded,{" "}
                        {receipt.resolved_at}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </SectionSurface>

      {selected !== "" ? (
        <SectionSurface
          description="What this resolution served, and what it did not."
          title="Receipt"
        >
          <div className="space-y-4 px-6 py-4">
            {receiptQuery.data ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge>{receiptQuery.data.state}</StatusBadge>
                <StatusBadge tone={servability ? "warning" : "neutral"}>
                  {receiptQuery.data.hydration_state}
                </StatusBadge>
                <span className="text-xs text-muted">
                  {receiptQuery.data.item_count} item(s) served, {receiptQuery.data.exclusion_count}{" "}
                  excluded, resolved {receiptQuery.data.resolved_at}
                </span>
              </div>
            ) : null}

            {/* The whole point of this task: neither refusal is an error, and
                they are not the same state. One is the system being careful and
                waiting fixes it; the other is a decision somebody took and
                waiting fixes nothing. */}
            {servability ? (
              <Notice
                action={
                  SERVABILITY_COPY[servability].waitingHelps ? (
                    <Button
                      onClick={() => {
                        void exclusionsQuery.refetch();
                        void referencesQuery.refetch();
                      }}
                      variant="secondary"
                    >
                      Re-read
                    </Button>
                  ) : undefined
                }
                title={SERVABILITY_COPY[servability].title}
                variant={servability === "withheld" ? "warning" : "info"}
              >
                {SERVABILITY_COPY[servability].detail}
              </Notice>
            ) : null}

            {exclusionsQuery.data ? (
              <div>
                <h3 className="text-sm font-semibold text-foreground">Withheld from this answer</h3>
                {exclusionsQuery.data.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    Nothing was excluded — and this receipt is hydrated, so that is the answer
                    rather than the absence of one.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {exclusionsQuery.data.map((exclusion) => (
                      <li
                        className="text-xs text-foreground"
                        key={`${exclusion.block}:${exclusion.item_key}`}
                      >
                        <code>{exclusion.item_key}</code>{" "}
                        <span className="text-muted">
                          from {exclusion.block} — {exclusion.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {referencesQuery.data ? (
              <div>
                <h3 className="text-sm font-semibold text-foreground">References it cited</h3>
                {referencesQuery.data.length === 0 ? (
                  <p className="mt-1 text-xs text-muted">
                    This receipt cited no external reference.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {referencesQuery.data.map((item, index) => (
                      <li className="text-xs text-foreground" key={index}>
                        <code>{JSON.stringify(item)}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </SectionSurface>
      ) : null}
    </div>
  );
}
