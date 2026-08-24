import type { MemoryClaim, MemoryClaimPersona } from "../../shared/api";

export const memoryTabs = [
  { id: "claims", label: "Claims" },
  { id: "curation", label: "Curation queue" },
] as const;

export type MemoryTab = (typeof memoryTabs)[number]["id"];
export type MemoryConfidenceFloor = "" | "0.5" | "0.8";

export interface MemoryUrlState {
  category: string;
  cursor: string;
  minConfidence: MemoryConfidenceFloor;
  namespacePrefix: string;
  persona: MemoryClaimPersona;
  predicate: string;
  query: string;
  subjectEntityId: string;
  tab: MemoryTab;
}

export const memoryConfidenceOptions: readonly { label: string; value: MemoryConfidenceFloor }[] = [
  { label: "At least 50%", value: "0.5" },
  { label: "At least 80%", value: "0.8" },
];

export const memoryPersonaOptions: readonly { label: string; value: MemoryClaimPersona }[] = [
  { label: "Agent", value: "agent" },
  { label: "Level 1 responder", value: "l1_responder" },
  { label: "Level 3 engineer", value: "l3_engineer" },
  { label: "Architect", value: "architect" },
];

export const defaultMemoryPersona: MemoryClaimPersona = "agent";
export const memoryClaimLimit = 50;
export const memoryCurationPageSize = 100;

export function isMemoryTab(value: string | null): value is MemoryTab {
  return memoryTabs.some((tab) => tab.id === value);
}

export function isMemoryClaimPersona(value: string | null): value is MemoryClaimPersona {
  return (
    value === "l1_responder" ||
    value === "l3_engineer" ||
    value === "architect" ||
    value === "agent"
  );
}

/**
 * Which tab an address names.
 *
 * The curation queue is `/memory/review` — an address of its own, because
 * Overview and `AssertClaimPage` were already deep-linking to `?tab=curation`
 * as though it were a destination, and a destination reachable only as a query
 * *value* is one nobody can bookmark, name in a runbook, or land on directly.
 *
 * The `?tab=curation` form is still read, so a bookmark from before the move
 * resolves to the same tab rather than silently to the claims list. The shell
 * rewrites the address; this makes the page right even if it did not.
 */
export function readMemoryUrlState(
  search = window.location.search,
  pathname = window.location.pathname,
): MemoryUrlState {
  const parameters = new URLSearchParams(search);
  const tab = pathname === "/memory/review" ? "curation" : parameters.get("tab");
  const persona = parameters.get("persona");
  const minConfidence = parameters.get("min_confidence");

  return {
    category: parameters.get("category") ?? "",
    cursor: parameters.get("cursor") ?? "",
    minConfidence: minConfidence === "0.5" || minConfidence === "0.8" ? minConfidence : "",
    namespacePrefix: parameters.get("namespace") ?? "",
    persona: isMemoryClaimPersona(persona) ? persona : defaultMemoryPersona,
    predicate: parameters.get("predicate") ?? "",
    query: parameters.get("q") ?? "",
    subjectEntityId: parameters.get("subject") ?? "",
    tab: isMemoryTab(tab) ? tab : "claims",
  };
}

export function memorySearch(state: MemoryUrlState): string {
  const parameters = new URLSearchParams();

  if (state.tab === "curation") {
    // No `tab` parameter: the path carries it now. Writing both would leave two
    // spellings of one address in circulation, and the redirect would then be
    // rewriting addresses this app had just minted.
    if (state.cursor) parameters.set("cursor", state.cursor);
  } else {
    if (state.query) parameters.set("q", state.query);
    if (state.subjectEntityId) parameters.set("subject", state.subjectEntityId);
    if (state.predicate) parameters.set("predicate", state.predicate);
    if (state.category) parameters.set("category", state.category);
    if (state.namespacePrefix) parameters.set("namespace", state.namespacePrefix);
    if (state.minConfidence) parameters.set("min_confidence", state.minConfidence);
    if (state.persona !== defaultMemoryPersona) parameters.set("persona", state.persona);
  }

  const query = parameters.toString();
  return query ? `?${query}` : "";
}

export function memoryListHref(state: MemoryUrlState): string {
  return `${state.tab === "curation" ? "/memory/review" : "/memory"}${memorySearch(state)}`;
}

/**
 * The address of one area, from where the reader is now.
 *
 * The cursor is dropped and the filters are not carried across: the two areas
 * filter on different things, and a cursor issued for one list is not a
 * position in the other. Switching areas starts at the top of the one you
 * arrived at, which is what a reader means by switching.
 */
export function memoryTabHref(tab: MemoryTab, state: MemoryUrlState): string {
  return memoryListHref({ ...state, cursor: "", tab });
}

export function memoryClaimHref(claimId: string, state: MemoryUrlState): string {
  return `/memory/claims/${encodeURIComponent(claimId)}${memorySearch(state)}`;
}

export function formatMemoryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(date);
}

export function shortMemoryIdentifier(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function humanizeMemoryValue(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatClaimValue(value: unknown): string {
  if (value === null) return "Null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "Value could not be displayed";
  }
}

export function formatConfidence(value: number | null): string {
  return value === null ? "Not reported" : `${(value * 100).toFixed(1)}%`;
}

export function recallCaveat(claims: readonly MemoryClaim[]): string | null {
  const note = claims[0]?.trust_note;
  if (!note) return null;
  return claims.every((claim) => claim.trust_note === note) ? note : null;
}

export function uncitedClaims(claims: readonly MemoryClaim[]): readonly MemoryClaim[] {
  return claims.filter((claim) => claim.citations.length === 0);
}

export function curationCountSummary(counts: Readonly<Record<string, number>>): string {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (entries.length === 0) return "The service published no curation reason counts.";
  const reasons = entries
    .map(([reason, count]) => `${count} ${humanizeMemoryValue(reason).toLocaleLowerCase()}`)
    .join(" · ");
  return `${total} total items waiting · ${reasons}`;
}
