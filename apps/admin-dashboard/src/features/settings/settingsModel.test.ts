import { describe, expect, it } from "vitest";

import {
  adminStatusTone,
  edgeSchemaLabel,
  formatAdminTimestamp,
  humanizeAdminValue,
  isSettingsTab,
  parseAlwaysReview,
  readSettingsTab,
  readVocabularyKind,
  recentSyncWindow,
  settingsSearch,
  shortAdminIdentifier,
} from "./settingsModel";

describe("settingsModel", () => {
  it("round-trips URL-addressable settings state and rejects unknown values", () => {
    expect(readSettingsTab("?tab=memory")).toBe("memory");
    expect(readSettingsTab("?tab=unknown")).toBe("integrations");
    expect(isSettingsTab("privacy")).toBe(true);
    expect(isSettingsTab(null)).toBe(false);
    expect(readVocabularyKind("?tab=schema&vocab=edge_rel")).toBe("edge_rel");
    expect(readVocabularyKind("?vocab=unknown")).toBe("entity_type");
    expect(settingsSearch("integrations")).toBe("");
    expect(settingsSearch("schema", "edge_rel")).toBe("?tab=schema&vocab=edge_rel");
  });

  it("formats service values without inventing missing data", () => {
    expect(formatAdminTimestamp(null)).toBe("Not reported");
    expect(formatAdminTimestamp("not-a-date")).toBe("not-a-date");
    expect(formatAdminTimestamp("2026-08-12T10:15:00Z")).toContain("12 Aug 2026");
    expect(shortAdminIdentifier("short-id")).toBe("short-id");
    expect(shortAdminIdentifier("1234567890abcdefghijkl")).toBe("12345678…ghijkl");
    expect(humanizeAdminValue("edge_rel-value")).toBe("Edge Rel Value");
    expect(edgeSchemaLabel({ rel: "depends_on" }, 0)).toBe("depends_on");
    expect(edgeSchemaLabel({ schema_id: "schema-a" }, 0)).toBe("schema-a");
    expect(edgeSchemaLabel({}, 2)).toBe("Schema 3");
  });

  it("classifies statuses, policy inputs, and the bounded sync window", () => {
    expect(adminStatusTone("done")).toBe("success");
    expect(adminStatusTone("failed")).toBe("danger");
    expect(adminStatusTone("running")).toBe("warning");
    expect(adminStatusTone("unknown")).toBe("neutral");
    expect(parseAlwaysReview("owner, lifecycle, owner, ")).toEqual(["owner", "lifecycle"]);
    expect(recentSyncWindow(Date.parse("2026-08-12T00:00:00Z"))).toBe("2026-08-05T00:00:00.000Z");
  });
});
