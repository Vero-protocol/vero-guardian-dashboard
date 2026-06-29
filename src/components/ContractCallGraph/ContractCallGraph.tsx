'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { GitGraph, Maximize2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  buildCytoscapeElements,
  buildStylesheet,
  computeInDegree,
  DEFAULT_CALL_GRAPH,
  findLeaves,
  findRoots,
  NODE_COLORS,
  type CallGraph,
  type CallGraphNode,
} from './StateStateStateStateStatecontractCallGraph';

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const LEGEND_KINDS: CallGraphNode['kind'][] = ['entry', 'internal', 'external', 'event'];

const KIND_LABEL_KEYS: Record<CallGraphNode['kind'], string> = {
  entry:    'contractCallGraph.kindEntry',
  internal: 'contractCallGraph.kindInternal',
  external: 'contractCallGraph.kindExternal',
  event:    'contractCallGraph.kindEvent',
};

function Legend(): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-3">
      {LEGEND_KINDS.map((kind) => (
        <div key={kind} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: NODE_COLORS[kind].bg }}
            aria-hidden="true"
          />
          {t(KIND_LABEL_KEYS[kind])}
        </div>
      ))}
      <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <span className="w-5 h-0 border-t-2 border-dashed border-slate-400 shrink-0" aria-hidden="true" />
        {t('contractCallGraph.edgeConditional')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node detail panel
// ---------------------------------------------------------------------------

interface NodeDetail {
  id: string;
  label: string;
  kind: CallGraphNode['kind'];
  gasCost: number;
  inDegree: number;
  callers: string[];
  callees: string[];
}

function NodeDetailPanel({ detail, onClose }: { detail: NodeDetail; onClose: () => void }): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      role="region"
      aria-label={t('contractCallGraph.detailAriaLabel')}
      className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 z-10 text-xs space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono font-semibold text-slate-900 dark:text-white text-sm">{detail.label}</p>
          <span
            className="inline-block mt-1 rounded-full px-2 py-0.5 text-white font-semibold"
            style={{ backgroundColor: NODE_COLORS[detail.kind].bg }}
          >
            {t(KIND_LABEL_KEYS[detail.kind])}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('contractCallGraph.closeDetail')}
          className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
        >
          ✕
        </button>
      </div>

      {detail.gasCost > 0 && (
        <div className="flex justify-between">
          <span className="text-slate-500 dark:text-slate-400">{t('contractCallGraph.gasCost')}</span>
          <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
            {new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(detail.gasCost)}
          </span>
        </div>
      )}

      <div className="flex justify-between">
        <span className="text-slate-500 dark:text-slate-400">{t('contractCallGraph.inDegree')}</span>
        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">{detail.inDegree}</span>
      </div>

      {detail.callers.length > 0 && (
        <div>
          <p className="text-slate-500 dark:text-slate-400 mb-1">{t('contractCallGraph.callers')}</p>
          <ul className="flex flex-wrap gap-1">
            {detail.callers.map((c) => (
              <li key={c} className="font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">{c}</li>
            ))}
          </ul>
        </div>
      )}

      {detail.callees.length > 0 && (
        <div>
          <p className="text-slate-500 dark:text-slate-400 mb-1">{t('contractCallGraph.callees')}</p>
          <ul className="flex flex-wrap gap-1">
            {detail.callees.map((c) => (
              <li key={c} className="font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300">{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface ContractCallGraphProps {
  /** The call graph to visualize. Defaults to the Vero contract demo graph. */
  graph?: CallGraph;
  /** Canvas height in pixels. Defaults to 480. */
  height?: number;
}

/**
 * ContractCallGraph — issue #53
 *
 * Renders a directed call graph of Vero smart contract functions using
 * Cytoscape.js. Cytoscape is imported dynamically to keep the SSR bundle
 * clean (it accesses `window` internally).
 *
 * All graph data lives in local state — no network calls.
 */
export default function ContractCallGraph({
  graph = DEFAULT_CALL_GRAPH,
  height = 480,
}: ContractCallGraphProps): ReactElement {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // cy instance stored in a ref — never triggers a re-render
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [isReady, setIsReady] = useState(false);

  const elements = useMemo(() => buildCytoscapeElements(graph), [graph]);
  const stylesheet = useMemo(() => buildStylesheet(), []);
  const inDegrees = useMemo(() => computeInDegree(graph), [graph]);

  // Build node lookup maps for the detail panel
  const nodeMap = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph],
  );

  const buildDetail = useCallback(
    (id: string): NodeDetail | null => {
      const node = nodeMap.get(id);
      if (!node) return null;
      return {
        id,
        label: node.label,
        kind: node.kind,
        gasCost: node.gasCost ?? 0,
        inDegree: inDegrees[id] ?? 0,
        callers: graph.edges.filter((e) => e.target === id).map((e) => e.source),
        callees: graph.edges.filter((e) => e.source === id).map((e) => e.target),
      };
    },
    [nodeMap, inDegrees, graph.edges],
  );

  // Initialise Cytoscape lazily (dynamic import avoids SSR issues)
  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    import('cytoscape').then(({ default: cytoscape }) => {
      if (destroyed || !containerRef.current) return;

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        style: stylesheet as any,
        layout: {
          name: 'breadthfirst',
          directed: true,
          padding: 24,
          spacingFactor: 1.4,
        } as cytoscape.BreadthFirstLayoutOptions,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        boxSelectionEnabled: false,
        minZoom: 0.3,
        maxZoom: 3,
      });

      cyRef.current = cy;
      setIsReady(true);

      // Node tap — show detail and highlight neighbourhood
      cy.on('tap', 'node', (evt) => {
        const nodeId = evt.target.id() as string;
        const detail = buildDetail(nodeId);
        setSelectedNode(detail);

        // Dim all, then highlight the tapped node + its neighbourhood
        cy.elements().addClass('dimmed').removeClass('highlighted');
        const neighbourhood = evt.target.closedNeighborhood();
        neighbourhood.removeClass('dimmed').addClass('highlighted');
      });

      // Tap on background — reset
      cy.on('tap', (evt) => {
        if (evt.target === cy) {
          cy.elements().removeClass('dimmed highlighted');
          setSelectedNode(null);
        }
      });
    });

    return () => {
      destroyed = true;
      cyRef.current?.destroy();
      cyRef.current = null;
      setIsReady(false);
    };
    // Intentionally only run on mount / graph change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Toolbar actions
  const handleZoomIn = useCallback(() => {
    cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
    cyRef.current?.center();
  }, []);

  const handleZoomOut = useCallback(() => {
    cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
    cyRef.current?.center();
  }, []);

  const handleFit = useCallback(() => {
    cyRef.current?.fit(undefined, 24);
  }, []);

  const handleReset = useCallback(() => {
    cyRef.current?.fit(undefined, 24);
    cyRef.current?.elements().removeClass('dimmed highlighted');
    setSelectedNode(null);
  }, []);

  // Graph stats for the summary strip
  const roots = useMemo(() => findRoots(graph), [graph]);
  const leaves = useMemo(() => findLeaves(graph), [graph]);

  if (graph.nodes.length === 0) {
    return (
      <section
        aria-labelledby="contract-call-graph-title"
        className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg"
      >
        <h3
          id="contract-call-graph-title"
          className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-2"
        >
          <GitGraph className="w-5 h-5 text-indigo-500" aria-hidden="true" />
          {t('contractCallGraph.heading')}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
          {t('contractCallGraph.empty')}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="contract-call-graph-title"
      className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        <div>
          <h3
            id="contract-call-graph-title"
            className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2"
          >
            <GitGraph className="w-5 h-5 text-indigo-500" aria-hidden="true" />
            {t('contractCallGraph.heading')}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('contractCallGraph.subheading')}
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1" role="toolbar" aria-label={t('contractCallGraph.toolbarAriaLabel')}>
          {[
            { icon: ZoomIn,    label: t('contractCallGraph.zoomIn'),   action: handleZoomIn  },
            { icon: ZoomOut,   label: t('contractCallGraph.zoomOut'),  action: handleZoomOut },
            { icon: Maximize2, label: t('contractCallGraph.fit'),      action: handleFit     },
            { icon: RotateCcw, label: t('contractCallGraph.reset'),    action: handleReset   },
          ].map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              aria-label={label}
              disabled={!isReady}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3">
        <Legend />
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-slate-500 dark:text-slate-400">
        <span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{graph.nodes.length}</span>{' '}
          {t('contractCallGraph.statNodes')}
        </span>
        <span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{graph.edges.length}</span>{' '}
          {t('contractCallGraph.statEdges')}
        </span>
        <span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{roots.length}</span>{' '}
          {t('contractCallGraph.statEntryPoints')}
        </span>
        <span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{leaves.length}</span>{' '}
          {t('contractCallGraph.statLeaves')}
        </span>
      </div>

      {/* Graph canvas */}
      <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950">
        {/* Loading overlay */}
        {!isReady && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950 z-10"
            aria-live="polite"
          >
            <p className="text-sm text-slate-400 animate-pulse">{t('contractCallGraph.loading')}</p>
          </div>
        )}

        {/* Hint */}
        {isReady && (
          <p className="absolute top-2 right-3 text-xs text-slate-400 dark:text-slate-500 select-none z-10 pointer-events-none">
            {t('contractCallGraph.tapHint')}
          </p>
        )}

        {/* Cytoscape mount point */}
        <div
          ref={containerRef}
          data-testid="cytoscape-container"
          style={{ height }}
          aria-label={t('contractCallGraph.canvasAriaLabel')}
          aria-description={t('contractCallGraph.canvasDescription')}
        />

        {/* Node detail overlay */}
        {selectedNode && (
          <NodeDetailPanel
            detail={selectedNode}
            onClose={() => {
              cyRef.current?.elements().removeClass('dimmed highlighted');
              setSelectedNode(null);
            }}
          />
        )}
      </div>
    </section>
  );
}
