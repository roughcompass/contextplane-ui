import { BellPlus, Link2, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Notice, RequestFailure, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  createCapabilityAdoption,
  createCapabilitySubscription,
  deleteCapabilityAdoption,
  deleteCapabilitySubscription,
  listCapabilityAdoptions,
  listCapabilitySubscriptions,
  queryRelationships,
  updateCapabilitySubscription,
  type CatalogCapabilityDetail,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type GovernedRelationship,
} from "../../shared/api";
import { catalogInputClassName, catalogLabelClassName } from "./CapabilityDialog";

/**
 * A readiness or validation state, coloured by whether it needs attention.
 *
 * `readiness_state` and the validation verdict are the two things this view has
 * that the Explore area does not, so they are the two the eye should land on.
 */
function toneFor(ready: boolean): "danger" | "success" {
  return ready ? "success" : "danger";
}

function GovernedRelationshipRow({
  entityId,
  relationship,
}: {
  entityId: string;
  relationship: GovernedRelationship;
}) {
  const { endpoints, profile, provenance, temporal, validation } = relationship;
  // Which end this entity sits on, said in the operator's terms. `is_inverse`
  // is the service's word for "you asked from the destination", and reading it
  // as a direction rather than a flag is the difference between a row that
  // explains itself and one that needs the contract open beside it.
  const other =
    endpoints.source_entity_id === entityId
      ? endpoints.destination_entity_id
      : endpoints.source_entity_id;
  const outgoing = endpoints.source_entity_id === entityId;

  return (
    <li className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge>{relationship.relationship_type}</StatusBadge>
        <StatusBadge tone="info">{outgoing ? "outgoing" : "incoming"}</StatusBadge>
        <StatusBadge tone={toneFor(validation.valid)}>
          {validation.valid ? "valid" : "invalid"}
        </StatusBadge>
        <StatusBadge tone={toneFor(relationship.readiness_state === "ready")}>
          {relationship.readiness_state}
        </StatusBadge>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted">{outgoing ? "Destination" : "Source"}</dt>
        <dd className="break-all font-mono text-xs text-foreground">{other}</dd>
        <dt className="text-muted">Enforcement</dt>
        <dd className="text-foreground">{profile.enforcement_mode}</dd>
        <dt className="text-muted">Profile revision</dt>
        <dd className="break-all font-mono text-xs text-foreground">
          {profile.profile_revision_id ?? "Not attributed"}
        </dd>
        <dt className="text-muted">Asserted by</dt>
        <dd className="text-foreground">
          {provenance.source_system ?? "Unrecorded"}
          {provenance.freshness_state ? ` · ${provenance.freshness_state}` : ""}
        </dd>
        <dt className="text-muted">Effective</dt>
        <dd className="text-foreground">
          {temporal.effective_from ?? "Unbounded"} → {temporal.effective_to ?? "open"}
        </dd>
      </dl>
      {validation.violations.length > 0 ? (
        <div className="mt-3 rounded-md border border-danger/40 bg-danger-subtle p-3">
          <p className="text-xs font-medium text-foreground">
            Validation violations{validation.truncated ? " (truncated by the service)" : ""}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">
            {validation.violations.map((violation) => (
              <li key={violation}>{violation}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

interface CapabilityConnectionsPanelProps {
  capability: CatalogCapabilityDetail;
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

export function CapabilityConnectionsPanel({
  capability,
  client,
  requestContext,
}: CapabilityConnectionsPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const tenantKey = requestContext.tenantId ?? "credential-default";
  const [intent, setIntent] = useState("");
  const [versionPin, setVersionPin] = useState("");
  const [eventKinds, setEventKinds] = useState("version.published,lifecycle.changed");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secretRef, setSecretRef] = useState("");
  const [deleteAdoptionId, setDeleteAdoptionId] = useState<string | null>(null);
  const [deleteSubscriptionId, setDeleteSubscriptionId] = useState<string | null>(null);

  const adoptionsKey = [
    "contextplane",
    tenantKey,
    "catalog",
    capability.entityId,
    "adoptions",
  ] as const;
  const subscriptionsKey = [
    "contextplane",
    tenantKey,
    "catalog",
    capability.entityId,
    "subscriptions",
  ] as const;
  const adoptions = useQuery({
    queryFn: ({ signal }) =>
      listCapabilityAdoptions(client, capability.entityId, requestContext, signal),
    queryKey: adoptionsKey,
  });
  // The governed edge read. Distinct from the dependency, dependents and
  // blast-radius endpoints the Explore area uses: those return bare edges, and
  // this returns the governance on them -- which profile revision the assertion
  // was composed against, whether it validates under that profile, whether the
  // service considers it ready, and who asserted it. Same edges, different
  // question, which is why this is an addition here and not a swap there.
  const relationships = useQuery({
    queryFn: ({ signal }) =>
      queryRelationships(client, { entityId: capability.entityId }, requestContext, signal),
    queryKey: ["contextplane", tenantKey, "catalog", capability.entityId, "governed-relationships"],
  });
  const subscriptions = useQuery({
    queryFn: ({ signal }) =>
      listCapabilitySubscriptions(client, capability.entityId, requestContext, signal),
    queryKey: subscriptionsKey,
  });
  const createAdoptionMutation = useMutation({
    mutationFn: () =>
      createCapabilityAdoption(
        client,
        capability.entityId,
        {
          ...(intent.trim() ? { intent: intent.trim() } : {}),
          ...(versionPin.trim() ? { version_pin: versionPin.trim() } : {}),
        },
        requestContext,
      ),
    onSuccess: () => {
      setIntent("");
      setVersionPin("");
      void queryClient.invalidateQueries({ queryKey: adoptionsKey });
      void queryClient.invalidateQueries({ queryKey: subscriptionsKey });
      showToast({
        message: "The tenant now records this capability as an active dependency.",
        title: "Capability adopted",
        variant: "success",
      });
    },
  });
  const deleteAdoptionMutation = useMutation({
    mutationFn: (adoptionId: string) =>
      deleteCapabilityAdoption(client, capability.entityId, adoptionId, requestContext),
    onSuccess: () => {
      setDeleteAdoptionId(null);
      void queryClient.invalidateQueries({ queryKey: adoptionsKey });
      void queryClient.invalidateQueries({ queryKey: subscriptionsKey });
      showToast({
        message: "The adoption was removed from active dependency state.",
        title: "Adoption removed",
        variant: "success",
      });
    },
  });
  const createSubscriptionMutation = useMutation({
    mutationFn: () =>
      createCapabilitySubscription(
        client,
        capability.entityId,
        {
          event_kinds: eventKinds
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          ...(secretRef.trim() ? { webhook_hmac_secret_ref: secretRef.trim() } : {}),
          ...(webhookUrl.trim() ? { webhook_url: webhookUrl.trim() } : {}),
        },
        requestContext,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionsKey });
      showToast({
        message: "The subscription is active for the selected capability events.",
        title: "Subscription created",
        variant: "success",
      });
    },
  });
  const updateSubscriptionMutation = useMutation({
    mutationFn: ({ enabled, subscriptionId }: { enabled: boolean; subscriptionId: string }) =>
      updateCapabilitySubscription(client, subscriptionId, { is_enabled: enabled }, requestContext),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: subscriptionsKey });
      showToast({
        message: "The subscription delivery state was updated.",
        title: "Subscription updated",
        variant: "success",
      });
    },
  });
  const deleteSubscriptionMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      deleteCapabilitySubscription(client, subscriptionId, requestContext),
    onSuccess: () => {
      setDeleteSubscriptionId(null);
      void queryClient.invalidateQueries({ queryKey: subscriptionsKey });
      showToast({
        message: "The subscription was removed from active delivery state.",
        title: "Subscription deleted",
        variant: "success",
      });
    },
  });

  return (
    <div className="space-y-8 p-6">
      <section aria-labelledby="governed-relationships-title">
        <h3 id="governed-relationships-title" className="text-base font-semibold text-foreground">
          Governed relationships
        </h3>
        <p className="mt-1 text-sm text-muted">
          Edges touching this entity, with the governance the traversal views omit: the profile
          revision each assertion was composed against, whether it still validates under that
          profile, and who asserted it.
        </p>
        {relationships.isPending ? (
          <div
            className="mt-4 h-28 animate-pulse rounded-lg bg-surface-muted"
            aria-label="Loading governed relationships"
            role="status"
          />
        ) : relationships.isError ? (
          <div className="mt-4">
            <RequestFailure
              onRetry={() => void relationships.refetch()}
              title="Governed relationships unavailable"
            >
              The governed relationship query could not be completed. Traversal views elsewhere read
              a different surface and may still work.
            </RequestFailure>
          </div>
        ) : relationships.data.items.length === 0 ? (
          <p className="mt-4 rounded-lg border border-border bg-surface-muted p-5 text-sm text-muted">
            No governed relationship touches this entity.
          </p>
        ) : (
          <>
            <ul className="mt-4 divide-y divide-border-subtle rounded-lg border border-border">
              {relationships.data.items.map((relationship) => (
                <GovernedRelationshipRow
                  key={relationship.relationship_id}
                  entityId={capability.entityId}
                  relationship={relationship}
                />
              ))}
            </ul>
            {relationships.data.has_more ? (
              // Said rather than paged. A "load more" here would be a second
              // pagination model in a dialog that has none, and the honest
              // thing an operator needs first is to know the list is partial.
              <p className="mt-2 text-sm text-muted">
                Showing the first {relationships.data.items.length}. More edges exist; the
                Relationships page lists them in full.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="adoptions-title">
        <h3 id="adoptions-title" className="text-base font-semibold text-foreground">
          Active adoptions
        </h3>
        <p className="mt-1 text-sm text-muted">
          Consumer tenants that declared this provider capability as a dependency. Adoption can
          automatically create an inbox subscription.
        </p>
        {adoptions.isPending ? (
          <div className="mt-4 h-28 animate-pulse rounded-lg bg-surface-muted" role="status" />
        ) : adoptions.isError ? (
          <div className="mt-4">
            <RequestFailure onRetry={() => void adoptions.refetch()} title="Adoptions unavailable">
              Active consumer dependencies could not be loaded.
            </RequestFailure>
          </div>
        ) : adoptions.data.length === 0 ? (
          <p className="mt-4 rounded-lg border border-border bg-surface-muted p-5 text-sm text-muted">
            No active adoption has been recorded for this capability.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border-subtle rounded-lg border border-border">
            {adoptions.data.map((adoption) => (
              <li key={adoption.adoptionId} className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <dl className="grid min-w-0 gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
                    <dt className="text-muted">Consumer tenant</dt>
                    <dd className="break-all font-mono text-xs text-foreground">
                      {adoption.consumerTenantId}
                    </dd>
                    <dt className="text-muted">Intent</dt>
                    <dd className="text-foreground">{adoption.intent ?? "Not provided"}</dd>
                    <dt className="text-muted">Version pin</dt>
                    <dd className="font-mono text-xs text-foreground">
                      {adoption.versionPin ?? "Not pinned"}
                    </dd>
                  </dl>
                  {deleteAdoptionId === adoption.adoptionId ? (
                    <div className="shrink-0 rounded-md border border-danger/40 bg-danger-subtle p-3">
                      <p className="text-xs font-medium text-foreground">Remove adoption?</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          disabled={deleteAdoptionMutation.isPending}
                          onClick={() => deleteAdoptionMutation.mutate(adoption.adoptionId)}
                          size="compact"
                          variant="danger"
                        >
                          Confirm remove
                        </Button>
                        <Button
                          onClick={() => setDeleteAdoptionId(null)}
                          size="compact"
                          variant="secondary"
                        >
                          Keep
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      aria-label={`Remove adoption ${adoption.adoptionId}`}
                      onClick={() => setDeleteAdoptionId(adoption.adoptionId)}
                      size="icon"
                      title="Remove adoption"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-5 rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            createAdoptionMutation.mutate();
          }}
        >
          <h4 className="font-semibold text-foreground">Record tenant adoption</h4>
          <p className="mt-1 text-sm text-muted">
            Use this when the selected tenant consumes this provider capability.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <label className={catalogLabelClassName}>
              Adoption intent
              <input
                className={catalogInputClassName}
                onChange={(event) => setIntent(event.target.value)}
                placeholder="Why this dependency is needed"
                value={intent}
              />
            </label>
            <label className={catalogLabelClassName}>
              Version pin
              <input
                className={catalogInputClassName}
                onChange={(event) => setVersionPin(event.target.value)}
                placeholder="Optional version constraint"
                value={versionPin}
              />
            </label>
          </div>
          {createAdoptionMutation.isError ? (
            <div className="mt-4">
              <Notice title="Adoption was not recorded" variant="danger">
                The service rejected the dependency declaration. The entered values remain
                available.
              </Notice>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button disabled={createAdoptionMutation.isPending} type="submit">
              <Link2 aria-hidden="true" className="size-4" />
              {createAdoptionMutation.isPending ? "Recording…" : "Record adoption"}
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="subscriptions-title">
        <h3 id="subscriptions-title" className="text-base font-semibold text-foreground">
          Event subscriptions
        </h3>
        <p className="mt-1 text-sm text-muted">
          Inbox or webhook delivery for lifecycle and version events on this capability.
        </p>
        {subscriptions.isPending ? (
          <div className="mt-4 h-28 animate-pulse rounded-lg bg-surface-muted" role="status" />
        ) : subscriptions.isError ? (
          <div className="mt-4">
            <RequestFailure
              onRetry={() => void subscriptions.refetch()}
              title="Subscriptions unavailable"
            >
              Event delivery state could not be loaded.
            </RequestFailure>
          </div>
        ) : subscriptions.data.length === 0 ? (
          <p className="mt-4 rounded-lg border border-border bg-surface-muted p-5 text-sm text-muted">
            No subscription is configured for the current tenant.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border-subtle rounded-lg border border-border">
            {subscriptions.data.map((subscription) => (
              <li key={subscription.subscriptionId} className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={subscription.isEnabled ? "success" : "neutral"}>
                        {subscription.isEnabled ? "Enabled" : "Paused"}
                      </StatusBadge>
                      <StatusBadge>{subscription.digestWindow}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-foreground">
                      {subscription.eventKinds.join(", ")}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted">
                      {subscription.webhookUrl ?? "Inbox delivery only"}
                    </p>
                  </div>
                  {deleteSubscriptionId === subscription.subscriptionId ? (
                    <div className="shrink-0 rounded-md border border-danger/40 bg-danger-subtle p-3">
                      <p className="text-xs font-medium text-foreground">Delete subscription?</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          disabled={deleteSubscriptionMutation.isPending}
                          onClick={() =>
                            deleteSubscriptionMutation.mutate(subscription.subscriptionId)
                          }
                          size="compact"
                          variant="danger"
                        >
                          Confirm delete
                        </Button>
                        <Button
                          onClick={() => setDeleteSubscriptionId(null)}
                          size="compact"
                          variant="secondary"
                        >
                          Keep
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        disabled={updateSubscriptionMutation.isPending}
                        onClick={() =>
                          updateSubscriptionMutation.mutate({
                            enabled: !subscription.isEnabled,
                            subscriptionId: subscription.subscriptionId,
                          })
                        }
                        size="compact"
                        variant="secondary"
                      >
                        {subscription.isEnabled ? "Pause" : "Enable"}
                      </Button>
                      <Button
                        aria-label={`Delete subscription ${subscription.subscriptionId}`}
                        onClick={() => setDeleteSubscriptionId(subscription.subscriptionId)}
                        size="icon"
                        title="Delete subscription"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-5 rounded-lg border border-border p-5"
          onSubmit={(event) => {
            event.preventDefault();
            createSubscriptionMutation.mutate();
          }}
        >
          <h4 className="font-semibold text-foreground">Create subscription</h4>
          <p className="mt-1 text-sm text-muted">
            Leave webhook fields blank for inbox delivery. Secret references identify
            deployment-managed credentials; they are not secret values.
          </p>
          <label className={`${catalogLabelClassName} mt-4`}>
            Event kinds
            <input
              required
              className={catalogInputClassName}
              onChange={(event) => setEventKinds(event.target.value)}
              value={eventKinds}
            />
            <span className="mt-1 block font-normal text-muted">
              Comma-separated service values.
            </span>
          </label>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <label className={catalogLabelClassName}>
              Webhook URL
              <input
                className={catalogInputClassName}
                onChange={(event) => setWebhookUrl(event.target.value)}
                placeholder="Optional HTTPS destination"
                type="url"
                value={webhookUrl}
              />
            </label>
            <label className={catalogLabelClassName}>
              HMAC secret reference
              <input
                className={catalogInputClassName}
                onChange={(event) => setSecretRef(event.target.value)}
                placeholder="Optional deployment secret ref"
                value={secretRef}
              />
            </label>
          </div>
          {createSubscriptionMutation.isError ? (
            <div className="mt-4">
              <Notice title="Subscription was not created" variant="danger">
                The service rejected the delivery configuration. The entered values remain
                available.
              </Notice>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button disabled={createSubscriptionMutation.isPending} type="submit">
              <BellPlus aria-hidden="true" className="size-4" />
              {createSubscriptionMutation.isPending ? "Creating…" : "Create subscription"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
