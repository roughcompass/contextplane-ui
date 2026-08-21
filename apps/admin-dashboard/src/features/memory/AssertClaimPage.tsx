import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";

import { PageContainer, PageHeader, PageSkeleton, SectionSurface } from "@repo/ui/layouts";
import {
  Button,
  DetailsLink,
  Notice,
  RequestFailure,
  SearchableSelect,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  assertMemoryClaim,
  ContextplaneApiError,
  getWhoAmI,
  listClaimPredicates,
  type ClaimAssertionReceipt,
  type ClaimEvidenceKind,
  type ClaimVisibility,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
  type WhoAmI,
} from "../../shared/api";
import {
  buildAssertClaimInput,
  claimAssertionBodyDigest,
  claimAssertionFieldError,
  claimAssertionOutcome,
  claimEvidenceKindOptions,
  claimPredicateOptions,
  claimValueFormatOptions,
  claimVisibilityOptions,
  createClaimAssertionDefaults,
  createClaimEvidenceFormValue,
  findClaimPredicate,
  interpretClaimValue,
  valueFormatForPredicate,
  type ClaimAssertionFormValues,
  type ClaimValueFormat,
} from "./claimAssertionModel";
import { humanizeMemoryValue, shortMemoryIdentifier } from "./memoryModel";

