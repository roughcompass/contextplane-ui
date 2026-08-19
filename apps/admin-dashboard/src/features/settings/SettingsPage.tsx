import { Database, GitBranch, Play, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { BRAND } from "@repo/ui/brand";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  PageSkeleton,
  SectionSurface,
} from "@repo/ui/layouts";
import {
  Button,
  Notice,
  RequestFailure,
  SearchableSelect,
  Skeleton,
  StatusBadge,
  Switch,
  useToast,
} from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  addVocabularyValue,
  changeAutopromotePredicate,
  createProgressionOverride,
  getAutopromoteAllowlist,
  getConformancePolicy,
  getPromotionPolicy,
  getWhoAmI,
  listEntityTypeSchemas,
  listEdgePropertySchemas,
  listExternalSystems,
  listExtractionStrategies,
  listMemoryCalibration,
  listMemorySources,
  listPiiFieldPolicies,
  listPiiPatterns,
  listProgressionDefinitions,
  listProgressionOverrides,
  listSyncRuns,
  listSyncSources,
  listVocabularyValues,
  purgeActorPersonalData,
  refitMemoryCalibration,
  replacePromotionPolicy,
  resetMemorySourceBreaker,
  setEntityTypeSchemaAdvisory,
  setPiiPatternEnabled,
  setSyncSourceActive,
  setVocabularyDeprecated,
  triggerSync,
  updateExtractionStrategy,
  type CalibrationMapping,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type GraphVocabularyKind,
  type ProgressionOverrideInput,
  type PromotionPolicy,
  type PromotionPolicyInput,
  type WhoAmI,
} from "../../shared/api";
import {
  adminStatusTone,
  edgeSchemaLabel,
  formatAdminTimestamp,
  humanizeAdminValue,
  parseAlwaysReview,
  readSettingsTab,
  readVocabularyKind,
  recentSyncWindow,
  settingsSearch,
  settingsTabs,
  shortAdminIdentifier,
  type SettingsTab,
} from "./settingsModel";

interface SettingsPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

interface AdminTabProps {
  apiTenantId?: string;
  client: ContextplaneClient;
  identity: WhoAmI;
}

