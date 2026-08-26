import { contextBlockNames, instructionDispositions } from "../../shared/api";
import type {
  ContextBlock,
  ContextBlockName,
  ContextBlockState,
  ContextEnvelope,
  ContextEnvelopeState,
  ContextItem,
  ContextTrust,
  InstructionDisposition,
  WhoAmI,
} from "../../shared/api";

/**
 * Five, and the count is load-bearing.
 *
 * Re-exported from the API vocabulary rather than restated, because this list
 * was four while the envelope was five — and a pane that silently omits the
 * instruction block reports a clean run over a wrong delta.
 */
export const contextBlockOrder = contextBlockNames;

export const contextLimitOptions = [10, 25, 50, 100] as const;
export type ContextLimit = (typeof contextLimitOptions)[number];

export const contextLimitSelectOptions: readonly { label: string; value: string }[] =
  contextLimitOptions.map((option) => ({ label: `${option} items`, value: String(option) }));

export const contextFreshnessOptions = [
  { label: "Any age", value: "" },
  { label: "Past hour", value: "3600" },
  { label: "Past day", value: "86400" },
  { label: "Past week", value: "604800" },
] as const;

export interface ContextLabScope {
  arcReceiptId: string;
  intentIds: readonly string[];
  limit: ContextLimit;
  maxAgeSeconds: number | null;
  subjectEntityId: string;
  workspaceTerm: string;
}

