import { CheckCircle2, Copy, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, SearchableSelect, StatusBadge } from "@repo/ui/primitives";

import { arcImpactDeltaOptions, arcProofMethodOptions } from "./arcModel";

import {
  acceptArcQualification,
  activateArcRevision,
  completeArcApprovalChallenge,
  confirmArcProposalReach,
  createArcApprovalChallenge,
  getArcObservation,
  getArcReviewPackageSummary,
  getArcRevisionActivationEligibility,
  qualifyArcProposal,
  rejectArcProposal,
  runArcSemanticTests,
  submitArcProposal,
  supersedeArcProposal,
  withdrawArcProposal,
  type ArcActivationEligibility,
  type ArcApprovalProof,
  type ArcApprovalChallenge,
  type ArcObservationStatus,
  type ArcProjectionApprovalEvidence,
  type ArcQualification,
  type ArcReviewPackageSummary,
  type ArcSemanticTestResult,
} from "../../shared/api/arcAuthoring";
import type { ContextplaneClient } from "../../shared/api/client";
import {
  getArcProposalVersion,
  validateArcProposalVersion,
  type ArcProposalVersion,
  type ArcValidationResult,
} from "../../shared/api/contextplane";

interface ArcLifecyclePanelProps {
  actorId: string;
  client: ContextplaneClient;
  onProposalChange: (proposal: ArcProposalVersion) => void;
  proposal: ArcProposalVersion;
  tenantId: string;
}

interface LifecycleFormValues {
  acknowledgedReasonCodes: string;
  approvalVerifierId: string;
  authorIssuer: string;
  authorSubject: string;
  impactActionClasses: string;
  impactDataSensitivity: string;
  impactDeltaCode:
    | "conflict_changed"
    | "mandatory_block_added"
    | "mandatory_block_removed"
    | "newly_selected"
    | "no_longer_selected";
  impactEnvironments: string;
  impactIntentKinds: string;
  impactMaximumCount: string;
  impactMinimumCount: number;
  impactRationaleCode: string;
  proofAssertionBase64: string;
  proofAssertionFormat: string;
  proofMethod: "detached_signature" | "verifier_attestation";
  proofProviderId: string;
  proofSignatureBase64: string;
  qualificationId: string;
  semanticManifest: string;
  transitionNote: string;
  transitionReasonCode: string;
}

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";
const labelClassName = "block text-xs font-medium text-muted";

