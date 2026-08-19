import { FilePlus2, SearchCheck, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { EmptyState } from "@repo/ui/layouts";
import { Button, Notice, RequestFailure, StatusBadge, useToast } from "@repo/ui/primitives";

import {
  ContextplaneApiError,
  createCapabilityArtifact,
  deleteCapabilityArtifact,
  getCapabilityInterface,
  listCapabilityArtifacts,
  previewCapabilityVersion,
  putCapabilityInterface,
  type CatalogCapabilityDetail,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { catalogInputClassName, catalogLabelClassName } from "./CapabilityDialog";

interface CapabilityEvidencePanelProps {
  capability: CatalogCapabilityDetail;
  client: ContextplaneClient;
  mode: "evidence" | "impact" | "interface";
  requestContext: ContextplaneRequestOptions;
}

function ArtifactsPanel({
  capability,
  client,
  requestContext,
}: Omit<CapabilityEvidencePanelProps, "mode">) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("overview");
  const [bodyFormat, setBodyFormat] = useState("markdown");
  const [body, setBody] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const artifacts = useQuery({
    queryFn: ({ signal }) =>
      listCapabilityArtifacts(client, capability.entityId, requestContext, signal),
    queryKey: ["contextplane", "catalog", capability.entityId, "artifacts"],
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createCapabilityArtifact(
        client,
        capability.entityId,
        { body, body_format: bodyFormat, category: category.trim(), title: title.trim() },
        requestContext,
      ),
    onSuccess: () => {
      setTitle("");
      setBody("");
      void queryClient.invalidateQueries({
        queryKey: ["contextplane", "catalog", capability.entityId, "artifacts"],
      });
      showToast({
        message: "The artifact is now attached to the canonical capability.",
        title: "Artifact created",
        variant: "success",
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (factId: string) =>
      deleteCapabilityArtifact(client, capability.entityId, factId, requestContext),
    onSuccess: () => {
      setDeleteTarget(null);
      void queryClient.invalidateQueries({
        queryKey: ["contextplane", "catalog", capability.entityId, "artifacts"],
      });
      showToast({
        message: "The artifact was removed from active capability evidence.",
        title: "Artifact deleted",
        variant: "success",
      });
    },
  });

  return (
    <div className="space-y-6 p-6">
      <section>
        <h3 className="text-base font-semibold text-foreground">Capability artifacts</h3>
        <p className="mt-1 text-sm text-muted">
          Documentation, decisions, runbooks, and release notes attached to this canonical record.
        </p>
        {artifacts.isPending ? (
          <div className="mt-4 h-32 animate-pulse rounded-lg bg-surface-muted" role="status" />
        ) : artifacts.isError ? (
          <div className="mt-4">
            <RequestFailure onRetry={() => void artifacts.refetch()} title="Artifacts unavailable">
              Existing capability evidence could not be loaded.
            </RequestFailure>
          </div>
        ) : artifacts.data.items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              description="Create the first artifact below to add inspectable context."
              title="No artifacts yet"
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border-subtle rounded-lg border border-border">
            {artifacts.data.items.map((artifact) => (
              <li key={artifact.factId} className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium text-foreground">
                        {artifact.title ?? "Untitled artifact"}
                      </h4>
                      {artifact.category ? <StatusBadge>{artifact.category}</StatusBadge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {artifact.bodyFormat ?? "Unknown format"}
                      {artifact.createdBy ? ` · ${artifact.createdBy}` : ""}
                      {artifact.createdAt ? ` · ${artifact.createdAt}` : ""}
                    </p>
                    {artifact.body ? (
                      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 font-sans text-sm leading-6 text-foreground">
                        {artifact.body}
                      </pre>
                    ) : null}
                  </div>
                  {deleteTarget === artifact.factId ? (
                    <div className="shrink-0 rounded-md border border-danger/40 bg-danger-subtle p-3">
                      <p className="text-xs font-medium text-foreground">Delete this artifact?</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(artifact.factId)}
                          size="compact"
                          variant="danger"
                        >
                          Confirm delete
                        </Button>
                        <Button
                          onClick={() => setDeleteTarget(null)}
                          size="compact"
                          variant="secondary"
                        >
                          Keep
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      aria-label={`Delete ${artifact.title ?? "artifact"}`}
                      onClick={() => setDeleteTarget(artifact.factId)}
                      size="icon"
                      title="Delete artifact"
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
      </section>

      <form
        className="rounded-lg border border-border p-5"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
      >
        <h3 className="text-base font-semibold text-foreground">Create artifact</h3>
        <p className="mt-1 text-sm text-muted">
          Attach decision-bearing context directly to this capability.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label className={catalogLabelClassName}>
            Title
            <input
              required
              className={catalogInputClassName}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label className={catalogLabelClassName}>
            Category
            <input
              required
              className={catalogInputClassName}
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            />
          </label>
          <label className={catalogLabelClassName}>
            Body format
            <select
              className={catalogInputClassName}
              onChange={(event) => setBodyFormat(event.target.value)}
              value={bodyFormat}
            >
              <option value="markdown">Markdown</option>
              <option value="plain">Plain text</option>
              <option value="html">HTML</option>
            </select>
          </label>
        </div>
        <label className={`${catalogLabelClassName} mt-5`}>
          Body
          <textarea
            required
            className={`${catalogInputClassName} min-h-40 resize-y leading-6`}
            onChange={(event) => setBody(event.target.value)}
            value={body}
          />
        </label>
        {createMutation.isError ? (
          <div className="mt-4">
            <Notice title="Artifact was not created" variant="danger">
              The service rejected the artifact. The entered content remains available.
            </Notice>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button disabled={createMutation.isPending} type="submit">
            <FilePlus2 aria-hidden="true" className="size-4" />
            {createMutation.isPending ? "Creating…" : "Create artifact"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function InterfacePanel({
  capability,
  client,
  requestContext,
}: Omit<CapabilityEvidencePanelProps, "mode">) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const interfaceQuery = useQuery({
    queryFn: ({ signal }) =>
      getCapabilityInterface(client, capability.entityId, requestContext, signal),
    queryKey: ["contextplane", "catalog", capability.entityId, "interface"],
    retry: false,
  });
  const [formatDraft, setFormatDraft] = useState<string | null>(null);
  const [sourceTextDraft, setSourceTextDraft] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const format = formatDraft ?? interfaceQuery.data?.format ?? "json_schema";
  const sourceText = sourceTextDraft ?? JSON.stringify(interfaceQuery.data?.source ?? {}, null, 2);

  const mutation = useMutation({
    mutationFn: (source: unknown) =>
      putCapabilityInterface(
        client,
        capability.entityId,
        { interface_format: format, interface_source: source },
        requestContext,
      ),
    onSuccess: () => {
      setConfirmation("");
      setFormatDraft(null);
      setSourceTextDraft(null);
      void queryClient.invalidateQueries({
        queryKey: ["contextplane", "catalog", capability.entityId, "interface"],
      });
      showToast({
        message: "The declared interface was replaced and normalized by the service.",
        title: "Interface published",
        variant: "success",
      });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const source: unknown = JSON.parse(sourceText);
      setSourceError(null);
      mutation.mutate(source);
    } catch {
      setSourceError("Enter valid JSON interface source.");
    }
  }

  const missing =
    interfaceQuery.error instanceof ContextplaneApiError && interfaceQuery.error.status === 404;

  return (
    <div className="space-y-6 p-6">
      <section>
        <h3 className="text-base font-semibold text-foreground">Declared interface</h3>
        <p className="mt-1 text-sm text-muted">
          The service normalizes this source before using it for compatibility and impact analysis.
        </p>
        {interfaceQuery.isPending ? (
          <div className="mt-4 h-32 animate-pulse rounded-lg bg-surface-muted" role="status" />
        ) : interfaceQuery.isError && !missing ? (
          <div className="mt-4">
            <RequestFailure
              onRetry={() => void interfaceQuery.refetch()}
              title="Interface unavailable"
            >
              The current declared interface could not be loaded.
            </RequestFailure>
          </div>
        ) : missing ? (
          <div className="mt-4">
            <EmptyState
              description="Publish an interface below before running version impact analysis."
              title="No interface published"
            />
          </div>
        ) : interfaceQuery.data ? (
          <dl className="mt-4 grid gap-4 rounded-lg border border-border bg-surface-muted p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-muted">Format</dt>
              <dd className="mt-1 text-sm text-foreground">
                {interfaceQuery.data.format ?? "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted">Ingested</dt>
              <dd className="mt-1 text-sm text-foreground">
                {interfaceQuery.data.ingestedAt ?? "Not reported"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted">Canonical surface</dt>
              <dd>
                <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-surface p-4 text-xs leading-5 text-foreground">
                  {JSON.stringify(interfaceQuery.data.surface, null, 2)}
                </pre>
              </dd>
            </div>
          </dl>
        ) : null}
      </section>

      <form className="rounded-lg border border-border p-5" onSubmit={submit}>
        <h3 className="text-base font-semibold text-foreground">
          {missing ? "Publish interface" : "Replace interface"}
        </h3>
        <p className="mt-1 text-sm text-muted">
          Replacing an interface can affect consumers. Run the Version impact workflow before
          publishing a consequential change.
        </p>
        <label className={`${catalogLabelClassName} mt-4`}>
          Interface format
          <select
            className={catalogInputClassName}
            onChange={(event) => setFormatDraft(event.target.value)}
            value={format}
          >
            <option value="json_schema">JSON Schema</option>
            <option value="openapi">OpenAPI</option>
            <option value="typescript">TypeScript</option>
          </select>
        </label>
        <label className={`${catalogLabelClassName} mt-4`}>
          Interface source
          <textarea
            aria-invalid={sourceError ? true : undefined}
            className={`${catalogInputClassName} min-h-64 resize-y font-mono leading-6`}
            onChange={(event) => setSourceTextDraft(event.target.value)}
            spellCheck={false}
            value={sourceText}
          />
        </label>
        {sourceError ? <p className="mt-2 text-sm text-danger">{sourceError}</p> : null}
        <label className={`${catalogLabelClassName} mt-4`}>
          Type PUBLISH to confirm replacement
          <input
            className={catalogInputClassName}
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
        </label>
        {mutation.isError ? (
          <div className="mt-4">
            <Notice title="Interface was not published" variant="danger">
              The service rejected the source. The draft remains available for correction.
            </Notice>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button disabled={mutation.isPending || confirmation !== "PUBLISH"} type="submit">
            {mutation.isPending
              ? "Publishing…"
              : missing
                ? "Publish interface"
                : "Replace interface"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ImpactPanel({
  capability,
  client,
  requestContext,
}: Omit<CapabilityEvidencePanelProps, "mode">) {
  const [version, setVersion] = useState("");
  const [format, setFormat] = useState("json_schema");
  const [interfaceText, setInterfaceText] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (proposedInterface: unknown) =>
      previewCapabilityVersion(
        client,
        capability.entityId,
        {
          interface_format: format,
          proposed_interface: proposedInterface,
          proposed_version: version.trim(),
        },
        requestContext,
      ),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const proposedInterface: unknown = JSON.parse(interfaceText);
      setError(null);
      mutation.mutate(proposedInterface);
    } catch {
      setError("Enter valid JSON for the proposed interface.");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Notice title="Preview before publishing" variant="info">
        This read-only analysis compares the proposed interface with the current declared surface
        and identifies affected consumers. It does not publish a version or change catalog state.
      </Notice>
      <form className="rounded-lg border border-border p-5" onSubmit={submit}>
        <h3 className="text-base font-semibold text-foreground">Proposed version</h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label className={catalogLabelClassName}>
            Proposed version
            <input
              required
              className={catalogInputClassName}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="2.0.0"
              value={version}
            />
          </label>
          <label className={catalogLabelClassName}>
            Interface format
            <select
              className={catalogInputClassName}
              onChange={(event) => setFormat(event.target.value)}
              value={format}
            >
              <option value="json_schema">JSON Schema</option>
              <option value="openapi">OpenAPI</option>
              <option value="typescript">TypeScript</option>
            </select>
          </label>
        </div>
        <label className={`${catalogLabelClassName} mt-5`}>
          Proposed interface
          <textarea
            aria-invalid={error ? true : undefined}
            className={`${catalogInputClassName} min-h-64 resize-y font-mono leading-6`}
            onChange={(event) => setInterfaceText(event.target.value)}
            spellCheck={false}
            value={interfaceText}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-4 flex justify-end">
          <Button disabled={mutation.isPending} type="submit">
            <SearchCheck aria-hidden="true" className="size-4" />
            {mutation.isPending ? "Analyzing…" : "Preview version impact"}
          </Button>
        </div>
      </form>

      {mutation.isError ? (
        <RequestFailure
          onRetry={() => {
            setError(null);
          }}
          title="Impact preview unavailable"
        >
          The service could not compare the proposed interface. The proposal remains available.
        </RequestFailure>
      ) : null}
      {mutation.data ? (
        <section aria-live="polite" className="space-y-5 rounded-lg border border-border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">Impact result</h3>
              <p className="mt-1 text-sm text-muted">
                Proposed version {mutation.data.proposedVersion}
              </p>
            </div>
            <StatusBadge tone={mutation.data.classification === "breaking" ? "danger" : "success"}>
              {mutation.data.classification}
            </StatusBadge>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              Affected consumers ({mutation.data.affectedConsumers.length})
            </h4>
            {mutation.data.affectedConsumers.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No affected consumer was reported.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border-subtle rounded-md border border-border">
                {mutation.data.affectedConsumers.map((consumer) => (
                  <li key={`${consumer.tenantId}:${consumer.entityId}`} className="p-3 text-sm">
                    <span className="font-medium text-foreground">
                      {consumer.name ?? consumer.entityId}
                    </span>
                    <span className="mt-1 block font-mono text-xs text-muted">
                      Tenant {consumer.tenantId}
                      {consumer.versionPin ? ` · pinned ${consumer.versionPin}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Inspect {mutation.data.changes.length} detected changes
            </summary>
            <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-surface-muted p-4 text-xs leading-5 text-foreground">
              {JSON.stringify(mutation.data.changes, null, 2)}
            </pre>
          </details>
          <div>
            <h4 className="text-sm font-semibold text-foreground">Release notes scaffold</h4>
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface-muted p-4 font-sans text-sm leading-6 text-foreground">
              {mutation.data.releaseNotes}
            </pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function CapabilityEvidencePanel(props: CapabilityEvidencePanelProps) {
  if (props.mode === "evidence") return <ArtifactsPanel {...props} />;
  if (props.mode === "interface") return <InterfacePanel {...props} />;
  return <ImpactPanel {...props} />;
}
