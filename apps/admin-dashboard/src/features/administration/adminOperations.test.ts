import { describe, expect, it } from "vitest";

import { ADMIN_OPERATIONS, ADMIN_OPERATION_GROUPS } from "./adminOperations";

function placeholders(path: string): readonly string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? "");
}

describe("administrative operation manifest", () => {
  it("represents the complete committed admin contract without duplicate operations", () => {
    const ids = ADMIN_OPERATIONS.map((operation) => operation.id);

    expect(ADMIN_OPERATIONS).toHaveLength(72);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ADMIN_OPERATIONS.filter((operation) => operation.scope === "tenant")).toHaveLength(58);
    expect(ADMIN_OPERATIONS.filter((operation) => operation.scope === "operator")).toHaveLength(14);
    expect(ADMIN_OPERATIONS.some((operation) => operation.path === "/metrics")).toBe(false);
  });

  it("assigns every operation to a visible domain and declares each path input", () => {
    const groupIds = new Set(ADMIN_OPERATION_GROUPS.map((group) => group.id));

    for (const operation of ADMIN_OPERATIONS) {
      expect(groupIds.has(operation.group)).toBe(true);
      expect(operation.pathParameters ?? []).toEqual(placeholders(operation.path));
    }
  });

  it("does not offer endpoints whose backend implementation is explicitly pending", () => {
    const unavailable = ADMIN_OPERATIONS.filter(
      (operation) => operation.availability === "service-pending",
    );

    expect(unavailable.map((operation) => operation.id)).toEqual([
      "GET /v1/admin/edge-property-schemas",
      "POST /v1/admin/edge-property-schemas",
      "PATCH /v1/admin/edge-property-schemas/{schema_id}",
    ]);
  });

  it("requires confirmation for every delete and trust-withdrawal operation", () => {
    const unsafeWithoutConfirmation = ADMIN_OPERATIONS.filter(
      (operation) =>
        (operation.method === "DELETE" || /revoke|invalidate|personal-data/.test(operation.path)) &&
        !operation.destructive,
    );

    expect(unsafeWithoutConfirmation).toEqual([]);
  });
});