interface MutationReceipt {
  body: string;
  title: string;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
const checkboxClassName =
  "size-5 rounded border-border-strong accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";

function requestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function tenantQueryKey(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function operationKey(): string {
  return globalThis.crypto.randomUUID();
}

function adminQueryPresentation(error: unknown) {
  if (error instanceof ContextplaneApiError) {
    if (error.code === "unauthenticated") {
      return {
        body: "Connect through the deployment gateway or runtime token provider. Access tokens must not be placed in browser-bundled variables.",
        title: `Connect an authenticated ${BRAND.name} session`,
        variant: "warning" as const,
      };
    }
    if (error.code === "tenant_required") {
      return {
        body: "The credential spans multiple tenants. Select a tenant that the runtime maps to the X-Tenant-ID request header.",
        title: "Select an API tenant",
        variant: "warning" as const,
      };
    }
    if (error.status === 403) {
      return {
        body: `The ${BRAND.name} service restricts this configuration to the administrator role in the resolved tenant.`,
        title: "Administrative settings are restricted",
        variant: "warning" as const,
      };
    }
  }
  return {
    body: "The administrative configuration could not be loaded. No setting has been changed; retry when the service is available.",
    title: "Settings could not be loaded",
    variant: "danger" as const,
  };
}

function adminMutationPresentation(error: unknown) {
  if (error instanceof ContextplaneApiError) {
    if (error.status === 403) {
      return {
        body: "The service refused this administrative write for the resolved actor or tenant.",
        title: "Administrative write not permitted",
      };
    }
    if (error.status === 409 || error.status === 412) {
      return {
        body: "The setting changed after it was loaded. Refresh this section and review the current service value before retrying.",
        title: "Setting changed concurrently",
      };
    }
    if (error.status === 422) {
      return {
        body: "The service rejected the supplied value. The entered data remains available for correction.",
        title: "Setting value was rejected",
      };
    }
  }
  return {
    body: "The service did not record this change. Existing configuration remains authoritative.",
    title: "Setting could not be changed",
  };
}

function QueryFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const presentation = adminQueryPresentation(error);
  return (
    <RequestFailure
      onRetry={onRetry}
      requestId={error instanceof ContextplaneApiError ? error.requestId : null}
      title={presentation.title}
      variant={presentation.variant}
    >
      {presentation.body}
    </RequestFailure>
  );
}

function MutationFailure({ error }: { error: unknown | null }) {
  if (error) {
    const presentation = adminMutationPresentation(error);
    return (
      <Notice title={presentation.title} variant="danger">
        {presentation.body}
        {error instanceof ContextplaneApiError && error.requestId ? (
          <span className="mt-1 block font-mono text-xs">Request ID: {error.requestId}</span>
        ) : null}
      </Notice>
    );
  }
  return null;
}

function useMutationToast() {
  const { showToast } = useToast();
  return (receipt: MutationReceipt) => {
    showToast({ message: receipt.body, title: receipt.title, variant: "success" });
  };
}

function TabLoading() {
  return (
    <SectionSurface title="Loading administrative settings">
      <div aria-label="Loading settings" className="space-y-4" role="status">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    </SectionSurface>
  );
}

function SettingsRow({
  action,
  description,
  metadata,
  title,
}: {
  action?: ReactNode;
  description: ReactNode;
  metadata?: ReactNode;
  title: ReactNode;
}) {
  return (
    <li className="grid gap-4 px-6 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="mt-1 text-sm leading-6 text-muted">{description}</div>
        {metadata ? <div className="mt-2 flex flex-wrap gap-2">{metadata}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2 sm:justify-end">{action}</div> : null}
    </li>
  );
}

function IntegrationsTab({ apiTenantId, client }: AdminTabProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const key = tenantQueryKey(apiTenantId);
  const queryClient = useQueryClient();
  const showMutationToast = useMutationToast();
  const query = useQuery({
    queryKey: ["settings", key, "integrations"],
    queryFn: async ({ signal }) => {
      const [sources, runs, systems] = await Promise.all([
        listSyncSources(client, context, signal),
        listSyncRuns(client, { from: recentSyncWindow() }, context, signal),
        listExternalSystems(client, context, signal),
      ]);
      return { runs, sources, systems };
    },
  });
  const mutation = useMutation({
    mutationFn: async (
      input:
        | { action: "active"; active: boolean; sourceId: string; sourceName: string }
        | { action: "trigger"; sourceId: string; sourceName: string },
    ) => {
      if (input.action === "trigger") {
        const trigger = await triggerSync(client, input.sourceId, operationKey(), context);
        return {
          body: `${input.sourceName} queued run ${shortAdminIdentifier(trigger.sync_run_id)} at ${formatAdminTimestamp(trigger.started_at)}.`,
          title: "Sync run queued",
        };
      }
      await setSyncSourceActive(client, input.sourceId, input.active, context);
      return {
        body: `${input.sourceName} is now ${input.active ? "active" : "paused"}.`,
        title: "Sync source updated",
      };
    },
    onSuccess: async (nextReceipt) => {
      showMutationToast(nextReceipt);
      await queryClient.invalidateQueries({ queryKey: ["settings", key, "integrations"] });
    },
  });

  if (query.isPending) return <TabLoading />;
  if (query.isError)
    return <QueryFailure error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-6">
      <MutationFailure error={mutation.error ?? null} />
      <SectionSurface
        description="Connector configuration and manual synchronization. Credentials remain server-side references and are never returned to this page."
        flush
        title="Sync sources"
      >
        {query.data.sources.length === 0 ? (
          <EmptyState
            description="Create a source through the administrative API before scheduling or triggering synchronization."
            icon={Database}
            title="No sync sources are configured"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.sources.map((source) => {
              const pending =
                mutation.isPending && mutation.variables.sourceId === source.source_id;
              return (
                <SettingsRow
                  key={source.source_id}
                  action={
                    <>
                      <Button
                        disabled={pending || !source.is_active}
                        onClick={() =>
                          mutation.mutate({
                            action: "trigger",
                            sourceId: source.source_id,
                            sourceName: source.display_name,
                          })
                        }
                        size="compact"
                        variant="secondary"
                      >
                        <Play aria-hidden="true" className="size-4" />
                        Trigger sync
                      </Button>
                      <Switch
                        checked={source.is_active}
                        checkedLabel="Active"
                        disabled={pending}
                        label={`${source.display_name} sync source`}
                        onCheckedChange={(active) =>
                          mutation.mutate({
                            action: "active",
                            active,
                            sourceId: source.source_id,
                            sourceName: source.display_name,
                          })
                        }
                        uncheckedLabel="Paused"
                      />
                    </>
                  }
                  description={`${humanizeAdminValue(source.source_type)} · ${source.schedule ?? "Manual schedule"}`}
                  metadata={<StatusBadge>{shortAdminIdentifier(source.source_id)}</StatusBadge>}
                  title={source.display_name}
                />
              );
            })}
          </ul>
        )}
      </SectionSurface>

      <SectionSurface
        description="The service returns an unpaged run list. This view requests only runs started in the last seven days."
        flush
        title="Recent sync runs"
      >
        {query.data.runs.length === 0 ? (
          <EmptyState
            description="No run was reported in the requested window."
            title="No recent sync runs"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.runs.map((run) => (
              <SettingsRow
                key={run.sync_run_id}
                description={`Started ${formatAdminTimestamp(run.started_at)} · ${run.artifact_count === null ? "Artifact count unavailable" : `${run.artifact_count} artifacts`} · ${run.duration_s === null ? "Duration unavailable" : `${run.duration_s}s`}`}
                metadata={
                  <>
                    <StatusBadge tone={adminStatusTone(run.status)}>
                      {humanizeAdminValue(run.status)}
                    </StatusBadge>
                    <StatusBadge>{humanizeAdminValue(run.trigger)}</StatusBadge>
                  </>
                }
                title={
                  <span title={run.sync_run_id}>
                    Run <span className="font-mono">{shortAdminIdentifier(run.sync_run_id)}</span>
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </SectionSurface>

      <SectionSurface
        description="Stable slugs and URL templates used to resolve references back to their source systems."
        flush
        title="External systems"
      >
        {query.data.systems.length === 0 ? (
          <EmptyState
            description="No external reference systems are registered for this tenant."
            title="No external systems"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.systems.map((system) => (
              <SettingsRow
                key={system.slug}
                description={system.description ?? "No description supplied."}
                metadata={
                  <>
                    <StatusBadge>{system.slug}</StatusBadge>
                    {system.url_template ? (
                      <StatusBadge tone="info">URL template set</StatusBadge>
                    ) : null}
                  </>
                }
                title={system.display_name}
              />
            ))}
          </ul>
        )}
      </SectionSurface>
    </div>
  );
}

function ExtractionTab({ apiTenantId, client }: AdminTabProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const key = tenantQueryKey(apiTenantId);
  const queryClient = useQueryClient();
  const showMutationToast = useMutationToast();
  const query = useQuery({
    queryKey: ["settings", key, "extraction"],
    queryFn: async ({ signal }) => {
      const [strategies, conformance] = await Promise.all([
        listExtractionStrategies(client, context, signal),
        getConformancePolicy(client, context, signal),
      ]);
      return { conformance, strategies };
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ enabled, strategyId }: { enabled: boolean; strategyId: string }) => {
      await updateExtractionStrategy(client, strategyId, { is_enabled: enabled }, context);
      return {
        body: `${humanizeAdminValue(strategyId)} is now ${enabled ? "enabled" : "disabled"}.`,
        title: "Extraction strategy updated",
      };
    },
    onSuccess: async (nextReceipt) => {
      showMutationToast(nextReceipt);
      await queryClient.invalidateQueries({ queryKey: ["settings", key, "extraction"] });
    },
  });

  if (query.isPending) return <TabLoading />;
  if (query.isError)
    return <QueryFailure error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-6">
      <MutationFailure error={mutation.error ?? null} />
      <SectionSurface
        description="The deployment-wide ratio and minimum sample the service uses to classify an extraction strategy as conformant."
        title="Conformance policy"
      >
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-muted">Target ratio</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {(query.data.conformance.target_ratio * 100).toFixed(1)}%
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted">Minimum sample</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {query.data.conformance.minimum_sample}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-6 text-muted">{query.data.conformance.explanation}</p>
      </SectionSurface>

      <SectionSurface
        description="Effective strategy configuration for this tenant. Prompt and model overrides are disclosed without exposing prompt content."
        flush
        title="Extraction strategies"
      >
        {query.data.strategies.length === 0 ? (
          <EmptyState
            description="The service did not publish any extraction strategies."
            title="No extraction strategies"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.strategies.map((strategy) => (
              <SettingsRow
                key={strategy.strategy_id}
                action={
                  <Switch
                    checked={strategy.is_enabled}
                    checkedLabel="Enabled"
                    disabled={
                      mutation.isPending && mutation.variables.strategyId === strategy.strategy_id
                    }
                    label={`${humanizeAdminValue(strategy.strategy_id)} extraction strategy`}
                    onCheckedChange={(enabled) =>
                      mutation.mutate({
                        enabled,
                        strategyId: strategy.strategy_id,
                      })
                    }
                    uncheckedLabel="Disabled"
                  />
                }
                description={`Model ${strategy.model_id} · Confidence floor ${(strategy.confidence_floor * 100).toFixed(1)}% · ${strategy.permitted_predicates.length} permitted predicates`}
                metadata={
                  strategy.model_is_overridden || strategy.prompt_is_overridden ? (
                    <>
                      {strategy.model_is_overridden ? (
                        <StatusBadge tone="info">Model override</StatusBadge>
                      ) : null}
                      {strategy.prompt_is_overridden ? (
                        <StatusBadge tone="info">Prompt override</StatusBadge>
                      ) : null}
                    </>
                  ) : undefined
                }
                title={humanizeAdminValue(strategy.strategy_id)}
              />
            ))}
          </ul>
        )}
      </SectionSurface>
    </div>
  );
}

function SchemaTab({
  apiTenantId,
  client,
  identity,
  onVocabularyKindChange,
  vocabularyKind,
}: AdminTabProps & {
  onVocabularyKindChange: (kind: GraphVocabularyKind) => void;
  vocabularyKind: GraphVocabularyKind;
}) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const key = tenantQueryKey(apiTenantId);
  const queryClient = useQueryClient();
  const valueId = useId();
  const [newValue, setNewValue] = useState("");
  const [enforcementTarget, setEnforcementTarget] = useState<string | null>(null);
  const showMutationToast = useMutationToast();
  const query = useQuery({
    queryKey: ["settings", key, "schema", vocabularyKind],
    queryFn: async ({ signal }) => {
      const [vocabulary, entityTypeSchemas, edgeSchemas] = await Promise.all([
        listVocabularyValues(client, vocabularyKind, context, signal),
        listEntityTypeSchemas(client, context, signal),
        listEdgePropertySchemas(client, context, signal),
      ]);
      return { edgeSchemas, entityTypeSchemas, vocabulary };
    },
  });
  const mutation = useMutation({
    mutationFn: async (
      input:
        | { action: "add"; value: string }
        | { action: "advisory"; advisory: boolean; entityType: string }
        | { action: "deprecated"; deprecated: boolean; value: string },
    ) => {
      if (input.action === "add") {
        await addVocabularyValue(client, vocabularyKind, input.value, operationKey(), context);
        return {
          body: `${input.value} is available for ${humanizeAdminValue(vocabularyKind)}.`,
          title: "Vocabulary value added",
        };
      }
      if (input.action === "advisory") {
        await setEntityTypeSchemaAdvisory(client, input.entityType, input.advisory, context);
        return {
          body: `${humanizeAdminValue(input.entityType)} validation is now ${input.advisory ? "advisory" : "enforcing"}.`,
          title: "Entity type schema updated",
        };
      }
      await setVocabularyDeprecated(client, vocabularyKind, input.value, input.deprecated, context);
      return {
        body: `${input.value} is now ${input.deprecated ? "deprecated for new writes" : "active"}.`,
        title: "Vocabulary value updated",
      };
    },
    onSuccess: async (nextReceipt, variables) => {
      showMutationToast(nextReceipt);
      if (variables.action === "add") setNewValue("");
      await queryClient.invalidateQueries({ queryKey: ["settings", key, "schema"] });
    },
  });

