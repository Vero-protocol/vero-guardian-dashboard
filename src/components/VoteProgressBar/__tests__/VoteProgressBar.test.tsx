import { render, screen } from '@testing-library/react';
import VoteProgressBar from '../VoteProgressBar';

// Recharts uses ResizeObserver and SVG APIs not available in jsdom. Mock the
// charting primitives so we can test the surrounding UI without errors.
jest.mock('recharts', () => {
  const React = require('react');
  return {
    BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
    Bar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    XAxis: () => null,
    YAxis: () => null,
    Cell: () => null,
    Tooltip: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    LabelList: () => null,
  };
});

describe('VoteProgressBar', () => {
  describe('summary row rendering', () => {
    it('displays approve and reject counts', () => {
      render(<VoteProgressBar approveCount={7} rejectCount={3} />);
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows correct approve percentage when votes exist', () => {
      render(<VoteProgressBar approveCount={3} rejectCount={1} />);
      // 3/4 = 75%
      expect(screen.getByText('(75%)')).toBeInTheDocument();
      expect(screen.getByText('(25%)')).toBeInTheDocument();
    });

    it('shows 0% for both sides when there are no votes', () => {
      render(<VoteProgressBar approveCount={0} rejectCount={0} />);
      expect(screen.getAllByText('(0%)')).toHaveLength(2);
    });

    it('shows 100% approve and 0% reject when all votes approve', () => {
      render(<VoteProgressBar approveCount={5} rejectCount={0} />);
      expect(screen.getByText('(100%)')).toBeInTheDocument();
      expect(screen.getByText('(0%)')).toBeInTheDocument();
    });

    it('shows 0% approve and 100% reject when all votes reject', () => {
      render(<VoteProgressBar approveCount={0} rejectCount={5} />);
      expect(screen.getByText('(0%)')).toBeInTheDocument();
      expect(screen.getByText('(100%)')).toBeInTheDocument();
    });

    it('rounds to 50% each for a tie', () => {
      render(<VoteProgressBar approveCount={4} rejectCount={4} />);
      expect(screen.getAllByText('(50%)')).toHaveLength(2);
    });

    it('displays the approve and reject labels', () => {
      render(<VoteProgressBar approveCount={1} rejectCount={1} />);
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });
  });

  describe('chart rendering', () => {
    it('renders the bar chart container', () => {
      render(<VoteProgressBar approveCount={5} rejectCount={3} />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    });
  });

  describe('quorum indicator', () => {
    it('does not render a quorum message when quorum prop is omitted', () => {
      render(<VoteProgressBar approveCount={3} rejectCount={2} />);
      expect(screen.queryByText(/quorum/i)).not.toBeInTheDocument();
    });

    it('shows "Quorum reached" when approveCount meets quorum', () => {
      render(<VoteProgressBar approveCount={5} rejectCount={2} quorum={5} />);
      expect(screen.getByText('Quorum reached')).toBeInTheDocument();
    });

    it('shows "Quorum reached" when approveCount exceeds quorum', () => {
      render(<VoteProgressBar approveCount={8} rejectCount={1} quorum={5} />);
      expect(screen.getByText('Quorum reached')).toBeInTheDocument();
    });

    it('shows votes still needed when approveCount is below quorum', () => {
      render(<VoteProgressBar approveCount={3} rejectCount={2} quorum={5} />);
      // 5 - 3 = 2 more needed
      expect(
        screen.getByText('2 more approve vote(s) needed to reach quorum of 5'),
      ).toBeInTheDocument();
    });

    it('shows 1 vote needed when exactly one away from quorum', () => {
      render(<VoteProgressBar approveCount={4} rejectCount={1} quorum={5} />);
      expect(
        screen.getByText('1 more approve vote(s) needed to reach quorum of 5'),
      ).toBeInTheDocument();
    });

    it('shows quorum needed message when approveCount is 0 and quorum is set', () => {
      render(<VoteProgressBar approveCount={0} rejectCount={0} quorum={3} />);
      expect(
        screen.getByText('3 more approve vote(s) needed to reach quorum of 3'),
      ).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('renders the root element with an aria-label describing the vote counts', () => {
      render(<VoteProgressBar approveCount={6} rejectCount={2} />);
      expect(
        screen.getByRole('generic', {
          name: 'Vote progress: 6 approve, 2 reject',
        }),
      ).toBeInTheDocument();
    });

    it('renders the quorum indicator with aria-live="polite"', () => {
      render(<VoteProgressBar approveCount={2} rejectCount={1} quorum={5} />);
      const quorumEl = screen.getByText(/more approve vote\(s\) needed/i);
      expect(quorumEl).toHaveAttribute('aria-live', 'polite');
    });

    it('the "Quorum reached" element also has aria-live="polite"', () => {
      render(<VoteProgressBar approveCount={5} rejectCount={0} quorum={5} />);
      const quorumEl = screen.getByText('Quorum reached');
      expect(quorumEl).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('edge cases', () => {
    it('renders without crashing when both counts are 0', () => {
      expect(() =>
        render(<VoteProgressBar approveCount={0} rejectCount={0} />),
      ).not.toThrow();
    });

    it('renders without crashing for very large vote counts', () => {
      expect(() =>
        render(<VoteProgressBar approveCount={999_999} rejectCount={1} />),
      ).not.toThrow();
      expect(screen.getByText('999999')).toBeInTheDocument();
    });

    it('handles a quorum of 0 (edge: quorum already met at any count)', () => {
      render(<VoteProgressBar approveCount={0} rejectCount={0} quorum={0} />);
      expect(screen.getByText('Quorum reached')).toBeInTheDocument();
    });

    it('renders correctly with approveCount=1 rejectCount=0', () => {
      render(<VoteProgressBar approveCount={1} rejectCount={0} />);
      expect(screen.getByText('(100%)')).toBeInTheDocument();
      expect(screen.getByText('(0%)')).toBeInTheDocument();
    });
  });
});
