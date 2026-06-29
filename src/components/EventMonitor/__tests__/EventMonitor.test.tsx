import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, type RenderHookResult } from '@testing-library/react';
import { act } from 'react';
import { useEvents, type UseEventsResult } from '@/hooks/useEvents';
import EventMonitor from '../StateStateStateStateStateStateStateStateStateStateEventMonitor';

function emitEvent(event: Parameters<UseEventsResult['emit']>[0]) {
  let hook: RenderHookResult<UseEventsResult, unknown>;
  act(() => {
    hook = renderHook(() => useEvents());
  });
  act(() => {
    hook.result.current.emit(event);
  });
}

function clearEvents() {
  let hook: RenderHookResult<UseEventsResult, unknown>;
  act(() => {
    hook = renderHook(() => useEvents());
  });
  act(() => {
    hook.result.current.clear();
  });
}

describe('EventMonitor', () => {
  beforeEach(() => {
    clearEvents();
  });

  it('renders the heading', () => {
    render(<EventMonitor />);
    expect(screen.getByText('Event Monitor')).toBeInTheDocument();
  });

  it('shows empty state when no events exist', () => {
    render(<EventMonitor />);
    expect(screen.getByText('No events recorded yet. Interact with the dashboard to see events appear here.')).toBeInTheDocument();
  });

  it('renders filter buttons for all event types', () => {
    render(<EventMonitor />);
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Vote')).toBeInTheDocument();
    expect(screen.getByText('Tx')).toBeInTheDocument();
  });

  it('displays events emitted through the bus', () => {
    render(<EventMonitor />);

    emitEvent({ type: 'vote', actor: 'GABCDEF', resource: 'pull_request', resourceId: '42' });

    expect(screen.getByText('GABCDEF')).toBeInTheDocument();
    expect(screen.getByText('pull_request')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('filters events when a type filter is clicked', () => {
    render(<EventMonitor />);

    emitEvent({ type: 'vote', actor: 'GABCDEF' });
    emitEvent({ type: 'transaction', actor: 'G123456' });

    expect(screen.getByText('GABCDEF')).toBeInTheDocument();
    expect(screen.getByText('G123456')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vote' }));
    });

    expect(screen.getByText('GABCDEF')).toBeInTheDocument();
    expect(screen.queryByText('G123456')).not.toBeInTheDocument();
  });

  it('clears events when clear button is clicked', () => {
    render(<EventMonitor />);

    emitEvent({ type: 'vote', actor: 'GABCDEF' });

    expect(screen.getByText('GABCDEF')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByLabelText('Clear all events'));
    });

    expect(screen.queryByText('GABCDEF')).not.toBeInTheDocument();
    expect(screen.getByText('No events recorded yet. Interact with the dashboard to see events appear here.')).toBeInTheDocument();
  });

  it('does not show clear button when timeline is empty', () => {
    render(<EventMonitor />);
    expect(screen.queryByLabelText('Clear all events')).not.toBeInTheDocument();
  });

  it('shows event count', () => {
    render(<EventMonitor />);

    emitEvent({ type: 'vote' });
    emitEvent({ type: 'transaction' });

    expect(screen.getByText('2 events')).toBeInTheDocument();
  });

  it('displays metadata key-value pairs', () => {
    render(<EventMonitor />);

    emitEvent({ type: 'vote', metadata: { prId: 42, severity: 'high' } });

    expect(screen.getByText('prId:')).toBeInTheDocument();
    expect(screen.getByText('severity:')).toBeInTheDocument();
  });
});