  function submitValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = newValue.trim();
    if (value) mutation.mutate({ action: "add", value });
  }

  if (query.isPending) return <TabLoading />;
  if (query.isError)
    return <QueryFailure error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-6">
      <MutationFailure error={mutation.error ?? null} />
      <SectionSurface
        action={
          <div className="w-52">
            <SearchableSelect
              allowEmpty={false}
              label="Vocabulary kind"
              onValueChange={(value) => {
                if (value === "entity_type" || value === "edge_rel") onVocabularyKindChange(value);
              }}
              options={[
                { label: "Entity types", value: "entity_type" },
                { label: "Edge relationships", value: "edge_rel" },
              ]}
              value={vocabularyKind}
            />
          </div>
        }
        description="The API does not enumerate vocabulary kinds. This console manages the entity type and edge relationship vocabularies used by the graph."
        flush
        title="Graph vocabulary"
      >
        <form
          className="border-y border-border-subtle bg-surface-muted px-6 py-4"
          onSubmit={submitValue}
        >
          <label className={labelClassName} htmlFor={valueId}>
            Add {vocabularyKind === "entity_type" ? "entity type" : "edge relationship"}
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              id={valueId}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              onChange={(event) => setNewValue(event.currentTarget.value)}
              placeholder={vocabularyKind === "entity_type" ? "service" : "depends_on"}
              value={newValue}
            />
            <Button disabled={!newValue.trim() || mutation.isPending} type="submit">
              Add value
            </Button>
          </div>
        </form>
        {query.data.vocabulary.length === 0 ? (
          <EmptyState
            description="No values were returned for this vocabulary kind."
            title="No vocabulary values"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.vocabulary.map((item) => (
              <SettingsRow
                key={item.vocab_id}
                action={
                  item.is_system ? undefined : (
                    <Button
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          action: "deprecated",
                          deprecated: item.deprecated_at === null,
                          value: item.value,
                        })
                      }
                      size="compact"
                      variant="ghost"
                    >
                      {item.deprecated_at ? "Reactivate" : "Deprecate"}
                    </Button>
                  )
                }
                description={
                  item.deprecated_at
                    ? `Deprecated ${formatAdminTimestamp(item.deprecated_at)}`
                    : `Created ${formatAdminTimestamp(item.created_at)}`
                }
                metadata={
                  <>
                    <StatusBadge tone={item.deprecated_at ? "warning" : "success"}>
                      {item.deprecated_at ? "Deprecated" : "Active"}
                    </StatusBadge>
                    {item.is_system ? (
                      <StatusBadge>System value</StatusBadge>
                    ) : (
                      <StatusBadge>Tenant value</StatusBadge>
                    )}
                  </>
                }
                title={<span className="font-mono">{item.value}</span>}
              />
            ))}
          </ul>
        )}
      </SectionSurface>

      <SectionSurface
        description={`JSON Schema validation for entity types in ${identity.tenant_display_name}. Advisory schemas report mismatches; enforcing schemas refuse invalid writes.`}
        flush
        title="Entity type schemas"
      >
        {query.data.entityTypeSchemas.length === 0 ? (
          <EmptyState
            description="No entity type schemas were returned."
            title="No entity type schemas"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.entityTypeSchemas.map((schema) => (
              <SettingsRow
                key={schema.schema_id}
                action={
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => {
                      if (schema.is_advisory) setEnforcementTarget(schema.entity_type);
                      else
                        mutation.mutate({
                          action: "advisory",
                          advisory: true,
                          entityType: schema.entity_type,
                        });
                    }}
                    size="compact"
                    variant="secondary"
                  >
                    {schema.is_advisory ? "Enforce writes" : "Make advisory"}
                  </Button>
                }
                description={`Valid from ${formatAdminTimestamp(schema.t_valid_from)} · ${Object.keys(schema.json_schema).length} top-level schema fields`}
                metadata={
                  <StatusBadge tone={schema.is_advisory ? "info" : "warning"}>
                    {schema.is_advisory ? "Advisory" : "Enforcing"}
                  </StatusBadge>
                }
                title={humanizeAdminValue(schema.entity_type)}
              />
            ))}
          </ul>
        )}
        {enforcementTarget ? (
          <div className="border-t border-border-subtle px-6 py-5">
            <Notice
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => {
                      mutation.mutate({
                        action: "advisory",
                        advisory: false,
                        entityType: enforcementTarget,
                      });
                      setEnforcementTarget(null);
                    }}
                    size="compact"
                  >
                    Confirm enforcement
                  </Button>
                  <Button onClick={() => setEnforcementTarget(null)} size="compact" variant="ghost">
                    Cancel
                  </Button>
                </div>
              }
              title={`Enforce ${humanizeAdminValue(enforcementTarget)} schema?`}
              variant="warning"
            >
              New writes that fail this JSON Schema will be refused. Existing records are not
              described as migrated by this operation.
            </Notice>
          </div>
        ) : null}
      </SectionSurface>

      <SectionSurface
        description="The service contract currently leaves edge schema items open-ended. This view reports the returned identifiers without inventing fields."
        flush
        title="Edge property schemas"
      >
        {query.data.edgeSchemas.length === 0 ? (
          <EmptyState
            description="No edge property schemas were returned."
            title="No edge property schemas"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.edgeSchemas.map((schema, index) => (
              <SettingsRow
                key={edgeSchemaLabel(schema, index)}
                description={`${Object.keys(schema).length} fields returned by the service contract`}
                title={humanizeAdminValue(edgeSchemaLabel(schema, index))}
              />
            ))}
          </ul>
        )}
      </SectionSurface>
    </div>
  );
}

