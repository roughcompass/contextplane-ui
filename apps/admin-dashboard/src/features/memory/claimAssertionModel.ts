import {
  claimEvidenceKinds,
  claimVisibilities,
  type AssertClaimInput,
  type ClaimAssertionReceipt,
  type ClaimEvidenceItem,
  type ClaimEvidenceKind,
  type ClaimPredicate,
  type ClaimVisibility,
} from "../../shared/api";
import { humanizeMemoryValue } from "./memoryModel";

export type ClaimValueFormat = "json" | "text";

export interface ClaimEvidenceFormValue {
  excerpt: string;
  kind: ClaimEvidenceKind;
  ref: string;
}

export interface ClaimAssertionFormValues {
  assertedValidFrom: string;
  assertedValidTo: string;
  evidence: ClaimEvidenceFormValue[];
  namespace: string;
  predicate: string;
  subjectReference: string;
  valueFormat: ClaimValueFormat;
  valueText: string;
  visibility: ClaimVisibility;
}

export const claimEvidenceKindLabels: Readonly<Record<ClaimEvidenceKind, string>> = {
  commit: "Commit",
  connector_run: "Connector run",
  curator: "Curator",
  document_revision: "Document revision",
  incident: "Incident",
  session_event: "Session event",
  work_item: "Work item",
};

export const claimVisibilityLabels: Readonly<Record<ClaimVisibility, string>> = {
  private: "Private",
  public: "Public",
  "tenant-shared": "Tenant shared",
};

export const claimValueFormatOptions = [
  { label: "Plain text", value: "text" },
  { label: "JSON", value: "json" },
] as const satisfies readonly { label: string; value: ClaimValueFormat }[];

export const claimEvidenceKindOptions: readonly { label: string; value: ClaimEvidenceKind }[] =
  claimEvidenceKinds.map((kind) => ({ label: claimEvidenceKindLabels[kind], value: kind }));

export const claimVisibilityOptions: readonly { label: string; value: ClaimVisibility }[] =
  claimVisibilities.map((visibility) => ({
    label: claimVisibilityLabels[visibility],
    value: visibility,
  }));

export function createClaimEvidenceFormValue(): ClaimEvidenceFormValue {
  return { excerpt: "", kind: "curator", ref: "" };
}

export function createClaimAssertionDefaults(): ClaimAssertionFormValues {
  return {
    assertedValidFrom: "",
    assertedValidTo: "",
    evidence: [createClaimEvidenceFormValue()],
    namespace: "",
    predicate: "",
    subjectReference: "",
    valueFormat: "text",
    valueText: "",
    visibility: "tenant-shared",
  };
}

export function assertClaimHref(): string {
  return "/memory/claims/new";
}

/**
 * The ontology declares a `value_type` per predicate but the contract types it as free
 * text, so recognized scalar names pick text entry and everything else — objects, lists,
 * names this client has not seen — starts in JSON. The operator can still override.
 */
export function valueFormatForPredicate(predicate: ClaimPredicate | undefined): ClaimValueFormat {
  if (!predicate) return "text";
  const declared = predicate.value_type.trim().toLowerCase();
  return declared === "string" || declared === "text" || declared === "str" ? "text" : "json";
}

export function findClaimPredicate(
  predicates: readonly ClaimPredicate[],
  value: string,
): ClaimPredicate | undefined {
  return predicates.find((predicate) => predicate.value === value);
}

export function claimPredicateOptions(
  predicates: readonly ClaimPredicate[],
): readonly { label: string; value: string }[] {
  return predicates.map((predicate) => ({
    label: predicate.deprecated_at
      ? `${predicate.value} (deprecated)`
      : `${predicate.value} · ${humanizeMemoryValue(predicate.claim_category)}`,
    value: predicate.value,
  }));
}

export type ClaimValueResult = { message: string; ok: false } | { ok: true; value: unknown };

export function interpretClaimValue(text: string, format: ClaimValueFormat): ClaimValueResult {
  if (format === "text") {
    const trimmed = text.trim();
    if (!trimmed) return { message: "Enter the value this claim asserts.", ok: false };
    return { ok: true, value: trimmed };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { message: "Enter valid JSON, or switch the value to plain text.", ok: false };
  }
}

