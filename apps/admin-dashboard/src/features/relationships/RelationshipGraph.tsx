import { Network } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { EmptyState } from "@repo/ui/layouts";
import { Button, SearchField, StatusBadge } from "@repo/ui/primitives";

import type {
  RelationshipEdge,
  RelationshipEntity,
  RelationshipTraversalResult,
} from "../../shared/api";
import {
  DEFAULT_VISIBLE_DEPTH,
  layoutRelationshipGraph,
  matchingNodes,
  nextFocusedNode,
  type GraphNode,
} from "./relationshipGraphLayout";
import { humanizeRelationship, shortRelationshipIdentifier } from "./relationshipModel";

const ARROW_KEYS = ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"] as const;
type ArrowKey = (typeof ARROW_KEYS)[number];

function isArrowKey(key: string): key is ArrowKey {
  return (ARROW_KEYS as readonly string[]).includes(key);
}

const NODE_WIDTH = 168;
const NODE_HEIGHT = 44;

interface RelationshipGraphProps {
  asOf: string;
  direction: string;
  edges: readonly RelationshipEdge[];
  entities: readonly RelationshipEntity[];
  question: string;
  rootEntityId: string;
  traversal: RelationshipTraversalResult | null;
  version: string;
}

/**
 * The traversal as a node-link diagram, beside the table rather than instead of
 * it.
 *
 * Every node is a `<button>` in the accessibility tree, so tab order, screen
 * readers and `:focus-visible` all work without being reimplemented. Arrow keys
 * move between nodes as an enhancement on top of that, never as the only way:
 * an operator who only presses Tab reaches every node, and selecting one opens
 * the same detail a table row opens. Nothing here needs a drag or a remembered
 * position.
 */