export interface ScopeValidationResult {
  errors: Readonly<{
    arcReceiptId?: string;
    intentIds?: string;
    subjectEntityId?: string;
  }>;
  scope: ContextLabScope;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const blockLabels: Record<ContextBlockName, string> = {
  canonical: "Canonical catalog",
  arc: "Governed policies",
  observed_claims: "Observed claims",
  workspace: "Workspace recall",
  instructions: "Instruction corrections",
};

// Each description says **what scoped the block**, because that is the question a
// reader has when a block's contents surprise them and the one thing the items
// cannot answer for themselves. Observed claims is why: it returned the tenant's
// most recent claims whatever the prompt asked, and every one of them was real,
// current and correctly trusted — so nothing on the screen could have told a
// reader they were about something else. Service-side that is fixed (ADR 0027);
// saying what scopes the block is what stops the next such gap being silent.
const blockDescriptions: Record<ContextBlockName, string> = {
  canonical: "Approved catalog records and the facts that matched this prompt.",
  arc: "Policy directives selected by a named, attested ARC receipt.",
  observed_claims:
    "Living Memory claims matching the prompt, or the subject entity when one is chosen. Observations until governed review.",
  workspace: "Task checkpoints visible to the current participant.",
  instructions:
    "Corrections this product served back about the caller's own declared instructions. Not context about the subject.",
};

export function isUuid(value: string): boolean {
  return uuidPattern.test(value.trim());
}

export function parseIntentIds(value: string): readonly string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function validateScope(input: {
  arcReceiptId: string;
  intentIds: string;
  limit: ContextLimit;
  maxAgeSeconds: string;
  subjectEntityId: string;
  workspaceTerm: string;
}): ScopeValidationResult {
  const arcReceiptId = input.arcReceiptId.trim();
  const subjectEntityId = input.subjectEntityId.trim();
  const intentIds = parseIntentIds(input.intentIds);
  const errors: {
    arcReceiptId?: string;
    intentIds?: string;
    subjectEntityId?: string;
  } = {};

  if (arcReceiptId && !isUuid(arcReceiptId)) {
    errors.arcReceiptId = "Enter a valid ARC receipt UUID.";
  }
  if (subjectEntityId && !isUuid(subjectEntityId)) {
    errors.subjectEntityId = "Enter a valid catalog entity UUID.";
  }
  const invalidIntent = intentIds.find((intentId) => !isUuid(intentId));
  if (invalidIntent) {
    errors.intentIds = `Intent ID ${invalidIntent} is not a valid UUID.`;
  }

  return {
    errors,
    scope: {
      arcReceiptId,
      intentIds,
      limit: input.limit,
      maxAgeSeconds: input.maxAgeSeconds ? Number(input.maxAgeSeconds) : null,
      subjectEntityId,
      workspaceTerm: input.workspaceTerm.trim(),
    },
  };
}

export function contextBlockLabel(name: ContextBlockName): string {
  return blockLabels[name];
}

export function contextBlockDescription(name: ContextBlockName): string {
  return blockDescriptions[name];
}

export function contextBlockStateLabel(state: ContextBlockState): string {
  if (state === "success") return "Returned context";
  if (state === "empty") return "No context returned";
  if (state === "degraded") return "Partial context";
  return "Source failed";
}

export function contextBlockStateTone(
  state: ContextBlockState,
): "neutral" | "success" | "warning" | "danger" {
  if (state === "success") return "success";
  if (state === "empty") return "neutral";
  if (state === "degraded") return "warning";
  return "danger";
}

export function contextEnvelopeStateLabel(state: ContextEnvelopeState): string {
  if (state === "complete") return "Complete";
  if (state === "degraded") return "Degraded";
  return "Blocked";
}

export function contextEnvelopeStateTone(
  state: ContextEnvelopeState,
): "success" | "warning" | "danger" {
  if (state === "complete") return "success";
  if (state === "degraded") return "warning";
  return "danger";
}

export function totalContextItems(envelope: ContextEnvelope): number {
  return envelope.blocks.reduce((total, block) => total + block.items.length, 0);
}

export function returnedContextBlocks(envelope: ContextEnvelope): number {
  return envelope.blocks.filter((block) => block.items.length > 0).length;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export function contextItemTitle(block: ContextBlock, item: ContextItem): string {
  const payload = item.payload;
  const preferredKeys: readonly string[] =
    block.name === "canonical"
      ? ["name", "external_id", "entity_id"]
      : block.name === "observed_claims"
        ? ["label", "predicate", "claim_id"]
        : block.name === "workspace"
          ? ["goal", "next_action", "checkpoint_id", "intent_id"]
          : ["source_locator", "directive_id", "artifact_id"];

  for (const key of preferredKeys) {
    const value = stringValue(payload[key]);
    if (value) return value;
  }
  return item.receipt_item_id.item_key;
}

export function contextItemSummary(block: ContextBlock, item: ContextItem): string {
  const payload = item.payload;
  if (block.name === "canonical") {
    const entityType = stringValue(payload.entity_type);
    const matchingFacts = Array.isArray(payload.matching_facts) ? payload.matching_facts.length : 0;
    return [entityType, `${matchingFacts} matching ${matchingFacts === 1 ? "fact" : "facts"}`]
      .filter(Boolean)
      .join(" · ");
  }
  if (block.name === "observed_claims") {
    const value = stringValue(payload.value);
    const confidence = typeof payload.confidence === "number" ? payload.confidence : null;
    return [value, confidence === null ? null : `Confidence ${formatConfidence(confidence)}`]
      .filter(Boolean)
      .join(" · ");
  }
  if (block.name === "workspace") {
    const nextAction = stringValue(payload.next_action);
    const questions = Array.isArray(payload.open_questions) ? payload.open_questions.length : 0;
    return nextAction
      ? `Next action: ${nextAction}`
      : `${questions} open ${questions === 1 ? "question" : "questions"}`;
  }
  return payload.is_mandatory === true ? "Mandatory directive" : "Selected directive";
}

export function formatConfidence(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

export function formatContextTimestamp(value: string | null): string {
  if (!value) return "Not reported";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(parsed);
}

export function humanizeContextField(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function displayContextValue(value: unknown): string {
  if (value === null) return "Not set";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

export function shortContextIdentifier(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function mayReportContextFeedback(identity: WhoAmI): boolean {
  return identity.roles.some(
    (role) => role === "consumer" || role === "producer" || role === "admin",
  );
}

export function identityDisplayName(identity: WhoAmI): string {
  return (
    identity.actor_display_name ?? identity.actor_email ?? shortContextIdentifier(identity.actor_id)
  );
}

const dispositionLabels: Record<InstructionDisposition, string> = {
  not_declared: "No instructions declared",
  declared_unknown: "Declared, content never submitted",
  declared_known: "Declared and submitted",
};

const dispositionDescriptions: Record<InstructionDisposition, string> = {
  not_declared:
    "This request sent no instruction digest, so the product had nothing to correct. Send one to receive governed corrections.",
  declared_unknown:
    "A digest arrived whose content was never submitted, so corrections could be served but contradictions could not be computed. This is the one state the caller can leave by acting.",
  declared_known:
    "The declared instruction set is on file, so a correction that contradicts it is reported as one.",
};

/**
 * The disposition as a reader sees it.
 *
 * Three labels rather than "declared" and "not declared", because
 * `declared_unknown` reported as either would hide partial adoption of the
 * channel — an integration that declares looking identical to one that never
 * adopted it. All three are rendered wherever any is.
 */
export function instructionDispositionLabel(disposition: InstructionDisposition): string {
  return dispositionLabels[disposition];
}

export function instructionDispositionDescription(disposition: InstructionDisposition): string {
  return dispositionDescriptions[disposition];
}

export function instructionDispositionTone(
  disposition: InstructionDisposition,
): "neutral" | "success" | "warning" {
  if (disposition === "declared_known") return "success";
  // Warning rather than neutral: this is the state the caller can fix, and the
  // one whose invisibility ADR 0020's third assumption was written about.
  if (disposition === "declared_unknown") return "warning";
  return "neutral";
}

/** Every disposition, so a surface cannot render a subset by omission. */
export const allInstructionDispositions = instructionDispositions;

export function trustSummary(trust: ContextTrust | null): string {
  if (!trust) return "Canonical catalog record";
  return `${humanizeContextField(trust.trust)} · ${humanizeContextField(trust.assertion_kind)}`;
}