interface AssertClaimPageProps {
  activeTenantName: string;
  apiTenantId?: string;
  client: ContextplaneClient;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";
const helpClassName = "mt-1.5 block text-xs leading-5 text-subtle";
const errorClassName = "mt-1.5 block text-xs text-danger";

function requestContext(apiTenantId: string | undefined): ContextplaneRequestOptions {
  return apiTenantId ? { tenantId: apiTenantId } : {};
}

function tenantQueryKey(apiTenantId: string | undefined): string {
  return apiTenantId ?? "credential-default";
}

function FieldErrorMessage({ id, message }: { id: string; message?: string | undefined }) {
  return message ? (
    <span className={errorClassName} id={id} role="alert">
      {message}
    </span>
  ) : null;
}

function assertionFailureBody(error: unknown): string {
  if (error instanceof ContextplaneApiError) {
    if (error.code === "unauthenticated") {
      return "The session is no longer authenticated. Reconnect through the deployment gateway and submit again; nothing was written.";
    }
    if (error.status === 403) {
      return "The resolved identity cannot assert claims in this tenant. The entered evidence remains available for a permitted actor.";
    }
    if (error.status === 429) {
      return "The service is rate limiting assertions right now. Submitting again reuses the same idempotency key, so a retry cannot create a second claim.";
    }
  }
  return "The service rejected this assertion. The entered evidence remains available for correction.";
}

function AssertClaimReceiptPanel({ receipt }: { receipt: ClaimAssertionReceipt }) {
  const outcome = claimAssertionOutcome(receipt);
  return (
    <Notice title={outcome.title} variant={outcome.variant}>
      <p>{outcome.body}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium">Claim</dt>
          <dd className="font-mono">{shortMemoryIdentifier(receipt.claim_id)}</dd>
        </div>
        <div>
          <dt className="font-medium">Status</dt>
          <dd>{humanizeMemoryValue(receipt.status)}</dd>
        </div>
        <div>
          <dt className="font-medium">Authority</dt>
          <dd>{humanizeMemoryValue(receipt.source_authority)}</dd>
        </div>
        <div>
          <dt className="font-medium">Visibility</dt>
          <dd>{humanizeMemoryValue(receipt.visibility)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-4">
        <DetailsLink href={`/memory/claims/${encodeURIComponent(receipt.claim_id)}`}>
          Inspect the stored claim
        </DetailsLink>
        {outcome.linked ? null : (
          <DetailsLink href="/memory?tab=curation">Open the curation queue</DetailsLink>
        )}
      </div>
    </Notice>
  );
}

export function AssertClaimPage({ activeTenantName, apiTenantId, client }: AssertClaimPageProps) {
  const context = requestContext(apiTenantId);
  const tenantKey = tenantQueryKey(apiTenantId);
  const { showToast } = useToast();
  const submissionKey = useRef<{ digest: string; key: string } | null>(null);

  const identity = useQuery({
    queryFn: ({ signal }) => getWhoAmI(client, context, signal),
    queryKey: ["contextplane", tenantKey, "identity"],
    staleTime: 5 * 60 * 1000,
  });
  const predicates = useQuery({
    queryFn: ({ signal }) => listClaimPredicates(client, context, signal),
    queryKey: ["contextplane", tenantKey, "claim-predicates"],
    staleTime: 5 * 60 * 1000,
  });

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    setValue,
  } = useForm<ClaimAssertionFormValues>({ defaultValues: createClaimAssertionDefaults() });
  const evidence = useFieldArray({ control, name: "evidence" });
  const valueFormat = useWatch({ control, name: "valueFormat" });
  const selectedPredicate = useWatch({ control, name: "predicate" });

  const assertion = useMutation({
    mutationFn: ({ value, values }: { value: unknown; values: ClaimAssertionFormValues }) => {
      const candidate = buildAssertClaimInput(values, value, "");
      const digest = claimAssertionBodyDigest(candidate);
      // Reuse the key only for a retry of an unchanged body, so one user-initiated
      // create stays one claim while an edited resubmission is a new one.
      const key =
        submissionKey.current?.digest === digest ? submissionKey.current.key : crypto.randomUUID();
      submissionKey.current = { digest, key };

      return assertMemoryClaim(client, { ...candidate, idempotencyKey: key }, context);
    },
    onError: (error) => {
      if (error instanceof ContextplaneApiError) {
        for (const item of error.errors) {
          const field = claimAssertionFieldError(item.path, item.message);
          if (field) {
            setError(field.name as keyof ClaimAssertionFormValues, { message: field.message });
          }
        }
      }
      setError("root.server", { message: assertionFailureBody(error) });
    },
    onSuccess: (receipt) => {
      const outcome = claimAssertionOutcome(receipt);
      showToast({
        message: outcome.body,
        title: outcome.title,
        variant: outcome.linked && !receipt.is_contested ? "success" : "warning",
      });
    },
  });

  function submit(values: ClaimAssertionFormValues) {
    const interpreted = interpretClaimValue(values.valueText, values.valueFormat);
    if (!interpreted.ok) {
      setError("valueText", { message: interpreted.message });
      return;
    }
    return assertion.mutateAsync({ value: interpreted.value, values }).catch(() => undefined);
  }

  function choosePredicate(value: string) {
    setValue("predicate", value, { shouldValidate: true });
    const match = findClaimPredicate(predicates.data ?? [], value);
    setValue("valueFormat", valueFormatForPredicate(match));
  }

  if (identity.isPending) return <PageSkeleton controls={2} rows={6} />;

  const tenantLabel = identity.isSuccess
    ? (identity.data as WhoAmI).tenant_display_name
    : activeTenantName;
  const predicateDetail = findClaimPredicate(predicates.data ?? [], selectedPredicate);

  return (
    <PageContainer width="settings">
      <PageHeader
        breadcrumbs={[
          { href: "/", label: tenantLabel },
          { href: "/memory", label: "Living Memory" },
          { label: "Record claim" },
        ]}
        description="State one fact about a subject and cite the evidence behind it. The service stores what you assert as an observation; it does not become a canonical record here."
        eyebrow="Observed context"
        title="Record claim"
      />

      <Notice title="An asserted claim is an observation, not a fact" variant="info">
        What you record enters Living Memory and competes with other claims about the same subject.
        Nothing here reaches the canonical graph directly — promotion runs later, by a different
        actor, through its own review gate.
      </Notice>

      {identity.isError ? (
        <div className="mt-6">
          <RequestFailure onRetry={() => void identity.refetch()} title="Identity unavailable">
            The calling identity could not be resolved, so the assertion cannot be attributed.
          </RequestFailure>
        </div>
      ) : null}

      <form className="mt-6 space-y-6" onSubmit={handleSubmit(submit)}>
        {errors.root?.server?.message ? (
          <Notice title="Assertion was not recorded" variant="danger">
            {errors.root.server.message}
          </Notice>
        ) : null}
        {assertion.data ? <AssertClaimReceiptPanel receipt={assertion.data} /> : null}

        <SectionSurface
          className="overflow-visible"
          description="The subject, the predicate, and the value the claim asserts."
          title="What this claim says"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={`${labelClassName} sm:col-span-2`} htmlFor="claim-subject">
              Subject reference
              <input
                aria-describedby="claim-subject-help claim-subject-error"
                aria-invalid={errors.subjectReference ? "true" : undefined}
                className={`${inputClassName} font-mono`}
                id="claim-subject"
                placeholder="system:github/identity-service"
                spellCheck={false}
                {...register("subjectReference", {
                  required: "Name the subject this claim is about.",
                })}
              />
              <span className={helpClassName} id="claim-subject-help">
                A reference the service can resolve to an entity. A reference it cannot resolve is
                still stored, as an unlinked claim awaiting curation.
              </span>
              <FieldErrorMessage
                id="claim-subject-error"
                message={errors.subjectReference?.message}
              />
            </label>

            {/*
              The ontology is operator-scoped, so a principal permitted to assert claims may
              still be unable to read it. Falling back to free text keeps the form usable; the
              service validates the predicate either way.
            */}
            {predicates.isError ? (
              <label className={`${labelClassName} sm:col-span-2`} htmlFor="claim-predicate">
                Predicate
                <input
                  aria-describedby="claim-predicate-help claim-predicate-error"
                  aria-invalid={errors.predicate ? "true" : undefined}
                  className={`${inputClassName} font-mono`}
                  id="claim-predicate"
                  placeholder="owned_by_team"
                  spellCheck={false}
                  {...register("predicate", {
                    required: "Enter the predicate this claim uses.",
                  })}
                />
                <span className={helpClassName} id="claim-predicate-help">
                  The predicate ontology could not be loaded, so this form cannot confirm the
                  predicate is registered. The service still validates it.{" "}
                  <button
                    className="text-accent underline"
                    onClick={() => void predicates.refetch()}
                    type="button"
                  >
                    Retry loading predicates
                  </button>
                </span>
                <FieldErrorMessage id="claim-predicate-error" message={errors.predicate?.message} />
              </label>
            ) : (
              <div className={`${labelClassName} sm:col-span-2`}>
                <Controller
                  control={control}
                  name="predicate"
                  render={({ field }) => (
                    <SearchableSelect
                      disabled={predicates.isPending}
                      emptyLabel="Select a predicate"
                      emptyMessage="No predicate matches"
                      label="Predicate"
                      onValueChange={choosePredicate}
                      options={claimPredicateOptions(predicates.data ?? [])}
                      searchPlaceholder="Search predicates"
                      value={field.value}
                    />
                  )}
                  rules={{ required: "Choose the predicate this claim uses." }}
                />
                {predicateDetail ? (
                  <span className={helpClassName}>
                    {predicateDetail.definition} Expects {predicateDetail.value_type}.
                    {predicateDetail.deprecated_at
                      ? " This predicate is deprecated; existing claims still reference it."
                      : ""}
                  </span>
                ) : (
                  <span className={helpClassName}>
                    Deprecated predicates stay listed because existing claims still reference them.
                  </span>
                )}
                <FieldErrorMessage id="claim-predicate-error" message={errors.predicate?.message} />
              </div>
            )}

            <Controller
              control={control}
              name="valueFormat"
              render={({ field }) => (
                <SearchableSelect
                  allowEmpty={false}
                  label="Value entry"
                  onValueChange={(next) => field.onChange(next as ClaimValueFormat)}
                  options={claimValueFormatOptions}
                  value={field.value}
                />
              )}
            />

            <label className={`${labelClassName} sm:col-span-2`} htmlFor="claim-value">
              Value
              {valueFormat === "json" ? (
                <textarea
                  aria-describedby="claim-value-error"
                  aria-invalid={errors.valueText ? "true" : undefined}
                  className={`${inputClassName} min-h-32 resize-y font-mono leading-6`}
                  id="claim-value"
                  spellCheck={false}
                  {...register("valueText", { required: "Enter the value this claim asserts." })}
                />
              ) : (
                <input
                  aria-describedby="claim-value-error"
                  aria-invalid={errors.valueText ? "true" : undefined}
                  className={inputClassName}
                  id="claim-value"
                  placeholder="trust-engineering"
                  {...register("valueText", { required: "Enter the value this claim asserts." })}
                />
              )}
              <FieldErrorMessage id="claim-value-error" message={errors.valueText?.message} />
            </label>
          </div>
        </SectionSurface>

        <SectionSurface
          action={
            <Button
              disabled={isSubmitting}
              onClick={() => evidence.append(createClaimEvidenceFormValue())}
              size="compact"
              variant="secondary"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add evidence
            </Button>
          }
          description="At least one citation is required. Evidence is what a reviewer reads when deciding whether this claim is believed."
          title="Evidence"
        >
          <div className="space-y-4">
            {evidence.fields.map((field, index) => {
              const itemErrors = errors.evidence?.[index];
              return (
                <fieldset
                  key={field.id}
                  className="rounded-lg border border-border bg-surface-muted p-4 sm:p-5"
                >
                  <legend className="px-1 text-sm font-semibold text-foreground">
                    Citation {index + 1}
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                    <Controller
                      control={control}
                      name={`evidence.${index}.kind`}
                      render={({ field }) => (
                        <SearchableSelect
                          allowEmpty={false}
                          label="Kind"
                          onValueChange={(next) => field.onChange(next as ClaimEvidenceKind)}
                          options={claimEvidenceKindOptions}
                          value={field.value}
                        />
                      )}
                    />
                    <label className={labelClassName} htmlFor={`claim-evidence-${index}-ref`}>
                      Reference
                      <input
                        aria-describedby={`claim-evidence-${index}-ref-error`}
                        aria-invalid={itemErrors?.ref ? "true" : undefined}
                        className={`${inputClassName} font-mono`}
                        id={`claim-evidence-${index}-ref`}
                        placeholder="review-114"
                        spellCheck={false}
                        {...register(`evidence.${index}.ref`, {
                          required: "Enter the reference this citation points at.",
                        })}
                      />
                      <FieldErrorMessage
                        id={`claim-evidence-${index}-ref-error`}
                        message={itemErrors?.ref?.message}
                      />
                    </label>
                    <label
                      className={`${labelClassName} sm:col-span-2`}
                      htmlFor={`claim-evidence-${index}-excerpt`}
                    >
                      Excerpt
                      <textarea
                        className={`${inputClassName} min-h-20 resize-y leading-6`}
                        id={`claim-evidence-${index}-excerpt`}
                        placeholder="The passage that supports this claim."
                        {...register(`evidence.${index}.excerpt`)}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end border-t border-border pt-4">
                    <Button
                      aria-label={`Remove citation ${index + 1}`}
                      disabled={evidence.fields.length === 1 || isSubmitting}
                      onClick={() => evidence.remove(index)}
                      size="compact"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                      Remove
                    </Button>
                  </div>
                </fieldset>
              );
            })}
          </div>
        </SectionSurface>

        <SectionSurface
          description="Optional. Absent bounds mean the claim is believed from now until something supersedes it."
          title="Scope and validity"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className={labelClassName} htmlFor="claim-namespace">
              Namespace
              <input
                className={inputClassName}
                id="claim-namespace"
                placeholder="platform.identity"
                {...register("namespace")}
              />
            </label>
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <SearchableSelect
                  allowEmpty={false}
                  label="Visibility"
                  onValueChange={(next) => field.onChange(next as ClaimVisibility)}
                  options={claimVisibilityOptions}
                  value={field.value}
                />
              )}
            />
            <label className={labelClassName} htmlFor="claim-valid-from">
              Valid from
              <input
                className={inputClassName}
                id="claim-valid-from"
                type="datetime-local"
                {...register("assertedValidFrom")}
              />
            </label>
            <label className={labelClassName} htmlFor="claim-valid-to">
              Valid until
              <input
                className={inputClassName}
                id="claim-valid-to"
                type="datetime-local"
                {...register("assertedValidTo")}
              />
            </label>
          </div>
        </SectionSurface>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <StatusBadge tone="neutral">Enters recall · not canonical</StatusBadge>
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Recording…" : "Record claim"}
          </Button>
        </div>
      </form>
    </PageContainer>
  );
}
