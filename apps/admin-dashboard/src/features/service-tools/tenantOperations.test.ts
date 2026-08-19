import { describe, expect, it } from "vitest";

import { TENANT_OPERATIONS, TENANT_OPERATION_GROUPS } from "./tenantOperations";

function placeholders(path: string): readonly string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? "");
}

describe("tenant operation manifest", () => {
  it("represents every committed tenant-focused operation without duplicates", () => {
    const ids = TENANT_OPERATIONS.map((operation) => operation.id);

    expect(TENANT_OPERATIONS).toHaveLength(160);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TENANT_OPERATIONS.some((operation) => operation.path === "/metrics")).toBe(false);
    expect(
      TENANT_OPERATIONS.some(
        (operation) =>
          operation.path.startsWith("/v1/admin/") ||
          operation.path.startsWith("/v1/arc/admin/") ||
          operation.path.startsWith("/v1/operator/"),
      ),
    ).toBe(false);
  });

  it("assigns every operation to a visible task domain and declares every path input", () => {
    const groupIds = new Set(TENANT_OPERATION_GROUPS.map((group) => group.id));

    for (const operation of TENANT_OPERATIONS) {
      expect(groupIds.has(operation.group)).toBe(true);
      expect(operation.pathParameters ?? []).toEqual(placeholders(operation.path));
    }
  });

  it("requires explicit confirmation for every state-changing operation", () => {
    const unsafeWithoutConfirmation = TENANT_OPERATIONS.filter(
      (operation) => operation.method !== "GET" && !operation.confirmationRequired,
    );

    expect(unsafeWithoutConfirmation).toEqual([]);
  });

  it("routes the multipart upload through its guided workflow", () => {
    expect(
      TENANT_OPERATIONS.filter((operation) => operation.availability === "guided-only").map(
        (operation) => operation.id,
      ),
    ).toEqual(["POST /v1/arc/sources/uploads"]);
  });
});
