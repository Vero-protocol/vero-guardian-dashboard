import { fireEvent, render, screen } from '@testing-library/react';
import GlobalStateSearch, { searchOnChainTargets, type OnChainSearchTarget } from '../StateStateStateStateStateStateStateStateStateStateGlobalStateSearch';

const targets: OnChainSearchTarget[] = [
  {
    id: 'vote',
    label: 'Guardian vote record',
    contract: 'Vote Ledger',
    functionId: 'vote_<prId>',
    account: 'Guardian wallet',
    network: 'Stellar Testnet',
    type: 'vote',
    tags: ['approval', 'review'],
    description: 'Stores guardian approvals.',
  },
  {
    id: 'reputation',
    label: 'Guardian reputation score',
    contract: 'Reputation',
    functionId: 'vero_reputation',
    account: 'Guardian wallet',
    network: 'Stellar Testnet',
    type: 'reputation',
    tags: ['score', 'trust'],
    description: 'Reads guardian trust score.',
  },
  {
    id: 'proposal',
    label: 'Governance proposal state',
    contract: 'Multisig Governance',
    functionId: 'proposal_<id>',
    account: 'Signer set',
    network: 'Stellar Testnet',
    type: 'governance',
    tags: ['multisig'],
    description: 'Shows proposal approvals.',
  },
];

describe('searchOnChainTargets', () => {
  it('ranks exact function matches above looser text matches', () => {
    const results = searchOnChainTargets('vote pr', targets);

    expect(results[0]).toMatchObject({
      id: 'vote',
      functionId: 'vote_<prId>',
    });
  });

  it('finds targets by fuzzy tag and description tokens', () => {
    const results = searchOnChainTargets('trust', targets);

    expect(results.map((result) => result.id)).toContain('reputation');
  });
});

describe('GlobalStateSearch', () => {
  it('filters visible targets as the guardian types', () => {
    render(<GlobalStateSearch targets={targets} />);

    expect(screen.getByText('Guardian vote record')).toBeInTheDocument();
    expect(screen.getByText('Governance proposal state')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'reputation' } });

    expect(screen.getByText('Guardian reputation score')).toBeInTheDocument();
    expect(screen.queryByText('Governance proposal state')).not.toBeInTheDocument();
  });

  it('shows a clear empty state when no indexed state target matches', () => {
    render(<GlobalStateSearch targets={targets} />);

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'does-not-exist' } });

    expect(screen.getByText(/No on-chain state targets match/)).toBeInTheDocument();
  });
});