function PromotionPolicyForm({
  disabled,
  onSave,
  policy,
}: {
  disabled: boolean;
  onSave: (input: PromotionPolicyInput) => void;
  policy: PromotionPolicy;
}) {
  const confidenceId = useId();
  const radiusId = useId();
  const reviewId = useId();
  const [confidence, setConfidence] = useState(String(policy.confidence_floor));
  const [blastRadius, setBlastRadius] = useState(String(policy.blast_radius_threshold));
  const [alwaysReview, setAlwaysReview] = useState(policy.always_review.join(", "));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confidenceFloor = Number(confidence);
    const blastRadiusThreshold = Number(blastRadius);
    if (
      !Number.isFinite(confidenceFloor) ||
      confidenceFloor < 0 ||
      confidenceFloor > 1 ||
      !Number.isInteger(blastRadiusThreshold) ||
      blastRadiusThreshold < 0
    ) {
      return;
    }
    onSave({
      always_review: parseAlwaysReview(alwaysReview),
      blast_radius_threshold: blastRadiusThreshold,
      confidence_floor: confidenceFloor,
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClassName} htmlFor={confidenceId}>
          Confidence floor (0–1)
          <input
            id={confidenceId}
            className={inputClassName}
            max="1"
            min="0"
            onChange={(event) => setConfidence(event.currentTarget.value)}
            required
            step="0.01"
            type="number"
            value={confidence}
          />
        </label>
        <label className={labelClassName} htmlFor={radiusId}>
          Blast-radius threshold
          <input
            id={radiusId}
            className={inputClassName}
            min="0"
            onChange={(event) => setBlastRadius(event.currentTarget.value)}
            required
            step="1"
            type="number"
            value={blastRadius}
          />
        </label>
      </div>
      <label className={labelClassName} htmlFor={reviewId}>
        Predicates that always require review
        <input
          id={reviewId}
          className={inputClassName}
          onChange={(event) => setAlwaysReview(event.currentTarget.value)}
          placeholder="owned_by_team, lifecycle"
          value={alwaysReview}
        />
        <span className="mt-1 block font-normal leading-5 text-muted">
          Comma-separated service predicate names.
        </span>
      </label>
      <Button disabled={disabled} type="submit">
        Save promotion policy
      </Button>
    </form>
  );
}

