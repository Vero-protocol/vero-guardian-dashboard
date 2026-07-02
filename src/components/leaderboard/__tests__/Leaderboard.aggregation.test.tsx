import { render, screen, within } from '@testing-library/react';
import React from 'react';


import Leaderboard from '@/components/leaderboard/Leaderboard';
import * as logger from '@/utils/logger';
import * as profileClient from '@/services/profileClient';

jest.mock('@/utils/logger', () => ({
  readAuditLogEvents: jest.fn(),
}));

jest.mock('@/services/profileClient', () => ({
  fetchContributorProfiles: jest.fn(),
}));

describe('Leaderboard aggregation', () => {
  const readAuditLogEvents = jest.mocked(logger.readAuditLogEvents);
  const fetchContributorProfiles = jest.mocked(profileClient.fetchContributorProfiles);

  beforeEach(() => {
    jest.useFakeTimers();
    fetchContributorProfiles.mockResolvedValue({});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('renders contributors ranked by computed score and filters recent window', async () => {
    const now = Date.now();
    const events = [
      {
        id: 'e1',
        timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'security',
        actor: 'WALLET_A',
        action: 'complete_audit',
        sequence: 1,
        metadata: { contributorId: 'A', displayName: 'Alice' },
      },
      {
        id: 'e2',
        timestamp: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'security',
        actor: 'WALLET_B',
        action: 'complete_audit',
        sequence: 2,
        metadata: { contributorId: 'B', displayName: 'Bob' },
      },
      {
        id: 'e3',
        timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'security',
        actor: 'WALLET_B',
        action: 'critical_finding',
        sequence: 3,
        metadata: { contributorId: 'B', displayName: 'Bob', count: 1 },
      },
    ] as any;

    readAuditLogEvents.mockResolvedValue(events);

    render(<Leaderboard />);

    // initial refresh is async; wait for leaderboard to render.
    const refreshBtn = await screen.findByRole('button', { name: /refresh/i });
    await refreshBtn.click();

    const list = await screen.findByRole('list');

    const items = await within(list).findAllByRole('listitem');

    // Bob should have higher score because of critical finding
    expect(items[0]).toHaveTextContent('Bob');

    // switch to recent (last 30d): Alice 10d ago stays, Bob has 2d ago critical => still Bob first
    const recentBtn = screen.getByRole('button', { name: /30d/i });
    recentBtn.click();

    const listRecent = await screen.findByRole('list');
    const itemsRecent = await within(listRecent).findAllByRole('listitem');
    expect(itemsRecent[0]).toHaveTextContent('Bob');

    // ensure Alice is present as well
    expect(itemsRecent.map((n) => n.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Alice')]),
    );
  });
});

