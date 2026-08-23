/**
 * Ownership assignments and the profile lifecycle — who answers for what, and
 * the revisions and bindings that put a profile into effect.
 *
 * Split out of `tenantWork.ts`; see `activity.ts` for why.
 */
import type { ContextplaneClient, ContextplaneRequestOptions } from "./client";
import type { components } from "./generated/contextplane";
import {
  nullableNumber,
  nullableString,
  requiredArray,
  requiredBoolean,
  requiredRecord,
  requiredString,
} from "./parse";

function contextOptions(
  context: ContextplaneRequestOptions,
  signal?: AbortSignal,
): ContextplaneRequestOptions {
  return {
    ...(signal ? { signal } : {}),
    ...(context.tenantId ? { tenantId: context.tenantId } : {}),
  };
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

export type StructuredServiceResult = Readonly<Record<string, unknown>> | readonly unknown[];

function structured(value: unknown, label: string): StructuredServiceResult {
  if (Array.isArray(value)) return value;
  return requiredRecord(value, label);
}

export type AssignOwnershipInput = components["schemas"]["AssignOwnershipRequestV1"];
export type OwnershipTransitionInput = components["schemas"]["TransitionRequestV1"];
export type PlanProfileBindingInput = components["schemas"]["PlanBindingRequest"];
export type ProfileBindingTransitionInput = components["schemas"]["BindingTransitionRequest"];
export type PublishProfileExtensionInput = components["schemas"]["PublishExtensionRequest"];
export type PublishProfileRevisionInput = components["schemas"]["PublishRevisionRequest"];

export interface OwnershipAssignment {
  confidence: number | null;
  derivationMethod: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isPending: boolean;
  ownedTargetId: string;
  ownedTargetKind: string;
  ownerPrincipal: string;
  ownershipAssignmentId: string;
  provenanceId: string;
  recordedAt: string;
  recordedBy: string;
  replacedByAssignmentId: string | null;
  revocationReason: string | null;
  role: string;
  scope: string;
  source: string;
  validationState: string;
}

function parseOwnership(value: unknown): OwnershipAssignment {
  const item = requiredRecord(value, "ownership assignment");
  return {
    confidence: nullableNumber(item, "confidence"),
    derivationMethod: nullableString(item, "derivation_method"),
    effectiveFrom: requiredString(item, "effective_from"),
    effectiveTo: nullableString(item, "effective_to"),
    isPending: requiredBoolean(item, "is_pending"),
    ownedTargetId: requiredString(item, "owned_target_id"),
    ownedTargetKind: requiredString(item, "owned_target_kind"),
    ownerPrincipal: requiredString(item, "owner_principal"),
    ownershipAssignmentId: requiredString(item, "ownership_assignment_id"),
    provenanceId: requiredString(item, "provenance_id"),
    recordedAt: requiredString(item, "recorded_at"),
    recordedBy: requiredString(item, "recorded_by"),
    replacedByAssignmentId: nullableString(item, "replaced_by_assignment_id"),
    revocationReason: nullableString(item, "revocation_reason"),
    role: requiredString(item, "role"),
    scope: requiredString(item, "scope"),
    source: requiredString(item, "source"),
    validationState: requiredString(item, "validation_state"),
  };
}

export async function findTargetOwners(
  client: ContextplaneClient,
  targetKind: string,
  targetId: string,
  includePending: boolean,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly OwnershipAssignment[]> {
  const search = new URLSearchParams({
    include_pending: String(includePending),
    owned_target_id: targetId,
    owned_target_kind: targetKind,
  });
  const value = requiredRecord(
    await client.request(
      `/v1/ownership:owned-by?${search.toString()}`,
      contextOptions(context, signal),
    ),
    "ownership list",
  );
  return requiredArray(value.items, "ownership assignments").map(parseOwnership);
}

export async function listPrincipalOwnership(
  client: ContextplaneClient,
  ownerPrincipal: string,
  includePending: boolean,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<readonly OwnershipAssignment[]> {
  const search = new URLSearchParams({
    include_pending: String(includePending),
    owner_principal: ownerPrincipal,
  });
  const value = requiredRecord(
    await client.request(
      `/v1/ownership:owns?${search.toString()}`,
      contextOptions(context, signal),
    ),
    "ownership list",
  );
  return requiredArray(value.items, "ownership assignments").map(parseOwnership);
}

export async function assignTenantOwnership(
  client: ContextplaneClient,
  input: AssignOwnershipInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<OwnershipAssignment> {
  return parseOwnership(
    await client.request("/v1/ownership/assignments", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
  );
}

export async function getTenantOwnershipAssignment(
  client: ContextplaneClient,
  assignmentId: string,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<OwnershipAssignment> {
  return parseOwnership(
    await client.request(
      `/v1/ownership/assignments/${encode(assignmentId)}`,
      contextOptions(context, signal),
    ),
  );
}

export async function transitionTenantOwnership(
  client: ContextplaneClient,
  assignmentId: string,
  input: OwnershipTransitionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<OwnershipAssignment> {
  return parseOwnership(
    await client.request(`/v1/ownership/assignments/${encode(assignmentId)}:transition`, {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
  );
}

export async function getProfileConformance(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/profiles/conformance", contextOptions(context, signal)),
    "profile conformance",
  );
}

export async function planProfileBinding(
  client: ContextplaneClient,
  input: PlanProfileBindingInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/profiles/bindings", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "profile binding",
  );
}

export async function transitionProfileBinding(
  client: ContextplaneClient,
  bindingId: string,
  action: "activate" | "rollback" | "rollback/complete" | "validate",
  input: ProfileBindingTransitionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request(`/v1/profiles/bindings/${encode(bindingId)}/${action}`, {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "profile binding transition",
  );
}

export async function publishProfileExtension(
  client: ContextplaneClient,
  input: PublishProfileExtensionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/profiles/extensions", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "profile extension",
  );
}

export async function publishProfileRevision(
  client: ContextplaneClient,
  input: PublishProfileRevisionInput,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<StructuredServiceResult> {
  return structured(
    await client.request("/v1/profiles/revisions", {
      ...contextOptions(context, signal),
      body: input,
      method: "POST",
    }),
    "profile revision",
  );
}


export interface GoverningBinding {
  bindingId: string;
  bound: boolean;
  enforcementState: string;
  /**
   * The half of the governing vocabulary the revision id does not cover.
   *
   * A tenant can rebind to a different extension set at the same
   * `profile_revision_id`, so a caller attesting only to the revision is silent
   * about the change the binding lifecycle exists to make.
   */
  extensionSetDigest: string;
  profileRevisionId: string;
}

export async function getGoverningBinding(
  client: ContextplaneClient,
  context: ContextplaneRequestOptions = {},
  signal?: AbortSignal,
): Promise<GoverningBinding | null> {
  const payload = requiredRecord(
    await client.request("/v1/profiles/conformance", contextOptions(context, signal)),
    "profile conformance",
  );
  if (!requiredBoolean(payload, "bound")) return null;
  const binding = requiredRecord(payload.binding, "profile binding");
  return {
    bindingId: requiredString(binding, "binding_id"),
    bound: true,
    enforcementState: requiredString(binding, "state"),
    extensionSetDigest: requiredString(binding, "extension_set_digest"),
    profileRevisionId: requiredString(binding, "profile_revision_id"),
  };
}
