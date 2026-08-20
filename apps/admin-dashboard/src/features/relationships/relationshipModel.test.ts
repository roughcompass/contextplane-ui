import { describe, expect, it } from "vitest";

import type { RelationshipEdge, RelationshipTraversalResult } from "../../shared/api";
import {
  defaultRelationshipState,
  groupRelationshipEdges,
  normalizeRelationshipState,
  parseRelationshipEdgeTypes,
  readRelationshipUrlState,
  relationshipAsOf,
  relationshipCaveats,
  relationshipPropertiesSummary,
  relationshipSearch,
  validateRelationshipState,
} from "./relationshipModel";

const edges: readonly RelationshipEdge[] = [
  {
    dst_entity_id: "entity-b",
    edge_id: "edge-a",
    properties: { version_constraint: ">=2.0.0" },
    rel: "depends_on",
    src_entity_id: "entity-a",
  },
  {
    dst_entity_id: "entity-c",
    edge_id: "edge-b",
    properties: null,
    rel: "integrates_with",
    src_entity_id: "entity-a",
  },
  {
    dst_entity_id: "entity-d",
    edge_id: "edge-c",
    properties: null,
    rel: "depends_on",
    src_entity_id: "entity-c",
  },
];

const traversal: RelationshipTraversalResult = {
  as_of: "2026-08-13T10:00:00Z",
  cache_hit: true,
  depth: 3,
  direction: "reverse",
  edges: [...edges],
  nodes: [],
  root_entity_id: "entity-a",
  version_satisfied: { "edge-a": true, "edge-b": false, "edge-c": false },
};

describe("relationship model", () => {
  it("reads valid URL state and rejects unsupported closed values", () => {
    expect(
      readRelationshipUrlState(
        "?root=identity&question=blast-radius&depth=5&direction=forward&relations=depends_on&as_of=2026-08-13T10%3A00%3A00Z&version=2.4.0",
      ),
    ).toEqual({
      area: "explore",
      asOf: "2026-08-13T10:00:00Z",
      asOfVersion: "2.4.0",
      cursor: "",
      depth: 5,
      direction: "forward",
      edgeTypes: "depends_on",
      projection: "provider",
      question: "blast-radius",
      root: "identity",
      view: "table",
    });
    expect(readRelationshipUrlState("?question=unknown&depth=9&direction=sideways")).toEqual(
      defaultRelationshipState,
    );
  });

  it("serializes only applicable state and preserves a shareable root", () => {
    expect(
      relationshipSearch({
        area: "explore",
        asOf: "2026-08-13T10:00:00Z",
        asOfVersion: "2.4.0",
        cursor: "",
        depth: 5,
        direction: "forward",
        edgeTypes: "depends_on, requires",
        projection: "provider",
        question: "blast-radius",
        root: "identity platform",
        view: "table",
      }),
    ).toBe(
      "?root=identity+platform&question=blast-radius&depth=5&direction=forward&relations=depends_on%2C+requires&as_of=2026-08-13T10%3A00%3A00Z&version=2.4.0",
    );

    expect(
      relationshipSearch({
        ...defaultRelationshipState,
        asOfVersion: "ignored",
        direction: "forward",
        edgeTypes: "ignored",
        question: "dependencies",
        root: "identity",
      }),
    ).toBe("?root=identity&question=dependencies");

    expect(
      relationshipSearch({
        ...defaultRelationshipState,
        area: "projections",
        asOf: "2026-08-13T10:00:00Z",
        cursor: "opaque/current cursor",
        projection: "consumer",
      }),
    ).toBe(
      "?tab=projections&projection=consumer&cursor=opaque%2Fcurrent+cursor&as_of=2026-08-13T10%3A00%3A00Z",
    );
  });

  it("normalizes inapplicable fields and validates required or malformed input", () => {
    expect(
      normalizeRelationshipState({
        ...defaultRelationshipState,
        asOfVersion: " 2.0.0 ",
        direction: "forward",
        edgeTypes: " depends_on ",
        question: "dependencies",
        root: " identity ",
      }),
    ).toEqual({
      ...defaultRelationshipState,
      question: "dependencies",
      root: "identity",
    });
    expect(validateRelationshipState(defaultRelationshipState)).toEqual({
      root: "Enter a capability UUID or slug.",
    });
    expect(
      validateRelationshipState({ ...defaultRelationshipState, asOf: "not-a-date", root: "x" }),
    ).toEqual({ asOf: "Enter a valid ISO 8601 timestamp." });
    expect(relationshipAsOf("2026-08-13T10:00:00+02:00")).toBe("2026-08-13T08:00:00.000Z");
  });

  it("parses and de-duplicates comma or whitespace separated edge relations", () => {
    expect(parseRelationshipEdgeTypes("depends_on, requires depends_on")).toEqual([
      "depends_on",
      "requires",
    ]);
    expect(parseRelationshipEdgeTypes("  ")).toBeUndefined();
  });

  it("groups in service order and reports properties without inventing fields", () => {
    const groups = [...groupRelationshipEdges(edges).entries()];
    expect(groups.map(([relation]) => relation)).toEqual(["depends_on", "integrates_with"]);
    expect(groups[0]?.[1].map((edge) => edge.edge_id)).toEqual(["edge-a", "edge-c"]);
    expect(relationshipPropertiesSummary(edges[0]?.properties ?? null)).toBe(
      "Version Constraint: >=2.0.0",
    );
    expect(relationshipPropertiesSummary(null)).toBe("None published");
  });

  it("reports cache and unresolved-version caveats as one answer scope", () => {
    expect(relationshipCaveats(traversal)).toEqual([
      "This closure was served from cache, so an edge written in the last moments may be missing.",
      "2 version constraints could not be resolved, so those edges are reported without version agreement.",
    ]);
    expect(
      relationshipCaveats({
        ...traversal,
        cache_hit: false,
        version_satisfied: { "edge-a": true },
      }),
    ).toEqual([]);
  });
});
