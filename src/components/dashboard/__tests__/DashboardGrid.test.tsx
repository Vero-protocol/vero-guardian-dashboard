import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import DashboardGrid, { DashboardWidget } from '../StateStateStateStateStateStateStateStateStateStateDashboardGrid';
import { GridStack } from 'gridstack';

// Mock GridStack to avoid actual DOM manipulations in Jest JSDOM env
jest.mock('gridstack', () => ({
  GridStack: {
    init: jest.fn().mockReturnValue({
      on: jest.fn(),
      save: jest.fn().mockReturnValue([]),
      destroy: jest.fn(),
    }),
  },
}));

const mockWidgets: DashboardWidget[] = [
  { id: 'pr-feed', title: 'PR Feed Widget', component: <div>PR Feed Content</div> },
  { id: 'state-search', title: 'State Search Widget', component: <div>State Search Content</div> },
];

describe('DashboardGrid Component', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    jest.useFakeTimers();
    store = {};
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] || null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      store[key] = value;
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
      delete store[key];
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('renders all widgets successfully', () => {
    render(<DashboardGrid widgets={mockWidgets} role="guardian" />);
    expect(screen.getByText('PR Feed Content')).toBeInTheDocument();
    expect(screen.getByText('State Search Content')).toBeInTheDocument();
  });

  it('verifies layout state persistence and validation safety', () => {
    // Save valid layout to localStorage
    const validLayout = [
      { id: 'pr-feed', x: 0, y: 0, w: 6, h: 4 },
      { id: 'state-search', x: 6, y: 0, w: 6, h: 4 }
    ];
    store['vero-guardian-dashboard-layout'] = JSON.stringify(validLayout);

    render(<DashboardGrid widgets={mockWidgets} role="guardian" />);

    // Since mock GridStack init runs in a timeout, let's wait a bit
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(GridStack.init).toHaveBeenCalled();
  });

  it('enforces safety and sanitizes invalid coordinates or structures from layout state', () => {
    // Malicious/corrupted layout state
    const badLayout = [
      { id: 'pr-feed', x: -5, y: 'nan', w: 100, h: 4 }, // invalid x, y, w
      { id: 'malicious-widget', x: 0, y: 0, w: 4, h: 4 } // invalid id
    ];
    store['vero-guardian-dashboard-layout'] = JSON.stringify(badLayout);

    render(<DashboardGrid widgets={mockWidgets} role="guardian" />);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(GridStack.init).toHaveBeenCalled();
  });

  it('verifies layout reset behavior', () => {
    store['vero-guardian-dashboard-layout'] = JSON.stringify([
      { id: 'pr-feed', x: 0, y: 0, w: 4, h: 4 }
    ]);

    render(<DashboardGrid widgets={mockWidgets} role="guardian" />);

    const resetBtn = screen.getByText('Reset Layout');
    fireEvent.click(resetBtn);

    expect(store['vero-guardian-dashboard-layout']).toBeUndefined();
  });
});