function MemoryTab({ apiTenantId, client }: AdminTabProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const key = tenantQueryKey(apiTenantId);
  const queryClient = useQueryClient();
  const predicateId = useId();
  const [predicate, setPredicate] = useState("");
  const showMutationToast = useMutationToast();
  const query = useQuery({
    queryKey: ["settings", key, "memory"],
    queryFn: async ({ signal }) => {
      const [sources, policy, allowlist, calibration] = await Promise.all([
        listMemorySources(client, context, signal),
        getPromotionPolicy(client, context, signal),
        getAutopromoteAllowlist(client, context, signal),
        listMemoryCalibration(client, context, signal),
      ]);
      return { allowlist, calibration, policy, sources };
    },
  });
  const mutation = useMutation({
    mutationFn: async (
      input:
        | { action: "allow"; predicate: string }
        | { action: "policy"; policy: PromotionPolicyInput }
        | { action: "refit"; mapping: CalibrationMapping }
        | { action: "revoke"; predicate: string }
        | { action: "reset"; sourceId: string },
    ) => {
      if (input.action === "policy") {
        await replacePromotionPolicy(client, input.policy, context);
        return {
          body: "The service recorded the complete replacement policy.",
          title: "Promotion policy updated",
        };
      }
      if (input.action === "allow" || input.action === "revoke") {
        await changeAutopromotePredicate(client, input.predicate, input.action, context);
        return {
          body: `${input.predicate} was ${input.action === "allow" ? "added to" : "removed from"} the allowlist.`,
          title: "Autopromote allowlist updated",
        };
      }
      if (input.action === "reset") {
        await resetMemorySourceBreaker(client, input.sourceId, context);
        return {
          body: `The breaker for ${shortAdminIdentifier(input.sourceId)} was reset.`,
          title: "Source breaker reset",
        };
      }
      const result = await refitMemoryCalibration(
        client,
        {
          model_id: input.mapping.model_id,
          provider_id: input.mapping.provider_id,
          strategy_id: input.mapping.strategy_id,
        },
        context,
      );
      return {
        body: `Version ${result.version} used ${result.n_adjudicated} adjudications and was ${result.activated ? "activated" : "not activated"}.`,
        title: "Calibration refit completed",
      };
    },
    onSuccess: async (nextReceipt, variables) => {
      showMutationToast(nextReceipt);
      if (variables.action === "allow") setPredicate("");
      await queryClient.invalidateQueries({ queryKey: ["settings", key, "memory"] });
    },
  });

  function submitPredicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = predicate.trim();
    if (value) mutation.mutate({ action: "allow", predicate: value });
  }

  if (query.isPending) return <TabLoading />;
  if (query.isError)
    return <QueryFailure error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-6">
      <MutationFailure error={mutation.error ?? null} />
      <SectionSurface
        description="A full replacement controls which observations may advance automatically and which require governed review."
        title="Promotion policy"
      >
        <PromotionPolicyForm
          key={JSON.stringify(query.data.policy)}
          disabled={mutation.isPending}
          onSave={(policy) => mutation.mutate({ action: "policy", policy })}
          policy={query.data.policy}
        />
      </SectionSurface>

      <SectionSurface
        description="Only predicates explicitly listed here may be considered for automatic promotion. Other promotion policy gates still apply."
        flush
        title="Autopromote allowlist"
      >
        <form
          className="border-y border-border-subtle bg-surface-muted px-6 py-4"
          onSubmit={submitPredicate}
        >
          <label className={labelClassName} htmlFor={predicateId}>
            Allow predicate
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              id={predicateId}
              className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              onChange={(event) => setPredicate(event.currentTarget.value)}
              placeholder="owned_by_team"
              value={predicate}
            />
            <Button disabled={!predicate.trim() || mutation.isPending} type="submit">
              Allow predicate
            </Button>
          </div>
        </form>
        {query.data.allowlist.predicates.length === 0 ? (
          <EmptyState
            description="Every observed predicate requires review under the current allowlist."
            title="No predicates are allowlisted"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.allowlist.predicates.map((item) => (
              <SettingsRow
                key={item}
                action={
                  <Button
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: "revoke", predicate: item })}
                    size="compact"
                    variant="ghost"
                  >
                    Revoke
                  </Button>
                }
                description="Eligible for automatic promotion when every remaining policy condition passes."
                title={<span className="font-mono">{item}</span>}
              />
            ))}
          </ul>
        )}
      </SectionSurface>

      <SectionSurface
        description="Per-source authority and ingestion limits, including live breaker state."
        flush
        title="Memory sources"
      >
        {query.data.sources.length === 0 ? (
          <EmptyState
            description="No source policy has been declared for this tenant."
            title="No memory sources"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.sources.map((source) => (
              <SettingsRow
                key={source.source_id}
                action={
                  source.breaker_open_until ? (
                    <Button
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({ action: "reset", sourceId: source.source_id })
                      }
                      size="compact"
                      variant="secondary"
                    >
                      <RefreshCw aria-hidden="true" className="size-4" />
                      Reset breaker
                    </Button>
                  ) : undefined
                }
                description={`${source.ingest_ceiling} observations per ${source.window_seconds}s · ${source.breach_count} recorded breaches`}
                metadata={
                  <>
                    <StatusBadge tone={source.breaker_open_until ? "danger" : "success"}>
                      {source.breaker_open_until
                        ? `Open until ${formatAdminTimestamp(source.breaker_open_until)}`
                        : "Breaker closed"}
                    </StatusBadge>
                    <StatusBadge>{humanizeAdminValue(source.authority_tier)}</StatusBadge>
                    {source.may_provision_entities ? (
                      <StatusBadge tone="warning">May provision entities</StatusBadge>
                    ) : null}
                  </>
                }
                title={<span className="font-mono">{shortAdminIdentifier(source.source_id)}</span>}
              />
            ))}
          </ul>
        )}
      </SectionSurface>

      <SectionSurface
        description="The latest deployment-wide confidence fit for each provider, model, and strategy triple."
        flush
        title="Calibration mappings"
      >
        {query.data.calibration.length === 0 ? (
          <EmptyState
            description="The service has not published a fitted calibration mapping."
            title="No calibration mappings"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.calibration.map((mapping) => {
              const mappingKey = `${mapping.provider_id}:${mapping.model_id}:${mapping.strategy_id}`;
              return (
                <SettingsRow
                  key={mappingKey}
                  action={
                    <Button
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ action: "refit", mapping })}
                      size="compact"
                      variant="secondary"
                    >
                      <RefreshCw aria-hidden="true" className="size-4" />
                      Refit now
                    </Button>
                  }
                  description={`${mapping.n_adjudicated} adjudications · Measured error ${mapping.measured_error.toFixed(4)} · Fitted ${formatAdminTimestamp(mapping.fitted_at)}`}
                  metadata={
                    <>
                      <StatusBadge tone={adminStatusTone(mapping.status)}>
                        {humanizeAdminValue(mapping.status)}
                      </StatusBadge>
                      <StatusBadge>Version {mapping.version}</StatusBadge>
                    </>
                  }
                  title={`${mapping.provider_id} / ${mapping.model_id} / ${mapping.strategy_id}`}
                />
              );
            })}
          </ul>
        )}
      </SectionSurface>
    </div>
  );
}

