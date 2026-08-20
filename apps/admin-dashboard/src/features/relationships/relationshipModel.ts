import type {
  RelationshipDepth,
  RelationshipDirection,
  RelationshipEdge,
  RelationshipEntity,
  RelationshipTraversalResult,
} from "../../shared/api";

export const relationshipQuestions = [
  {
    description: "Who needs this capability. Read this before changing it.",
    id: "dependents",
    label: "Used by",
  },
  {
    description: "What this capability needs. Read this before building on it.",
    id: "dependencies",
    label: "Depends on",
  },
  {
    description: "Everything a change here could reach, transitively.",
    id: "blast-radius",
    label: "Blast radius",
  },
] as const;

export type RelationshipQuestion = (typeof relationshipQuestions)[number]["id"];

export const relationshipAreas = [
  { id: "explore", label: "Explore impact" },
  { id: "projections", label: "Tenant projections" },
] as const;
export type RelationshipArea = (typeof relationshipAreas)[number]["id"];

/**
 * Explore renders the same traversal two ways. A view is part of the address
 * because the design standard requires graph focus to survive reload and
 * sharing: a copied link has to come back as the view the sender was looking at.
 */
export const relationshipViews = [
  { id: "table", label: "Table" },
  { id: "graph", label: "Graph" },
] as const;
export type RelationshipView = (typeof relationshipViews)[number]["id"];

export const relationshipProjections = [
  { id: "provider", label: "What this tenant ships" },
  { id: "consumer", label: "What this tenant consumes" },
] as const;
export type RelationshipProjection = (typeof relationshipProjections)[number]["id"];

export interface RelationshipUrlState {
  area: RelationshipArea;
  asOf: string;
  asOfVersion: string;
  cursor: string;
  depth: RelationshipDepth;
  direction: RelationshipDirection;
  edgeTypes: string;
  projection: RelationshipProjection;
  question: RelationshipQuestion;
  root: string;
  view: RelationshipView;
}

export interface RelationshipValidation {
  asOf?: string;
  root?: string;
}

export const defaultRelationshipState: RelationshipUrlState = {
  area: "explore",
  asOf: "",
  asOfVersion: "",
  cursor: "",
  depth: 2,
  direction: "reverse",
  edgeTypes: "",
  projection: "provider",
  question: "dependents",
  root: "",
  view: "table",
};

export function isRelationshipQuestion(value: string | null): value is RelationshipQuestion {
  return relationshipQuestions.some((question) => question.id === value);
}

export function isRelationshipArea(value: string | null): value is RelationshipArea {
  return value === "explore" || value === "projections";
}

export function isRelationshipProjection(value: string | null): value is RelationshipProjection {
  return value === "provider" || value === "consumer";
}

