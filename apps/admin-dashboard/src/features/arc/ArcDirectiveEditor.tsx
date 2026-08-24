import { Plus, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, ResourcePicker, SearchableSelect, StatusBadge } from "@repo/ui/primitives";

import {
  arcApplicabilityScopeOptions,
  arcContentClassificationOptions,
  arcDetailAudienceOptions,
  arcDirectiveTypeOptions,
  arcFreshnessBasisOptions,
  arcSatisfactionModeOptions,
  arcVisibilityOptions,
} from "./arcModel";
import type { ArcSourceEvidence } from "../../shared/api/arcAuthoring";
import type { PickerSource } from "../../shared/pickers/sources";
import type {
  ArcArtifactFamily,
  ArcProposalPatchRequest,
  ArcProposalVersion,
} from "../../shared/api/contextplane";
import {
  buildArcProposalPatch,
  createApplicabilityFormValue,
  createArcSemanticsDefaults,
  createDirectiveFormValue,
  type ArcDirectiveFormValue,
  type ArcSemanticsFormValues,
} from "./arcSemantics";

interface ArcDirectiveEditorProps {
  artifact: ArcArtifactFamily;
  defaultTenantId: string;
  onSave: (patch: ArcProposalPatchRequest) => Promise<void>;
  proposal: ArcProposalVersion;
  source: ArcSourceEvidence;
  /**
   * The tenants this credential reaches. Passed in rather than built here for
   * the same reason `ArcArtifactDialog` takes one: this is a form, and a form
   * that knows how to fetch has to be handed a client before it can be tested.
   */
  tenants: PickerSource;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle";
const labelClassName = "block text-xs font-medium text-muted";
const errorClassName = "mt-1.5 block text-xs text-danger";
const conflictFields = [
  { label: "Namespace", name: "conflictNamespace", placeholder: "deployment" },
  { label: "Subject selector", name: "conflictSubjectSelector", placeholder: "service:payments" },
  { label: "Operation", name: "conflictOperation", placeholder: "deploy" },
  { label: "Action class", name: "conflictActionClass", placeholder: "production_change" },
  { label: "Target selector", name: "conflictTargetSelector", placeholder: "environment:prod" },
  { label: "Modality", name: "conflictModality", placeholder: "must" },
  { label: "Constraint operator", name: "conflictConstraintOperator", placeholder: "equals" },
  { label: "Constraint value", name: "conflictConstraintValue", placeholder: "approved" },
] as const satisfies readonly {
  label: string;
  name: keyof ArcDirectiveFormValue;
  placeholder: string;
}[];

interface FieldErrorMessageProps {
  id: string;
  message?: string | undefined;
}

function FieldErrorMessage({ id, message }: FieldErrorMessageProps) {
  return message ? (
    <span className={errorClassName} id={id} role="alert">
      {message}
    </span>
  ) : null;
}

export function ArcDirectiveEditor({
  artifact,
  defaultTenantId,
  onSave,
  proposal,
  source,
  tenants,
}: ArcDirectiveEditorProps) {
  const editable = proposal.available_actions.includes("edit");
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<ArcSemanticsFormValues>({
    defaultValues: createArcSemanticsDefaults(artifact.target_tenant_id ?? defaultTenantId),
  });
  const directives = useFieldArray({ control, name: "directives" });
  const applicability = useFieldArray({ control, name: "applicability" });
  const directiveValues = useWatch({ control, name: "directives" });
  const applicabilityValues = useWatch({ control, name: "applicability" });

  async function save(values: ArcSemanticsFormValues) {
    try {
      await onSave(await buildArcProposalPatch(values, artifact, source, proposal));
    } catch {
      setError("root.server", {
        message: "The candidate could not be saved. Review the service response and try again.",
      });
    }
  }

  return (
    <SectionSurface
      className="overflow-visible"
      description="Write the policy content people and agents will follow. Saving creates candidate semantics; it does not activate them."
      id="arc-step-candidate"
      title="4. Write the directive candidate"
    >
      {!editable ? (
        <Notice title="This version is frozen" variant="warning">
          This draft revision is {proposal.state}. Open revisions can be edited; frozen revisions
          remain available as review evidence.
        </Notice>
      ) : null}

      <form className="mt-5 space-y-8" onSubmit={handleSubmit(save)}>
        {errors.root?.server?.message ? (
          <Notice title="Candidate was not saved" variant="danger">
            {errors.root.server.message}
          </Notice>
        ) : null}
        {Object.keys(errors).some((key) => key !== "root") ? (
          <Notice title="Review the highlighted fields" variant="danger">
            The candidate has missing or invalid values. Each affected field explains what to
            correct.
          </Notice>
        ) : null}

        <fieldset
          className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3"
          disabled={!editable}
        >
          <legend className="sr-only">Candidate governance</legend>
          <Controller
            control={control}
            name="visibility"
            render={({ field }) => (
              <SearchableSelect
                allowEmpty={false}
                disabled={!editable}
                label="Visibility"
                onValueChange={field.onChange}
                options={arcVisibilityOptions}
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="contentClassification"
            render={({ field }) => (
              <SearchableSelect
                allowEmpty={false}
                disabled={!editable}
                label="Content classification"
                onValueChange={field.onChange}
                options={arcContentClassificationOptions}
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="detailAudience"
            render={({ field }) => (
              <SearchableSelect
                allowEmpty={false}
                disabled={!editable}
                label="Detail audience"
                onValueChange={field.onChange}
                options={arcDetailAudienceOptions}
                value={field.value}
              />
            )}
          />
          <label className={labelClassName} htmlFor="arc-review-expires">
            Review expires
            <input
              aria-describedby="arc-review-expires-error"
              aria-invalid={errors.reviewExpiresAt ? "true" : undefined}
              className={inputClassName}
              id="arc-review-expires"
              type="datetime-local"
              {...register("reviewExpiresAt", { required: "Choose a review expiry." })}
            />
            <FieldErrorMessage
              id="arc-review-expires-error"
              message={errors.reviewExpiresAt?.message}
            />
          </label>
          <label className={labelClassName} htmlFor="arc-retention">
            Retention floor (days)
            <input
              aria-describedby="arc-retention-error"
              aria-invalid={errors.approvedRetentionFloorDays ? "true" : undefined}
              className={inputClassName}
              id="arc-retention"
              min={1}
              type="number"
              {...register("approvedRetentionFloorDays", {
                min: { message: "Use at least one day.", value: 1 },
                required: "Enter a retention floor.",
                valueAsNumber: true,
              })}
            />
            <FieldErrorMessage
              id="arc-retention-error"
              message={errors.approvedRetentionFloorDays?.message}
            />
          </label>
          <div>
            <Controller
              control={control}
              name="freshnessBasis"
              render={({ field }) => (
                <SearchableSelect
                  allowEmpty={false}
                  disabled={!editable}
                  label="Initial freshness basis"
                  onValueChange={field.onChange}
                  options={arcFreshnessBasisOptions}
                  value={field.value}
                />
              )}
            />
            <span className="mt-1.5 block text-xs leading-5 text-subtle" id="arc-freshness-help">
              Revision pinned always uses these source bytes. Connector verified rechecks the
              immutable revision through its registered source connector.
            </span>
          </div>
          <label className={`${labelClassName} sm:col-span-2`} htmlFor="arc-source-approval-digest">
            Source approval evidence digest
            {/* Asserted about the approval record's content, not looked up.
                identifier-exception: asserted-digest */}
            <input
              aria-describedby="arc-source-approval-digest-help arc-source-approval-digest-error"
              aria-invalid={errors.sourceApprovalEvidenceDigest ? "true" : undefined}
              className={`${inputClassName} font-mono`}
              id="arc-source-approval-digest"
              placeholder="64-character SHA-256 digest"
              spellCheck={false}
              {...register("sourceApprovalEvidenceDigest", {
                pattern: {
                  message: "Enter a lowercase 64-character SHA-256 digest.",
                  value: /^[0-9a-f]{64}$/,
                },
                required: "Enter the digest that binds the source approval evidence.",
              })}
            />
            <span
              className="mt-1.5 block text-xs leading-5 text-subtle"
              id="arc-source-approval-digest-help"
            >
              This value comes from the source approval workflow. It is evidence metadata, not a
              signing key.
            </span>
            <FieldErrorMessage
              id="arc-source-approval-digest-error"
              message={errors.sourceApprovalEvidenceDigest?.message}
            />
          </label>
          <label className={labelClassName} htmlFor="arc-revision-id">
            Draft revision ID
            <input
              className={`${inputClassName} font-mono`}
              id="arc-revision-id"
              readOnly
              {...register("revisionId")}
            />
          </label>
        </fieldset>

        <section aria-labelledby="arc-directives-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground" id="arc-directives-heading">
                Directives
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                State what must be remembered or verified, and cite the exact source location.
              </p>
            </div>
            <Button
              disabled={!editable || isSubmitting}
              onClick={() => directives.append(createDirectiveFormValue())}
              size="compact"
              variant="secondary"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add directive
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {directives.fields.map((field, index) => {
              const actionProtecting =
                directiveValues[index]?.directiveType === "verify_before_action";
              const itemErrors = errors.directives?.[index];
              return (
                <fieldset
                  key={field.id}
                  className="rounded-lg border border-border bg-surface-muted p-4 sm:p-5"
                  disabled={!editable}
                >
                  <legend className="px-1 text-sm font-semibold text-foreground">
                    Directive {index + 1}
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                    <Controller
                      control={control}
                      name={`directives.${index}.directiveType`}
                      render={({ field }) => (
                        <SearchableSelect
                          allowEmpty={false}
                          disabled={!editable}
                          label="Behavior"
                          onValueChange={field.onChange}
                          options={arcDirectiveTypeOptions}
                          value={field.value}
                        />
                      )}
                    />
                    <label className={labelClassName} htmlFor={`arc-directive-${index}-anchor`}>
                      Source anchor
                      <input
                        aria-describedby={`arc-directive-${index}-anchor-error`}
                        aria-invalid={itemErrors?.sourceAnchor ? "true" : undefined}
                        className={inputClassName}
                        id={`arc-directive-${index}-anchor`}
                        placeholder="section-4.2"
                        {...register(`directives.${index}.sourceAnchor`, {
                          required: "Enter the source section, heading, or anchor.",
                        })}
                      />
                      <FieldErrorMessage
                        id={`arc-directive-${index}-anchor-error`}
                        message={itemErrors?.sourceAnchor?.message}
                      />
                    </label>
                    <label
                      className={`${labelClassName} sm:col-span-2`}
                      htmlFor={`arc-directive-${index}-statement`}
                    >
                      Directive statement
                      <textarea
                        aria-describedby={`arc-directive-${index}-statement-help arc-directive-${index}-statement-error`}
                        aria-invalid={itemErrors?.statement ? "true" : undefined}
                        className={`${inputClassName} min-h-28 resize-y leading-6`}
                        id={`arc-directive-${index}-statement`}
                        placeholder="Before changing production traffic, verify…"
                        {...register(`directives.${index}.statement`, {
                          required: "Enter the directive statement.",
                        })}
                      />
                      <span
                        className="mt-1.5 block text-xs leading-5 text-subtle"
                        id={`arc-directive-${index}-statement-help`}
                      >
                        Use the approved source wording. The candidate stores a SHA-256 digest and
                        source-backed provenance for this text.
                      </span>
                      <FieldErrorMessage
                        id={`arc-directive-${index}-statement-error`}
                        message={itemErrors?.statement?.message}
                      />
                    </label>
                  </div>

                  {actionProtecting ? (
                    <div className="mt-5 border-t border-border pt-5">
                      <div className="mb-4 flex items-center gap-2">
                        <StatusBadge tone="warning">Action protection</StatusBadge>
                        <p className="text-xs text-muted">
                          These fields identify conflicts and acceptable verification evidence.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                        {conflictFields.map(({ label, name, placeholder }) => {
                          const fieldName = name;
                          return (
                            <label
                              key={name}
                              className={labelClassName}
                              htmlFor={`arc-directive-${index}-${name}`}
                            >
                              {label}
                              <input
                                aria-describedby={`arc-directive-${index}-${name}-error`}
                                aria-invalid={itemErrors?.[fieldName] ? "true" : undefined}
                                className={inputClassName}
                                id={`arc-directive-${index}-${name}`}
                                placeholder={placeholder}
                                {...register(`directives.${index}.${fieldName}`, {
                                  required: "Required for action protection.",
                                })}
                              />
                              <FieldErrorMessage
                                id={`arc-directive-${index}-${name}-error`}
                                message={itemErrors?.[fieldName]?.message}
                              />
                            </label>
                          );
                        })}
                        <Controller
                          control={control}
                          name={`directives.${index}.satisfactionMode`}
                          render={({ field }) => (
                            <SearchableSelect
                              allowEmpty={false}
                              disabled={!editable}
                              label="Satisfaction mode"
                              onValueChange={field.onChange}
                              options={arcSatisfactionModeOptions}
                              value={field.value}
                            />
                          )}
                        />
                        <label
                          className={labelClassName}
                          htmlFor={`arc-directive-${index}-max-age`}
                        >
                          Verification max age (seconds)
                          <input
                            className={inputClassName}
                            id={`arc-directive-${index}-max-age`}
                            min={1}
                            type="number"
                            {...register(`directives.${index}.verificationMaxAgeSeconds`, {
                              min: 1,
                              valueAsNumber: true,
                            })}
                          />
                        </label>
                        <label
                          className={labelClassName}
                          htmlFor={`arc-directive-${index}-evidence-type`}
                        >
                          Required evidence type
                          <input
                            className={inputClassName}
                            id={`arc-directive-${index}-evidence-type`}
                            placeholder="change_approval"
                            {...register(`directives.${index}.requiredEvidenceType`)}
                          />
                        </label>
                        <label
                          className={labelClassName}
                          htmlFor={`arc-directive-${index}-verifier-classes`}
                        >
                          Verifier classes
                          <input
                            className={inputClassName}
                            id={`arc-directive-${index}-verifier-classes`}
                            placeholder="change-system, security-review"
                            {...register(`directives.${index}.acceptedVerifierClasses`)}
                          />
                        </label>
                        <label
                          className={labelClassName}
                          htmlFor={`arc-directive-${index}-verifier-ids`}
                        >
                          Verifier IDs
                          <input
                            className={inputClassName}
                            id={`arc-directive-${index}-verifier-ids`}
                            placeholder="verifier-a, verifier-b"
                            {...register(`directives.${index}.acceptedVerifierIds`)}
                          />
                        </label>
                        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground sm:self-end">
                          <input
                            className="size-4 accent-accent"
                            type="checkbox"
                            {...register(`directives.${index}.delegableException`)}
                          />
                          Allow delegated exceptions
                        </label>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex justify-end border-t border-border pt-4">
                    <Button
                      aria-label={`Remove directive ${index + 1}`}
                      disabled={!editable || directives.fields.length === 1 || isSubmitting}
                      onClick={() => directives.remove(index)}
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
        </section>

        <section aria-labelledby="arc-applicability-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground" id="arc-applicability-heading">
                Where this policy applies
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Choose the tenants, domains, capabilities, intents, and environments that receive
                this policy. Multiple rules broaden its reach.
              </p>
            </div>
            <Button
              disabled={!editable || isSubmitting}
              onClick={() => applicability.append(createApplicabilityFormValue(defaultTenantId))}
              size="compact"
              variant="secondary"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add rule
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {applicability.fields.map((field, index) => {
              const scope = applicabilityValues[index]?.scope;
              const itemErrors = errors.applicability?.[index];
              return (
                <fieldset
                  key={field.id}
                  className="rounded-lg border border-border bg-surface-muted p-4 sm:p-5"
                  disabled={!editable}
                >
                  <legend className="px-1 text-sm font-semibold text-foreground">
                    Rule {index + 1}
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                    <Controller
                      control={control}
                      name={`applicability.${index}.scope`}
                      render={({ field }) => (
                        <SearchableSelect
                          allowEmpty={false}
                          disabled={!editable}
                          label="Scope"
                          onValueChange={field.onChange}
                          options={arcApplicabilityScopeOptions}
                          value={field.value}
                        />
                      )}
                    />
                    {scope === "tenant" ? (
                      <div>
                        {/* `Controller` rather than `register`, which is what
                            the scope select beside it already does: a picker is
                            a controlled component and registering one twice is
                            the failure this form's own guidance names. */}
                        <Controller
                          control={control}
                          name={`applicability.${index}.targetTenantId`}
                          render={({ field }) => (
                            <ResourcePicker
                              disabled={!editable}
                              emptyMessage="This credential reaches no other tenant."
                              label="Target tenant"
                              load={tenants}
                              onValueChange={field.onChange}
                              searchPlaceholder="Search tenants by name"
                              value={field.value ?? ""}
                            />
                          )}
                          rules={{ required: "Choose the target tenant." }}
                        />
                        <FieldErrorMessage
                          id={`arc-rule-${index}-tenant-error`}
                          message={itemErrors?.targetTenantId?.message}
                        />
                      </div>
                    ) : null}
                    {scope === "domain" ? (
                      <label className={labelClassName} htmlFor={`arc-rule-${index}-domains`}>
                        Domain IDs
                        <input
                          aria-describedby={`arc-rule-${index}-domains-error`}
                          aria-invalid={itemErrors?.domainIds ? "true" : undefined}
                          className={inputClassName}
                          id={`arc-rule-${index}-domains`}
                          placeholder="payments, identity"
                          {...register(`applicability.${index}.domainIds`, {
                            required: "Enter at least one domain ID.",
                          })}
                        />
                        <FieldErrorMessage
                          id={`arc-rule-${index}-domains-error`}
                          message={itemErrors?.domainIds?.message}
                        />
                      </label>
                    ) : null}
                    {scope === "entity" ? (
                      <>
                        <label
                          className={labelClassName}
                          htmlFor={`arc-rule-${index}-capabilities`}
                        >
                          Entity IDs
                          <input
                            className={inputClassName}
                            id={`arc-rule-${index}-capabilities`}
                            placeholder="UUIDs separated by commas"
                            {...register(`applicability.${index}.entityIds`)}
                          />
                        </label>
                        <label className={labelClassName} htmlFor={`arc-rule-${index}-labels`}>
                          Capability labels
                          <input
                            className={inputClassName}
                            id={`arc-rule-${index}-labels`}
                            placeholder="deploy, rollback"
                            {...register(`applicability.${index}.entityLabels`)}
                          />
                        </label>
                      </>
                    ) : null}
                    {scope === "intent" ? (
                      <label className={labelClassName} htmlFor={`arc-rule-${index}-intents`}>
                        Intent kinds
                        <input
                          aria-describedby={`arc-rule-${index}-intents-error`}
                          aria-invalid={itemErrors?.intentKinds ? "true" : undefined}
                          className={inputClassName}
                          id={`arc-rule-${index}-intents`}
                          placeholder="deploy, operate"
                          {...register(`applicability.${index}.intentKinds`, {
                            required: "Enter at least one intent kind.",
                          })}
                        />
                        <FieldErrorMessage
                          id={`arc-rule-${index}-intents-error`}
                          message={itemErrors?.intentKinds?.message}
                        />
                      </label>
                    ) : null}
                    <label className={labelClassName} htmlFor={`arc-rule-${index}-actions`}>
                      Action classes
                      <input
                        className={inputClassName}
                        id={`arc-rule-${index}-actions`}
                        placeholder="production_change, data_write"
                        {...register(`applicability.${index}.actionClasses`)}
                      />
                    </label>
                    <label className={labelClassName} htmlFor={`arc-rule-${index}-environments`}>
                      Environments
                      <input
                        className={inputClassName}
                        id={`arc-rule-${index}-environments`}
                        placeholder="production, staging"
                        {...register(`applicability.${index}.environments`)}
                      />
                    </label>
                    <label className={labelClassName} htmlFor={`arc-rule-${index}-sensitivity`}>
                      Data sensitivity tiers
                      <input
                        className={inputClassName}
                        id={`arc-rule-${index}-sensitivity`}
                        placeholder="restricted, confidential"
                        {...register(`applicability.${index}.dataSensitivityTiers`)}
                      />
                    </label>
                    <label className={labelClassName} htmlFor={`arc-rule-${index}-from`}>
                      Effective from
                      <input
                        className={inputClassName}
                        id={`arc-rule-${index}-from`}
                        type="datetime-local"
                        {...register(`applicability.${index}.effectiveFrom`)}
                      />
                    </label>
                    <label className={labelClassName} htmlFor={`arc-rule-${index}-until`}>
                      Effective until
                      <input
                        className={inputClassName}
                        id={`arc-rule-${index}-until`}
                        type="datetime-local"
                        {...register(`applicability.${index}.effectiveUntil`)}
                      />
                    </label>
                    <label className="flex min-h-11 items-center gap-3 text-sm text-foreground sm:self-end">
                      <input
                        className="size-4 accent-accent"
                        type="checkbox"
                        {...register(`applicability.${index}.isMandatory`)}
                      />
                      Mandatory where matched
                    </label>
                  </div>
                  <div className="mt-5 flex justify-end border-t border-border pt-4">
                    <Button
                      aria-label={`Remove applicability rule ${index + 1}`}
                      disabled={!editable || applicability.fields.length === 1 || isSubmitting}
                      onClick={() => applicability.remove(index)}
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
        </section>

        <div className="sticky bottom-0 z-10 -mx-6 flex flex-col gap-3 border-t border-border bg-surface px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted">
            Source: {source.source_system} · {source.source_revision_locator}
          </p>
          <Button disabled={!editable || isSubmitting} type="submit">
            {isSubmitting ? "Saving candidate…" : "Save candidate"}
          </Button>
        </div>
      </form>
    </SectionSurface>
  );
}
