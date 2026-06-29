import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import GasHeatmap, {
  buildHeatmap,
  findHotspots,
  formatGas,
  GAS_METRICS,
  type FunctionGasUsage,
} from '../StateStateStateStateStateStateStateStateStateStateGasHeatmap';

const SAMPLE: FunctionGasUsage[] = [
  { functionName: 'alpha', costs: { cpuInsns: 100, memBytes: 200, ledgerReads: 4, ledgerWrites: 1, events: 0 } },
  { functionName: 'beta', costs: { cpuInsns: 400, memBytes: 100, ledgerReads: 2, ledgerWrites: 5, events: 3 } },
];

describe('formatGas', () => {
  test('formats small and large values compactly', () => {
    expect(formatGas(8)).toBe('8');
    expect(formatGas(41_200_000)).toBe('41.2M');
    expect(formatGas(1_310_720)).toBe('1.3M');
  });
});

describe('buildHeatmap', () => {
  test('produces a function-by-metric grid', () => {
    const grid = buildHeatmap(SAMPLE);
    expect(grid).toHaveLength(SAMPLE.length);
    expect(grid[0]).toHaveLength(GAS_METRICS.length);
  });

  test('normalises intensity per metric column', () => {
    const grid = buildHeatmap(SAMPLE);
    // cpuInsns column: alpha=100, beta=400 -> beta is the column max (intensity 1).
    const alphaCpu = grid[0][0];
    const betaCpu = grid[1][0];
    expect(alphaCpu.metric).toBe('cpuInsns');
    expect(betaCpu.intensity).toBe(1);
    expect(betaCpu.isHotspot).toBe(true);
    expect(alphaCpu.intensity).toBeCloseTo(0.25);
    expect(alphaCpu.isHotspot).toBe(false);
  });

  test('marks zero-valued columns with zero intensity and no hotspot', () => {
    const grid = buildHeatmap([
      { functionName: 'only', costs: { cpuInsns: 0, memBytes: 0, ledgerReads: 0, ledgerWrites: 0, events: 0 } },
    ]);
    expect(grid[0].every((cell) => cell.intensity === 0 && cell.isHotspot === false)).toBe(true);
  });
});

describe('findHotspots', () => {
  test('returns the most expensive function per metric', () => {
    const hotspots = findHotspots(SAMPLE);
    const byMetric = Object.fromEntries(hotspots.map((h) => [h.metric, h.functionName]));
    expect(byMetric.cpuInsns).toBe('beta');
    expect(byMetric.memBytes).toBe('alpha');
    expect(byMetric.ledgerWrites).toBe('beta');
  });

  test('omits metrics whose values are all zero', () => {
    const hotspots = findHotspots([
      { functionName: 'a', costs: { cpuInsns: 5, memBytes: 0, ledgerReads: 0, ledgerWrites: 0, events: 0 } },
    ]);
    expect(hotspots.map((h) => h.metric)).toEqual(['cpuInsns']);
  });
});

describe('GasHeatmap component', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders the heading and a cell for every function/metric pair', () => {
    render(<GasHeatmap data={SAMPLE} />);

    expect(screen.getByText('Gas Usage Heatmap')).toBeTruthy();
    expect(screen.getAllByTestId('gas-cell')).toHaveLength(SAMPLE.length * GAS_METRICS.length);
  });

  test('flags one hotspot cell per non-empty metric', () => {
    render(<GasHeatmap data={SAMPLE} />);

    const hotspotCells = screen
      .getAllByTestId('gas-cell')
      .filter((cell) => cell.getAttribute('data-hotspot') === 'true');
    // Every metric column in SAMPLE has a positive max except events for alpha,
    // but events still has a max (beta=3), so all five metrics yield a hotspot.
    expect(hotspotCells).toHaveLength(GAS_METRICS.length);
  });

  test('renders metric column labels and function row labels', () => {
    render(<GasHeatmap data={SAMPLE} />);

    // Metric labels and function names also appear in the hotspots summary,
    // so assert at least one occurrence each.
    expect(screen.getAllByText('CPU').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Memory').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('alpha').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('beta').length).toBeGreaterThanOrEqual(1);
  });

  test('renders a hotspots summary section', () => {
    render(<GasHeatmap data={SAMPLE} />);
    expect(screen.getByText('Hotspots')).toBeTruthy();
  });

  test('falls back to the default dataset when no data prop is given', () => {
    render(<GasHeatmap />);
    // DEFAULT_GAS_USAGE has 5 functions.
    expect(screen.getAllByTestId('gas-cell')).toHaveLength(5 * GAS_METRICS.length);
    expect(screen.getByText('cast_vote')).toBeTruthy();
  });

  test('renders an empty state when there is no data', () => {
    render(<GasHeatmap data={[]} />);
    expect(screen.getByText('No gas usage data available.')).toBeTruthy();
    expect(screen.queryAllByTestId('gas-cell')).toHaveLength(0);
  });
});
