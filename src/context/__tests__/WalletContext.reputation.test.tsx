import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetworkProvider, useNetwork } from '@/context/NetworkContext';
import { WalletProvider, useWallet } from '@/context/WalletContext';
import { getReputation } from '@/lib/stellar-interact';

jest.mock('@stellar/freighter-api', () => ({
  isConnected: jest.fn(async () => ({ isConnected: false })),
  getAddress: jest.fn(async () => ({ address: '' })),
  requestAccess: jest.fn(async () => ({ address: '' })),
  WatchWalletChanges: jest.fn(() => ({
    watch: jest.fn(),
    stop: jest.fn(),
  })),
  getPublicKey: jest.fn(async () => ''),
  signTransaction: jest.fn(),
}));

jest.mock('@/lib/stellar-interact', () => ({
  getReputation: jest.fn(async (_pk: string, _url?: string) => 42),
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
}));

jest.mock('@/hooks/useChainState', () => ({
  useChainState: () => ({
    forceSync: jest.fn(),
    isSyncing: false,
    status: 'idle',
    syncVersion: 0,
  }),
}));

const mockGetReputation = getReputation as jest.MockedFunction<typeof getReputation>;
const TEST_PUBLIC_KEY = 'GDZST3XVCDTUJ76ZAV2HA72KYXY5YOFZ3F5YMQABR6J32F2TQPWQNQ3X';

function ConsumerComponent() {
  const { setMockPublicKey, reputation } = useWallet();
  const { setHorizonUrl } = useNetwork();

  return (
    <div>
      <span data-testid="reputation">{reputation}</span>
      <button
        data-testid="set-key-btn"
        onClick={() => setMockPublicKey(TEST_PUBLIC_KEY)}
      >
        Set Key
      </button>
      <button
        data-testid="switch-network-btn"
        onClick={() => setHorizonUrl('https://horizon.stellar.org')}
      >
        Switch Network
      </button>
    </div>
  );
}

describe('WalletContext reputation network integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockGetReputation.mockClear();
  });

  it('passes the active Horizon URL to getReputation and re-fetches when network changes', async () => {
    const user = userEvent.setup();

    render(
      <NetworkProvider>
        <WalletProvider>
          <ConsumerComponent />
        </WalletProvider>
      </NetworkProvider>
    );

    // Initially no wallet connected, so getReputation should not have been called
    expect(mockGetReputation).not.toHaveBeenCalled();

    // Connect wallet
    await user.click(screen.getByTestId('set-key-btn'));

    await waitFor(() => {
      expect(mockGetReputation).toHaveBeenCalledWith(
        TEST_PUBLIC_KEY,
        'https://horizon-testnet.stellar.org'
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('reputation').textContent).toBe('42');
    });

    // Clear calls to verify network switch triggers a fresh fetch
    mockGetReputation.mockClear();
    mockGetReputation.mockResolvedValueOnce(99);

    // Switch horizon URL via NetworkContext
    await user.click(screen.getByTestId('switch-network-btn'));

    await waitFor(() => {
      expect(mockGetReputation).toHaveBeenCalledWith(
        TEST_PUBLIC_KEY,
        'https://horizon.stellar.org'
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('reputation').textContent).toBe('99');
    });
  });
});