function commaSeparated(value: string): string[] | null {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function actionTone(state: ArcProposalVersion["state"]) {
  if (state === "activated" || state === "approved") return "success" as const;
  if (state === "submitted") return "info" as const;
  if (state === "open") return "warning" as const;
  return "neutral" as const;
}

export function ArcLifecyclePanel({
  actorId,
  client,
  onProposalChange,
  proposal,
  tenantId,
}: ArcLifecyclePanelProps) {
  const context = { tenantId };
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [requestError, setRequestError] = useState("");
  const [validation, setValidation] = useState<ArcValidationResult | null>(null);
  const [testResults, setTestResults] = useState<readonly ArcSemanticTestResult[] | null>(null);
  const [reachConfirmed, setReachConfirmed] = useState(false);
  const [challenge, setChallenge] = useState<ArcApprovalChallenge | null>(null);
  const [reviewedPackage, setReviewedPackage] = useState<{
    proposal: ArcProposalVersion;
    summary: ArcReviewPackageSummary;
  } | null>(null);
  const reviewPackage = reviewedPackage?.proposal === proposal ? reviewedPackage.summary : null;
  const [approvalEvidence, setApprovalEvidence] = useState<ArcProjectionApprovalEvidence | null>(
    null,
  );
  const [observation, setObservation] = useState<ArcObservationStatus | null>(null);
  const [qualification, setQualification] = useState<ArcQualification | null>(null);
  const [eligibility, setEligibility] = useState<ArcActivationEligibility | null>(null);
  const { control, getValues, register } = useForm<LifecycleFormValues>({
    defaultValues: {
      acknowledgedReasonCodes: "",
      approvalVerifierId: "",
      authorIssuer: "",
      authorSubject: actorId,
      impactActionClasses: "",
      impactDataSensitivity: "",
      impactDeltaCode: "newly_selected",
      impactEnvironments: "",
      impactIntentKinds: "",
      impactMaximumCount: "",
      impactMinimumCount: 0,
      impactRationaleCode: "expected-policy-effect",
      proofAssertionBase64: "",
      proofAssertionFormat: "",
      proofMethod: "detached_signature",
      proofProviderId: "",
      proofSignatureBase64: "",
      qualificationId: "",
      semanticManifest: JSON.stringify(
        {
          entity_ids: null,
          data_sensitivity_tier: null,
          domain_ids: null,
          environment: null,
          intent_kind: null,
          profile: "arc_observation_class_predicate_v2",
          requested_action_classes: null,
        },
        null,
        2,
      ),
      transitionNote: "",
      transitionReasonCode: "operator-decision",
    },
  });
  const proofMethod = useWatch({ control, name: "proofMethod" });

  async function run<T>(label: string, operation: () => Promise<T>): Promise<T | null> {
    setPendingAction(label);
    setRequestError("");
    try {
      return await operation();
    } catch {
      setRequestError(
        `The ${label} action was not completed. Review the service response and try again.`,
      );
      return null;
    } finally {
      setPendingAction(null);
    }
  }

  async function refreshProposal() {
    const next = await run("refresh", () =>
      getArcProposalVersion(client, proposal.proposal_id, proposal.proposal_version, context),
    );
    if (next) onProposalChange(next);
  }

  async function validateCandidate() {
    const result = await run("validation", () =>
      validateArcProposalVersion(client, proposal.proposal_id, proposal.proposal_version, context),
    );
    if (result) setValidation(result);
  }

  async function runTests() {
    let manifest: Readonly<Record<string, unknown>>;
    try {
      const candidate: unknown = JSON.parse(getValues("semanticManifest"));
      if (!isRecord(candidate)) {
        throw new Error("manifest must be an object");
      }
      manifest = candidate;
    } catch {
      setRequestError("The semantic test manifest must be a JSON object.");
      return;
    }
    const results = await run("semantic test", () =>
      runArcSemanticTests(
        client,
        proposal.proposal_id,
        proposal.proposal_version,
        [{ manifest, test_id: crypto.randomUUID() }],
        context,
      ),
    );
    if (results) setTestResults(results);
  }

  async function confirmReach() {
    const result = await run("reach confirmation", () =>
      confirmArcProposalReach(
        client,
        proposal.proposal_id,
        proposal.proposal_version,
        ["directives", "applicability"],
        context,
      ),
    );
    if (result) setReachConfirmed(true);
  }

  async function submitCandidate() {
    const values = getValues();
    if (!values.authorIssuer.trim() || !values.authorSubject.trim()) {
      setRequestError("Enter the authenticated author issuer and subject before submission.");
      return;
    }
    const maximumCount = values.impactMaximumCount.trim()
      ? Number(values.impactMaximumCount)
      : null;
    const next = await run("submission", () =>
      submitArcProposal(
        client,
        proposal.proposal_id,
        proposal.proposal_version,
        {
          expectedImpactEnvelope: {
            author_issuer: values.authorIssuer.trim(),
            author_subject: values.authorSubject.trim(),
            created_at: new Date().toISOString(),
            envelope_id: crypto.randomUUID(),
            items: [
              {
                class_predicate: {
                  entity_ids: null,
                  data_sensitivity_tier: commaSeparated(values.impactDataSensitivity),
                  domain_ids: null,
                  environment: commaSeparated(values.impactEnvironments),
                  intent_kind: commaSeparated(values.impactIntentKinds),
                  profile: "arc_observation_class_predicate_v2",
                  requested_action_classes: commaSeparated(values.impactActionClasses),
                },
                delta_code: values.impactDeltaCode,
                item_id: crypto.randomUUID(),
                maximum_count: maximumCount,
                minimum_count: values.impactMinimumCount,
                rationale_code: values.impactRationaleCode,
              },
            ],
            profile: "arc_expected_impact_envelope_v2",
            proposal_id: proposal.proposal_id,
            proposal_version: proposal.proposal_version,
          },
        },
        context,
      ),
    );
    if (next) onProposalChange(next);
  }

  async function issueChallenge() {
    const verifierId = getValues("approvalVerifierId").trim();
    if (!verifierId) {
      setRequestError("Enter the enrolled approval verifier ID.");
      return;
    }
    const next = await run("approval challenge", () =>
      createArcApprovalChallenge(
        client,
        proposal.proposal_id,
        proposal.proposal_version,
        verifierId,
        crypto.randomUUID(),
        context,
      ),
    );
    if (next) setChallenge(next);
  }

  async function loadReviewPackage() {
    const result = await run("review package", () =>
      getArcReviewPackageSummary(client, proposal.proposal_id, proposal.proposal_version, context),
    );
    if (result) setReviewedPackage({ proposal, summary: result });
  }

  async function completeChallenge() {
    if (!challenge) return;
    const values = getValues();
    const proof: ArcApprovalProof =
      values.proofMethod === "detached_signature"
        ? {
            signature_algorithm: "Ed25519",
            signature_base64: values.proofSignatureBase64,
            verification_method: "detached_signature",
          }
        : {
            assertion_base64: values.proofAssertionBase64,
            assertion_format: values.proofAssertionFormat,
            provider_id: values.proofProviderId,
            verification_method: "verifier_attestation",
          };
    const evidence = await run("approval completion", () =>
      completeArcApprovalChallenge(client, challenge.approval_challenge_id, proof, context),
    );
    if (!evidence) return;
    setApprovalEvidence(evidence);
    await refreshProposal();
  }

  async function loadObservation() {
    const result = await run("observation status", () =>
      getArcObservation(client, proposal.proposal_id, proposal.proposal_version, context),
    );
    if (result) setObservation(result);
  }

  async function qualify() {
    const result = await run("qualification", () =>
      qualifyArcProposal(client, proposal.proposal_id, proposal.proposal_version, context),
    );
    if (result) setQualification(result);
  }

  async function acceptQualification() {
    const qualificationId = qualification?.qualification_id ?? getValues("qualificationId").trim();
    if (!qualificationId) {
      setRequestError("Enter or compute a qualification before accepting it.");
      return;
    }
    const result = await run("qualification acceptance", () =>
      acceptArcQualification(
        client,
        proposal.proposal_id,
        proposal.proposal_version,
        qualificationId,
        commaSeparated(getValues("acknowledgedReasonCodes")) ?? [],
        context,
      ),
    );
    if (result) setQualification(result);
  }

  async function checkEligibility() {
    if (!proposal.revision_id) return;
    const result = await run("activation eligibility", () =>
      getArcRevisionActivationEligibility(client, proposal.revision_id ?? "", context),
    );
    if (result) setEligibility(result);
  }

  async function activate() {
    if (!proposal.revision_id) return;
    const qualificationId = qualification?.qualification_id ?? getValues("qualificationId").trim();
    const revision = await run("activation", () =>
      activateArcRevision(
        client,
        proposal.revision_id ?? "",
        proposal.proposal_id,
        proposal.proposal_version,
        qualificationId || null,
        context,
      ),
    );
    if (revision) await refreshProposal();
  }

  async function transition(action: "reject" | "supersede" | "withdraw") {
    const values = getValues();
    const operation = {
      reject: rejectArcProposal,
      supersede: supersedeArcProposal,
      withdraw: withdrawArcProposal,
    }[action];
    const next = await run(action, () =>
      operation(
        client,
        proposal.proposal_id,
        proposal.proposal_version,
        { note: values.transitionNote || null, reasonCode: values.transitionReasonCode },
        context,
      ),
    );
    if (next) onProposalChange(next);
  }

  return (
    <SectionSurface
      action={<StatusBadge tone={actionTone(proposal.state)}>{proposal.state}</StatusBadge>}
      description="Each gate records a distinct decision. The service, not the browser, enforces state transitions, identities, evidence, and activation predicates."
      id="arc-step-activation"
      title="5. Validate, approve, and activate"
    >
      {requestError ? (
        <Notice className="mb-5" title="Action not completed" variant="danger">
          {requestError}
        </Notice>
      ) : null}

      <div className="space-y-5">
        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Candidate checks</h3>
              <p className="mt-1 text-sm leading-6 text-muted">
                Validate stored semantics, run a representative match test, and confirm the reach
                you reviewed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  pendingAction !== null || !proposal.available_actions.includes("validate")
                }
                onClick={validateCandidate}
                size="compact"
                variant="secondary"
              >
                Validate
              </Button>
              <Button
                disabled={
                  pendingAction !== null || !proposal.available_actions.includes("confirm_reach")
                }
                onClick={confirmReach}
                size="compact"
                variant="secondary"
              >
                Confirm reach
              </Button>
            </div>
          </div>
          {validation ? (
            <Notice
              className="mt-4"
              title={validation.valid ? "Candidate is valid" : "Candidate needs changes"}
              variant={validation.valid ? "success" : "danger"}
            >
              {validation.valid
                ? "The persisted candidate passed structural and provenance validation."
                : validation.errors
                    .map((error) => `${error.field_path}: ${error.message}`)
                    .join(" · ")}
            </Notice>
          ) : null}
          {reachConfirmed ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-success">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Directive and applicability reach confirmed for this candidate.
            </p>
          ) : null}
          <label className={`${labelClassName} mt-5`} htmlFor="arc-semantic-manifest">
            Semantic test manifest
            <textarea
              className={`${inputClassName} min-h-40 resize-y font-mono text-xs leading-5`}
              id="arc-semantic-manifest"
              spellCheck={false}
              {...register("semanticManifest")}
            />
          </label>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              The manifest is an open predicate object by contract.
            </p>
            <Button
              disabled={
                pendingAction !== null || !proposal.available_actions.includes("run_semantic_tests")
              }
              onClick={runTests}
              size="compact"
              variant="secondary"
            >
              Run test
            </Button>
          </div>
          {testResults ? (
            <p className="mt-3 text-sm text-foreground">
              {testResults.every((result) => result.passed)
                ? "All semantic tests passed."
                : `${testResults.filter((result) => !result.passed).length} semantic test(s) failed.`}
            </p>
          ) : null}
        </section>

        <section className="border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-foreground">Submit expected impact</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            Submission freezes this version and declares the behavior change reviewers should
            observe.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <label className={labelClassName} htmlFor="arc-author-issuer">
              Authenticated author issuer
              <input
                className={inputClassName}
                id="arc-author-issuer"
                {...register("authorIssuer")}
              />
            </label>
            <label className={labelClassName} htmlFor="arc-author-subject">
              Authenticated author subject
              <input
                className={inputClassName}
                id="arc-author-subject"
                {...register("authorSubject")}
              />
            </label>
            <Controller
              control={control}
              name="impactDeltaCode"
              render={({ field }) => (
                <SearchableSelect
                  allowEmpty={false}
                  label="Expected delta"
                  onValueChange={field.onChange}
                  options={arcImpactDeltaOptions}
                  value={field.value}
                />
              )}
            />
            <label className={labelClassName} htmlFor="arc-impact-minimum">
              Minimum count
              <input
                className={inputClassName}
                id="arc-impact-minimum"
                min={0}
                type="number"
                {...register("impactMinimumCount", { valueAsNumber: true })}
              />
            </label>
            <label className={labelClassName} htmlFor="arc-impact-maximum">
              Maximum count (optional)
              <input
                className={inputClassName}
                id="arc-impact-maximum"
                min={0}
                type="number"
                {...register("impactMaximumCount")}
              />
            </label>
            <label className={labelClassName} htmlFor="arc-impact-rationale">
              Rationale code
              <input
                className={inputClassName}
                id="arc-impact-rationale"
                {...register("impactRationaleCode")}
              />
            </label>
            <label className={labelClassName} htmlFor="arc-impact-intents">
              Intent kinds
              <input
                className={inputClassName}
                id="arc-impact-intents"
                placeholder="deploy, operate"
                {...register("impactIntentKinds")}
              />
            </label>
            <label className={labelClassName} htmlFor="arc-impact-actions">
              Action classes
              <input
                className={inputClassName}
                id="arc-impact-actions"
                placeholder="production_change"
                {...register("impactActionClasses")}
              />
            </label>
            <label className={labelClassName} htmlFor="arc-impact-environments">
              Environments
              <input
                className={inputClassName}
                id="arc-impact-environments"
                placeholder="production"
                {...register("impactEnvironments")}
              />
            </label>
            <label className={labelClassName} htmlFor="arc-impact-sensitivity">
              Data sensitivity
              <input
                className={inputClassName}
                id="arc-impact-sensitivity"
                placeholder="restricted"
                {...register("impactDataSensitivity")}
              />
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              disabled={pendingAction !== null || !proposal.available_actions.includes("submit")}
              onClick={submitCandidate}
            >
              Submit for approval
            </Button>
          </div>
        </section>

        <section className="border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-foreground">External approval</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            The browser requests canonical bytes, then transports proof created by an enrolled
            verifier. It never handles private signing material.
          </p>
          <div className="mt-4 border-t border-border pt-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Authoritative review package
                </p>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
                  Read the service-generated policy summary, baseline changes, reach, impact, and
                  tests. The approval signature binds this package digest.
                </p>
              </div>
              <Button
                disabled={
                  pendingAction !== null || !proposal.available_actions.includes("request_approval")
                }
                onClick={loadReviewPackage}
                variant="secondary"
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Load review package
              </Button>
            </div>
            {reviewPackage ? (
              <div className="mt-4 space-y-4">
                <Notice title="Review before signing" variant="info">
                  Reload this package after any candidate change. Request canonical signing bytes
                  only after confirming the evidence below.
                </Notice>
                <div className="bg-surface-muted px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.04em] text-subtle">
                    Policy readback
                  </p>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {reviewPackage.prose_readback}
                  </p>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Risk", reviewPackage.risk_classification.replaceAll("_", " ")],
                    [
                      "Semantic tests",
                      `${reviewPackage.semantic_test_pass_count}/${reviewPackage.semantic_test_total_count} passed`,
                    ],
                    ["Expected impacts", String(reviewPackage.expected_impact_count)],
                    ["Reach confirmations", String(reviewPackage.reach_confirmation_count)],
                    ["Citations", String(reviewPackage.citation_count)],
                    ["Provenance records", String(reviewPackage.field_provenance_count)],
                    ["Judgment authors", String(reviewPackage.judgment_author_count)],
                    ["Baseline", reviewPackage.baseline_diff.baseline_revision_id ?? "New policy"],
                  ].map(([label, value]) => (
                    <div className="min-w-0 border-l-2 border-border pl-3" key={label}>
                      <dt className="text-xs text-subtle">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-medium capitalize text-foreground">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.04em] text-subtle">
                    Baseline changes
                  </p>
                  {reviewPackage.baseline_diff.changes.length ? (
                    <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                      {reviewPackage.baseline_diff.changes.map((change) => (
                        <li
                          className="space-y-3 px-3 py-3"
                          key={`${change.field_path}-${change.change_kind}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <code className="break-all text-xs text-foreground">
                              {change.field_path}
                            </code>
                            <StatusBadge
                              tone={change.change_kind === "removed" ? "warning" : "neutral"}
                            >
                              {change.change_kind}
                            </StatusBadge>
                          </div>
                          <dl className="grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0">
                              <dt className="text-xs font-medium text-subtle">Before</dt>
                              <dd className="mt-1">
                                {change.before ? (
                                  <pre className="max-h-40 overflow-auto bg-surface-muted p-2 text-xs leading-5 text-foreground">
                                    {JSON.stringify(change.before, null, 2)}
                                  </pre>
                                ) : (
                                  <span className="text-sm text-muted">Not present</span>
                                )}
                              </dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-xs font-medium text-subtle">Proposed</dt>
                              <dd className="mt-1">
                                {change.after ? (
                                  <pre className="max-h-40 overflow-auto bg-surface-muted p-2 text-xs leading-5 text-foreground">
                                    {JSON.stringify(change.after, null, 2)}
                                  </pre>
                                ) : (
                                  <span className="text-sm text-muted">Not present</span>
                                )}
                              </dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      No field-level changes from the baseline.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.04em] text-subtle">
                    Supporting citations
                  </p>
                  {reviewPackage.citations.length ? (
                    <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                      {reviewPackage.citations.map((citation) => (
                        <li
                          className="grid gap-2 px-3 py-3 sm:grid-cols-2"
                          key={`${citation.field_path}-${citation.source_anchor}`}
                        >
                          <div>
                            <p className="text-xs text-subtle">Candidate field</p>
                            <code className="mt-1 block break-all text-xs text-foreground">
                              {citation.field_path}
                            </code>
                          </div>
                          <div>
                            <p className="text-xs text-subtle">Approved source anchor</p>
                            <p className="mt-1 text-sm text-foreground">{citation.source_anchor}</p>
                            <code className="mt-1 block break-all text-xs text-muted">
                              {citation.source_evidence_id}
                            </code>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      No source citations were included in this package.
                    </p>
                  )}
                </div>
                <div className="grid gap-3 text-xs text-muted sm:grid-cols-2">
                  <p>
                    Review package digest
                    <code className="mt-1 block break-all text-foreground">
                      {reviewPackage.review_package_digest}
                    </code>
                  </p>
                  <p>
                    Revision digest
                    <code className="mt-1 block break-all text-foreground">
                      {reviewPackage.artifact_revision_digest}
                    </code>
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Load this package before requesting a signing challenge.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className={`${labelClassName} min-w-0 flex-1`} htmlFor="arc-approval-verifier">
              Approval verifier ID
              <input
                className={`${inputClassName} font-mono`}
                id="arc-approval-verifier"
                {...register("approvalVerifierId")}
              />
            </label>
            <Button
              disabled={
                pendingAction !== null ||
                !reviewPackage ||
                !proposal.available_actions.includes("request_approval")
              }
              onClick={issueChallenge}
              variant="secondary"
            >
              Request challenge
            </Button>
          </div>
          {challenge ? (
            <div className="mt-5 rounded-lg border border-info/25 bg-info-subtle p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    Challenge ready for external signing
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Domain {challenge.signing_domain} · expires{" "}
                    {new Date(challenge.expires_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  onClick={() =>
                    navigator.clipboard.writeText(challenge.canonical_evidence_bytes_base64)
                  }
                  size="compact"
                  variant="secondary"
                >
                  <Copy aria-hidden="true" className="size-4" />
                  Copy bytes
                </Button>
              </div>
              <textarea
                aria-label="Canonical evidence bytes"
                className={`${inputClassName} mt-4 min-h-24 resize-y font-mono text-xs`}
                readOnly
                value={challenge.canonical_evidence_bytes_base64}
              />
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="proofMethod"
                  render={({ field }) => (
                    <SearchableSelect
                      allowEmpty={false}
                      label="Proof method"
                      onValueChange={field.onChange}
                      options={arcProofMethodOptions}
                      value={field.value}
                    />
                  )}
                />
                {proofMethod === "detached_signature" ? (
                  <label className={labelClassName} htmlFor="arc-approval-signature">
                    Signature (base64)
                    <textarea
                      className={`${inputClassName} min-h-24 resize-y font-mono`}
                      id="arc-approval-signature"
                      {...register("proofSignatureBase64")}
                    />
                  </label>
                ) : (
                  <div className="grid gap-4">
                    <label className={labelClassName} htmlFor="arc-proof-provider">
                      Provider ID
                      <input
                        className={inputClassName}
                        id="arc-proof-provider"
                        {...register("proofProviderId")}
                      />
                    </label>
                    <label className={labelClassName} htmlFor="arc-proof-format">
                      Assertion format
                      <input
                        className={inputClassName}
                        id="arc-proof-format"
                        {...register("proofAssertionFormat")}
                      />
                    </label>
                    <label className={labelClassName} htmlFor="arc-proof-assertion">
                      Assertion (base64)
                      <textarea
                        className={`${inputClassName} min-h-24 resize-y font-mono`}
                        id="arc-proof-assertion"
                        {...register("proofAssertionBase64")}
                      />
                    </label>
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <Button disabled={pendingAction !== null} onClick={completeChallenge}>
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  Verify and record approval
                </Button>
              </div>
            </div>
          ) : null}
          {approvalEvidence ? (
            <Notice className="mt-4" title="Approval recorded" variant="success">
              Evidence {approvalEvidence.evidence_id} binds this draft revision to the verified
              approving principal.
            </Notice>
          ) : null}
        </section>

        <section className="border-t border-border pt-6">
          <h3 className="text-sm font-semibold text-foreground">Qualification and activation</h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            High-risk changes may require an observation decision. Eligibility shows every service
            predicate instead of guessing whether activation will succeed.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={pendingAction !== null}
              onClick={loadObservation}
              size="compact"
              variant="secondary"
            >
              Load observation
            </Button>
            <Button
              disabled={pendingAction !== null || !proposal.available_actions.includes("qualify")}
              onClick={qualify}
              size="compact"
              variant="secondary"
            >
              Compute qualification
            </Button>
            <Button
              disabled={
                pendingAction !== null ||
                !proposal.available_actions.includes("accept_qualification")
              }
              onClick={acceptQualification}
              size="compact"
              variant="secondary"
            >
              Accept qualification
            </Button>
          </div>
          {observation ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-surface p-3">
                <p className="text-xs text-muted">Decision</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {observation.computed_decision}
                </p>
              </div>
              <div className="rounded-md border border-border bg-surface p-3">
                <p className="text-xs text-muted">Observed / eligible</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {observation.observed_count} / {observation.eligible_count}
                </p>
              </div>
              <div className="rounded-md border border-border bg-surface p-3">
                <p className="text-xs text-muted">Outside envelope</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {observation.out_of_envelope_count}
                </p>
              </div>
            </div>
          ) : null}
          {qualification ? (
            <Notice
              className="mt-4"
              title={`Qualification ${qualification.decision}`}
              variant={qualification.decision === "qualified" ? "success" : "warning"}
            >
              Qualification ID: {qualification.qualification_id}
              {qualification.accepted_at ? " · accepted" : " · acceptance still required"}
            </Notice>
          ) : null}
          <label className={`${labelClassName} mt-5`} htmlFor="arc-qualification-id">
            Qualification ID (when required)
            <input
              className={`${inputClassName} font-mono`}
              id="arc-qualification-id"
              {...register("qualificationId")}
            />
          </label>
          <label className={`${labelClassName} mt-4`} htmlFor="arc-reason-codes">
            Acknowledged reason codes
            <input
              className={inputClassName}
              id="arc-reason-codes"
              placeholder="comma-separated"
              {...register("acknowledgedReasonCodes")}
            />
          </label>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              disabled={pendingAction !== null || !proposal.revision_id}
              onClick={checkEligibility}
              variant="secondary"
            >
              Check activation eligibility
            </Button>
            <Button
              disabled={
                pendingAction !== null ||
                !proposal.revision_id ||
                !proposal.available_actions.includes("activate") ||
                eligibility?.eligible !== true
              }
              onClick={activate}
            >
              Activate revision
            </Button>
          </div>
          {eligibility ? (
            <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Activation predicates</p>
                <StatusBadge tone={eligibility.eligible ? "success" : "warning"}>
                  {eligibility.eligible ? "Eligible" : "Blocked"}
                </StatusBadge>
              </div>
              <ul className="divide-y divide-border">
                {eligibility.predicates.map((predicate) => (
                  <li
                    key={predicate.name}
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                  >
                    <span className="text-foreground">{predicate.name.replaceAll("_", " ")}</span>
                    <span className={predicate.satisfied ? "text-success" : "text-warning"}>
                      {predicate.satisfied
                        ? "Satisfied"
                        : (predicate.reason_code ?? "Not satisfied")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <details className="border-t border-border pt-6">
          <summary className="cursor-pointer text-sm font-semibold text-foreground">
            Close or supersede this draft revision
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className={labelClassName} htmlFor="arc-transition-reason">
              Reason code
              <input
                className={inputClassName}
                id="arc-transition-reason"
                {...register("transitionReasonCode")}
              />
            </label>
            <label className={labelClassName} htmlFor="arc-transition-note">
              Note
              <input
                className={inputClassName}
                id="arc-transition-note"
                {...register("transitionNote")}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              disabled={
                pendingAction !== null || !proposal.allowed_transitions.includes("withdrawn")
              }
              onClick={() => transition("withdraw")}
              size="compact"
              variant="secondary"
            >
              Withdraw
            </Button>
            <Button
              disabled={
                pendingAction !== null || !proposal.allowed_transitions.includes("rejected")
              }
              onClick={() => transition("reject")}
              size="compact"
              variant="danger"
            >
              Reject
            </Button>
            <Button
              disabled={
                pendingAction !== null || !proposal.allowed_transitions.includes("superseded")
              }
              onClick={() => transition("supersede")}
              size="compact"
              variant="secondary"
            >
              Supersede
            </Button>
          </div>
        </details>

        <div className="flex justify-end">
          <Button
            disabled={pendingAction !== null}
            onClick={refreshProposal}
            size="compact"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Refresh version
          </Button>
        </div>
      </div>
    </SectionSurface>
  );
}
