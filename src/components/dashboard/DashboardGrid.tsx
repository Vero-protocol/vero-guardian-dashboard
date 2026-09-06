"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { RefreshCw, GripHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface DashboardWidget {
  id: string;
  component: React.ReactNode;
  title: string;
}

interface WidgetLayout {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DashboardGridProps {
  widgets: DashboardWidget[];
  role: string;
  storageKey?: string;
}

// Layout validator to enforce schema safety
function sanitizeLayout(layout: any, validIds: string[]): WidgetLayout[] {
  if (!Array.isArray(layout)) return [];
  return layout
    .filter((item) => {
      return (
        item &&
        typeof item.id === "string" &&
        validIds.includes(item.id) &&
        typeof item.x === "number" &&
        !isNaN(item.x) &&
        item.x >= 0 &&
        item.x < 12 &&
        typeof item.y === "number" &&
        !isNaN(item.y) &&
        item.y >= 0 &&
        typeof item.w === "number" &&
        !isNaN(item.w) &&
        item.w >= 1 &&
        item.w <= 12 &&
        typeof item.h === "number" &&
        !isNaN(item.h) &&
        item.h >= 1
      );
    })
    .map((item) => ({
      id: item.id,
      x: Math.floor(item.x),
      y: Math.floor(item.y),
      w: Math.min(12, Math.max(1, Math.floor(item.w))),
      h: Math.max(1, Math.floor(item.h)),
    }));
}

export default function DashboardGrid({
  widgets,
  role,
  storageKey = "vero-guardian-dashboard-layout",
}: DashboardGridProps) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<WidgetLayout[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const gridRef = useRef<GridStack | null>(null);

  const validIds = useMemo(() => widgets.map((w) => w.id), [widgets]);

  const defaultLayout = useMemo(() => {
    const base = [
      { id: "pr-feed", x: 0, y: 0, w: 8, h: 6 },
      { id: "state-search", x: 8, y: 0, w: 4, h: 2 },
      { id: "security-scanner", x: 8, y: 2, w: 4, h: 3 },
      { id: "transaction-feed", x: 8, y: 5, w: 4, h: 4 },
      { id: "leaderboard", x: 8, y: 9, w: 4, h: 4 },
      { id: "quick-actions", x: 0, y: 6, w: 4, h: 3 },
      { id: "gas-heatmap", x: 0, y: 9, w: 8, h: 4 },
      { id: "session-timer", x: 0, y: 13, w: 4, h: 2 },
      { id: "contract-time-traveler", x: 4, y: 13, w: 4, h: 2 },
      { id: "audit-session-timer", x: 8, y: 13, w: 4, h: 2 },
      { id: "event-monitor", x: 0, y: 15, w: 12, h: 4 },
      { id: "contract-call-graph", x: 0, y: 19, w: 12, h: 6 },
    ];

    if (role === "admin") {
      base.push({ id: "task-card", x: 4, y: 6, w: 4, h: 3 });
      base.push({ id: "emergency-halt", x: 0, y: 25, w: 4, h: 2 });
      base.push({ id: "admin-vault", x: 4, y: 25, w: 4, h: 4 });
      base.push({ id: "audit-export", x: 8, y: 25, w: 4, h: 4 });
    }

    return base;
  }, [role]);

  // Load layout from localStorage on mount
  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const sanitized = sanitizeLayout(parsed, validIds);

        const savedIds = sanitized.map((item) => item.id);
        const missing = defaultLayout.filter(
          (item) => !savedIds.includes(item.id) && validIds.includes(item.id),
        );

        setLayout([...sanitized, ...missing]);
      } catch (e) {
        setLayout(defaultLayout);
      }
    } else {
      setLayout(defaultLayout);
    }
  }, [validIds, defaultLayout, storageKey]);

  // Initialize and update GridStack
  useEffect(() => {
    if (!isMounted || layout.length === 0) return;

    const timer = setTimeout(() => {
      if (gridRef.current) {
        gridRef.current.destroy(false);
        gridRef.current = null;
      }

      const grid = GridStack.init({
        column: 12,
        cellHeight: "auto",
        margin: 12,
        float: true,
        draggable: {
          handle: ".widget-drag-handle",
          scroll: true,
        },
        resizable: {
          handles: "e,se,s,sw,w",
        },
      });

      if (!grid) return;

      gridRef.current = grid;

      grid.on("change", () => {
        const savedData = grid.save(false) as any[];
        const sanitized = sanitizeLayout(savedData, validIds);
        localStorage.setItem(storageKey, JSON.stringify(sanitized));
      });
    }, 50);

    return () => {
      clearTimeout(timer);
      if (gridRef.current) {
        gridRef.current.destroy(false);
        gridRef.current = null;
      }
    };
  }, [layout, isMounted, validIds, storageKey]);

  const handleResetLayout = () => {
    localStorage.removeItem(storageKey);
    setLayout([]);
    setTimeout(() => {
      setLayout(defaultLayout);
    }, 0);
  };

  if (!isMounted) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" role="status" aria-busy="true">
        {widgets.map((w) => (
          <div
            key={w.id}
            className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-lg"
          >
            {w.component}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="w-full relative">
      {/* Dashboard Controls */}
      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={handleResetLayout}
          aria-label={t("dashboard.resetLayout", {
            defaultValue: "Reset dashboard layout to default",
          })}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          <span>{t("dashboard.resetLayout", { defaultValue: "Reset Layout" })}</span>
        </button>
      </div>

      {/* Screen reader instructions */}
      <p className="sr-only">
        Dashboard widgets can be rearranged by dragging the handle at the top of
        each widget. Use the Reset Layout button to restore the default arrangement.
      </p>

      {/* Grid Stack container */}
      <div
        className="grid-stack min-h-[500px]"
        role="region"
        aria-label={t("dashboard.gridLabel", {
          defaultValue: "Dashboard widgets",
        })}
      >
        {layout.map((item) => {
          const widget = widgets.find((w) => w.id === item.id);
          if (!widget) return null;

          return (
            <div
              key={item.id}
              className="grid-stack-item group"
              gs-id={item.id}
              gs-x={item.x}
              gs-y={item.y}
              gs-w={item.w}
              gs-h={item.h}
              role="group"
              aria-label={widget.title}
            >
              <div className="grid-stack-item-content bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col h-full overflow-hidden transition-all group-hover:border-slate-300 dark:group-hover:border-slate-700">
                {/* Drag handle header bar */}
                <div
                  className="widget-drag-handle flex items-center justify-between pb-2 mb-2 border-b border-slate-150 dark:border-slate-800 cursor-move text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  tabIndex={0}
                  role="button"
                  aria-label={`Drag to rearrange ${widget.title} widget`}
                  title={`Drag to move ${widget.title}`}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                    {widget.title}
                  </span>
                  <GripHorizontal
                    className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                  />
                </div>

                <div className="flex-1 overflow-auto h-full min-h-0">
                  {widget.component}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
    }
