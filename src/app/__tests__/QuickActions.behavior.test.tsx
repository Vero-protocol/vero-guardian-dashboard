import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from '../page';
import { useRole } from '@/context/RoleContext';
import { useWallet } from '@/context/WalletContext';

// The Home page owns the widget list; simulate DashboardGrid actually mounting
// each element. This catches accidental duplicate JSX outside the grid.
jest.mock('@/context/RoleContext', () => ({ useRole: jest.fn() }));
jest.mock('@/context/WalletContext', () => ({ useWallet: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
}));
jest.mock('@/components/dashboard/DashboardGrid', () => ({
  __esModule: true,
  default: ({ widgets, role }: { widgets: Array<{ id: string; component: React.ReactNode }>; role: string }) => (
    <div data-testid="dashboard-grid" data-role={role}>
      {widgets.map(widget => (
        <section key={widget.id} data-testid={'widget-' + widget.id}>
          {widget.component}
        </section>
      ))}
    </div>
  ),
}));
jest.mock('@/components/ErrorBoundary', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/ProofViewer', () => ({
  ProofHistoryTable: () => <div data-testid="render-proof-history" />,
}));
jest.mock('@/components/security', () => ({
  __esModule: true,
  default: () => <div data-testid="render-security-scanner" />,
}));
jest.mock('@/components/AlertBanner', () => ({
  AlertBanner: () => <div data-testid="render-alert-banner" />,
}));
jest.mock('@/components/AuditSessionTimer', () => ({ __esModule: true, default: () => <div data-testid="render-audit-session-timer" /> }));
jest.mock('@/components/ConnectButton', () => ({ __esModule: true, default: () => <div data-testid="render-connect-button" /> }));
jest.mock('@/components/ContractTimeTraveler', () => ({ __esModule: true, default: () => <div data-testid="render-contract-time-traveler" /> }));
jest.mock('@/components/EmergencyHaltButton', () => ({ __esModule: true, default: () => <div data-testid="render-emergency-halt" /> }));
jest.mock('@/components/EventMonitor', () => ({ __esModule: true, default: () => <div data-testid="render-event-monitor" /> }));
jest.mock('@/components/FeedbackModal', () => ({ __esModule: true, default: () => <div data-testid="render-feedback-modal" /> }));
jest.mock('@/components/ForceSyncButton', () => ({ __esModule: true, default: () => <div data-testid="render-force-sync" /> }));
jest.mock('@/components/GasHeatmap', () => ({ __esModule: true, default: () => <div data-testid="render-gas-heatmap" /> }));
jest.mock('@/components/GlobalStateSearch', () => ({ __esModule: true, default: () => <div data-testid="render-state-search" /> }));
jest.mock('@/components/LanguageToggle', () => ({ __esModule: true, default: () => <div data-testid="render-language-toggle" /> }));
jest.mock('@/components/leaderboard', () => ({ __esModule: true, default: () => <div data-testid="render-leaderboard" /> }));
jest.mock('@/components/NetworkStatus', () => ({ __esModule: true, default: () => <div data-testid="render-network-status" /> }));
jest.mock('@/components/PRFeed', () => ({ __esModule: true, default: () => <div data-testid="render-pr-feed" /> }));
jest.mock('@/components/PushNotificationToggle', () => ({ __esModule: true, default: () => <div data-testid="render-push-notification" /> }));
jest.mock('@/components/ContractCallGraph', () => ({ __esModule: true, default: () => <div data-testid="render-contract-call-graph" /> }));
jest.mock('@/components/TaskCard', () => ({ __esModule: true, default: () => <div data-testid="render-task-card" /> }));
jest.mock('@/components/ThemeToggle', () => ({ __esModule: true, default: () => <div data-testid="render-theme-toggle" /> }));
jest.mock('@/components/TransactionFeed', () => ({ __esModule: true, default: () => <div data-testid="render-transaction-feed" /> }));
jest.mock('@/components/timer', () => ({ __esModule: true, default: () => <div data-testid="render-session-timer" /> }));
jest.mock('@/components/security/RelayerVault', () => ({ __esModule: true, default: () => <div data-testid="render-relayer-vault" /> }));
jest.mock('@/components/security/AuditExport', () => ({ __esModule: true, default: () => <div data-testid="render-audit-export" /> }));

const mockUseRole = useRole as jest.MockedFunction<typeof useRole>;
const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

beforeEach(() => {
  jest.clearAllMocks();
  (useRole as jest.Mock).mockReturnValue({ role: 'guardian', isLoading: false });
  (useWallet as jest.Mock).mockReturnValue({ isConnected: false, reputation: 0 });
});

it('network status action is a functional anchor to the real status section', () => {
  render(<Home />);
  const anchor = screen.getByRole('link', { name: 'actions.networkStatus' });
  expect(anchor).toHaveAttribute('href', '#network-status');
  const section = document.querySelector('#network-status');
  expect(section).not.toBeNull();
  expect(section).toContainElement(screen.getByTestId('render-network-status'));
});

it('stake and reward actions are visibly disabled until implemented', () => {
  render(<Home />);
  for (const name of ['actions.stake — actions.comingSoon', 'actions.rewards — actions.comingSoon']) {
    const action = screen.getByRole('button', { name });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('title', 'actions.comingSoon');
  }
  expect(screen.getAllByText('actions.comingSoon')).toHaveLength(2);
});

it('renders the same actions for admin users without enabling unavailable operations', () => {
  (useRole as jest.Mock).mockReturnValue({ role: 'admin', isLoading: false });
  render(<Home />);
  expect(screen.getByRole('link', { name: 'actions.networkStatus' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'actions.stake — actions.comingSoon' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'actions.rewards — actions.comingSoon' })).toBeDisabled();
});