function PrivacyTab({ apiTenantId, client }: AdminTabProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const key = tenantQueryKey(apiTenantId);
  const queryClient = useQueryClient();
  const actorIdField = useId();
  const confirmationField = useId();
  const [actorId, setActorId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [durableReceipt, setDurableReceipt] = useState<MutationReceipt | null>(null);
  const showMutationToast = useMutationToast();
  const query = useQuery({
    queryKey: ["settings", key, "privacy"],
    queryFn: async ({ signal }) => {
      const [patterns, fieldPolicies] = await Promise.all([
        listPiiPatterns(client, context, signal),
        listPiiFieldPolicies(client, context, signal),
      ]);
      return { fieldPolicies, patterns };
    },
  });
  const mutation = useMutation({
    mutationFn: async (
      input:
        | { action: "purge"; actorId: string }
        | { action: "toggle"; enabled: boolean; patternId: string; patternName: string },
    ) => {
      if (input.action === "toggle") {
        await setPiiPatternEnabled(client, input.patternId, input.enabled, context);
        return {
          body: `${input.patternName} is now ${input.enabled ? "enabled" : "disabled"}.`,
          title: "Detection pattern updated",
        };
      }
      const result = await purgeActorPersonalData(client, input.actorId, context);
      const subsystemCount = Object.keys(result.subsystems).length;
      return {
        body: `Purged ${result.purged_workspaces} workspaces and ${result.purged_entries} entries. ${subsystemCount} subsystems reported erasure counts.`,
        title: "Personal-data purge completed",
      };
    },
    onSuccess: async (nextReceipt, variables) => {
      showMutationToast(nextReceipt);
      if (variables.action === "purge") {
        setDurableReceipt(nextReceipt);
        setActorId("");
        setConfirmation("");
      } else setDurableReceipt(null);
      await queryClient.invalidateQueries({ queryKey: ["settings", key, "privacy"] });
    },
  });

  function submitPurge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = actorId.trim();
    if (target && confirmation.trim() === target)
      mutation.mutate({ action: "purge", actorId: target });
  }

  if (query.isPending) return <TabLoading />;
  if (query.isError)
    return <QueryFailure error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <div className="space-y-6">
      <MutationFailure error={mutation.error ?? null} />
      {durableReceipt ? (
        <Notice role="status" title="Personal-data purge receipt" variant="success">
          {durableReceipt.body}
        </Notice>
      ) : null}
      <SectionSurface
        description="System patterns are visible but immutable. Tenant-owned patterns may be enabled or disabled without changing their regular expression."
        flush
        title="Personal-data detection patterns"
      >
        {query.data.patterns.length === 0 ? (
          <EmptyState
            description="No personal-data patterns were returned by the service."
            title="No detection patterns"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.patterns.map((pattern) => (
              <SettingsRow
                key={pattern.pattern_id}
                action={
                  pattern.is_system ? undefined : (
                    <Switch
                      checked={pattern.is_enabled}
                      checkedLabel="Enabled"
                      disabled={mutation.isPending}
                      label={`${pattern.name} detection pattern`}
                      onCheckedChange={(enabled) =>
                        mutation.mutate({
                          action: "toggle",
                          enabled,
                          patternId: pattern.pattern_id,
                          patternName: pattern.name,
                        })
                      }
                      uncheckedLabel="Disabled"
                    />
                  )
                }
                description={`${pattern.category} · ${pattern.policy_override ?? "Default policy"}`}
                metadata={
                  <>
                    {pattern.is_system ? (
                      <StatusBadge tone={pattern.is_enabled ? "success" : "neutral"}>
                        {pattern.is_enabled ? "Enabled" : "Disabled"}
                      </StatusBadge>
                    ) : null}
                    <StatusBadge>
                      {pattern.is_system ? "System pattern" : "Tenant pattern"}
                    </StatusBadge>
                  </>
                }
                title={pattern.name}
              />
            ))}
          </ul>
        )}
      </SectionSurface>

      <SectionSurface
        description="Field-level overrides may apply to one detector pattern or to every pattern for that field type."
        flush
        title="Field policies"
      >
        {query.data.fieldPolicies.length === 0 ? (
          <EmptyState
            description="The tenant relies on service defaults for every field type."
            title="No field policy overrides"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {query.data.fieldPolicies.map((policy) => (
              <SettingsRow
                key={policy.policy_id}
                description={
                  policy.pattern_id
                    ? `Pattern ${shortAdminIdentifier(policy.pattern_id)}`
                    : "Applies to every pattern for this field type"
                }
                metadata={
                  <StatusBadge tone="info">{humanizeAdminValue(policy.policy)}</StatusBadge>
                }
                title={humanizeAdminValue(policy.field_type)}
              />
            ))}
          </ul>
        )}
      </SectionSurface>

      <SectionSurface
        description="Irreversibly purge workspace personal data for an actor. The service returns subsystem-specific counts as the durable erasure receipt."
        title="Actor personal-data erasure"
      >
        <Notice title="This action cannot be undone" variant="warning">
          Confirm the exact actor identifier. The operation may remove data from several subsystems
          and does not provide a client-side undo.
        </Notice>
        <form className="mt-5 space-y-4" onSubmit={submitPurge}>
          <label className={labelClassName} htmlFor={actorIdField}>
            Actor ID
            <input
              id={actorIdField}
              autoComplete="off"
              className={inputClassName}
              onChange={(event) => setActorId(event.currentTarget.value)}
              placeholder="Actor UUID"
              required
              value={actorId}
            />
          </label>
          <label className={labelClassName} htmlFor={confirmationField}>
            Confirm actor ID
            <input
              id={confirmationField}
              autoComplete="off"
              className={inputClassName}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              placeholder="Repeat the actor UUID"
              required
              value={confirmation}
            />
          </label>
          <Button
            disabled={
              !actorId.trim() || confirmation.trim() !== actorId.trim() || mutation.isPending
            }
            type="submit"
            variant="danger"
          >
            Purge actor personal data
          </Button>
        </form>
      </SectionSurface>
    </div>
  );
}

