import type { StatusTone } from "@repo/ui/primitives";

import type { GraphVocabularyKind } from "../../shared/api";

export const settingsTabs = [
  {
    description: "Sync sources, recent runs, and registered external systems.",
    id: "integrations",
    label: "Integrations",
  },
  {
    description: "Extraction strategies and the service conformance rule.",
    id: "extraction",
    label: "Extraction",
  },
  {
    description: "Graph vocabularies, capability schemas, and edge property schemas.",
    id: "schema",
    label: "Graph schema",
  },
  {
    description: "Source policy, promotion policy, allowlists, and calibration.",
    id: "memory",
    label: "Memory",
  },
  {
    description: "Personal-data detection, field policy, and actor erasure.",
    id: "privacy",
    label: "Data protection",
  },
  {
    description: "Tenant progression definitions and entity-specific overrides.",
    id: "lifecycle",
    label: "Lifecycle",
  },
] as const;

export type SettingsTab = (typeof settingsTabs)[number]["id"];

export function isSettingsTab(value: string | null): value is SettingsTab {
  return settingsTabs.some((tab) => tab.id === value);
}

export function readSettingsTab(search: string): SettingsTab {
  const value = new URLSearchParams(search).get("tab");
  return isSettingsTab(value) ? value : "integrations";
}

export function readVocabularyKind(search: string): GraphVocabularyKind {
  return new URLSearchParams(search).get("vocab") === "edge_rel" ? "edge_rel" : "entity_type";
}

export function settingsSearch(tab: SettingsTab, vocabularyKind?: GraphVocabularyKind): string {
  const parameters = new URLSearchParams();
  if (tab !== "integrations") parameters.set("tab", tab);
  if (tab === "schema" && vocabularyKind === "edge_rel") parameters.set("vocab", vocabularyKind);
  const search = parameters.toString();
  return search ? `?${search}` : "";
}

export function formatAdminTimestamp(value: string | null): string {
  if (!value) return "Not reported";
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

export function shortAdminIdentifier(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function humanizeAdminValue(value: string): string {
  return value
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\b\w/g, (character) => character.toUpperCase());
}

export function adminStatusTone(value: string): StatusTone {
  if (["done", "active", "enabled", "conformant", "fitted"].includes(value)) return "success";
  if (["failed", "disabled", "open"].includes(value)) return "danger";
  if (["partial", "queued", "running", "pending"].includes(value)) return "warning";
  return "neutral";
}

export function recentSyncWindow(now = Date.now()): string {
  return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
}

export function parseAlwaysReview(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function edgeSchemaLabel(value: Record<string, unknown>, index: number): string {
  for (const key of ["rel", "relationship", "schema_id"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return `Schema ${index + 1}`;
}
