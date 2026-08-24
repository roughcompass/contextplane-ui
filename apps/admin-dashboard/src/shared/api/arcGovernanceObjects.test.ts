import { describe, expect, it, vi } from "vitest";

import { clientFromRequest } from "./client";
import { listArcGovernanceObjects, listArcGovernanceOptions } from "./arcGovernanceObjects";

const CONNECTOR = {
  created_at: "2026-08-22T09:00:00Z",
  detail: { allowed_hosts: ["policy.example.com"], max_bytes: 1048576 },
  in_force: true,
  in_force_until: null,
  kind: "source_connector",
  object_id: "connector-a",
  scope: "global",
  target_tenant_id: null,
};

const REVOKED = {
  ...CONNECTOR,
  in_force: false,
  in_force_until: "2026-08-23T09:00:00Z",
  object_id: "connector-b",
};

function testClient(items: readonly unknown[] = [CONNECTOR]) {
  const paths: string[] = [];
  const request = vi.fn(async (path: string) => {
    paths.push(path);
    return { items };
  });
  return { client: clientFromRequest(request), paths };
}

describe("listArcGovernanceObjects", () => {
  it("reads each collection from its own path", async () => {
    // E19-T7's defect: the endpoint is part of the behaviour. A test asserting
    // the parsed body but not the path passes while a call goes somewhere else.
    const cases = [
      ["approvalEvidence", "/v1/arc/admin/approval-evidence"],
      ["approvalVerifiers", "/v1/arc/admin/approval-verifiers"],
      ["replayCorpora", "/v1/arc/admin/observation-replay-corpora"],
      ["sourceConnectors", "/v1/arc/admin/source-connectors"],
      ["sourceUploadPolicies", "/v1/arc/admin/source-upload-policies"],
    ] as const;

    for (const [collection, path] of cases) {
      const { client, paths } = testClient();
      await listArcGovernanceObjects(client, collection);
      expect(paths).toEqual([path]);
    }
  });

  it("returns revoked objects alongside live ones", async () => {
    // The question an operator brings to these screens is usually about the
    // registration that is no longer there. A list filtered to what is in force
    // answers "nothing was ever registered" to that question.
    const { client } = testClient([CONNECTOR, REVOKED]);

    const rows = await listArcGovernanceObjects(client, "sourceConnectors");

    expect(rows.map((row) => row.object_id)).toEqual(["connector-a", "connector-b"]);
    expect(rows[1]?.in_force).toBe(false);
    expect(rows[1]?.in_force_until).toBe("2026-08-23T09:00:00Z");
  });

  it("asks for everything unless narrowing is requested", async () => {
    const { client, paths } = testClient();

    await listArcGovernanceObjects(client, "sourceConnectors");

    expect(paths[0]).not.toContain("in_force_only");
  });

  it("narrows to what is live when asked", async () => {
    const { client, paths } = testClient();

    await listArcGovernanceObjects(client, "sourceConnectors", { inForceOnly: true });

    expect(paths[0]).toContain("in_force_only=true");
  });

  it("scopes approval evidence to one revision when asked", async () => {
    const { client, paths } = testClient();

    await listArcGovernanceObjects(client, "approvalEvidence", { revisionId: "rev-1" });

    expect(paths[0]).toContain("revision_id=rev-1");
  });

  it("carries detail through without narrowing it", async () => {
    // Narrowing here would mean five type guards over five schemas the shared
    // endpoint does not promise, and a guard that refused an unfamiliar key
    // would turn a service that added a field into a dashboard showing nothing.
    const { client } = testClient([{ ...CONNECTOR, detail: { something_new: 1 } }]);

    const [row] = await listArcGovernanceObjects(client, "sourceConnectors");

    expect(row?.detail).toEqual({ something_new: 1 });
  });

  it("refuses a row missing a field the shape promises, and names it", async () => {
    const { client } = testClient([{ ...CONNECTOR, object_id: undefined }]);

    await expect(listArcGovernanceObjects(client, "sourceConnectors")).rejects.toThrow(
      /sourceConnectors\[0\] object_id/u,
    );
  });

  it("refuses a body whose items are not a list", async () => {
    const request = vi.fn(async () => ({ items: "connector-a" }));

    await expect(
      listArcGovernanceObjects(clientFromRequest(request), "sourceConnectors"),
    ).rejects.toThrow(/sourceConnectors items is not an array/u);
  });
});

describe("listArcGovernanceOptions", () => {
  it("offers only what is in force", async () => {
    // A list is a record of what happened; a picker is a set of things you may
    // choose. Offering a revoked verifier would let somebody grant approval
    // authority to a credential that no longer exists.
    const { client, paths } = testClient();

    const options = await listArcGovernanceOptions(client, "approvalVerifiers");

    expect(paths[0]).toContain("in_force_only=true");
    expect(options).toEqual([
      { description: "global", label: "connector-a", value: "connector-a" },
    ]);
  });
});
