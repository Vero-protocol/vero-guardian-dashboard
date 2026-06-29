/**
 * Tests for the analytics/GasHeatmap module.
 * Verifies that the component and helpers are correctly accessible from the
 * analytics path and that hotspots are visible in the rendered output.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from '@jest/globals';
import GasHeatmap, {
  buildHeatmap,
  findHotspots,
  formatGas,
  GAS_METRICS,
  type FunctionGasUsage,
} from '../StateStateStateStateStateStateStateStateStateStateGasHeatmap';

const SAMPLE: FunctionGasUsage[] = [
  { functionName: 'cast_vote', costs: { cpuInsns: 12_500_000, memBytes: 524_288, ledgerReads: 8, ledgerWrites: 3, events: 2 } },
  { functionName: 'tally_votes', costs: { cpuInsns: 41_200_000, memBytes: 1_310_720, ledgerReads: 24, ledgerWrites: 4, events: 5 } },
];

describe('analytics/GasHeatmap — helpers', () => {
  test('formatGas formats large values compactly', () => {
    expect(formatGas(41_200_000)).toBe('41.2M');
  });

  test('buildHeatmap returns a row per function and column per metric', () => {
    const grid = buildHeatmap(SAMPLE);
    expect(grid).toHaveLength(SAMPLE.length);
    expect(grid[0]).toHaveLength(GAS_METRICS.length);
  });

  test('findHotspots identifies the costliest function per metric', () => {
    const hotspots = findHotspots(SAMPLE);
    const byMetric = Object.fromEntries(hotspots.map((h) => [h.metric, h.functionName]));
    expect(byMetric.cpuInsns).toBe('tally_votes');
    expect(byMetric.memBytes).toBe('tally_votes');
  });
});

describe('analytics/GasHeatmap — component', () => {
  test('renders heatmap cells for each function/metric pair', () => {
    render(<GasHeatmap data={SAMPLE} />);
    expect(screen.getAllByTestId('gas-cell')).toHaveLength(SAMPLE.length * GAS_METRICS.length);
  });

  test('hotspot cells are clearly flagged', () => {
    render(<GasHeatmap data={SAMPLE} />);
    const hotspotCells = screen
      .getAllByTestId('gas-cell')
      .filter((cell) => cell.getAttribute('data-hotspot') === 'true');
    // Every metric column has a non-zero max, so one hotspot per metric.
    expect(hotspotCells).toHaveLength(GAS_METRICS.length);
  });

  test('renders the hotspots summary section', () => {
    render(<GasHeatmap data={SAMPLE} />);
    expect(screen.getByText('Hotspots')).toBeTruthy();
  });

  test('renders an empty state when data is empty', () => {
    render(<GasHeatmap data={[]} />);
    expect(screen.getByText('No gas usage data available.')).toBeTruthy();
    expect(screen.queryAllByTestId('gas-cell')).toHaveLength(0);
  });
});
