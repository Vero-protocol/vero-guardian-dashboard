import { render, screen } from '@testing-library/react';
import { describe, expect, it, jest, beforeAll } from '@jest/globals';
import ContractCallGraph from '../StateStateStateStateStateStateStateStateStateStateContractCallGraph';
import {
  buildCytoscapeElements,
  computeInDegree,
  DEFAULT_CALL_GRAPH,
  findLeaves,
  findRoots,
  getCallees,
  getCallers,
  type CallGraph,
} from '../StateStateStateStateStateStateStateStateStateStatecontractCallGraph';

// ---------------------------------------------------------------------------
// Mock cytoscape — it uses window/document APIs not available in jsdom fully.
// We verify the component mounts and passes data correctly; graph rendering
// is an integration concern tested in a real browser.
// ---------------------------------------------------------------------------

const mockOn = jest.fn();
const mockDestroy = jest.fn();
const mockFit = jest.fn();
const mockZoom = jest.fn(() => 1);
const mockCenter = jest.fn();
const mockElements = jest.fn(() => ({ addClass: jest.fn(), removeClass: jest.fn() }));

const mockCyInstance = {
  on: mockOn,
  destroy: mockDestroy,
  fit: mockFit,
  zoom: mockZoom,
  center: mockCenter,
  elements: mockElements,
};

beforeAll(() => {
  jest.mock('cytoscape', () => ({
    __esModule: true,
    default: jest.fn(() => mockCyInstance),
  }));
});

// ---------------------------------------------------------------------------
// Pure logic — buildCytoscapeElements
// ---------------------------------------------------------------------------

