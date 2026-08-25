import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VoteButton from '@/components/VoteButton';
import { castVote } from '@/services/contractClient';
import { useRole } from '@/context/RoleContext';
import { useToast } from '@/components/Toast';
import { appendAuditEvent } from '@/utils/logger';

jest.mock('@/services/contractClient', () => ({
  castVote: jest.fn(),
}));
jest.mock('@/context/RoleContext', () => ({
  useRole: jest.fn(),
}));
jest.mock('@/components/Toast');
jest.mock('@/utils/logger', () => ({
  appendAuditEvent: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/context/NetworkContext', () => ({
  useNetwork: jest.fn(() => ({
    networkConfig: {
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    },
  })),
}));
jest.mock('@/context/WalletContext', () => ({
  useWallet: jest.fn(),
}));
jest.mock('@/hooks/useChainState', () => ({
  useChainState: jest.fn(() => ({ forceSync: jest.fn() })),
}));
jest.mock('@/lib/stellar-expert', () => ({
  getStellarExplorerTxUrl: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
}));

import { useNetwork } from '@/context/NetworkContext';

const mockCastVote = castVote as jest.MockedFunction<typeof castVote>;
const mockUseRole = useRole as jest.MockedFunction<typeof useRole>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUseNetwork = useNetwork as jest.MockedFunction<typeof useNetwork>;
const { useWallet } = require('@/context/WalletContext');
const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockShowToast = jest.fn();
const mockRefreshRole = jest.fn();

type MockRoleState = ReturnType<typeof useRole>;

function mockRole(overrides: Partial<MockRoleState> = {}): void {
  mockUseRole.mockReturnValue({
    role: 'guardian',
    isAdmin: false,
    isGuardian: true,
    canVote: true,
    canManageTasks: false,
    isLoading: false,
    error: null,
    refreshRole: mockRefreshRole,
    ...overrides,
  });
}

function renderVoteButton(publicKey: string | null = 'GPUBKEY'): HTMLElement {
  render(<VoteButton prId={42} publicKey={publicKey} />);
  return screen.getByRole('button');
}

beforeEach(() => {
  mockUseToast.mockReturnValue({ showToast: mockShowToast });
  mockUseNetwork.mockReturnValue({
    networkConfig: {
      horizonUrl: 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    isCustomConfig: false,
    urlError: null,
    clearUrlError: jest.fn(),
    setHorizonUrl: jest.fn(),
    setSorobanRpcUrl: jest.fn(),
    setNetworkPassphrase: jest.fn(),
    resetToDefaults: jest.fn(),
  });
  mockUseWallet.mockReturnValue({
    publicKey: 'GPUBKEY',
    isConnected: true,
    connect: jest.fn(),
    disconnect: jest.fn(),
    isLoading: false,
    error: null,
    reputation: 0,
    activeProvider: 'freighter',
    availableProviders: [],
    setMockPublicKey: jest.fn(),
  });
  mockRole();
  mockCastVote.mockResolvedValue('deafhash');
});

afterEach(() => jest.clearAllMocks());

describe('VoteButton', () => {
  it('lets a connected authorized role cast a vote', async () => {
    mockRole({ role: 'admin', isAdmin: true, isGuardian: false, canManageTasks: true });
    const button = renderVoteButton();

    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(mockCastVote).toHaveBeenCalledWith(
      42,
      'GPUBKEY',
      expect.any(String),
      expect.any(String),
      expect.any(String),
    ));
    await waitFor(() =>
      expect(appendAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'vote-42-deafhash',
          type: 'guardian.vote',
          action: 'vote_submitted',
          status: 'success',
        }),
      ),
    );
  });

  it('is disabled when no wallet is connected', () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      isConnected: false,
      connect: jest.fn(),
      disconnect: jest.fn(),
      isLoading: false,
      error: null,
      reputation: 0,
      activeProvider: null,
      availableProviders: [],
      setMockPublicKey: jest.fn(),
    });
    const button = renderVoteButton(null);

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockCastVote).not.toHaveBeenCalled();
  });

  it('is disabled for an unauthorized role and does not vote', () => {
    mockRole({ role: 'unauthorized', isGuardian: false, canVote: false });
    const button = renderVoteButton();

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockCastVote).not.toHaveBeenCalled();
  });

  it('is disabled while role data is loading', () => {
    mockRole({ isLoading: true, canVote: true });
    expect(renderVoteButton()).toBeDisabled();
  });

  it('shows Loader2 spinner and "Signing…" label in PENDING state', async () => {
    // Keep castVote pending so we can inspect the mid-flight UI.
    let resolve!: (hash: string) => void;
    mockCastVote.mockReturnValue(new Promise<string>((res) => { resolve = res; }));

    const button = renderVoteButton();
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    // The button should contain the spinning loader during signing.
    expect(button.querySelector('svg')).toBeInTheDocument();
    // Aria label updates to "signing" state.
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('PR #42'));

    // Also expect the inline pending notification to appear.
    await waitFor(() =>
      expect(screen.getByRole('status')).toBeInTheDocument(),
    );

    resolve('finalhash');
  });

  it('shows success notification with explorer link after a successful vote', async () => {
    const button = renderVoteButton();
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    // Button text changes to "✓ Voted"
    await waitFor(() => expect(button).toHaveTextContent(/voted/i));
    // Inline success notification with a link.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /view transaction/i })).toBeInTheDocument(),
    );
  });

  it('shows a network error notification when the vote fails with a contract error', async () => {
    mockCastVote.mockRejectedValue(new Error('Horizon error'));
    const button = renderVoteButton();
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network or contract error/i),
    );
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'guardian.vote',
        action: 'vote_failed',
        status: 'failure',
        metadata: expect.objectContaining({ errorKind: 'network_error' }),
      }),
    );
  });

  it('shows a user rejection notification when Freighter is declined', async () => {
    mockCastVote.mockRejectedValue(new Error('User declined access'));
    const button = renderVoteButton();
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/rejected/i),
    );
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ errorKind: 'user_rejected' }),
      }),
    );
  });

  it('clears the error notification when the dismiss button is clicked', async () => {
    mockCastVote.mockRejectedValue(new Error('Horizon error'));
    renderVoteButton();
    fireEvent.click(screen.getByRole('button', { name: /vote for pr/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /close notification/i }));

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
