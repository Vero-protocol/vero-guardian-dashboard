import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config';
import TransactionNotification from '../index';
import type { VoteTxState } from '@/hooks/useVoteTransaction';

jest.mock('@/lib/stellar-expert', () => ({
  getStellarExplorerTxUrl: (hash: string) =>
    `https://stellar.expert/explorer/public/tx/${hash}`,
}));

function renderNotification(
  state: VoteTxState,
  onDismiss?: () => void,
) {
  return render(
    <I18nextProvider i18n={i18n}>
      <TransactionNotification state={state} onDismiss={onDismiss} />
    </I18nextProvider>,
  );
}

const IDLE_STATE: VoteTxState = {
  status: 'idle',
  txHash: null,
  errorKind: null,
  errorMessage: null,
};

const PENDING_STATE: VoteTxState = {
  status: 'pending',
  txHash: null,
  errorKind: null,
  errorMessage: null,
};

const SUCCESS_STATE: VoteTxState = {
  status: 'success',
  txHash: 'abc123def456',
  errorKind: null,
  errorMessage: null,
};

const ERROR_NETWORK_STATE: VoteTxState = {
  status: 'error',
  txHash: null,
  errorKind: 'network_error',
  errorMessage: 'Horizon error',
};

const ERROR_USER_REJECTED_STATE: VoteTxState = {
  status: 'error',
  txHash: null,
  errorKind: 'user_rejected',
  errorMessage: 'User declined',
};

describe('TransactionNotification', () => {
  describe('idle state', () => {
    test('renders nothing when status is idle', () => {
      const { container } = renderNotification(IDLE_STATE);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('pending state', () => {
    test('renders a status region with aria-live="polite"', () => {
      renderNotification(PENDING_STATE);
      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
      expect(status).toHaveAttribute('aria-live', 'polite');
    });

    test('shows the pending message', () => {
      renderNotification(PENDING_STATE);
      expect(
        screen.getByText('Waiting for Freighter signature…'),
      ).toBeInTheDocument();
    });

    test('includes a spinner svg icon', () => {
      renderNotification(PENDING_STATE);
      const status = screen.getByRole('status');
      // The Loader2 icon renders as an SVG with aria-hidden="true"
      const svg = status.querySelector('svg[aria-hidden="true"]');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('success state', () => {
    test('renders a status region with aria-live="polite"', () => {
      renderNotification(SUCCESS_STATE);
      const status = screen.getByRole('status');
      expect(status).toBeInTheDocument();
      expect(status).toHaveAttribute('aria-live', 'polite');
    });

    test('shows the success message', () => {
      renderNotification(SUCCESS_STATE);
      expect(screen.getByText('Vote recorded on-chain.')).toBeInTheDocument();
    });

    test('renders an explorer link pointing to the correct URL', () => {
      renderNotification(SUCCESS_STATE);
      const link = screen.getByRole('link', { name: /view transaction/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute(
        'href',
        'https://stellar.expert/explorer/public/tx/abc123def456',
      );
    });

    test('explorer link opens in a new tab with rel="noopener noreferrer"', () => {
      renderNotification(SUCCESS_STATE);
      const link = screen.getByRole('link', { name: /view transaction/i });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    test('includes a success svg icon with aria-hidden="true"', () => {
      renderNotification(SUCCESS_STATE);
      const status = screen.getByRole('status');
      const svg = status.querySelector('svg[aria-hidden="true"]');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('error state — network error', () => {
    test('renders an alert region with aria-live="assertive"', () => {
      renderNotification(ERROR_NETWORK_STATE);
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    test('shows the network error message', () => {
      renderNotification(ERROR_NETWORK_STATE);
      expect(
        screen.getByText(
          'Transaction failed due to a network or contract error. Please try again.',
        ),
      ).toBeInTheDocument();
    });

    test('does not show the user-rejected message for a network error', () => {
      renderNotification(ERROR_NETWORK_STATE);
      expect(
        screen.queryByText('Signature rejected. Open Freighter and try again.'),
      ).not.toBeInTheDocument();
    });

    test('includes an error svg icon with aria-hidden="true"', () => {
      renderNotification(ERROR_NETWORK_STATE);
      const alert = screen.getByRole('alert');
      const svg = alert.querySelector('svg[aria-hidden="true"]');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('error state — user rejected', () => {
    test('shows the user-rejected message', () => {
      renderNotification(ERROR_USER_REJECTED_STATE);
      expect(
        screen.getByText('Signature rejected. Open Freighter and try again.'),
      ).toBeInTheDocument();
    });

    test('does not show the network error message for a user rejection', () => {
      renderNotification(ERROR_USER_REJECTED_STATE);
      expect(
        screen.queryByText(
          'Transaction failed due to a network or contract error. Please try again.',
        ),
      ).not.toBeInTheDocument();
    });
  });

  describe('dismiss button', () => {
    test('renders a dismiss button when onDismiss is provided in error state', () => {
      const onDismiss = jest.fn();
      renderNotification(ERROR_NETWORK_STATE, onDismiss);
      expect(
        screen.getByRole('button', { name: /close notification/i }),
      ).toBeInTheDocument();
    });

    test('calls onDismiss when the dismiss button is clicked', () => {
      const onDismiss = jest.fn();
      renderNotification(ERROR_NETWORK_STATE, onDismiss);
      fireEvent.click(screen.getByRole('button', { name: /close notification/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    test('does not render a dismiss button when onDismiss is not provided', () => {
      renderNotification(ERROR_NETWORK_STATE);
      expect(
        screen.queryByRole('button', { name: /close notification/i }),
      ).not.toBeInTheDocument();
    });

    test('does not render a dismiss button in pending state', () => {
      const onDismiss = jest.fn();
      renderNotification(PENDING_STATE, onDismiss);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    test('does not render a dismiss button in success state', () => {
      const onDismiss = jest.fn();
      renderNotification(SUCCESS_STATE, onDismiss);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('success state without txHash', () => {
    test('renders nothing when status is success but txHash is null', () => {
      const stateNoHash: VoteTxState = {
        status: 'success',
        txHash: null,
        errorKind: null,
        errorMessage: null,
      };
      const { container } = renderNotification(stateNoHash);
      expect(container.firstChild).toBeNull();
    });
  });
});