describe('buildCytoscapeElements', () => {
  it('produces one element per node', () => {
    const elements = buildCytoscapeElements(DEFAULT_CALL_GRAPH);
    const nodes = elements.filter((e) => e.group === 'nodes');
    expect(nodes).toHaveLength(DEFAULT_CALL_GRAPH.nodes.length);
  });

  it('produces one element per edge', () => {
    const elements = buildCytoscapeElements(DEFAULT_CALL_GRAPH);
    const edges = elements.filter((e) => e.group === 'edges');
    expect(edges).toHaveLength(DEFAULT_CALL_GRAPH.edges.length);
  });

  it('copies node data fields correctly', () => {
    const elements = buildCytoscapeElements(DEFAULT_CALL_GRAPH);
    const node = elements.find((e) => e.data.id === 'cast_vote');
    expect(node).toBeDefined();
    expect(node?.data.label).toBe('cast_vote');
    expect(node?.data.kind).toBe('entry');
    expect(node?.data.gasCost).toBe(12_500_000);
  });

  it('sets edge source and target correctly', () => {
    const elements = buildCytoscapeElements(DEFAULT_CALL_GRAPH);
    const edge = elements.find(
      (e) => e.group === 'edges' && e.data.source === 'cast_vote' && e.data.target === 'verify_guardian',
    );
    expect(edge).toBeDefined();
  });

  it('marks conditional edges', () => {
    const elements = buildCytoscapeElements(DEFAULT_CALL_GRAPH);
    const conditionalEdge = elements.find(
      (e) => e.group === 'edges' && e.data.conditional === true,
    );
    expect(conditionalEdge).toBeDefined();
  });

  it('returns empty arrays for an empty graph', () => {
    const elements = buildCytoscapeElements({ nodes: [], edges: [] });
    expect(elements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — findRoots
// ---------------------------------------------------------------------------

describe('findRoots', () => {
  it('identifies nodes with no incoming edges', () => {
    const roots = findRoots(DEFAULT_CALL_GRAPH);
    // All entry-point functions are called from outside — they have no callers
    expect(roots).toContain('cast_vote');
    expect(roots).toContain('register_task');
    expect(roots).toContain('tally_votes');
  });

  it('returns all nodes when there are no edges', () => {
    const graph: CallGraph = {
      nodes: [
        { id: 'a', label: 'a', kind: 'entry' },
        { id: 'b', label: 'b', kind: 'internal' },
      ],
      edges: [],
    };
    expect(findRoots(graph)).toEqual(['a', 'b']);
  });

  it('returns an empty array for an empty graph', () => {
    expect(findRoots({ nodes: [], edges: [] })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — findLeaves
// ---------------------------------------------------------------------------

describe('findLeaves', () => {
  it('identifies nodes with no outgoing edges', () => {
    const leaves = findLeaves(DEFAULT_CALL_GRAPH);
    // Events have no outgoing calls — they are leaves
    expect(leaves).toContain('evt_vote_cast');
    expect(leaves).toContain('evt_task_reg');
    expect(leaves).toContain('evt_tally_done');
    expect(leaves).toContain('evt_role_set');
  });

  it('returns all nodes when there are no edges', () => {
    const graph: CallGraph = {
      nodes: [{ id: 'x', label: 'x', kind: 'event' }],
      edges: [],
    };
    expect(findLeaves(graph)).toEqual(['x']);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — computeInDegree
// ---------------------------------------------------------------------------

describe('computeInDegree', () => {
  it('returns zero in-degree for root nodes', () => {
    const degrees = computeInDegree(DEFAULT_CALL_GRAPH);
    expect(degrees['cast_vote']).toBe(0);
  });

  it('correctly counts multiple callers', () => {
    const degrees = computeInDegree(DEFAULT_CALL_GRAPH);
    // verify_guardian is called by cast_vote, register_task, set_role = 3
    expect(degrees['verify_guardian']).toBe(3);
  });

  it('returns zero for all nodes when there are no edges', () => {
    const graph: CallGraph = {
      nodes: [{ id: 'a', label: 'a', kind: 'entry' }],
      edges: [],
    };
    expect(computeInDegree(graph)['a']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pure logic — getCallees / getCallers
// ---------------------------------------------------------------------------

describe('getCallees', () => {
  it('returns direct callees of a node', () => {
    const callees = getCallees(DEFAULT_CALL_GRAPH, 'cast_vote');
    expect(callees).toContain('verify_guardian');
    expect(callees).toContain('update_score');
    expect(callees).toContain('evt_vote_cast');
  });

  it('returns an empty array for a leaf node', () => {
    expect(getCallees(DEFAULT_CALL_GRAPH, 'evt_vote_cast')).toHaveLength(0);
  });
});

describe('getCallers', () => {
  it('returns direct callers of a node', () => {
    const callers = getCallers(DEFAULT_CALL_GRAPH, 'verify_guardian');
    expect(callers).toContain('cast_vote');
    expect(callers).toContain('register_task');
    expect(callers).toContain('set_role');
  });

  it('returns an empty array for a root node', () => {
    expect(getCallers(DEFAULT_CALL_GRAPH, 'cast_vote')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Component — ContractCallGraph
// ---------------------------------------------------------------------------

describe('ContractCallGraph', () => {
  it('renders the heading', () => {
    render(<ContractCallGraph />);
    expect(screen.getByText('Contract Call Graph')).toBeTruthy();
  });

  it('shows the empty state when graph has no nodes', () => {
    render(<ContractCallGraph graph={{ nodes: [], edges: [] }} />);
    expect(screen.getByText('No contract call graph data available.')).toBeTruthy();
  });

  it('renders the stats strip with node and edge counts', () => {
    render(<ContractCallGraph graph={DEFAULT_CALL_GRAPH} />);
    expect(
      screen.getByText(String(DEFAULT_CALL_GRAPH.nodes.length)),
    ).toBeTruthy();
    expect(
      screen.getByText(String(DEFAULT_CALL_GRAPH.edges.length)),
    ).toBeTruthy();
  });

  it('renders the cytoscape container div', () => {
    render(<ContractCallGraph />);
    expect(screen.getByTestId('cytoscape-container')).toBeTruthy();
  });

  it('renders the legend with all four node kind labels', () => {
    render(<ContractCallGraph />);
    expect(screen.getByText('Entry')).toBeTruthy();
    expect(screen.getByText('Internal')).toBeTruthy();
    expect(screen.getByText('External')).toBeTruthy();
    expect(screen.getByText('Event')).toBeTruthy();
  });

  it('renders toolbar buttons', () => {
    render(<ContractCallGraph />);
    expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /zoom out/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /fit to screen/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reset graph/i })).toBeTruthy();
  });

  it('accepts a custom height prop', () => {
    render(<ContractCallGraph height={300} />);
    const container = screen.getByTestId('cytoscape-container');
    expect(container.style.height).toBe('300px');
  });
});
