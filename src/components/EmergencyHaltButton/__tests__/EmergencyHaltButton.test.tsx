import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Set environment variable BEFORE importing the component
process.env.NEXT_PUBLIC_CONTRACT_ID = '0x1234567890abcdef';

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'emergencyHalt.label': 'Emergency Halt',
        'emergencyHalt.halted': 'Contract Halted',
        'emergencyHalt.halting': 'Halting Contract…',
        'emergencyHalt.noContract': 'Contract Not Configured',
        'emergencyHalt.missingWallet': 'Connect Wallet First',
        'emergencyHalt.unauthorized': 'Admin Only',
        'emergencyHalt.confirmTitle': 'Confirm Emergency Halt',
        'emergencyHalt.confirmDescription': 'This will halt all contract operations. This action is irreversible and requires admin authority.',
        'emergencyHalt.confirmExecute': 'Yes, Halt Contract',
        'emergencyHalt.confirmCancel': 'Cancel',
        'emergencyHalt.ariaLabel': 'Emergency halt circuit breaker',
        'emergencyHalt.toast.connectWallet': 'Connect your wallet to halt the contract.',
        'emergencyHalt.toast.noContract': 'No contract ID configured (NEXT_PUBLIC_CONTRACT_ID).',
        'emergencyHalt.toast.halted': 'Contract successfully halted.',
        'emergencyHalt.toast.failed': 'Failed to halt the contract.',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock dependencies