export function isRelationshipDepth(value: number): value is RelationshipDepth {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function isRelationshipDirection(value: string | null): value is RelationshipDirection {
  return value === "forward" || value === "reverse";
}

export function isRelationshipView(value: string | null): value is RelationshipView {
  return value === "table" || value === "graph";
}

export function readRelationshipUrlState(search = window.location.search): RelationshipUrlState {
  const parameters = new URLSearchParams(search);
  const question = parameters.get("question");
  const depth = Number(parameters.get("depth"));
  const direction = parameters.get("direction");
  const area = parameters.get("tab");
  const projection = parameters.get("projection");

  return {
    area: isRelationshipArea(area) ? area : defaultRelationshipState.area,
    asOf: parameters.get("as_of") ?? "",
    asOfVersion: parameters.get("version") ?? "",
    cursor: parameters.get("cursor") ?? "",
    depth: isRelationshipDepth(depth) ? depth : defaultRelationshipState.depth,
    direction: isRelationshipDirection(direction) ? direction : defaultRelationshipState.direction,
    edgeTypes: parameters.get("relations") ?? "",
    projection: isRelationshipProjection(projection)
      ? projection
      : defaultRelationshipState.projection,
    question: isRelationshipQuestion(question) ? question : defaultRelationshipState.question,
    root: parameters.get("root") ?? "",
    view: isRelationshipView(parameters.get("view"))
      ? (parameters.get("view") as RelationshipView)
      : defaultRelationshipState.view,
  };
}

export function relationshipSearch(state: RelationshipUrlState): string {
  const parameters = new URLSearchParams();
  const root = state.root.trim();
  const edgeTypes = state.edgeTypes.trim();
  const asOf = state.asOf.trim();
  const asOfVersion = state.asOfVersion.trim();

  if (state.area === "projections") {
    parameters.set("tab", "projections");
    if (state.projection !== defaultRelationshipState.projection) {
      parameters.set("projection", state.projection);
    }
    if (state.cursor) parameters.set("cursor", state.cursor);
    if (asOf) parameters.set("as_of", asOf);
    return `?${parameters.toString()}`;
  }

  if (root) parameters.set("root", root);
  if (state.question !== defaultRelationshipState.question) {
    parameters.set("question", state.question);
  }
  if (state.depth !== defaultRelationshipState.depth) {
    parameters.set("depth", String(state.depth));
  }
  if (state.question === "blast-radius" && state.direction !== "reverse") {
    parameters.set("direction", state.direction);
  }
  if (state.question !== "dependencies" && edgeTypes) {
    parameters.set("relations", edgeTypes);
  }
  if (asOf) parameters.set("as_of", asOf);
  if (state.question !== "dependencies" && asOfVersion) {
    parameters.set("version", asOfVersion);
  }
  if (state.view !== defaultRelationshipState.view) parameters.set("view", state.view);

  const query = parameters.toString();
  return query ? `?${query}` : "";
}

export function normalizeRelationshipState(state: RelationshipUrlState): RelationshipUrlState {
  if (state.area === "projections") {
    return {
      ...defaultRelationshipState,
      area: "projections",
      asOf: state.asOf.trim(),
      cursor: state.cursor,
      projection: state.projection,
    };
  }
  return {
    ...state,
    asOf: state.asOf.trim(),
    asOfVersion: state.question === "dependencies" ? "" : state.asOfVersion.trim(),
    direction: state.question === "blast-radius" ? state.direction : "reverse",
    edgeTypes: state.question === "dependencies" ? "" : state.edgeTypes.trim(),
    root: state.root.trim(),
  };
}

export function validateRelationshipState(state: RelationshipUrlState): RelationshipValidation {
  const validation: RelationshipValidation = {};
  if (state.area === "explore" && !state.root.trim()) {
    validation.root = "Enter a capability UUID or slug.";
  }

  const asOf = state.asOf.trim();
  if (asOf) {
    const instant = new Date(asOf);
    if (Number.isNaN(instant.getTime())) {
      validation.asOf = "Enter a valid ISO 8601 timestamp.";
    }
  }

  return validation;
}

export function relationshipAsOf(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return new Date(value).toISOString();
}

export function parseRelationshipEdgeTypes(value: string): readonly string[] | undefined {
  const edgeTypes = value
    .split(/[\s,]+/)
    .map((edgeType) => edgeType.trim())
    .filter(Boolean);
  return edgeTypes.length > 0 ? [...new Set(edgeTypes)] : undefined;
}

export function relationshipQuestionLabel(question: RelationshipQuestion): string {
  return relationshipQuestions.find((candidate) => candidate.id === question)?.label ?? question;
}

export function relationshipQuestionDescription(question: RelationshipQuestion): string {
  return relationshipQuestions.find((candidate) => candidate.id === question)?.description ?? "";
}

export function humanizeRelationship(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortRelationshipIdentifier(value: string): string {
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function groupRelationshipEdges(
  edges: readonly RelationshipEdge[],
): ReadonlyMap<string, readonly RelationshipEdge[]> {
  const groups = new Map<string, RelationshipEdge[]>();
  for (const edge of edges) {
    const existing = groups.get(edge.rel);
    if (existing) existing.push(edge);
    else groups.set(edge.rel, [edge]);
  }
  return groups;
}

export function relationshipNodeLookup(
  nodes: readonly RelationshipEntity[],
): ReadonlyMap<string, RelationshipEntity> {
  return new Map(nodes.map((node) => [node.entity_id, node]));
}

export function relationshipPropertiesSummary(properties: Record<string, unknown> | null): string {
  if (!properties || Object.keys(properties).length === 0) return "None published";
  return Object.entries(properties)
    .map(([key, value]) => {
      const rendered = typeof value === "string" ? value : JSON.stringify(value);
      return `${humanizeRelationship(key)}: ${rendered}`;
    })
    .join(" · ");
}

export function unsatisfiedRelationshipEdges(
  traversal: RelationshipTraversalResult,
): readonly string[] {
  return Object.entries(traversal.version_satisfied)
    .filter(([, satisfied]) => !satisfied)
    .map(([edgeId]) => edgeId);
}

export function relationshipCaveats(traversal: RelationshipTraversalResult): readonly string[] {
  const caveats: string[] = [];
  if (traversal.cache_hit) {
    caveats.push(
      "This closure was served from cache, so an edge written in the last moments may be missing.",
    );
  }
  const unresolved = unsatisfiedRelationshipEdges(traversal).length;
  if (unresolved > 0) {
    caveats.push(
      `${unresolved} version ${unresolved === 1 ? "constraint could" : "constraints could"} not be resolved, so those edges are reported without version agreement.`,
    );
  }
  return caveats;
}