function LifecycleTab({ apiTenantId, client, identity }: AdminTabProps) {
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const key = tenantQueryKey(apiTenantId);
  const queryClient = useQueryClient();
  const entityField = useId();
  const fromField = useId();
  const toField = useId();
  const gateField = useId();
  const reasonField = useId();
  const [entityInput, setEntityInput] = useState("");
  const [activeEntityId, setActiveEntityId] = useState("");
  const [fromState, setFromState] = useState("");
  const [toState, setToState] = useState("");
  const [gateId, setGateId] = useState("");
  const [reason, setReason] = useState("");
  const [bypassSkipRules, setBypassSkipRules] = useState(false);
  const [durableReceipt, setDurableReceipt] = useState<MutationReceipt | null>(null);
  const showMutationToast = useMutationToast();
  const definitions = useQuery({
    queryKey: ["settings", key, "lifecycle", "definitions", identity.tenant_id],
    queryFn: ({ signal }) =>
      listProgressionDefinitions(client, identity.tenant_id, context, signal),
  });
  const overrides = useQuery({
    enabled: Boolean(activeEntityId),
    queryKey: ["settings", key, "lifecycle", "overrides", identity.tenant_id, activeEntityId],
    queryFn: ({ signal }) =>
      listProgressionOverrides(client, identity.tenant_id, activeEntityId, {}, context, signal),
  });
  const mutation = useMutation({
    mutationFn: async (input: { entityId: string; override: ProgressionOverrideInput }) =>
      createProgressionOverride(
        client,
        identity.tenant_id,
        input.entityId,
        input.override,
        context,
      ),
    onSuccess: async (override) => {
      const nextReceipt = {
        body: `Override ${shortAdminIdentifier(override.override_id)} was audit-logged as ${shortAdminIdentifier(override.audit_event_id)} before activation.`,
        title: "Progression override recorded",
      };
      setDurableReceipt(nextReceipt);
      showMutationToast(nextReceipt);
      setFromState("");
      setToState("");
      setGateId("");
      setReason("");
      setBypassSkipRules(false);
      await queryClient.invalidateQueries({
        queryKey: ["settings", key, "lifecycle", "overrides", identity.tenant_id, activeEntityId],
      });
    },
  });

  function loadOverrides(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveEntityId(entityInput.trim());
  }

  function createOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeEntityId || !fromState.trim() || !toState.trim() || !gateId.trim() || !reason.trim())
      return;
    mutation.mutate({
      entityId: activeEntityId,
      override: {
        bypass_skip_rules: bypassSkipRules,
        from_state: fromState.trim(),
        gate_id: gateId.trim(),
        reason: reason.trim(),
        to_state: toState.trim(),
      },
    });
  }

  if (definitions.isPending) return <TabLoading />;
  if (definitions.isError) {
    return <QueryFailure error={definitions.error} onRetry={() => void definitions.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <MutationFailure error={mutation.error ?? null} />
      {durableReceipt ? (
        <Notice role="status" title="Progression override receipt" variant="success">
          {durableReceipt.body}
        </Notice>
      ) : null}
      <SectionSurface
        description="Current and historical state-machine definitions. Definition replacement requires a dry-run impact workflow and remains outside this compact settings surface."
        flush
        title="Progression definitions"
      >
        {definitions.data.length === 0 ? (
          <EmptyState
            description="No progression definition is configured for this tenant."
            icon={GitBranch}
            title="No progression definitions"
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {definitions.data.map((definition) => (
              <SettingsRow
                key={definition.progression_id}
                description={`Valid from ${formatAdminTimestamp(definition.t_valid_from)} · ${Object.keys(definition.definition).length} top-level definition fields`}
                metadata={
                  <>
                    <StatusBadge tone={definition.is_advisory ? "info" : "warning"}>
                      {definition.is_advisory ? "Advisory" : "Enforcing"}
                    </StatusBadge>
                    {definition.t_valid_to ? (
                      <StatusBadge>Historical</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Current</StatusBadge>
                    )}
                  </>
                }
                title={humanizeAdminValue(definition.entity_type)}
              />
            ))}
          </ul>
        )}
      </SectionSurface>

      <SectionSurface
        description="Inspect overrides for one entity, then record a reasoned transition override. The service writes the audit event before the override row."
        title="Entity progression overrides"
      >
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={loadOverrides}>
          <label className={`${labelClassName} min-w-0 flex-1`} htmlFor={entityField}>
            Entity ID
            <input
              id={entityField}
              className={inputClassName}
              onChange={(event) => setEntityInput(event.currentTarget.value)}
              placeholder="Entity UUID"
              value={entityInput}
            />
          </label>
          <Button disabled={!entityInput.trim()} type="submit" variant="secondary">
            Load overrides
          </Button>
        </form>

        {activeEntityId ? (
          <div className="mt-6 space-y-5 border-t border-border-subtle pt-5">
            {overrides.isPending ? (
              <div aria-label="Loading overrides" className="space-y-3" role="status">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : overrides.isError ? (
              <QueryFailure error={overrides.error} onRetry={() => void overrides.refetch()} />
            ) : overrides.data.length === 0 ? (
              <EmptyState
                description="No consumed, active, or expired override was returned for this entity."
                title="No progression overrides"
              />
            ) : (
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
                {overrides.data.map((override) => (
                  <SettingsRow
                    key={override.override_id}
                    description={`${override.from_state} → ${override.to_state} · ${override.reason}`}
                    metadata={
                      <>
                        <StatusBadge tone={override.consumed_at ? "neutral" : "warning"}>
                          {override.consumed_at ? "Consumed" : "Available"}
                        </StatusBadge>
                        <StatusBadge>Gate {override.gate_id}</StatusBadge>
                      </>
                    }
                    title={
                      <span className="font-mono">
                        {shortAdminIdentifier(override.override_id)}
                      </span>
                    }
                  />
                ))}
              </ul>
            )}

            <form className="space-y-4" onSubmit={createOverride}>
              <h3 className="text-sm font-semibold text-foreground">Record a new override</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClassName} htmlFor={fromField}>
                  From state
                  <input
                    id={fromField}
                    className={inputClassName}
                    onChange={(event) => setFromState(event.currentTarget.value)}
                    required
                    value={fromState}
                  />
                </label>
                <label className={labelClassName} htmlFor={toField}>
                  To state
                  <input
                    id={toField}
                    className={inputClassName}
                    onChange={(event) => setToState(event.currentTarget.value)}
                    required
                    value={toState}
                  />
                </label>
              </div>
              <label className={labelClassName} htmlFor={gateField}>
                Gate ID
                <input
                  id={gateField}
                  className={inputClassName}
                  onChange={(event) => setGateId(event.currentTarget.value)}
                  required
                  value={gateId}
                />
              </label>
              <label className={labelClassName} htmlFor={reasonField}>
                Audit reason
                <textarea
                  id={reasonField}
                  className={inputClassName}
                  onChange={(event) => setReason(event.currentTarget.value)}
                  required
                  rows={3}
                  value={reason}
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input
                  className={checkboxClassName}
                  checked={bypassSkipRules}
                  onChange={(event) => setBypassSkipRules(event.currentTarget.checked)}
                  type="checkbox"
                />
                Bypass progression skip rules
              </label>
              <Button disabled={mutation.isPending} type="submit">
                Record progression override
              </Button>
            </form>
          </div>
        ) : null}
      </SectionSurface>
    </div>
  );
}

