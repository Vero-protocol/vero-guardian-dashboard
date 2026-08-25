import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RelayerVault from '../RelayerVault';

describe('RelayerVault Component', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders status tab and fetches vault status on mount', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        configured: true,
        hardwareBacked: true,
        rawSecretPresent: false,
        warning: undefined,
      }),
    });

    render(<RelayerVault />);

    // Shows loading/fetching state initially or after resolving
    await waitFor(() => {
      expect(screen.getByText('Vault Configured')).toBeInTheDocument();
      expect(screen.getByText('Hardware-Backed Storage')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/vault');
  });

  it('renders warnings if configured key is exposed as raw secret', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        configured: true,
        hardwareBacked: false,
        rawSecretPresent: true,
        warning: 'STELLAR_SECRET_KEY is a raw environment secret and will be ignored',
      }),
    });

    render(<RelayerVault />);

    await waitFor(() => {
      expect(screen.getByText(/is a raw environment secret/)).toBeInTheDocument();
    });
  });

  it('shows a retryable error when the status request is not successful', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ configured: true, hardwareBacked: false }),
      });

    render(<RelayerVault />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load vault status. Please try again.');
    expect(screen.queryByText('Fetching vault status...')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(screen.getByText('Vault Configured')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a retryable error when fetching status rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));

    render(<RelayerVault />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load vault status. Please try again.');
    expect(screen.queryByText('Fetching vault status...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('allows tab switching', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ configured: false }),
    });

    render(<RelayerVault />);

    await screen.findByText('Vault Not Configured');

    // Switch to Encrypt Key tab
    const encryptTab = screen.getByText('Encrypt Key');
    fireEvent.click(encryptTab);
    expect(screen.getByLabelText(/Stellar Secret Key/)).toBeInTheDocument();

    // Switch to Verify Retrieval tab
    const verifyTab = screen.getByText('Verify Retrieval');
    fireEvent.click(verifyTab);
    expect(screen.getByLabelText(/Vault Record JSON/)).toBeInTheDocument();
  });

  it('handles encrypt action and displays record', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ configured: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          record: {
            version: 1,
            algorithm: 'AES-256-GCM',
            keyId: 'test-key',
            hardwareBacked: true,
            iv: 'base64-iv',
            authTag: 'base64-tag',
            ciphertext: 'base64-ciphertext',
            createdAt: '2026-06-20T12:00:00Z',
          },
        }),
      });

    render(<RelayerVault />);

    await screen.findByText('Vault Not Configured');

    // Go to Encrypt
    fireEvent.click(screen.getByText('Encrypt Key'));

    // Fill fields
    fireEvent.change(screen.getByLabelText(/Stellar Secret Key/), {
      target: { value: 'SSECRETKEY...' },
    });
    fireEvent.change(screen.getByLabelText(/Hardware Key Material/), {
      target: { value: 'my-passphrase' },
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Generate Vault Record' }));

    await waitFor(() => {
      expect(screen.getByText('Vault Record (JSON)')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/vault',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'encrypt',
          secret: 'SSECRETKEY...',
          keyId: 'vero-guardian-relayer-key',
          hardwareBacked: true,
          keyMaterial: 'my-passphrase',
        }),
      }),
    );
  });

  it('handles verify retrieval action and displays success state', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ configured: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          length: 56,
        }),
      });

    render(<RelayerVault />);

    await screen.findByText('Vault Not Configured');

    // Go to Verify
    fireEvent.click(screen.getByText('Verify Retrieval'));

    // Fill fields
    fireEvent.change(screen.getByLabelText(/Vault Record JSON/), {
      target: { value: '{"version":1,"hardwareBacked":true}' },
    });
    fireEvent.change(screen.getByLabelText(/Hardware Key Material/), {
      target: { value: 'my-passphrase' },
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Verify Key Retrieval' }));

    await waitFor(() => {
      expect(screen.getByText('Verification Successful')).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/vault',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'verify',
          record: { version: 1, hardwareBacked: true },
          keyMaterial: 'my-passphrase',
        }),
      }),
    );
  });
});