jest.mock('@/services/contractClient', () => ({
  haltContract: jest.fn(),
}));
jest.mock('@/context/RoleContext', () => ({
  useRole: jest.fn(),
}));
jest.mock('@/components/Toast');
jest.mock('@/context/WalletContext', () => ({
  useWallet: jest.fn(),
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
jest.mock('@/hooks/useChainState', () => ({
  useChainState: jest.fn(() => ({ forceSync: jest.fn(), isHalted: false })),
}));
jest.mock('@/hooks/useEvents', () => ({
  useEvents: jest.fn(() => ({ emit: jest.fn(), timeline: [], clear: jest.fn() })),
}));
jest.mock('@/utils/logger', () => ({
  appendAuditEvent: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/stellar-expert', () => ({
  getStellarExplorerTxUrl: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
}));

// Import after all mocks are set up
import EmergencyHaltButton from '@/components/EmergencyHaltButton';
import { haltContract } from '@/services/contractClient';
import { useRole } from '@/context/RoleContext';
import { useToast } from '@/components/Toast';
import { useWallet } from '@/context/WalletContext';
import { useNetwork } from '@/context/NetworkContext';
import { useChainState } from '@/hooks/useChainState';
import { useEvents } from '@/hooks/useEvents';
import { appendAuditEvent } from '@/utils/logger';

const mockHaltContract = haltContract as jest.MockedFunction<typeof haltContract>;
const mockUseRole = useRole as jest.MockedFunction<typeof useRole>;
const mockUseToast = useToast as jest.MockedFunction<typeof useToast>;
const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;
const mockUseNetwork = useNetwork as jest.MockedFunction<typeof useNetwork>;
const mockUseEvents = useEvents as jest.MockedFunction<typeof useEvents>;
const mockShowToast = jest.fn();
const mockEmit = jest.fn();
const mockClear = jest.fn();

beforeEach(() => {
  // Ensure env var is set for each test
  process.env.NEXT_PUBLIC_CONTRACT_ID = '0x1234567890abcdef';
  
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
    publicKey: 'GPUBKEY123',
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
  mockUseRole.mockReturnValue({
    role: 'admin',
    isAdmin: true,
    isGuardian: false,
    canVote: false,
    canManageTasks: true,
    isLoading: false,
    error: null,
    refreshRole: jest.fn(),
  });
  mockUseEvents.mockReturnValue({ 
    emit: mockEmit, 
    timeline: [], 
    clear: mockClear 
  });
  mockHaltContract.mockResolvedValue('abcdef1234567890');
  const { useChainState } = require('@/hooks/useChainState');
  useChainState.mockReturnValue({ forceSync: jest.fn(), isHalted: false });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('EmergencyHaltButton', () => {
  describe('Rendering states', () => {
    it('renders the button in ready state for admin with wallet connected', () => {
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      expect(button).toBeEnabled();
      expect(button).toHaveTextContent('Emergency Halt');
    });

    it('shows missing wallet state when no wallet connected', () => {
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
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Connect Wallet First');
      expect(button).toBeDisabled();
    });

    it('shows unauthorized state for non-admin users', () => {
      mockUseRole.mockReturnValue({
        role: 'guardian',
        isAdmin: false,
        isGuardian: true,
        canVote: true,
        canManageTasks: false,
        isLoading: false,
        error: null,
        refreshRole: jest.fn(),
      });
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Admin Only');
      expect(button).toBeDisabled();
    });
  });

  describe('Confirmation flow', () => {
    it('shows confirmation dialog when button is clicked', () => {
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);

      expect(screen.getByText('Confirm Emergency Halt')).toBeInTheDocument();
      expect(screen.getByText(/This will halt all contract operations/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Yes, Halt Contract' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('cancels confirmation when cancel button is clicked', () => {
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);

      expect(screen.getByText('Confirm Emergency Halt')).toBeInTheDocument();
      
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      expect(screen.queryByText('Confirm Emergency Halt')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Emergency halt circuit breaker/i })).toBeInTheDocument();
    });
  });

  describe('Halt execution', () => {
    it('calls haltContract with correct parameters', async () => {
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);
      const confirmButton = screen.getByRole('button', { name: 'Yes, Halt Contract' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockHaltContract).toHaveBeenCalledWith(
          'GPUBKEY123',
          expect.any(String),
          expect.any(String),
          expect.any(String),
        );
      });
    });

    it('emits event on successful halt', async () => {
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);
      const confirmButton = screen.getByRole('button', { name: 'Yes, Halt Contract' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockEmit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'emergency_halt',
            actor: 'GPUBKEY123',
            resource: 'contract',
          })
        );
      });
    });

    it('appends audit event on successful halt', async () => {
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);
      const confirmButton = screen.getByRole('button', { name: 'Yes, Halt Contract' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(appendAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'admin.emergency_halt',
            actor: 'GPUBKEY123',
            action: 'contract_halted',
            status: 'success',
          })
        );
      });
    });

    it('shows success toast with transaction link', async () => {
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);
      const confirmButton = screen.getByRole('button', { name: 'Yes, Halt Contract' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('Contract successfully halted'),
          'success'
        );
      });
    });

    it('handles error when halt fails', async () => {
      const errorMessage = 'Contract halt failed';
      mockHaltContract.mockRejectedValue(new Error(errorMessage));
      
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);
      const confirmButton = screen.getByRole('button', { name: 'Yes, Halt Contract' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          errorMessage,
          'error'
        );
      });
    });

    it('appends audit event on halt failure', async () => {
      mockHaltContract.mockRejectedValue(new Error('Contract halt failed'));
      
      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);
      const confirmButton = screen.getByRole('button', { name: 'Yes, Halt Contract' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(appendAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'admin.emergency_halt',
            action: 'halt_failed',
            status: 'failure',
          })
        );
      });
    });
  });

  describe('Edge cases', () => {
    it('shows halting state while processing', async () => {
      let resolve: (value: string) => void = () => {};
      mockHaltContract.mockReturnValue(new Promise((res) => { resolve = res; }));

      render(<EmergencyHaltButton />);
      const button = screen.getByRole('button', { name: /Emergency halt circuit breaker/i });
      fireEvent.click(button);
      const confirmButton = screen.getByRole('button', { name: 'Yes, Halt Contract' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Halting Contract…')).toBeInTheDocument();
      });

      resolve('hash');
    });
  });
});