export function RelationshipGraph({
  asOf,
  direction,
  edges,
  entities,
  question,
  rootEntityId,
  traversal,
  version,
}: RelationshipGraphProps) {
  const titleId = useId();
  const [visibleDepth, setVisibleDepth] = useState(DEFAULT_VISIBLE_DEPTH);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);

  const layout = useMemo(
    () => layoutRelationshipGraph({ edges, entities, rootEntityId, visibleDepth }),
    [edges, entities, rootEntityId, visibleDepth],
  );

  const matches = useMemo(() => matchingNodes(layout.nodes, search), [layout.nodes, search]);
  const matchedIds = useMemo(() => new Set(matches.map((node) => node.entityId)), [matches]);
  const selectedNode = layout.nodes.find((node) => node.entityId === selected) ?? null;

  function focusNode(entityId: string) {
    setSelected(entityId);
    svgRef.current
      ?.querySelector<SVGGraphicsElement>(`[data-entity-id="${CSS.escape(entityId)}"]`)
      ?.focus();
  }

  function onNodeKeyDown(event: React.KeyboardEvent, node: GraphNode) {
    if (!isArrowKey(event.key)) return;
    const target = nextFocusedNode(layout.nodes, node.entityId, event.key);
    if (!target) return;
    event.preventDefault();
    focusNode(target);
  }

  if (layout.nodes.length <= 1 && layout.edges.length === 0) {
    return (
      <EmptyState
        description="The service returned no connections to draw at this depth and time. The table view shows the same answer."
        icon={Network}
        title="Nothing to plot for this traversal"
      />
    );
  }

  return (
    <div className="space-y-4 p-6">
      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="inline text-muted">Focus</dt>{" "}
          <dd className="inline font-medium text-foreground">
            {layout.nodes.find((node) => node.depth === 0)?.name ??
              shortRelationshipIdentifier(rootEntityId)}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted">Question</dt>{" "}
          <dd className="inline text-foreground">{question}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Direction</dt>{" "}
          <dd className="inline text-foreground">{direction}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Hops shown</dt>{" "}
          <dd className="inline text-foreground">
            {visibleDepth} of {layout.maxDepth}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted">Time</dt>{" "}
          <dd className="inline text-foreground">{asOf || "Current graph time"}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Version</dt>{" "}
          <dd className="inline text-foreground">{version || "Not constrained"}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <SearchField
          className="w-full sm:w-72"
          label="Find a node by name or ID"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or UUID"
          value={search}
        />
        <Button
          disabled={visibleDepth >= layout.maxDepth}
          onClick={() => setVisibleDepth((depth) => depth + 1)}
          size="compact"
          variant="secondary"
        >
          Expand one hop
        </Button>
        <Button
          disabled={visibleDepth <= DEFAULT_VISIBLE_DEPTH}
          onClick={() => setVisibleDepth(DEFAULT_VISIBLE_DEPTH)}
          size="compact"
          variant="secondary"
        >
          Collapse to one hop
        </Button>
      </div>

      <p aria-live="polite" className="text-xs text-muted">
        {search
          ? `${matches.length} of ${layout.nodes.length} plotted nodes match “${search}”.`
          : `${layout.nodes.length} nodes and ${layout.edges.length} edges plotted.`}
        {layout.hiddenNodeCount > 0
          ? ` ${layout.hiddenNodeCount} further ${layout.hiddenNodeCount === 1 ? "node is" : "nodes are"} beyond ${visibleDepth} ${visibleDepth === 1 ? "hop" : "hops"} and not drawn.`
          : ""}
        {layout.unreachableNodeCount > 0
          ? ` ${layout.unreachableNodeCount} returned ${layout.unreachableNodeCount === 1 ? "node is" : "nodes are"} not reachable from the focus by any returned edge.`
          : ""}
      </p>

      {layout.legend.length > 0 ? (
        <ul aria-label="Relationship types drawn" className="flex flex-wrap gap-2">
          {layout.legend.map((relationship) => (
            <li key={relationship}>
              <StatusBadge>{humanizeRelationship(relationship)}</StatusBadge>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border bg-surface-muted/40">
        <svg
          ref={svgRef}
          aria-labelledby={titleId}
          className="min-w-full"
          height={layout.height}
          role="group"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
        >
          <title id={titleId}>
            Relationship graph focused on{" "}
            {layout.nodes.find((node) => node.depth === 0)?.name ?? rootEntityId}, showing{" "}
            {layout.nodes.length} nodes across {visibleDepth + 1} hop columns. Every node is also
            listed in the table view.
          </title>
          <g aria-hidden="true">
            {layout.edges.map((edge) => {
              const from = layout.nodes.find((node) => node.entityId === edge.source);
              const to = layout.nodes.find((node) => node.entityId === edge.destination);
              if (!from || !to) return null;
              const highlighted =
                selected !== null && (edge.source === selected || edge.destination === selected);
              return (
                <line
                  key={edge.edgeId}
                  className={highlighted ? "stroke-accent" : "stroke-border-subtle"}
                  strokeWidth={highlighted ? 2 : 1}
                  x1={from.x}
                  x2={to.x}
                  y1={from.y}
                  y2={to.y}
                />
              );
            })}
          </g>
          {layout.nodes.map((node) => {
            const isSelected = node.entityId === selected;
            const isMatch = matchedIds.has(node.entityId);
            return (
              <g
                key={node.entityId}
                data-entity-id={node.entityId}
                aria-current={isSelected ? "true" : undefined}
                aria-label={`${node.name}, ${node.depth === 0 ? "the focus" : `${node.depth} ${node.depth === 1 ? "hop" : "hops"} away`}, ${node.neighbours.length} drawn ${node.neighbours.length === 1 ? "connection" : "connections"}`}
                className="cursor-pointer focus:outline-2 focus:outline-offset-2 focus:outline-accent"
                onClick={() => setSelected(node.entityId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(node.entityId);
                    return;
                  }
                  onNodeKeyDown(event, node);
                }}
                role="button"
                tabIndex={0}
              >
                <rect
                  className={
                    node.depth === 0
                      ? "fill-accent/15 stroke-accent"
                      : isSelected
                        ? "fill-surface stroke-accent"
                        : isMatch
                          ? "fill-surface stroke-warning"
                          : "fill-surface stroke-border"
                  }
                  height={NODE_HEIGHT}
                  rx={6}
                  strokeWidth={isSelected || node.depth === 0 ? 2 : 1}
                  width={NODE_WIDTH}
                  x={node.x - NODE_WIDTH / 2}
                  y={node.y - NODE_HEIGHT / 2}
                />
                <text
                  className="fill-foreground text-xs"
                  textAnchor="middle"
                  x={node.x}
                  y={node.y + 4}
                >
                  {node.name.length > 22 ? `${node.name.slice(0, 21)}…` : node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {matches.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold text-foreground">Matching nodes</h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {matches.map((node) => (
              <li key={node.entityId}>
                <Button onClick={() => focusNode(node.entityId)} size="compact" variant="secondary">
                  {node.name}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedNode ? (
        <section
          aria-label={`Detail for ${selectedNode.name}`}
          className="rounded-md border border-border bg-surface p-4"
        >
          <h4 className="text-sm font-semibold text-foreground">{selectedNode.name}</h4>
          <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted">Entity ID</dt>
            <dd className="break-all font-mono text-foreground">{selectedNode.entityId}</dd>
            <dt className="text-muted">Type</dt>
            <dd className="text-foreground">
              {selectedNode.entity
                ? humanizeRelationship(selectedNode.entity.entity_type)
                : "Not returned with this traversal"}
            </dd>
            <dt className="text-muted">External ID</dt>
            <dd className="break-all font-mono text-foreground">
              {selectedNode.entity?.external_id ?? "Not assigned"}
            </dd>
            <dt className="text-muted">Hops from focus</dt>
            <dd className="text-foreground">{selectedNode.depth}</dd>
            <dt className="text-muted">Drawn connections</dt>
            <dd className="text-foreground">{selectedNode.neighbours.length}</dd>
            <dt className="text-muted">Version agreement</dt>
            <dd className="text-foreground">
              {traversal ? versionSummary(selectedNode, layout.edges, traversal) : "Not evaluated"}
            </dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}

function versionSummary(
  node: GraphNode,
  edges: readonly { destination: string; edgeId: string; source: string }[],
  traversal: RelationshipTraversalResult,
): string {
  const touching = edges.filter(
    (edge) => edge.source === node.entityId || edge.destination === node.entityId,
  );
  const evaluated = touching.filter((edge) => edge.edgeId in traversal.version_satisfied);
  if (evaluated.length === 0) return "Not evaluated";
  const unresolved = evaluated.filter((edge) => !traversal.version_satisfied[edge.edgeId]).length;
  return unresolved === 0
    ? `Satisfied on all ${evaluated.length} evaluated`
    : `${unresolved} of ${evaluated.length} evaluated unresolved`;
}
