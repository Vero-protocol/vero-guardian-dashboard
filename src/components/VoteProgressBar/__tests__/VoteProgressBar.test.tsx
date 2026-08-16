import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import VoteProgressBar from '../VoteProgressBar';

// ---------------------------------------------------------------------------
// Mock recharts — ResponsiveContainer measures the parent element, which is a
// no-op in jsdom. Rendering children directly keeps the test focused on the
// component's data/state handling.
// ---------------------------------------------------------------------------
jest.mock('recharts', () => {
  const passthrough = (props: { children?: React.ReactNode }) => <div>{props.children}</div>;
  return {
    BarChart: passthrough,
    Bar: passthrough,
    XAxis: passthrough,
    YAxis: passthrough,
    Cell: passthrough,
    LabelList: passthrough,
    Tooltip: (_props: { content?: React.ReactNode }) => <div />,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

describe('VoteProgressBar', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders approve/reject counts and percentages for a typical vote', () => {
    render(<VoteProgressBar approveCount={7} rejectCount={3} />);

    // Counts appear in the summary row.
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();

    // Percentages: 7/10 = 70% approve, 30% reject.
    expect(screen.getByText('(70%)')).toBeTruthy();
    expect(screen.getByText('(30%)')).toBeTruthy();
  });

  test('handles a unanimous approve vote (100%)', () => {
    render(<VoteProgressBar approveCount={5} rejectCount={0} />);

    expect(screen.getByText('5')).toBeTruthy();
    // Both approve and reject sides render a percentage; 100% appears once.
    expect(screen.getByText('(100%)')).toBeTruthy();
    expect(screen.getAllByText('(0%)').length).toBeGreaterThanOrEqual(1);
  });

  test('handles a unanimous reject vote (0% approve)', () => {
    render(<VoteProgressBar approveCount={0} rejectCount={4} />);

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('(100%)')).toBeTruthy();
    expect(screen.getAllByText('(0%)').length).toBeGreaterThanOrEqual(1);
  });

  test('handles a tie (50/50)', () => {
    render(<VoteProgressBar approveCount={3} rejectCount={3} />);

    // Both approve and reject sides show 50%, so getAllByText returns 2.
    expect(screen.getAllByText('(50%)')).toHaveLength(2);
    // The count '3' appears on both sides too.
    expect(screen.getAllByText('3')).toHaveLength(2);
  });

  test('handles zero total votes without dividing by zero', () => {
    render(<VoteProgressBar approveCount={0} rejectCount={0} />);

    // Percentage stays at 0% instead of NaN on both sides.
    expect(screen.getAllByText('(0%)').length).toBeGreaterThanOrEqual(2);
  });

  test('renders an accessible label with the vote counts', () => {
    render(<VoteProgressBar approveCount={2} rejectCount={1} />);

    expect(screen.getByLabelText(/Vote progress: 2 approve, 1 reject/)).toBeTruthy();
  });

  test('does not render the quorum indicator when quorum is undefined', () => {
    render(<VoteProgressBar approveCount={2} rejectCount={1} />);

    expect(screen.queryByText(/Quorum reached/)).toBeNull();
    expect(screen.queryByText(/quorum of/)).toBeNull();
  });

  test('shows quorum reached when approveCount meets the quorum', () => {
    render(<VoteProgressBar approveCount={4} rejectCount={0} quorum={3} />);

    expect(screen.getByText('Quorum reached')).toBeTruthy();
    expect(screen.queryByText(/needed to reach quorum/)).toBeNull();
  });

  test('shows votes needed when quorum is not yet reached', () => {
    render(<VoteProgressBar approveCount={2} rejectCount={3} quorum={5} />);

    expect(screen.getByText(/3 more approve vote\(s\) needed to reach quorum of 5/)).toBeTruthy();
    expect(screen.queryByText('Quorum reached')).toBeNull();
  });

  test('announces quorum changes via aria-live region', () => {
    render(<VoteProgressBar approveCount={1} rejectCount={1} quorum={2} />);

    const liveRegion = screen.getByText(/needed to reach quorum/).closest('[aria-live="polite"]');
    expect(liveRegion).toBeTruthy();
  });

  test('renders approve and reject labels', () => {
    render(<VoteProgressBar approveCount={1} rejectCount={1} />);

    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });
});