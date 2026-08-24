import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import { isRecord, nullableString, requiredBoolean, requiredString } from "./parse";

/**
 * The autonomy envelope's four acts, and the read that shows the posture.
 *
 * An envelope decides what an agent may do. The service has had `grant`,
 * `suspend`, `reinstate` and `revoke` since E7 and **no transport reached any of
 * them** — the control could be read and not operated, so an incident response
 * consisted of editing rows. E23-T5 gave them routes; this is the client half.
 *
 * ## The three states, and why two of them must never be merged
 *
 * `resolveEnvelope` answers `null` when no binding covers the instant. That is
 * not "suspended". One is a principal nobody has governed; the other is a
 * posture somebody chose. Reading the first as the second is what lets an
 * ungoverned agent look controlled, which is the reading that stops an operator
 * acting — so the return type is `EnvelopeBinding | null` and the screen says
 * which of the two it got.
 *
 * ## Suspending is not revoking
 *
 * A suspension is a posture somebody can reverse; a revocation closes the
 * interval. They are separate calls here because they are separate acts to the
 * auditor reading the record afterwards, and a single `setInForce(boolean)`
 * would make the difference an argument somebody passes wrong.
 *
 * ## Why the principal is typed and not chosen
 *
 * ADR 0018 says a server-assigned identifier is chosen from a list. A workload
 * identity is the exception it names: the `(issuer, subject)` pair comes from
 * the agent's own IdP, this service never assigned it, and there is no
 * collection to enumerate. So it stays two text fields, and the screen says so
 * rather than leaving a reader to wonder where the dropdown went.
 */

export interface EnvelopeBinding {
  binding_id: string;
  revision_id: string;
  artifact_id: string;
  principal_issuer: string;
  principal_subject: string;
  state: string;
  effective_from: string;
  effective_to: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  /**
   * The bound revision's own lifecycle. A binding is only checked for `active`
   * at grant time, so a live binding to a superseded or revoked governance
   * document is a real state — reported rather than hidden.
   */
  revision_lifecycle_state: string;
  /** Whether the binding is switched on. Says nothing about the revision. */
  is_in_force: boolean;
}

export interface WorkloadIdentity {
  issuer: string;
  subject: string;
}

export interface EnvelopeGrantInput extends WorkloadIdentity {
  revision_id: string;
  reason: string;
  effective_to?: string;
}

function parseBinding(payload: unknown): EnvelopeBinding {
  if (!isRecord(payload)) throw new Error("Invalid API response: envelope binding.");
  return {
    artifact_id: requiredString(payload, "artifact_id"),
    binding_id: requiredString(payload, "binding_id"),
    effective_from: requiredString(payload, "effective_from"),
    effective_to: nullableString(payload, "effective_to", "effective_to"),
    is_in_force: requiredBoolean(payload, "is_in_force", "is_in_force"),
    principal_issuer: requiredString(payload, "principal_issuer"),
    principal_subject: requiredString(payload, "principal_subject"),
    revision_id: requiredString(payload, "revision_id"),
    revision_lifecycle_state: requiredString(payload, "revision_lifecycle_state"),
    state: requiredString(payload, "state"),
    suspended_at: nullableString(payload, "suspended_at", "suspended_at"),
    suspension_reason: nullableString(payload, "suspension_reason", "suspension_reason"),
  };
}

/**
 * The envelope covering one principal right now, suspended or not.
 *
 * `null` means no binding covers the instant — see the module note. The `at`
 * parameter exists because an operator asking "what governed this agent when it
 * did that" is asking about a past instant, and answering with the present
 * would be answering a different question.
 */
export async function resolveEnvelope(
  client: ContextplaneClient,
  principal: WorkloadIdentity,
  options: { at?: string } = {},
  context: ContextplaneRequestOptions = {},
): Promise<EnvelopeBinding | null> {
  const search = new URLSearchParams({
    principal_issuer: principal.issuer,
    principal_subject: principal.subject,
  });
  if (options.at) search.set("at", options.at);

  const payload = await client.request(`/v1/arc/admin/envelopes/bindings?${search.toString()}`, {
    ...context,
    method: "GET",
  });
  return payload === null || payload === undefined ? null : parseBinding(payload);
}

/** Bind a principal to an envelope revision. Returns the new binding's id. */
export async function grantEnvelope(
  client: ContextplaneClient,
  input: EnvelopeGrantInput,
  context: ContextplaneRequestOptions = {},
): Promise<string> {
  const payload = await client.request("/v1/arc/admin/envelopes/bindings", {
    ...context,
    body: {
      ...(input.effective_to ? { effective_to: input.effective_to } : {}),
      principal_issuer: input.issuer,
      principal_subject: input.subject,
      reason: input.reason,
      revision_id: input.revision_id,
    },
    method: "POST",
  });
  if (!isRecord(payload)) throw new Error("Invalid API response: envelope grant.");
  return requiredString(payload, "binding_id");
}

/** The three acts that flip or end an existing binding. */
export type EnvelopeAct = "suspend" | "reinstate" | "revoke";

/**
 * Perform one act on one binding.
 *
 * The act is in the path and the reason is required, both matching the service.
 * A binding switched off with no stated reason leaves the next reader working
 * out why an agent stopped being able to act, during the incident where that
 * matters most.
 */
export async function actOnEnvelope(
  client: ContextplaneClient,
  bindingId: string,
  act: EnvelopeAct,
  reason: string,
  context: ContextplaneRequestOptions = {},
): Promise<void> {
  await client.request(
    `/v1/arc/admin/envelopes/bindings/${encodeURIComponent(bindingId)}/${act}`,
    { ...context, body: { reason }, method: "POST" },
  );
}
