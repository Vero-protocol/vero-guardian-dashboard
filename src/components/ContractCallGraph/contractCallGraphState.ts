/**
 * Contract call graph logic (issue #53)
 *
 * Pure functions for building and querying the directed call-graph data model.
 * Cytoscape element definitions are produced here so the component stays thin
 * and these functions stay unit-testable without a DOM.
 */

import type { ElementDefinition } from 'cytoscape';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** A single contract function (graph node). */
export interface CallGraphNode {
  /** Unique identifier — matches the `id` used in edges. */
  id: string;
  /** Display label shown inside the node. */
  label: string;
  /**
   * Semantic category drives node colour.
   * - `entry`    — publicly callable top-level functions
   * - `internal` — private/helper functions called only from within the contract
   * - `external` — cross-contract calls (other deployed contracts)
   * - `event`    — emitted events (sink nodes, no outgoing calls)
   */
  kind: 'entry' | 'internal' | 'external' | 'event';
  /** Optional gas cost hint — surfaced in the tooltip. */
  gasCost?: number;
}

/** A directed call relationship between two functions (graph edge). */
export interface CallGraphEdge {
  /** Source node id (caller). */
  source: string;
  /** Target node id (callee). */
  target: string;
  /** Optional label shown on the edge (e.g. "conditional", "loop"). */
  label?: string;
  /** When true the edge is drawn as dashed to indicate a conditional call. */
  conditional?: boolean;
}

/** The full call graph definition passed to the component. */
export interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
}

// ---------------------------------------------------------------------------
// Cytoscape element builder
// ---------------------------------------------------------------------------

/**
 * Convert a `CallGraph` into a flat array of Cytoscape `ElementDefinition`
 * objects ready to pass to `cytoscape({ elements })`.
 */
export function buildCytoscapeElements(graph: CallGraph): ElementDefinition[] {
  const nodeElements: ElementDefinition[] = graph.nodes.map((node) => ({
    group: 'nodes' as const,
    data: {
      id: node.id,
      label: node.label,
      kind: node.kind,
      gasCost: node.gasCost ?? 0,
    },
  }));

  const edgeElements: ElementDefinition[] = graph.edges.map((edge, i) => ({
    group: 'edges' as const,
    data: {
      id: `edge-${edge.source}-${edge.target}-${i}`,
      source: edge.source,
      target: edge.target,
      label: edge.label ?? '',
      conditional: edge.conditional ?? false,
    },
  }));

  return [...nodeElements, ...edgeElements];
}

// ---------------------------------------------------------------------------
// Graph analysis helpers (all pure, exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Return the set of node ids that have no incoming edges (root callers).
 * These are the true entry-points of the call graph.
 */
export function findRoots(graph: CallGraph): string[] {
  const targeted = new Set(graph.edges.map((e) => e.target));
  return graph.nodes
    .filter((n) => !targeted.has(n.id))
    .map((n) => n.id);
}

/**
 * Return the set of node ids that have no outgoing edges (leaf callees).
 */
export function findLeaves(graph: CallGraph): string[] {
  const sources = new Set(graph.edges.map((e) => e.source));
  return graph.nodes
    .filter((n) => !sources.has(n.id))
    .map((n) => n.id);
}

/**
 * Count the number of unique callers for each node (in-degree).
 * Useful for highlighting heavily-depended-on functions.
 */
export function computeInDegree(graph: CallGraph): Record<string, number> {
  const degrees: Record<string, number> = {};
  for (const node of graph.nodes) {
    degrees[node.id] = 0;
  }
  for (const edge of graph.edges) {
    degrees[edge.target] = (degrees[edge.target] ?? 0) + 1;
  }
  return degrees;
}

/**
 * Return all direct callees of a given node id.
 */
export function getCallees(graph: CallGraph, nodeId: string): string[] {
  return graph.edges
    .filter((e) => e.source === nodeId)
    .map((e) => e.target);
}

/**
 * Return all direct callers of a given node id.
 */
export function getCallers(graph: CallGraph, nodeId: string): string[] {
  return graph.edges
    .filter((e) => e.target === nodeId)
    .map((e) => e.source);
}

// ---------------------------------------------------------------------------
// Cytoscape stylesheet
// ---------------------------------------------------------------------------

/** Colour palette per node kind. */
export const NODE_COLORS: Record<CallGraphNode['kind'], { bg: string; border: string; text: string }> = {
  entry:    { bg: '#6366f1', border: '#4338ca', text: '#ffffff' },
  internal: { bg: '#0ea5e9', border: '#0284c7', text: '#ffffff' },
  external: { bg: '#f59e0b', border: '#d97706', text: '#ffffff' },
  event:    { bg: '#10b981', border: '#059669', text: '#ffffff' },
};