function SettingsTabs({
  activeTab,
  onChange,
}: {
  activeTab: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  function moveFocus(nextIndex: number) {
    const nextTab = settingsTabs[nextIndex];
    if (!nextTab) return;
    onChange(nextTab.id);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`#settings-tab-${nextTab.id}`)?.focus();
    });
  }

  return (
    <nav aria-label="Settings sections" className="mb-6 border-b border-border">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" role="tablist">
        {settingsTabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            aria-controls={`settings-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={`min-h-11 border-b-2 px-3 py-3 text-left text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              activeTab === tab.id
                ? "border-accent font-semibold text-foreground"
                : "border-transparent text-muted hover:border-border-strong hover:text-foreground"
            }`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveFocus((index + 1) % settingsTabs.length);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveFocus((index - 1 + settingsTabs.length) % settingsTabs.length);
              } else if (event.key === "Home") {
                event.preventDefault();
                moveFocus(0);
              } else if (event.key === "End") {
                event.preventDefault();
                moveFocus(settingsTabs.length - 1);
              }
            }}
            role="tab"
            tabIndex={activeTab === tab.id ? 0 : -1}
            title={tab.description}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function SettingsContent({
  activeTab,
  apiTenantId,
  client,
  identity,
  onVocabularyKindChange,
  vocabularyKind,
}: AdminTabProps & {
  activeTab: SettingsTab;
  onVocabularyKindChange: (kind: GraphVocabularyKind) => void;
  vocabularyKind: GraphVocabularyKind;
}) {
  const props = { ...(apiTenantId ? { apiTenantId } : {}), client, identity };
  return (
    <div
      id={`settings-panel-${activeTab}`}
      aria-labelledby={`settings-tab-${activeTab}`}
      role="tabpanel"
      tabIndex={0}
    >
      {activeTab === "integrations" ? <IntegrationsTab {...props} /> : null}
      {activeTab === "extraction" ? <ExtractionTab {...props} /> : null}
      {activeTab === "schema" ? (
        <SchemaTab
          {...props}
          onVocabularyKindChange={onVocabularyKindChange}
          vocabularyKind={vocabularyKind}
        />
      ) : null}
      {activeTab === "memory" ? <MemoryTab {...props} /> : null}
      {activeTab === "privacy" ? <PrivacyTab {...props} /> : null}
      {activeTab === "lifecycle" ? <LifecycleTab {...props} /> : null}
    </div>
  );
}

export function SettingsPage({ activeTenantName, apiTenantId, client }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState(() => readSettingsTab(window.location.search));
  const [vocabularyKind, setVocabularyKind] = useState(() =>
    readVocabularyKind(window.location.search),
  );
  const context = useMemo(() => requestContext(apiTenantId), [apiTenantId]);
  const identity = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, context, signal),
    queryKey: ["contextplane", tenantQueryKey(apiTenantId), "identity"],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    function restoreSettingsLocation() {
      setActiveTab(readSettingsTab(window.location.search));
      setVocabularyKind(readVocabularyKind(window.location.search));
    }
    window.addEventListener("popstate", restoreSettingsLocation);
    return () => window.removeEventListener("popstate", restoreSettingsLocation);
  }, []);

  function changeTab(tab: SettingsTab) {
    window.history.pushState(
      window.history.state,
      "",
      `/settings${settingsSearch(tab, vocabularyKind)}`,
    );
    setActiveTab(tab);
  }

  function changeVocabularyKind(kind: GraphVocabularyKind) {
    window.history.pushState(
      window.history.state,
      "",
      `/settings${settingsSearch("schema", kind)}`,
    );
    setVocabularyKind(kind);
  }

  if (identity.isPending) return <PageSkeleton controls={2} />;

  if (identity.isError) {
    return (
      <PageContainer>
        <PageHeader
          breadcrumbs={[{ href: "/", label: activeTenantName }, { label: "Settings" }]}
          description={`Configure tenant-level ${BRAND.name} administration through service-authoritative controls.`}
          eyebrow="Administration"
          title="Settings"
        />
        <QueryFailure error={identity.error} onRetry={() => void identity.refetch()} />
      </PageContainer>
    );
  }

  const isAdministrator = identity.data.roles.includes("admin");

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[
          { href: "/", label: identity.data.tenant_display_name },
          { label: "Settings" },
        ]}
        description="Configure integrations, extraction, graph schema, memory governance, personal-data controls, and lifecycle rules for the active tenant."
        eyebrow="Administration"
        metadata={
          <>
            <StatusBadge tone={isAdministrator ? "success" : "warning"}>
              {isAdministrator ? "Administrator access" : "Administrator access required"}
            </StatusBadge>
            <StatusBadge>{identity.data.tenant_display_name}</StatusBadge>
          </>
        }
        title="Settings"
      />

      {isAdministrator ? (
        <>
          <SettingsTabs activeTab={activeTab} onChange={changeTab} />
          <SettingsContent
            {...(apiTenantId ? { apiTenantId } : {})}
            activeTab={activeTab}
            client={client}
            identity={identity.data}
            onVocabularyKindChange={changeVocabularyKind}
            vocabularyKind={vocabularyKind}
          />
        </>
      ) : (
        <Notice title="Administrator access is required" variant="warning">
          The resolved {BRAND.name} role does not permit tenant administration. No administrative
          endpoint was requested.
        </Notice>
      )}
    </PageContainer>
  );
}
