import { useMutation } from "@tanstack/react-query";
import { FileWarning } from "lucide-react";
import { useState, type FormEvent } from "react";

import { SectionSurface } from "@repo/ui/layouts";
import { Button, Notice, useToast } from "@repo/ui/primitives";

import {
  grantArcException,
  revokeArcException,
  type ArcExceptionGrant,
  type ContextplaneClient,
  type ContextplaneRequestOptions,
} from "../../shared/api";

interface ExceptionGrantPanelProps {
  client: ContextplaneClient;
  requestContext: ContextplaneRequestOptions;
}

const fieldClassName =
  "mt-1.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-subtle focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

interface GrantForm {
  approvalTimestamp: string;
  approvedPayloadDigest: string;
  approvingPrincipal: string;
  approvingRole: string;
  auditLogReference: string;
  descriptor: string;
  directiveId: string;
  effectiveFrom: string;
  effectiveUntil: string;
  evidenceId: string;
  justification: string;
  lowerScopeKind: string;
  revisionId: string;
  statement: string;
  verifierId: string;
}

const EMPTY: GrantForm = {
  approvalTimestamp: "",
  approvedPayloadDigest: "",
  approvingPrincipal: "",
  approvingRole: "",
  auditLogReference: "",
  descriptor: "{}",
  directiveId: "",
  effectiveFrom: "",
  effectiveUntil: "",
  evidenceId: "",
  justification: "",
  lowerScopeKind: "",
  revisionId: "",
  statement: "",
  verifierId: "",
};

const REQUIRED: readonly (keyof GrantForm)[] = [
  "approvalTimestamp",
  "approvedPayloadDigest",
  "approvingPrincipal",
  "approvingRole",
  "auditLogReference",
  "directiveId",
  "effectiveFrom",
  "evidenceId",
  "justification",
  "lowerScopeKind",
  "revisionId",
  "statement",
  "verifierId",
];