/** Build a Cytoscape stylesheet array for the call graph. */
export function buildStylesheet(): any[] {
  return [
    {
      selector: 'node',
      style: {
        'label': 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '11px',
        'font-family': 'ui-monospace, monospace',
        'width': 'label',
        'height': 'label',
        'padding': '10px',
        'border-width': 2,
        'shape': 'round-rectangle',
        'color': '#ffffff',
        'text-wrap': 'wrap',
        'text-max-width': '120px',
      } as any,
    },
    // Per-kind node colours
    ...(['entry', 'internal', 'external', 'event'] as CallGraphNode['kind'][]).map((kind) => ({
      selector: `node[kind = "${kind}"]`,
      style: {
        'background-color': NODE_COLORS[kind].bg,
        'border-color': NODE_COLORS[kind].border,
      } as any,
    })),
    // Selected node highlight
    {
      selector: 'node:selected',
      style: {
        'border-width': 3,
        'border-color': '#f8fafc',
        'overlay-color': '#6366f1',
        'overlay-padding': '4px',
        'overlay-opacity': 0.2,
      } as any,
    },
    // Edges
    {
      selector: 'edge',
      style: {
        'width': 1.5,
        'line-color': '#94a3b8',
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'font-size': '9px',
        'color': '#94a3b8',
        'text-background-color': '#f8fafc',
        'text-background-opacity': 0.8,
        'text-background-padding': '2px',
      } as any,
    },
    // Conditional edges — dashed
    {
      selector: 'edge[conditional = 1]',
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [6, 3],
      } as any,
    },
    // Dimmed state when a neighbour is focused
    {
      selector: '.dimmed',
      style: {
        'opacity': 0.2,
      } as any,
    },
    {
      selector: '.highlighted',
      style: {
        'border-width': 3,
        'border-color': '#f8fafc',
      } as any,
    },
  ];
}

// ---------------------------------------------------------------------------
// Seed / demo data
// ---------------------------------------------------------------------------

/**
 * Representative call graph for the Vero smart contract suite.
 * Injectable via props so real static-analysis output can replace it.
 */
export const DEFAULT_CALL_GRAPH: CallGraph = {
  nodes: [
    { id: 'cast_vote',       label: 'cast_vote',        kind: 'entry',    gasCost: 12_500_000 },
    { id: 'register_task',   label: 'register_task',    kind: 'entry',    gasCost: 9_800_000  },
    { id: 'tally_votes',     label: 'tally_votes',      kind: 'entry',    gasCost: 41_200_000 },
    { id: 'set_role',        label: 'set_role',          kind: 'entry',    gasCost: 7_400_000  },
    { id: 'get_reputation',  label: 'get_reputation',   kind: 'entry',    gasCost: 3_100_000  },
    { id: 'verify_guardian', label: 'verify_guardian',  kind: 'internal', gasCost: 1_200_000  },
    { id: 'check_threshold', label: 'check_threshold',  kind: 'internal', gasCost: 800_000    },
    { id: 'update_score',    label: 'update_score',     kind: 'internal', gasCost: 2_400_000  },
    { id: 'read_reputation', label: 'read_reputation',  kind: 'external', gasCost: 500_000    },
    { id: 'evt_vote_cast',   label: 'VoteCast',         kind: 'event'                          },
    { id: 'evt_task_reg',    label: 'TaskRegistered',   kind: 'event'                          },
    { id: 'evt_role_set',    label: 'RoleSet',          kind: 'event'                          },
    { id: 'evt_tally_done',  label: 'TallyComplete',    kind: 'event'                          },
  ],
  edges: [
    { source: 'cast_vote',       target: 'verify_guardian',  label: '' },
    { source: 'cast_vote',       target: 'check_threshold',  label: '', conditional: true },
    { source: 'cast_vote',       target: 'update_score',     label: '' },
    { source: 'cast_vote',       target: 'evt_vote_cast',    label: '' },
    { source: 'register_task',   target: 'verify_guardian',  label: '' },
    { source: 'register_task',   target: 'evt_task_reg',     label: '' },
    { source: 'tally_votes',     target: 'check_threshold',  label: '' },
    { source: 'tally_votes',     target: 'update_score',     label: '' },
    { source: 'tally_votes',     target: 'evt_tally_done',   label: '' },
    { source: 'set_role',        target: 'verify_guardian',  label: '' },
    { source: 'set_role',        target: 'evt_role_set',     label: '' },
    { source: 'get_reputation',  target: 'read_reputation',  label: '' },
    { source: 'update_score',    target: 'read_reputation',  label: '' },
    { source: 'verify_guardian', target: 'read_reputation',  label: '', conditional: true },
  ],
};
