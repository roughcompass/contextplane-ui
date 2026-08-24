import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, RefreshCw } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import { SectionSurface } from "@repo/ui/layouts";
import {
  Button,
  Notice,
  ResourcePicker,
  SearchableSelect,
  StatusBadge,
  useToast,
} from "@repo/ui/primitives";

import {
  createArcEnrollmentChallenge,
  enrolArcApprovalVerifier,
  getArcOperatorIdentity,
  revokeArcApprovalVerifier,
  type ArcApprovalVerifier,
  type ArcEnrollmentChallenge,
  type ArcEvidenceType,
  type ArcOwningScope,
  type ArcPrincipalBindingKind,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";
import { governancePickerSource } from "../../shared/arcGovernance/governancePickerSource";

interface VerifierEnrolmentPanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const fieldClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

const SCOPES: readonly { label: string; value: ArcOwningScope }[] = [
  { label: "Global — trusted across every tenant", value: "global" },
  { label: "Tenant — trusted for one tenant only", value: "tenant" },
];

const BINDINGS: readonly { label: string; value: ArcPrincipalBindingKind }[] = [
  { label: "Exact principal — one named subject", value: "exact_principal" },
  { label: "Provider delegated — anyone a provider vouches for", value: "provider_delegated" },
];

const EVIDENCE: readonly { label: string; value: ArcEvidenceType }[] = [
  { label: "Artifact activation", value: "artifact_activation" },
  { label: "Exception approval", value: "exception_approval" },
];

interface EnrolmentForm {
  binding: ArcPrincipalBindingKind | "";
  evidence: readonly ArcEvidenceType[];
  principalIssuer: string;
  principalSubject: string;
  providerAllowedIssuer: string;
  providerId: string;
  publicKey: string;
  scope: ArcOwningScope | "";
  targetTenantId: string;
  validFrom: string;
  validTo: string;
}

const EMPTY_FORM: EnrolmentForm = {
  binding: "",
  evidence: [],
  principalIssuer: "",
  principalSubject: "",
  providerAllowedIssuer: "",
  providerId: "",
  publicKey: "",
  scope: "",
  targetTenantId: "",
  validFrom: "",
  validTo: "",
};

/**
 * Whether the form has everything the service's own validator requires.
 *
 * Mirrored here rather than left to a 422 because the conditional halves are
 * not guessable from the fields: `exact_principal` requires issuer and subject
 * and *forbids* the provider pair, and `provider_delegated` is the reverse. An
 * operator who filled in all six would be refused with no way to tell which
 * three to clear.
 */
function missingFields(form: EnrolmentForm): readonly string[] {
  const missing: string[] = [];
  if (form.scope === "") missing.push("an owning scope");
  if (form.scope === "tenant" && form.targetTenantId.trim() === "") missing.push("a target tenant");
  if (form.binding === "") missing.push("a binding kind");
  if (form.binding === "exact_principal") {
    if (form.principalIssuer.trim() === "") missing.push("a principal issuer");
    if (form.principalSubject.trim() === "") missing.push("a principal subject");
  }
  if (form.binding === "provider_delegated") {
    if (form.providerId.trim() === "") missing.push("a provider");
    if (form.providerAllowedIssuer.trim() === "") missing.push("a provider-allowed issuer");
  }
  if (form.evidence.length === 0) missing.push("at least one evidence type");
  if (form.publicKey.trim() === "") missing.push("a public key");
  if (form.validFrom.trim() === "" || form.validTo.trim() === "") missing.push("a validity window");
  return missing;
}

export function VerifierEnrolmentPanel({ client, requestContext }: VerifierEnrolmentPanelProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<EnrolmentForm>(EMPTY_FORM);
  const [challenge, setChallenge] = useState<ArcEnrollmentChallenge | null>(null);
  const [signature, setSignature] = useState("");
  const [enrolled, setEnrolled] = useState<ArcApprovalVerifier | null>(null);
  const [revokeId, setRevokeId] = useState("");
  const [revokeCode, setRevokeCode] = useState("");
  const [revokeNote, setRevokeNote] = useState("");

  // Memoized on the client and the tenant, and the context is rebuilt inside
  // rather than closed over: the page constructs `requestContext` fresh on every
  // render, so depending on the object would rebuild the source every render —
  // throwing away the collection it holds, re-requesting on every keystroke, and
  // changing the identity of the `load` the picker's effect depends on.
  const tenantId = requestContext.tenantId;
  const verifierSource = useMemo(
    () => governancePickerSource(client, "approvalVerifiers", tenantId ? { tenantId } : {}),
    [client, tenantId],
  );

  const identity = useQuery({
    queryFn: () => getArcOperatorIdentity(client, requestContext),
    queryKey: ["arc-operator-identity", requestContext.tenantId ?? null],
  });

  const challengeMutation = useMutation({
    mutationFn: () =>
      createArcEnrollmentChallenge(
        client,
        {
          binding_kind: form.binding as ArcPrincipalBindingKind,
          evidence_types: form.evidence,
          owning_scope: form.scope as ArcOwningScope,
          public_key_base64: form.publicKey.trim(),
          signature_algorithm: "Ed25519",
          valid_from: new Date(form.validFrom).toISOString(),
          valid_to: new Date(form.validTo).toISOString(),
          ...(form.binding === "exact_principal"
            ? {
                principal_issuer: form.principalIssuer.trim(),
                principal_subject: form.principalSubject.trim(),
              }
            : {
                provider_allowed_principal_issuer: form.providerAllowedIssuer.trim(),
                provider_id: form.providerId.trim(),
              }),
          ...(form.scope === "tenant" ? { target_tenant_id: form.targetTenantId.trim() } : {}),
        },
        requestContext,
      ),
    onSuccess: setChallenge,
  });

  const enrolMutation = useMutation({
    mutationFn: (current: ArcEnrollmentChallenge) =>
      enrolArcApprovalVerifier(
        client,
        {
          enrollment_challenge_id: current.enrollment_challenge_id,
          proof: {
            signature_algorithm: "Ed25519",
            signature_base64: signature.trim(),
            verification_method: "detached_signature",
          },
        },
        requestContext,
      ),
    onSuccess: (verifier) => {
      showToast({ title: "Verifier enrolled", variant: "success" });
      setEnrolled(verifier);
      setChallenge(null);
      setSignature("");
      setForm(EMPTY_FORM);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () =>
      revokeArcApprovalVerifier(
        client,
        revokeId.trim(),
        {
          reason_code: revokeCode.trim(),
          ...(revokeNote.trim() === "" ? {} : { note: revokeNote.trim() }),
        },
        requestContext,
      ),
    onSuccess: () => {
      showToast({ title: "Verifier revoked", variant: "success" });
      setRevokeId("");
      setRevokeCode("");
      setRevokeNote("");
    },
  });

  const missing = missingFields(form);

  function update<K extends keyof EnrolmentForm>(key: K, value: EnrolmentForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function requestChallenge(event: FormEvent) {
    event.preventDefault();
    if (missing.length === 0) challengeMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <SectionSurface
        description="Read before attempting a governance write rather than after one."
        title="This deployment, and you"
      >
        <div className="space-y-3 px-6 py-4">
          {identity.isPending ? (
            <p className="text-sm text-muted">Checking…</p>
          ) : identity.data ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={identity.data.is_global_operator ? "success" : "neutral"}>
                  {identity.data.is_global_operator
                    ? "Deployment operator"
                    : "Not a deployment operator"}
                </StatusBadge>
                <span className="text-xs text-muted">
                  Allowlist fingerprint{" "}
                  <code className="text-xs">{identity.data.allowlist_fingerprint}</code>
                </span>
              </div>
              {identity.data.is_global_operator ? null : (
                <p className="text-xs text-muted">
                  Global-scope enrolment will be refused. The fingerprint identifies the allowlist
                  without disclosing it, so two operators can confirm they are reading the same
                  deployment without either seeing who else is on it.
                </p>
              )}
              {identity.data.context_resolution_enabled ? null : (
                <Notice title="This deployment cannot sign receipts" variant="warning">
                  Context resolution is disabled, so resolution answers 503 rather than issuing a
                  receipt it could not stand behind. Verifiers enrolled here are still recorded, and
                  still cannot approve anything that needs a signed receipt.
                </Notice>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">This deployment did not answer.</p>
          )}

          {/* The entry's central point, and the one thing this screen must not
              imply. Actor separation is enforced across submitter, approver and
              activator by the proposal lifecycle — not between enrolling a
              verifier and later approving with it. Nothing prevents that, so
              the screen says so rather than looking like it does. */}
          <Notice title="Enrolling is not separated from approving" variant="info">
            The proposal lifecycle requires distinct principals for submitting, approving and
            activating a change. Verifier enrolment carries no such rule: the actor who enrols a
            verifier may later approve with it, and nothing here or in the service prevents that.
            Four-eyes over enrolment would be a service change.
          </Notice>
        </div>
      </SectionSurface>

      <SectionSurface
        description="Two steps. Requesting a challenge enrols nothing — it returns the bytes your verifier's key must sign."
        title="Enrol an approval verifier"
      >
        <form className="space-y-3 px-6 py-4" onSubmit={requestChallenge}>
          <div className="grid gap-3 md:grid-cols-2">
            <SearchableSelect
              emptyLabel="Choose an owning scope…"
              label="Owning scope"
              onValueChange={(value) => update("scope", value as ArcOwningScope)}
              options={SCOPES.map((entry) => ({ label: entry.label, value: entry.value }))}
              value={form.scope}
            />
            {form.scope === "tenant" ? (
              <label className="text-xs font-medium text-muted" htmlFor="verifier-tenant">
                Target tenant
                <input
                  className={fieldClassName}
                  id="verifier-tenant"
                  onChange={(event) => update("targetTenantId", event.target.value)}
                  value={form.targetTenantId}
                />
              </label>
            ) : null}
            <SearchableSelect
              emptyLabel="Choose a binding kind…"
              label="Binding kind"
              onValueChange={(value) => update("binding", value as ArcPrincipalBindingKind)}
              options={BINDINGS.map((entry) => ({ label: entry.label, value: entry.value }))}
              value={form.binding}
            />
          </div>

          {/* Shown by binding kind rather than all at once: the service forbids
              the provider pair on an exact binding, so offering all four fields
              invites a refusal that names a field the operator was given. */}
          {form.binding === "exact_principal" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-muted" htmlFor="verifier-issuer">
                Principal issuer
                <input
                  className={fieldClassName}
                  id="verifier-issuer"
                  onChange={(event) => update("principalIssuer", event.target.value)}
                  value={form.principalIssuer}
                />
              </label>
              <label className="text-xs font-medium text-muted" htmlFor="verifier-subject">
                Principal subject
                <input
                  className={fieldClassName}
                  id="verifier-subject"
                  onChange={(event) => update("principalSubject", event.target.value)}
                  value={form.principalSubject}
                />
              </label>
            </div>
          ) : null}
          {form.binding === "provider_delegated" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-muted" htmlFor="verifier-provider">
                Provider
                <input
                  className={fieldClassName}
                  id="verifier-provider"
                  onChange={(event) => update("providerId", event.target.value)}
                  value={form.providerId}
                />
              </label>
              <label className="text-xs font-medium text-muted" htmlFor="verifier-allowed-issuer">
                Provider-allowed issuer
                <input
                  className={fieldClassName}
                  id="verifier-allowed-issuer"
                  onChange={(event) => update("providerAllowedIssuer", event.target.value)}
                  value={form.providerAllowedIssuer}
                />
              </label>
            </div>
          ) : null}

          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-muted">Trusted for</legend>
            {EVIDENCE.map((entry) => (
              <label className="flex items-center gap-2 text-sm text-foreground" key={entry.value}>
                <input
                  checked={form.evidence.includes(entry.value)}
                  onChange={(event) =>
                    update(
                      "evidence",
                      event.target.checked
                        ? [...form.evidence, entry.value]
                        : form.evidence.filter((value) => value !== entry.value),
                    )
                  }
                  type="checkbox"
                />
                {entry.label}
              </label>
            ))}
          </fieldset>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-xs font-medium text-muted" htmlFor="verifier-public-key">
              Public key (base64)
              <input
                className={fieldClassName}
                id="verifier-public-key"
                onChange={(event) => update("publicKey", event.target.value)}
                value={form.publicKey}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="verifier-valid-from">
              Valid from
              <input
                className={fieldClassName}
                id="verifier-valid-from"
                onChange={(event) => update("validFrom", event.target.value)}
                type="datetime-local"
                value={form.validFrom}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="verifier-valid-to">
              Valid to
              <input
                className={fieldClassName}
                id="verifier-valid-to"
                onChange={(event) => update("validTo", event.target.value)}
                type="datetime-local"
                value={form.validTo}
              />
            </label>
          </div>
          <p className="text-xs text-muted">
            Ed25519, and only Ed25519 — the service accepts no other algorithm. The key here is the{" "}
            <strong>public</strong> half. Nothing on this screen asks for, generates or transports a
            private key: the signature below is produced wherever that key already lives.
          </p>

          {missing.length > 0 ? (
            <p className="text-xs text-muted">Still needs {missing.join(", ")}.</p>
          ) : null}
          <Button disabled={missing.length > 0 || challengeMutation.isPending} type="submit">
            {challengeMutation.isPending ? (
              <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            Request a signing challenge
          </Button>
        </form>

        {challenge ? (
          <div className="space-y-3 border-t border-border-subtle px-6 py-4">
            <Notice title="Sign these bytes where the key lives" variant="info">
              Signing domain <code className="text-xs">{challenge.signing_domain}</code>. The
              challenge expires at {challenge.expires_at}; after that, enrolment restarts from the
              form above.
            </Notice>
            <div>
              <p className="text-xs font-medium text-muted">Canonical enrolment bytes (base64)</p>
              <code className="mt-1 block break-all rounded-md border border-border bg-surface-muted p-3 text-xs">
                {challenge.canonical_enrollment_bytes_base64}
              </code>
            </div>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (signature.trim() !== "") enrolMutation.mutate(challenge);
              }}
            >
              <label className="block text-xs font-medium text-muted" htmlFor="verifier-signature">
                Detached signature (base64)
                <input
                  className={fieldClassName}
                  id="verifier-signature"
                  onChange={(event) => setSignature(event.target.value)}
                  value={signature}
                />
              </label>
              <Button
                disabled={signature.trim() === "" || enrolMutation.isPending}
                type="submit"
                variant="primary"
              >
                <KeyRound aria-hidden="true" className="size-4" />
                Complete enrolment
              </Button>
            </form>
          </div>
        ) : null}

        {enrolled ? (
          <div className="border-t border-border-subtle px-6 py-4">
            {/* Not a receipt an operator can go back and look up. Nothing lists
                verifiers, so this render is the only place the id appears. */}
            <Notice title="Record this identifier now" variant="warning">
              <code className="text-xs">{enrolled.approval_verifier_id}</code> is enrolled for{" "}
              {enrolled.evidence_types.join(", ")} until {enrolled.valid_to}, with credential
              fingerprint <code className="text-xs">{enrolled.credential_fingerprint}</code>.
              <span className="mt-1 block">
                There is no directory of enrolled verifiers. This screen cannot show it to you
                again, and revoking it later needs this identifier.
              </span>
            </Notice>
          </div>
        ) : null}
      </SectionSurface>

      <SectionSurface
        description="Ends a verifier's authority. Approvals it already gave stand; it gives no more."
        title="Revoke a verifier"
      >
        <form
          className="space-y-3 px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (revokeId.trim() !== "" && revokeCode.trim() !== "") revokeMutation.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {/* ADR 0018: a field whose value is a server-assigned identifier is
                chosen from a list, never typed. It matters most here — an
                operator revoking the wrong verifier ends the wrong person's
                approval authority, and a UUID typed from memory is exactly how
                that happens. Only verifiers in force are offered: revoking one
                already revoked is a no-op the service would refuse, and
                offering it invites the attempt. */}
            <ResourcePicker
              label="Approval verifier"
              load={verifierSource.load}
              onValueChange={setRevokeId}
              resolve={verifierSource.resolve}
              searchPlaceholder="Search enrolled verifiers"
              value={revokeId}
            />
            <label className="text-xs font-medium text-muted" htmlFor="revoke-reason-code">
              Reason code
              <input
                className={fieldClassName}
                id="revoke-reason-code"
                onChange={(event) => setRevokeCode(event.target.value)}
                value={revokeCode}
              />
            </label>
          </div>
          <label className="block text-xs font-medium text-muted" htmlFor="revoke-note">
            Note (optional)
            <input
              className={fieldClassName}
              id="revoke-note"
              onChange={(event) => setRevokeNote(event.target.value)}
              value={revokeNote}
            />
          </label>
          <p className="text-xs text-muted">
            Pasted rather than chosen from a list because the service exposes no way to enumerate
            enrolled verifiers. An identifier not written down at enrolment has to be recovered from
            the audit log.
          </p>
          <Button
            disabled={
              revokeId.trim() === "" || revokeCode.trim() === "" || revokeMutation.isPending
            }
            type="submit"
            variant="danger"
          >
            Revoke this verifier
          </Button>
        </form>
      </SectionSurface>
    </div>
  );
}
