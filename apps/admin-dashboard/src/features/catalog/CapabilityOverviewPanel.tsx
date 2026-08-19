import { AlertTriangle, Save, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button, Notice, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  changeCapabilityLifecycle,
  deleteCapability,
  setCapabilityVisibility,
  updateCapability,
  type CatalogCapabilityDetail,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { catalogInputClassName, catalogLabelClassName } from "./CapabilityDialog";

interface CapabilityOverviewPanelProps {
  capability: CatalogCapabilityDetail;
  client: ContextplaneClient;
  onDeleted: () => void;
  requestContext: ContextplaneRequestOptions;
}

const visibilityOptions = ["private", "tenant-shared", "public"] as const;
const lifecycleOptions = ["alpha", "beta", "ga", "deprecated", "retired"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function CapabilityOverviewPanel({
  capability,
  client,
  onDeleted,
  requestContext,
}: CapabilityOverviewPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [attributesText, setAttributesText] = useState(() =>
    JSON.stringify(capability.attributes, null, 2),
  );
  const [attributesError, setAttributesError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<(typeof visibilityOptions)[number]>("private");
  const [sharedTenantIds, setSharedTenantIds] = useState("");
  const [lifecycle, setLifecycle] = useState(capability.lifecycle);
  const [successor, setSuccessor] = useState("none");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);

  function refresh(message: string) {
    setReceipt(`${message} · ${new Date().toISOString()}`);
    void queryClient.invalidateQueries({ queryKey: ["contextplane"] });
    showToast({ message, title: capability.name, variant: "success" });
  }

  const updateMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      updateCapability(client, capability.entityId, { updates }, requestContext),
    onSuccess: () => refresh("Capability attributes were updated."),
  });
  const visibilityMutation = useMutation({
    mutationFn: () =>
      setCapabilityVisibility(
        client,
        capability.entityId,
        {
          visibility,
          ...(visibility === "tenant-shared"
            ? {
                shared_with_tenants: sharedTenantIds
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              }
            : {}),
        },
        requestContext,
      ),
    onSuccess: () => refresh(`Capability visibility changed to ${visibility}.`),
  });
  const lifecycleMutation = useMutation({
    mutationFn: () =>
      changeCapabilityLifecycle(
        client,
        capability.entityId,
        { new_state: lifecycle, successor: successor.trim() || "none" },
        requestContext,
      ),
    onSuccess: () => refresh(`Capability lifecycle changed to ${lifecycle}.`),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteCapability(client, capability.entityId, requestContext),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contextplane"] });
      showToast({
        message: `${capability.name} was removed from active catalog state.`,
        title: "Capability deleted",
        variant: "success",
      });
      onDeleted();
    },
  });

  function submitAttributes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const value: unknown = JSON.parse(attributesText);
      if (!isRecord(value)) {
        setAttributesError("Attributes must be a JSON object.");
        return;
      }
      setAttributesError(null);
      updateMutation.mutate(value);
    } catch {
      setAttributesError("Enter valid JSON attributes.");
    }
  }

  const hasFailure =
    updateMutation.isError ||
    visibilityMutation.isError ||
    lifecycleMutation.isError ||
    deleteMutation.isError;

  return (
    <div className="space-y-6 p-6">
      <section aria-labelledby="capability-identity-title">
        <h3 id="capability-identity-title" className="text-base font-semibold text-foreground">
          Identity and current state
        </h3>
        <dl className="mt-4 grid gap-x-8 gap-y-4 rounded-lg border border-border bg-surface-muted p-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">Stable ID</dt>
            <dd className="mt-1 break-all font-mono text-sm text-foreground">
              {capability.entityId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">External ID</dt>
            <dd className="mt-1 font-mono text-sm text-foreground">
              {capability.externalId ?? "Not assigned"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Entity type</dt>
            <dd className="mt-1 text-sm text-foreground">{capability.entityType}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Lifecycle</dt>
            <dd className="mt-1">
              <StatusBadge tone="info">{capability.lifecycle}</StatusBadge>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-muted">Created</dt>
            <dd className="mt-1 text-sm text-foreground">
              <time dateTime={capability.createdAt}>{capability.createdAt}</time>
            </dd>
          </div>
        </dl>
      </section>

      {receipt ? (
        <Notice title="Service change completed" variant="success">
          {receipt}
        </Notice>
      ) : null}
      {hasFailure ? (
        <Notice title="Change was not completed" variant="danger">
          The service refused or could not complete the requested change. Existing catalog state
          remains authoritative and the entered values are preserved.
        </Notice>
      ) : null}

      <form className="rounded-lg border border-border p-5" onSubmit={submitAttributes}>
        <h3 className="text-base font-semibold text-foreground">Capability attributes</h3>
        <p className="mt-1 text-sm text-muted">
          Update only the structured properties governed by this capability's active profile.
        </p>
        <label className={`${catalogLabelClassName} mt-4`}>
          Attributes JSON
          <textarea
            aria-invalid={attributesError ? true : undefined}
            className={`${catalogInputClassName} min-h-52 resize-y font-mono leading-6`}
            onChange={(event) => setAttributesText(event.target.value)}
            spellCheck={false}
            value={attributesText}
          />
        </label>
        {attributesError ? <p className="mt-2 text-sm text-danger">{attributesError}</p> : null}
        <div className="mt-4 flex justify-end">
          <Button disabled={updateMutation.isPending} type="submit">
            <Save aria-hidden="true" className="size-4" />
            {updateMutation.isPending ? "Saving…" : "Save attributes"}
          </Button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            visibilityMutation.mutate();
          }}
        >
          <h3 className="text-base font-semibold text-foreground">Visibility</h3>
          <p className="mt-1 text-sm text-muted">
            Choose who may discover and use this capability. Current visibility is not included in
            the default detail response, so no value is inferred.
          </p>
          <label className={`${catalogLabelClassName} mt-4`}>
            New visibility
            <select
              className={catalogInputClassName}
              onChange={(event) =>
                setVisibility(event.target.value as (typeof visibilityOptions)[number])
              }
              value={visibility}
            >
              {visibilityOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          {visibility === "tenant-shared" ? (
            <label className={`${catalogLabelClassName} mt-4`}>
              Shared tenant UUIDs
              <input
                required
                className={catalogInputClassName}
                onChange={(event) => setSharedTenantIds(event.target.value)}
                placeholder="UUID, UUID"
                value={sharedTenantIds}
              />
            </label>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button disabled={visibilityMutation.isPending} type="submit" variant="secondary">
              {visibilityMutation.isPending ? "Changing…" : "Change visibility"}
            </Button>
          </div>
        </form>

        <form
          className="rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            lifecycleMutation.mutate();
          }}
        >
          <h3 className="text-base font-semibold text-foreground">Lifecycle transition</h3>
          <p className="mt-1 text-sm text-muted">
            The service evaluates progression rules and returns gate failures without changing the
            current state.
          </p>
          <label className={`${catalogLabelClassName} mt-4`}>
            New lifecycle state
            <select
              className={catalogInputClassName}
              onChange={(event) => setLifecycle(event.target.value)}
              value={lifecycle}
            >
              {lifecycleOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className={`${catalogLabelClassName} mt-4`}>
            Successor capability UUID or “none”
            <input
              required
              className={catalogInputClassName}
              onChange={(event) => setSuccessor(event.target.value)}
              value={successor}
            />
          </label>
          <div className="mt-4 flex justify-end">
            <Button disabled={lifecycleMutation.isPending} type="submit" variant="secondary">
              {lifecycleMutation.isPending ? "Changing…" : "Change lifecycle"}
            </Button>
          </div>
        </form>
      </div>

      <section className="rounded-lg border border-danger/40 bg-danger-subtle p-5">
        <div className="flex gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground">Delete capability</h3>
            <p className="mt-1 text-sm text-muted">
              This removes the capability from active catalog state. Review dependents and adoptions
              before proceeding.
            </p>
            <label className={`${catalogLabelClassName} mt-4`}>
              Type {capability.name} to confirm
              <input
                autoComplete="off"
                className={catalogInputClassName}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                value={deleteConfirmation}
              />
            </label>
            <div className="mt-4 flex justify-end">
              <Button
                disabled={deleteMutation.isPending || deleteConfirmation.trim() !== capability.name}
                onClick={() => deleteMutation.mutate()}
                variant="danger"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {deleteMutation.isPending ? "Deleting…" : "Delete capability"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
