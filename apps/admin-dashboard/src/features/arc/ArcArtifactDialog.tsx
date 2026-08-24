import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { Button, Notice, ResourcePicker, SearchableSelect } from "@repo/ui/primitives";

import { arcArtifactKindOptions, arcOwningScopeOptions } from "./arcModel";

import type {
  ArcArtifactKind,
  ArcOwningScope,
  CreateArcArtifactFamilyInput,
} from "../../shared/api/contextplane";
import { arcArtifactKinds, arcOwningScopes } from "../../shared/api/contextplane";
import { ContextplaneApiError } from "../../shared/api/client";
import type { PickerSource } from "../../shared/pickers/sources";

interface ArcArtifactDialogProps {
  defaultTenantId: string;
  onClose: () => void;
  onCreate: (input: CreateArcArtifactFamilyInput) => Promise<void>;
  /**
   * The tenants this credential reaches. Passed in rather than built here so
   * the dialog stays free of the API client: it is a form, and a form that
   * knows how to fetch is one that has to be given a client to be tested.
   */
  tenants: PickerSource;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";

function isArcArtifactKind(value: string): value is ArcArtifactKind {
  return arcArtifactKinds.some((candidate) => candidate === value);
}

function isArcOwningScope(value: string): value is ArcOwningScope {
  return arcOwningScopes.some((candidate) => candidate === value);
}

function createErrorMessage(error: unknown): string {
  if (error instanceof ContextplaneApiError) {
    if (error.status === 403) return "Only an authorized administrator may create this policy.";
    if (error.status === 409) return "That policy already exists in this scope.";
    if (error.status === 422) return "The service rejected one or more artifact fields.";
    return error.message;
  }
  return "The policy could not be created.";
}

export function ArcArtifactDialog({
  defaultTenantId,
  onClose,
  onCreate,
  tenants,
}: ArcArtifactDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const slugId = useId();
  const tenantId = useId();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<ArcArtifactKind>("policy");
  const [scope, setScope] = useState<ArcOwningScope>("tenant");
  const [targetTenantId, setTargetTenantId] = useState(defaultTenantId);
  const [titleError, setTitleError] = useState("");
  const [slugError, setSlugError] = useState("");
  const [tenantError, setTenantError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    titleRef.current?.focus();
  }, []);

  function closeDialog() {
    if (!pending) dialogRef.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextSlug = slug.trim();
    const nextTargetTenantId = targetTenantId.trim();
    const nextTitleError = nextTitle ? "" : "Enter an artifact title.";
    const nextSlugError = nextSlug ? "" : "Enter a stable artifact slug.";
    const nextTenantError = scope === "tenant" && !nextTargetTenantId ? "Enter a tenant ID." : "";

    setTitleError(nextTitleError);
    setSlugError(nextSlugError);
    setTenantError(nextTenantError);
    setRequestError("");
    if (nextTitleError || nextSlugError || nextTenantError) return;

    setPending(true);
    try {
      await onCreate({
        idempotencyKey: crypto.randomUUID(),
        kind,
        owningScope: scope,
        slug: nextSlug,
        targetTenantId: scope === "tenant" ? nextTargetTenantId : null,
        title: nextTitle,
      });
      dialogRef.current?.close();
    } catch (error) {
      setRequestError(createErrorMessage(error));
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${titleId}-dialog-title`}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[min(42rem,calc(100dvw-1.5rem))] max-w-none overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-overlay"
      onCancel={(event) => {
        event.preventDefault();
        closeDialog();
      }}
      onClose={onClose}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.04em] text-muted uppercase">
            Policy authoring
          </p>
          <h2 className="mt-1 text-lg font-semibold" id={`${titleId}-dialog-title`}>
            Create policy
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Create the stable policy record whose content will evolve through governed revisions.
          </p>
        </div>
        <Button
          aria-label="Close policy creation"
          disabled={pending}
          onClick={closeDialog}
          size="icon"
          title="Close policy creation"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>

      <form className="max-h-[calc(100dvh-9rem)] overflow-y-auto" onSubmit={submit}>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <Notice title="Creating a policy does not activate it">
            This creates the stable policy record. Approved source evidence, a draft revision,
            validation, review, and activation remain separate steps.
          </Notice>

          {requestError ? (
            <Notice role="alert" title="Policy was not created" variant="danger">
              {requestError}
            </Notice>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <label className={`${labelClassName} sm:col-span-2`} htmlFor={titleId}>
              Title
              <input
                ref={titleRef}
                aria-describedby={titleError ? `${titleId}-error` : undefined}
                aria-invalid={titleError ? "true" : undefined}
                className={inputClassName}
                id={titleId}
                maxLength={200}
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                  if (titleError) setTitleError("");
                }}
                placeholder="Production deployment safeguards"
                value={title}
              />
              {titleError ? (
                <span
                  className="mt-1.5 block text-xs text-danger"
                  id={`${titleId}-error`}
                  role="alert"
                >
                  {titleError}
                </span>
              ) : null}
            </label>

            <label className={labelClassName} htmlFor={slugId}>
              Stable slug
              <input
                aria-describedby={slugError ? `${slugId}-error` : `${slugId}-help`}
                aria-invalid={slugError ? "true" : undefined}
                className={inputClassName}
                id={slugId}
                onChange={(event) => {
                  setSlug(event.currentTarget.value);
                  if (slugError) setSlugError("");
                }}
                placeholder="production-deployment-safeguards"
                value={slug}
              />
              <span className="mt-1.5 block text-xs text-subtle" id={`${slugId}-help`}>
                Use a durable identifier; every revision remains attached to this policy.
              </span>
              {slugError ? (
                <span
                  className="mt-1.5 block text-xs text-danger"
                  id={`${slugId}-error`}
                  role="alert"
                >
                  {slugError}
                </span>
              ) : null}
            </label>

            <SearchableSelect
              allowEmpty={false}
              label="Artifact kind"
              onValueChange={(value) => {
                if (isArcArtifactKind(value)) setKind(value);
              }}
              options={arcArtifactKindOptions}
              value={kind}
            />

            <SearchableSelect
              allowEmpty={false}
              label="Owning scope"
              onValueChange={(nextScope) => {
                if (!isArcOwningScope(nextScope)) return;
                setScope(nextScope);
                if (nextScope === "tenant" && !targetTenantId) setTargetTenantId(defaultTenantId);
                if (tenantError) setTenantError("");
              }}
              options={arcOwningScopeOptions}
              value={scope}
            />

            {scope === "tenant" ? (
              <div>
                {/* A tenant-scoped policy typed into the wrong tenant is
                    governance that silently applies to somebody else. The list
                    is the credential's own memberships, so a tenant this caller
                    cannot reach is not offered rather than accepted and
                    refused. */}
                <ResourcePicker
                  emptyMessage="This credential reaches no other tenant."
                  label="Target tenant"
                  load={tenants}
                  onValueChange={(next) => {
                    setTargetTenantId(next);
                    if (tenantError) setTenantError("");
                  }}
                  searchPlaceholder="Search tenants by name"
                  value={targetTenantId}
                />
                {tenantError ? (
                  <span
                    className="mt-1.5 block text-xs text-danger"
                    id={`${tenantId}-error`}
                    role="alert"
                  >
                    {tenantError}
                  </span>
                ) : null}
              </div>
            ) : (
              <Notice
                className="sm:col-span-2"
                title="Global scope requires operator authority"
                variant="warning"
              >
                The service authorizes global policy creation through its operator allowlist.
              </Notice>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-muted px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button disabled={pending} onClick={closeDialog} variant="secondary">
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            {pending ? "Creating…" : "Create policy"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