export function ExceptionGrantPanel({ client, requestContext }: ExceptionGrantPanelProps) {
  const { showToast } = useToast();
  const [form, setForm] = useState<GrantForm>(EMPTY);
  const [descriptorError, setDescriptorError] = useState<string | null>(null);
  const [granted, setGranted] = useState<ArcExceptionGrant | null>(null);
  const [revokeId, setRevokeId] = useState("");
  const [revokeCode, setRevokeCode] = useState("");

  const grantMutation = useMutation({
    mutationFn: (descriptor: Readonly<Record<string, unknown>>) =>
      grantArcException(
        client,
        {
          approval: {
            approval_timestamp: new Date(form.approvalTimestamp).toISOString(),
            approval_verifier_id: form.verifierId.trim(),
            approved_payload_digest: form.approvedPayloadDigest.trim(),
            approving_principal: form.approvingPrincipal.trim(),
            approving_role: form.approvingRole.trim(),
            audit_log_reference: form.auditLogReference.trim(),
            evidence_id: form.evidenceId.trim(),
          },
          effective_from: new Date(form.effectiveFrom).toISOString(),
          exception_statement: form.statement.trim(),
          higher_scope_directive_id: form.directiveId.trim(),
          higher_scope_revision_id: form.revisionId.trim(),
          justification: form.justification.trim(),
          lower_scope_kind: form.lowerScopeKind.trim(),
          replacement_conflict_descriptor: descriptor,
          // Omitted rather than sent as null when blank: an absent field is the
          // contract's own way of saying "no end", and inventing a default
          // expiry here would turn a permanent deviation into a lapsing one.
          ...(form.effectiveUntil === ""
            ? {}
            : { effective_until: new Date(form.effectiveUntil).toISOString() }),
        },
        requestContext,
      ),
    onSuccess: (result) => {
      showToast({ title: "Exception granted", variant: "success" });
      setGranted(result);
      setForm(EMPTY);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: () =>
      revokeArcException(
        client,
        revokeId.trim(),
        { reason_code: revokeCode.trim() },
        requestContext,
      ),
    onSuccess: () => {
      showToast({ title: "Exception revoked", variant: "success" });
      setRevokeId("");
      setRevokeCode("");
    },
  });

  const missing = REQUIRED.filter((key) => form[key].trim() === "");
  const openEnded = form.effectiveUntil.trim() === "";

  function update<K extends keyof GrantForm>(key: K, value: GrantForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (missing.length > 0) return;
    let descriptor: unknown;
    try {
      descriptor = JSON.parse(form.descriptor);
    } catch {
      setDescriptorError("The replacement conflict descriptor is not valid JSON.");
      return;
    }
    if (typeof descriptor !== "object" || descriptor === null || Array.isArray(descriptor)) {
      setDescriptorError("The replacement conflict descriptor must be a JSON object.");
      return;
    }
    setDescriptorError(null);
    grantMutation.mutate(descriptor as Readonly<Record<string, unknown>>);
  }

  function textField(key: keyof GrantForm, label: string, id: string) {
    return (
      <label className="text-xs font-medium text-muted" htmlFor={id}>
        {label}
        <input
          className={fieldClassName}
          id={id}
          onChange={(event) => update(key, event.target.value)}
          value={form[key]}
        />
      </label>
    );
  }

  return (
    <div className="space-y-6">
      <SectionSurface
        description="An exception is a governed statement that a directive does not apply here, for a reason, until a date."
        title="Grant an exception"
      >
        <form className="space-y-4 px-6 py-4" onSubmit={submit}>
          {/* Not authorisation. Every field below names something that already
              exists, produced by the approval that actually happened. */}
          <Notice title="This form transcribes an approval, it does not make one" variant="info">
            The approval envelope below — evidence, verifier, digest, audit reference and timestamp
            — is produced by the approval itself, elsewhere. Nothing typed here approves anything;
            it records an approval that has already been given, so an auditor can find it later.
          </Notice>

          <div className="grid gap-3 md:grid-cols-2">
            {textField("directiveId", "Higher-scope directive", "exception-directive")}
            {textField("revisionId", "Higher-scope revision", "exception-revision")}
            {textField("lowerScopeKind", "Lower-scope kind", "exception-scope-kind")}
            {textField("effectiveFrom", "Effective from", "exception-from")}
          </div>

          <label className="block text-xs font-medium text-muted" htmlFor="exception-statement">
            Exception statement
            <input
              className={fieldClassName}
              id="exception-statement"
              onChange={(event) => update("statement", event.target.value)}
              value={form.statement}
            />
          </label>
          <label className="block text-xs font-medium text-muted" htmlFor="exception-justification">
            Justification
            <input
              className={fieldClassName}
              id="exception-justification"
              onChange={(event) => update("justification", event.target.value)}
              value={form.justification}
            />
          </label>

          <label className="block text-xs font-medium text-muted" htmlFor="exception-until">
            Effective until (optional)
            <input
              className={fieldClassName}
              id="exception-until"
              onChange={(event) => update("effectiveUntil", event.target.value)}
              type="datetime-local"
              value={form.effectiveUntil}
            />
          </label>
          {/* The service does not require an end date, so the screen has to be
              the thing that says what leaving it blank means. */}
          {openEnded ? (
            <Notice title="With no end date, this is a permanent deviation" variant="warning">
              The service accepts an exception that never expires. Nothing will bring the directive
              back into force, nothing will prompt a review, and — because exceptions cannot be
              listed — nobody will come across it later. An exception with no end is a policy change
              wearing a smaller word; if that is the intent, change the policy instead.
            </Notice>
          ) : null}

          <label className="block text-xs font-medium text-muted" htmlFor="exception-descriptor">
            Replacement conflict descriptor (JSON object)
            <textarea
              className={`${fieldClassName} min-h-24 font-mono`}
              id="exception-descriptor"
              onChange={(event) => update("descriptor", event.target.value)}
              value={form.descriptor}
            />
          </label>
          {descriptorError ? (
            <p className="text-xs text-danger" role="alert">
              {descriptorError}
            </p>
          ) : null}

          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-medium text-muted">
              The approval, transcribed
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              {textField("evidenceId", "Evidence", "exception-evidence")}
              {textField("verifierId", "Approval verifier", "exception-verifier")}
              {textField("approvingPrincipal", "Approving principal", "exception-principal")}
              {textField("approvingRole", "Approving role", "exception-role")}
              {textField("approvedPayloadDigest", "Approved payload digest", "exception-digest")}
              {textField("auditLogReference", "Audit log reference", "exception-audit")}
              {textField("approvalTimestamp", "Approval timestamp", "exception-approved-at")}
            </div>
          </fieldset>

          {missing.length > 0 ? (
            <p className="text-xs text-muted">{missing.length} required field(s) still empty.</p>
          ) : null}
          <Button disabled={missing.length > 0 || grantMutation.isPending} type="submit">
            <FileWarning aria-hidden="true" className="size-4" />
            Grant this exception
          </Button>
        </form>

        {granted ? (
          <div className="border-t border-border-subtle px-6 py-4">
            <Notice title="Record this identifier now" variant="warning">
              <code className="text-xs">{granted.exception_id}</code> is {granted.status}. Nothing
              lists exceptions, so this is the only time it is shown, and revoking it later needs
              this identifier.
            </Notice>
          </div>
        ) : null}
      </SectionSurface>

      <SectionSurface
        description="Restores the directive this exception narrowed. What happened under it stands."
        title="Revoke an exception"
      >
        <form
          className="space-y-3 px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (revokeId.trim() !== "" && revokeCode.trim() !== "") revokeMutation.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-muted" htmlFor="revoke-exception-id">
              Exception id
              <input
                className={fieldClassName}
                id="revoke-exception-id"
                onChange={(event) => setRevokeId(event.target.value)}
                value={revokeId}
              />
            </label>
            <label className="text-xs font-medium text-muted" htmlFor="revoke-exception-reason">
              Reason code
              <input
                className={fieldClassName}
                id="revoke-exception-reason"
                onChange={(event) => setRevokeCode(event.target.value)}
                value={revokeCode}
              />
            </label>
          </div>
          <p className="text-xs text-muted">
            Pasted rather than chosen, for the same reason there is no register above.
          </p>
          <Button
            disabled={
              revokeId.trim() === "" || revokeCode.trim() === "" || revokeMutation.isPending
            }
            type="submit"
            variant="danger"
          >
            Revoke this exception
          </Button>
        </form>
      </SectionSurface>
    </div>
  );
}