function isoFromLocalDateTime(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function evidenceFrom(rows: readonly ClaimEvidenceFormValue[]): readonly ClaimEvidenceItem[] {
  return rows.map((row) => {
    const excerpt = row.excerpt.trim();
    return {
      ...(excerpt ? { excerpt } : {}),
      kind: row.kind,
      ref: row.ref.trim(),
    };
  });
}

/**
 * Builds the request body only. The caller owns the idempotency key so that retrying an
 * unchanged submission reuses it rather than creating a second claim.
 */
export function buildAssertClaimInput(
  values: ClaimAssertionFormValues,
  value: unknown,
  idempotencyKey: string,
): AssertClaimInput {
  const namespace = values.namespace.trim();
  const validFrom = isoFromLocalDateTime(values.assertedValidFrom);
  const validTo = isoFromLocalDateTime(values.assertedValidTo);
  return {
    ...(validFrom ? { assertedValidFrom: validFrom } : {}),
    ...(validTo ? { assertedValidTo: validTo } : {}),
    evidence: evidenceFrom(values.evidence),
    idempotencyKey,
    ...(namespace ? { namespace } : {}),
    predicate: values.predicate,
    subjectReference: values.subjectReference.trim(),
    value,
    visibility: values.visibility,
  };
}

/**
 * Identifies a submitted body so a retry of the same content reuses its idempotency key.
 * Deliberately excludes the key itself.
 */
export function claimAssertionBodyDigest(input: AssertClaimInput): string {
  return JSON.stringify({ ...input, idempotencyKey: undefined });
}

const serverFieldNames: Readonly<Record<string, string>> = {
  asserted_valid_from: "assertedValidFrom",
  asserted_valid_to: "assertedValidTo",
  namespace: "namespace",
  predicate: "predicate",
  subject_reference: "subjectReference",
  value: "valueText",
  visibility: "visibility",
};

export interface ClaimAssertionFieldError {
  message: string;
  name: string;
}

/**
 * Maps one service error path onto the form control that produced it. Paths this form
 * has no control for stay unmapped so the caller can surface them as feedback rather
 * than attaching them to an unrelated field.
 */
export function claimAssertionFieldError(
  path: string | null,
  message: string,
): ClaimAssertionFieldError | null {
  if (!path) return null;
  const segments = path.replace(/^\$\.?/, "").split(".");
  const [head, ...rest] = segments;
  if (!head) return null;

  if (head === "evidence") {
    const [index, field] = rest;
    if (index === undefined || !/^\d+$/.test(index)) return null;
    if (field !== "ref" && field !== "excerpt" && field !== "kind") return null;
    return { message, name: `evidence.${index}.${field}` };
  }

  const name = serverFieldNames[head];
  return name ? { message, name } : null;
}

export interface ClaimAssertionOutcome {
  body: string;
  linked: boolean;
  title: string;
  variant: "success" | "warning";
}

/**
 * A stored assertion is not a fact. An unresolvable subject is stored `unlinked` rather
 * than refused, so a receipt without a subject entity needs saying out loud.
 */
export function claimAssertionOutcome(receipt: ClaimAssertionReceipt): ClaimAssertionOutcome {
  const authority = humanizeMemoryValue(receipt.source_authority).toLocaleLowerCase();
  if (!receipt.subject_entity_id) {
    return {
      body: `The service stored this assertion as ${receipt.status} because it could not resolve the subject reference to a known entity. It will not be recalled against that subject until a curator links it.`,
      linked: false,
      title: "Stored, but not attached to a subject",
      variant: "warning",
    };
  }
  if (receipt.is_contested) {
    return {
      body: `The assertion is recorded with ${authority} authority and contests an existing claim about this subject. Curation decides which one is believed.`,
      linked: true,
      title: "Recorded as a contested observation",
      variant: "warning",
    };
  }
  return {
    body: `The assertion is recorded with ${authority} authority as an observation. It enters recall now and reaches the canonical graph only through promotion review.`,
    linked: true,
    title: "Recorded as an observation",
    variant: "success",
  };
}
