import { Copy, Upload } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, SearchableSelect, StatusBadge } from "@repo/ui/primitives";

import type {
  AdmitArcConnectorFetchInput,
  AdmitArcGraphPromotionInput,
  AdmitArcSourceUploadInput,
  ArcApprovalProof,
  ArcSourceApprovalClaim,
  ArcSourceEvidence,
} from "../../shared/api/arcAuthoring";
import { sha256Hex } from "./arcSemantics";
import { arcProofMethodOptions, formatArcDate, formatArcLabel } from "./arcModel";

interface ArcSourceEvidenceSectionProps {
  onAdmitConnector: (input: AdmitArcConnectorFetchInput) => Promise<ArcSourceEvidence>;
  onAdmitGraphPromotion: (input: AdmitArcGraphPromotionInput) => Promise<ArcSourceEvidence>;
  onAdmitUpload: (input: AdmitArcSourceUploadInput) => Promise<ArcSourceEvidence>;
  onLookup: (sourceEvidenceId: string) => Promise<ArcSourceEvidence>;
  onSelect: (source: ArcSourceEvidence) => void;
  selectedSource: ArcSourceEvidence | null;
}

type EvidenceMode = "connector" | "existing" | "promotion" | "upload";

interface SourceEvidenceFormValues {
  approvalLocator: string;
  claimId: string;
  approvalScope: string;
  approvedAt: string;
  approvingAuthorityIssuer: string;
  approvingAuthoritySubject: string;
  assertionBase64: string;
  assertionFormat: string;
  connectorId: string;
  expiresAt: string;
  policyId: string;
  proofMethod: "detached_signature" | "verifier_attestation";
  providerId: string;
  reviewExpiresAt: string;
  signatureBase64: string;
  sourceContentDigest: string;
  sourceContentType: string;
  sourceEvidenceId: string;
  sourceRevisionLocator: string;
  sourceSystem: string;
  verifierId: string;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";
const errorClassName = "mt-1.5 block text-xs text-danger";

function FieldErrorMessage({ id, message }: { id: string; message?: string | undefined }) {
  return message ? (
    <span className={errorClassName} id={id} role="alert">
      {message}
    </span>
  ) : null;
}

function evidenceStatusTone(status: ArcSourceEvidence["status"]) {
  if (status === "current") return "success" as const;
  if (status === "unknown" || status === "overdue") return "warning" as const;
  return "danger" as const;
}

function sourceClaim(
  values: SourceEvidenceFormValues,
  contentDigest: string,
): ArcSourceApprovalClaim {
  return {
    approval_locator: values.approvalLocator,
    approval_scope: values.approvalScope,
    approved_at: new Date(values.approvedAt).toISOString(),
    approving_authority_issuer: values.approvingAuthorityIssuer,
    approving_authority_subject: values.approvingAuthoritySubject,
    expires_at: new Date(values.expiresAt).toISOString(),
    profile: "arc_source_approval_claim_v1",
    source_content_digest: contentDigest,
    source_content_digest_algorithm: "sha256",
    source_content_type: values.sourceContentType,
    source_revision_locator: values.sourceRevisionLocator,
    source_system: values.sourceSystem,
  };
}

function sourceProof(values: SourceEvidenceFormValues): ArcApprovalProof {
  return values.proofMethod === "detached_signature"
    ? {
        signature_algorithm: "Ed25519",
        signature_base64: values.signatureBase64,
        verification_method: "detached_signature",
      }
    : {
        assertion_base64: values.assertionBase64,
        assertion_format: values.assertionFormat,
        provider_id: values.providerId,
        verification_method: "verifier_attestation",
      };
}

export function ArcSourceEvidenceSection({
  onAdmitConnector,
  onAdmitGraphPromotion,
  onAdmitUpload,
  onLookup,
  onSelect,
  selectedSource,
}: ArcSourceEvidenceSectionProps) {
  const [mode, setMode] = useState<EvidenceMode>("existing");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const {
    clearErrors,
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<SourceEvidenceFormValues>({
    defaultValues: {
      approvalLocator: "",
      claimId: "",
      approvalScope: "",
      approvedAt: "",
      approvingAuthorityIssuer: "",
      approvingAuthoritySubject: "",
      assertionBase64: "",
      assertionFormat: "",
      connectorId: "",
      expiresAt: "",
      policyId: "",
      proofMethod: "detached_signature",
      providerId: "",
      reviewExpiresAt: "",
      signatureBase64: "",
      sourceContentDigest: "",
      sourceContentType: "text/plain",
      sourceEvidenceId: "",
      sourceRevisionLocator: "",
      sourceSystem: "",
      verifierId: "",
    },
  });
  const proofMethod = useWatch({ control, name: "proofMethod" });

  function changeMode(nextMode: EvidenceMode) {
    setMode(nextMode);
    clearErrors();
  }

  async function submit(values: SourceEvidenceFormValues) {
    try {
      if (mode === "existing") {
        onSelect(await onLookup(values.sourceEvidenceId.trim()));
        return;
      }

      const idempotencyKey = crypto.randomUUID();
      if (mode === "promotion") {
        onSelect(
          await onAdmitGraphPromotion({
            claimId: values.claimId.trim(),
            idempotencyKey,
            reviewExpiresAt: new Date(values.reviewExpiresAt).toISOString(),
            sourceSystem: values.sourceSystem.trim(),
          }),
        );
        return;
      }

      const proof = sourceProof(values);
      if (mode === "upload") {
        if (!uploadFile) {
          setError("root.file", { message: "Choose the approved source file." });
          return;
        }
        const contentDigest = await sha256Hex(new Uint8Array(await uploadFile.arrayBuffer()));
        const source = await onAdmitUpload({
          body: uploadFile,
          claim: sourceClaim(values, contentDigest),
          idempotencyKey,
          policyId: values.policyId,
          proof,
          sourceContentType: values.sourceContentType,
          sourceRevisionLocator: values.sourceRevisionLocator,
          sourceSystem: values.sourceSystem,
          verifierId: values.verifierId,
        });
        onSelect(source);
        return;
      }

      const source = await onAdmitConnector({
        claim: sourceClaim(values, values.sourceContentDigest),
        connectorId: values.connectorId,
        idempotencyKey,
        proof,
        sourceRevisionLocator: values.sourceRevisionLocator,
        verifierId: values.verifierId,
      });
      onSelect(source);
    } catch {
      setError("root.server", {
        message:
          "The service did not accept this evidence. Check the immutable source and external proof.",
      });
    }
  }

  return (
    <SectionSurface
      description="A draft must be bound to immutable, approved source evidence before policy content is written."
      id="arc-step-evidence"
      title="2. Bind approved source evidence"
    >
      {selectedSource ? (
        <div className="mb-5 rounded-lg border border-success/25 bg-success-subtle p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Selected evidence</p>
              <p className="mt-1 break-words text-sm text-muted">
                {selectedSource.source_system} · {selectedSource.source_revision_locator}
              </p>
              <div className="mt-2 flex min-w-0 items-center gap-2">
                <code className="break-all text-xs text-subtle">
                  {selectedSource.source_evidence_id}
                </code>
                <Button
                  aria-label="Copy source evidence ID"
                  className="shrink-0"
                  onClick={() =>
                    void navigator.clipboard.writeText(selectedSource.source_evidence_id)
                  }
                  size="icon"
                  title="Copy source evidence ID"
                  variant="ghost"
                >
                  <Copy aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
            <StatusBadge tone={evidenceStatusTone(selectedSource.status)}>
              {selectedSource.status}
            </StatusBadge>
          </div>
          <dl className="mt-4 grid gap-3 border-t border-success/25 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-subtle">Verification</dt>
              <dd className="mt-1 text-sm text-foreground">
                {formatArcLabel(selectedSource.verification_method)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Verified</dt>
              <dd className="mt-1 text-sm text-foreground">
                {formatArcDate(selectedSource.verified_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Evidence expires</dt>
              <dd className="mt-1 text-sm text-foreground">
                {formatArcDate(selectedSource.expires_at)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Source digest</dt>
              <dd className="mt-1 break-all font-mono text-xs text-foreground">
                {selectedSource.source_content_digest}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <fieldset>
        <legend className="text-xs font-medium text-muted">Evidence source</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["promotion", "Cite a promoted graph claim"],
              ["existing", "Use admitted evidence"],
              ["upload", "Admit an upload"],
              ["connector", "Fetch through connector"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                mode === value
                  ? "border-accent bg-accent-subtle text-foreground"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              <input
                checked={mode === value}
                className="size-4 accent-accent"
                name="arc-evidence-mode"
                onChange={() => changeMode(value)}
                type="radio"
                value={value}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <form className="mt-5 space-y-5" onSubmit={handleSubmit(submit)}>
        {errors.root?.server?.message ? (
          <Notice title="Evidence was not accepted" variant="danger">
            {errors.root.server.message}
          </Notice>
        ) : null}
        {Object.keys(errors).some((key) => key !== "root") ? (
          <Notice title="Review the highlighted fields" variant="danger">
            The source evidence request has missing or invalid values. Each affected field explains
            what to correct.
          </Notice>
        ) : null}

        {mode === "promotion" ? (
          <>
            <Notice title="Approval comes from the promotion, not a signature" variant="info">
              The claim must already be promoted onto the canonical graph by someone other than its
              author. The service reads the approving actor, the approval time, and the upstream
              revision from that promotion, and refuses one that was reversed.
            </Notice>

            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <label className={`${labelClassName} sm:col-span-2`} htmlFor="arc-promoted-claim-id">
                Promoted claim ID
                <input
                  aria-describedby="arc-promoted-claim-id-error"
                  aria-invalid={errors.claimId ? "true" : undefined}
                  className={`${inputClassName} font-mono`}
                  id="arc-promoted-claim-id"
                  placeholder="UUID"
                  {...register("claimId", {
                    required: mode === "promotion" ? "Enter a promoted claim ID." : false,
                  })}
                />
                <FieldErrorMessage
                  id="arc-promoted-claim-id-error"
                  message={errors.claimId?.message}
                />
              </label>

              <label className={labelClassName} htmlFor="arc-promotion-source-system">
                Upstream system
                <input
                  aria-describedby="arc-promotion-source-system-error"
                  aria-invalid={errors.sourceSystem ? "true" : undefined}
                  className={inputClassName}
                  id="arc-promotion-source-system"
                  placeholder="bitbucket.org/acme/adr"
                  {...register("sourceSystem", {
                    required: mode === "promotion" ? "Enter the upstream system." : false,
                  })}
                />
                <FieldErrorMessage
                  id="arc-promotion-source-system-error"
                  message={errors.sourceSystem?.message}
                />
              </label>

              <label className={labelClassName} htmlFor="arc-promotion-review-expires">
                Review by
                <input
                  aria-describedby="arc-promotion-review-expires-error"
                  aria-invalid={errors.reviewExpiresAt ? "true" : undefined}
                  className={inputClassName}
                  id="arc-promotion-review-expires"
                  type="datetime-local"
                  {...register("reviewExpiresAt", {
                    required:
                      mode === "promotion" ? "Choose when this citation is revisited." : false,
                  })}
                />
                <FieldErrorMessage
                  id="arc-promotion-review-expires-error"
                  message={errors.reviewExpiresAt?.message}
                />
              </label>
            </div>

            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Admitting\u2026" : "Admit promoted claim"}
            </Button>
          </>
        ) : mode === "existing" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className={`${labelClassName} min-w-0 flex-1`} htmlFor="arc-source-evidence-id">
              Source evidence ID
              <input
                aria-describedby="arc-source-evidence-id-error"
                aria-invalid={errors.sourceEvidenceId ? "true" : undefined}
                className={`${inputClassName} font-mono`}
                id="arc-source-evidence-id"
                placeholder="UUID"
                {...register("sourceEvidenceId", { required: "Enter a source evidence ID." })}
              />
              <FieldErrorMessage
                id="arc-source-evidence-id-error"
                message={errors.sourceEvidenceId?.message}
              />
            </label>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? "Checking…" : "Use evidence"}
            </Button>
          </div>
        ) : (
          <>
            <Notice title="Proof is produced outside the browser" variant="warning">
              This form transports a verifier signature or attestation. It never creates or stores
              signing keys. The service verifies the proof before admitting source bytes.
            </Notice>

            <fieldset className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              <legend className="sr-only">Immutable source</legend>
              {mode === "upload" ? (
                <label
                  className={`${labelClassName} sm:col-span-2 lg:col-span-3`}
                  htmlFor="arc-source-file"
                >
                  Approved source file
                  <span className={`${inputClassName} flex cursor-pointer items-center gap-2`}>
                    <Upload aria-hidden="true" className="size-4" />
                    <span className="truncate">
                      {uploadFile?.name ?? "Choose file (10 MiB maximum)"}
                    </span>
                  </span>
                  <input
                    aria-describedby="arc-source-file-error"
                    aria-invalid={errors.root?.file ? "true" : undefined}
                    className="sr-only"
                    id="arc-source-file"
                    onChange={(event) => setUploadFile(event.currentTarget.files?.[0] ?? null)}
                    type="file"
                  />
                  {errors.root?.file?.message ? (
                    <span className={errorClassName} id="arc-source-file-error" role="alert">
                      {errors.root.file.message}
                    </span>
                  ) : null}
                </label>
              ) : (
                <label className={labelClassName} htmlFor="arc-connector-id">
                  Registered connector ID
                  <input
                    aria-describedby="arc-connector-id-error"
                    aria-invalid={errors.connectorId ? "true" : undefined}
                    className={inputClassName}
                    id="arc-connector-id"
                    {...register("connectorId", {
                      required: mode === "connector" ? "Enter a registered connector ID." : false,
                    })}
                  />
                  <FieldErrorMessage
                    id="arc-connector-id-error"
                    message={errors.connectorId?.message}
                  />
                </label>
              )}
              <label className={labelClassName} htmlFor="arc-source-system">
                Source system
                <input
                  aria-describedby="arc-source-system-error"
                  aria-invalid={errors.sourceSystem ? "true" : undefined}
                  className={inputClassName}
                  id="arc-source-system"
                  placeholder="policy-repository"
                  {...register("sourceSystem", { required: "Enter the source system." })}
                />
                <FieldErrorMessage
                  id="arc-source-system-error"
                  message={errors.sourceSystem?.message}
                />
              </label>
              <label className={labelClassName} htmlFor="arc-source-revision">
                Immutable revision locator
                {/* The other system's name for the commit this evidence was taken from.
                    ADR 0018 names this class in its own text.
                    identifier-exception: external-locator */}
                <input
                  aria-describedby="arc-source-revision-error"
                  aria-invalid={errors.sourceRevisionLocator ? "true" : undefined}
                  className={inputClassName}
                  id="arc-source-revision"
                  placeholder="commit:abc123"
                  {...register("sourceRevisionLocator", {
                    required: "Enter the immutable revision.",
                  })}
                />
                <FieldErrorMessage
                  id="arc-source-revision-error"
                  message={errors.sourceRevisionLocator?.message}
                />
              </label>
              <label className={labelClassName} htmlFor="arc-source-content-type">
                Content type
                <input
                  aria-describedby="arc-source-content-type-error"
                  aria-invalid={errors.sourceContentType ? "true" : undefined}
                  className={inputClassName}
                  id="arc-source-content-type"
                  {...register("sourceContentType", { required: "Enter the content type." })}
                />
                <FieldErrorMessage
                  id="arc-source-content-type-error"
                  message={errors.sourceContentType?.message}
                />
              </label>
              {mode === "connector" ? (
                <label className={`${labelClassName} sm:col-span-2`} htmlFor="arc-source-digest">
                  Expected content digest
                  {/* Asserted about bytes not yet fetched, which is the whole point: offering
                      a list of digests the system already holds would defeat the constraint.
                      identifier-exception: asserted-digest */}
                  <input
                    aria-describedby="arc-source-digest-error"
                    aria-invalid={errors.sourceContentDigest ? "true" : undefined}
                    className={`${inputClassName} font-mono`}
                    id="arc-source-digest"
                    placeholder="64-character SHA-256 digest"
                    {...register("sourceContentDigest", {
                      pattern: {
                        message: "Enter a lowercase SHA-256 digest.",
                        value: /^[0-9a-f]{64}$/,
                      },
                      required: "Enter the expected source digest.",
                    })}
                  />
                  <FieldErrorMessage
                    id="arc-source-digest-error"
                    message={errors.sourceContentDigest?.message}
                  />
                </label>
              ) : null}
              {mode === "upload" ? (
                <label className={labelClassName} htmlFor="arc-source-policy-id">
                  Admission policy ID
                  <input
                    aria-describedby="arc-source-policy-id-error"
                    aria-invalid={errors.policyId ? "true" : undefined}
                    className={inputClassName}
                    id="arc-source-policy-id"
                    {...register("policyId", { required: "Enter the admission policy ID." })}
                  />
                  <FieldErrorMessage
                    id="arc-source-policy-id-error"
                    message={errors.policyId?.message}
                  />
                </label>
              ) : null}
            </fieldset>

            <fieldset className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              <legend className="mb-2 text-sm font-semibold text-foreground">Approval claim</legend>
              <label className={labelClassName} htmlFor="arc-approval-locator">
                Approval locator
                {/* Where the approval lives in the approving system. This one cannot list
                    another system's records.
                    identifier-exception: external-locator */}
                <input
                  aria-describedby="arc-approval-locator-error"
                  aria-invalid={errors.approvalLocator ? "true" : undefined}
                  className={inputClassName}
                  id="arc-approval-locator"
                  {...register("approvalLocator", { required: "Enter the approval locator." })}
                />
                <FieldErrorMessage
                  id="arc-approval-locator-error"
                  message={errors.approvalLocator?.message}
                />
              </label>
              <label className={labelClassName} htmlFor="arc-approval-scope">
                Approval scope
                <input
                  aria-describedby="arc-approval-scope-error"
                  aria-invalid={errors.approvalScope ? "true" : undefined}
                  className={inputClassName}
                  id="arc-approval-scope"
                  {...register("approvalScope", { required: "Enter the approved scope." })}
                />
                <FieldErrorMessage
                  id="arc-approval-scope-error"
                  message={errors.approvalScope?.message}
                />
              </label>
              <label className={labelClassName} htmlFor="arc-verifier-id">
                Verifier ID
                <input
                  aria-describedby="arc-verifier-id-error"
                  aria-invalid={errors.verifierId ? "true" : undefined}
                  className={inputClassName}
                  id="arc-verifier-id"
                  {...register("verifierId", { required: "Enter the enrolled verifier ID." })}
                />
                <FieldErrorMessage
                  id="arc-verifier-id-error"
                  message={errors.verifierId?.message}
                />
              </label>
              <label className={labelClassName} htmlFor="arc-authority-issuer">
                Authority issuer
                <input
                  aria-describedby="arc-authority-issuer-error"
                  aria-invalid={errors.approvingAuthorityIssuer ? "true" : undefined}
                  className={inputClassName}
                  id="arc-authority-issuer"
                  {...register("approvingAuthorityIssuer", {
                    required: "Enter the authority issuer.",
                  })}
                />
                <FieldErrorMessage
                  id="arc-authority-issuer-error"
                  message={errors.approvingAuthorityIssuer?.message}
                />
              </label>
              <label className={labelClassName} htmlFor="arc-authority-subject">
                Authority subject
                {/* Half of an IdP-issued pair with the issuer above. Matched as a pair, and
                    no collection of external authorities exists to enumerate.
                    identifier-exception: external-id */}
                <input
                  aria-describedby="arc-authority-subject-error"
                  aria-invalid={errors.approvingAuthoritySubject ? "true" : undefined}
                  className={inputClassName}
                  id="arc-authority-subject"
                  {...register("approvingAuthoritySubject", {
                    required: "Enter the authority subject.",
                  })}
                />
                <FieldErrorMessage
                  id="arc-authority-subject-error"
                  message={errors.approvingAuthoritySubject?.message}
                />
              </label>
              <label className={labelClassName} htmlFor="arc-approved-at">
                Approved at
                <input
                  aria-describedby="arc-approved-at-error"
                  aria-invalid={errors.approvedAt ? "true" : undefined}
                  className={inputClassName}
                  id="arc-approved-at"
                  type="datetime-local"
                  {...register("approvedAt", { required: "Enter the approval time." })}
                />
                <FieldErrorMessage
                  id="arc-approved-at-error"
                  message={errors.approvedAt?.message}
                />
              </label>
              <label className={labelClassName} htmlFor="arc-approval-expires">
                Approval expires
                <input
                  aria-describedby="arc-approval-expires-error"
                  aria-invalid={errors.expiresAt ? "true" : undefined}
                  className={inputClassName}
                  id="arc-approval-expires"
                  type="datetime-local"
                  {...register("expiresAt", { required: "Enter the approval expiry." })}
                />
                <FieldErrorMessage
                  id="arc-approval-expires-error"
                  message={errors.expiresAt?.message}
                />
              </label>
            </fieldset>

            <fieldset className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              <legend className="mb-2 text-sm font-semibold text-foreground">External proof</legend>
              <Controller
                control={control}
                name="proofMethod"
                render={({ field }) => (
                  <SearchableSelect
                    allowEmpty={false}
                    label="Verification method"
                    onValueChange={field.onChange}
                    options={arcProofMethodOptions}
                    value={field.value}
                  />
                )}
              />
              {proofMethod === "detached_signature" ? (
                <label className={`${labelClassName} sm:col-span-2`} htmlFor="arc-signature">
                  Signature (base64)
                  <textarea
                    aria-describedby="arc-signature-error"
                    aria-invalid={errors.signatureBase64 ? "true" : undefined}
                    className={`${inputClassName} min-h-24 resize-y font-mono`}
                    id="arc-signature"
                    {...register("signatureBase64", { required: "Paste the external signature." })}
                  />
                  <FieldErrorMessage
                    id="arc-signature-error"
                    message={errors.signatureBase64?.message}
                  />
                </label>
              ) : (
                <>
                  <label className={labelClassName} htmlFor="arc-provider-id">
                    Provider ID
                    {/* The attestation provider's own id, in its id space rather than this one's.
                        identifier-exception: external-id */}
                    <input
                      aria-describedby="arc-provider-id-error"
                      aria-invalid={errors.providerId ? "true" : undefined}
                      className={inputClassName}
                      id="arc-provider-id"
                      {...register("providerId", { required: "Enter the provider ID." })}
                    />
                    <FieldErrorMessage
                      id="arc-provider-id-error"
                      message={errors.providerId?.message}
                    />
                  </label>
                  <label className={labelClassName} htmlFor="arc-assertion-format">
                    Assertion format
                    <input
                      aria-describedby="arc-assertion-format-error"
                      aria-invalid={errors.assertionFormat ? "true" : undefined}
                      className={inputClassName}
                      id="arc-assertion-format"
                      {...register("assertionFormat", { required: "Enter the assertion format." })}
                    />
                    <FieldErrorMessage
                      id="arc-assertion-format-error"
                      message={errors.assertionFormat?.message}
                    />
                  </label>
                  <label className={`${labelClassName} sm:col-span-2`} htmlFor="arc-assertion">
                    Assertion (base64)
                    <textarea
                      aria-describedby="arc-assertion-error"
                      aria-invalid={errors.assertionBase64 ? "true" : undefined}
                      className={`${inputClassName} min-h-24 resize-y font-mono`}
                      id="arc-assertion"
                      {...register("assertionBase64", {
                        required: "Paste the external assertion.",
                      })}
                    />
                    <FieldErrorMessage
                      id="arc-assertion-error"
                      message={errors.assertionBase64?.message}
                    />
                  </label>
                </>
              )}
            </fieldset>

            <div className="flex justify-end border-t border-border pt-5">
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Admitting evidence…" : "Admit and use evidence"}
              </Button>
            </div>
          </>
        )}
      </form>
    </SectionSurface>
  );
}
