import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from '@jest/globals';
import {
  NetworkProvider,
  useNetwork,
  CUSTOM_NETWORK_CONFIG_WARNING,
} from '@/context/NetworkContext';
import { defaultNetworkConfig } from '@/services/rpc';

function NetworkProbe() {
  const {
    networkConfig,
    isCustomConfig,
    urlError,
    setHorizonUrl,
    setSorobanRpcUrl,
    resetToDefaults,
  } = useNetwork();

  return (
    <div>
      <p data-testid="horizon-url">{networkConfig.horizonUrl}</p>
      <p data-testid="soroban-url">{networkConfig.sorobanRpcUrl}</p>
      <p data-testid="is-custom">{String(isCustomConfig)}</p>
      <p data-testid="url-error">{urlError ?? ''}</p>
      <button
        type="button"
        onClick={() => setHorizonUrl('http://evil.example/horizon')}
      >
        Set evil horizon
      </button>
      <button
        type="button"
        onClick={() => setSorobanRpcUrl('https://custom-rpc.example')}
      >
        Set custom soroban
      </button>
      <button type="button" onClick={() => resetToDefaults()}>
        Reset
      </button>
    </div>
  );
}

describe('NetworkContext URL scheme restrictions', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('rejects non-https (non-localhost) URLs with a clear error and does not update config', async () => {
    const user = userEvent.setup();
    render(
      <NetworkProvider>
        <NetworkProbe />
      </NetworkProvider>,
    );

    expect(screen.getByTestId('horizon-url').textContent).toBe(
      defaultNetworkConfig.horizonUrl,
    );

    await user.click(screen.getByRole('button', { name: 'Set evil horizon' }));

    expect(screen.getByTestId('url-error').textContent).toMatch(
      /HTTP is only allowed for localhost|Only HTTPS URLs are allowed/i,
    );
    expect(screen.getByTestId('horizon-url').textContent).toBe(
      defaultNetworkConfig.horizonUrl,
    );
    expect(screen.queryByTestId('custom-network-config-warning')).toBeNull();
  });

  it('shows a persistent warning banner whenever a custom endpoint is active', async () => {
    const user = userEvent.setup();
    render(
      <NetworkProvider>
        <NetworkProbe />
      </NetworkProvider>,
    );

    expect(screen.queryByTestId('custom-network-config-warning')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Set custom soroban' }));

    await waitFor(() => {
      expect(screen.getByTestId('is-custom').textContent).toBe('true');
    });

    const banner = screen.getByTestId('custom-network-config-warning');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Custom network endpoints in use');
    expect(banner.textContent).toContain(CUSTOM_NETWORK_CONFIG_WARNING);
    expect(screen.getByTestId('soroban-url').textContent).toBe(
      'https://custom-rpc.example',
    );

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => {
      expect(screen.getByTestId('is-custom').textContent).toBe('false');
    });
    expect(screen.queryByTestId('custom-network-config-warning')).toBeNull();
  });

  it('does not persist an insecure stored URL from localStorage', async () => {
    window.localStorage.setItem(
      'vero_network_config',
      JSON.stringify({
        horizonUrl: 'http://evil.example',
        sorobanRpcUrl: defaultNetworkConfig.sorobanRpcUrl,
        networkPassphrase: defaultNetworkConfig.networkPassphrase,
      }),
    );

    render(
      <NetworkProvider>
        <NetworkProbe />
      </NetworkProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('horizon-url').textContent).toBe(
        defaultNetworkConfig.horizonUrl,
      );
    });

    expect(screen.queryByTestId('custom-network-config-warning')).toBeNull();
  });
});
