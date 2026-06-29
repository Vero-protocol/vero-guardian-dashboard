import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { NetworkProvider } from '@/context/NetworkContext';
import NetworkStatus, { HEARTBEAT_INTERVAL_MS, RPC_REQUEST_TIMEOUT_MS, fetchRpcHealth } from '../StateStateStateStateStateStateStateStateStateStateNetworkStatus';

function renderWithProviders(element: React.ReactElement) {
  return render(<NetworkProvider>{element}</NetworkProvider>);
}

describe('fetchRpcHealth', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('classifies a healthy getHealth response with measured latency', async () => {
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { status: 'healthy' } }),
    } as Response);
    const now = jest.fn<() => number>().mockReturnValueOnce(1_000).mockReturnValueOnce(1_084);

    await expect(fetchRpcHealth('https://rpc.example', fetcher, now)).resolves.toEqual({
      status: 'healthy',
      latencyMs: 84,
      message: 'RPC getHealth is responding normally',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://rpc.example',
      expect.objectContaining({
        method: 'POST',
        body: '{"jsonrpc":"2.0","id":1,"method":"getHealth"}',
      })
    );
  });

  test('classifies invalid JSON from a reachable RPC as degraded and logs context', async () => {
    const error = new SyntaxError('Unexpected token');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw error;
      },
    } as unknown as Response);
    const now = jest.fn<() => number>().mockReturnValueOnce(1_000).mockReturnValueOnce(1_012);

    await expect(fetchRpcHealth('https://rpc.example', fetcher, now)).resolves.toEqual({
      status: 'degraded',
      latencyMs: 12,
      message: 'RPC returned an invalid health response. Switch RPC endpoints if this continues.',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Stellar RPC getHealth returned invalid JSON',
      expect.objectContaining({ endpoint: 'https://rpc.example', error })
    );
  });
});

describe('NetworkStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('transitions from healthy to offline on the next heartbeat failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ result: { status: 'healthy' } }),
      } as Response)
      .mockRejectedValueOnce(new TypeError('network down'));
    const now = jest.fn<() => number>().mockReturnValueOnce(1_000).mockReturnValueOnce(1_042).mockReturnValue(2_000);

    renderWithProviders(<NetworkStatus endpoint="https://rpc.example" fetcher={fetcher} now={now} />);

    expect(screen.getByText('https://rpc.example')).toBeTruthy();
    expect(await screen.findByText('Healthy')).toBeTruthy();
    expect(screen.getByText('42 ms')).toBeTruthy();
    expect(screen.getByTestId('rpc-status-dot').className).toContain('bg-emerald-500');

    await act(async () => {
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });

    await waitFor(() => expect(screen.getByText('Offline')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('RPC unreachable');
    expect(screen.getByTestId('rpc-status-dot').className).toContain('bg-red-500');
    expect(errorSpy).toHaveBeenCalledWith(
      'Stellar RPC getHealth request failed',
      expect.objectContaining({ endpoint: 'https://rpc.example', error: expect.any(TypeError) })
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('marks a hung heartbeat offline before the next polling interval', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = jest.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('heartbeat timeout')), { once: true });
        })
    );
    const now = jest.fn<() => number>().mockReturnValue(1_000);

    renderWithProviders(<NetworkStatus endpoint="https://rpc.example" fetcher={fetcher} now={now} />);

    expect(screen.getByText('Checking RPC health...')).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(RPC_REQUEST_TIMEOUT_MS);
    });

    await waitFor(() => expect(screen.getByText('Offline')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('RPC unreachable');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Stellar RPC getHealth request failed',
      expect.objectContaining({ endpoint: 'https://rpc.example', error: expect.any(Error) })
    );
  });

  test('marks an RPC with a stalled health body offline before the next polling interval', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = jest.fn<typeof fetch>(
      (_input, init) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('health body timeout')), { once: true });
            }),
        } as unknown as Response)
    );
    const now = jest.fn<() => number>().mockReturnValueOnce(1_000).mockReturnValueOnce(1_010).mockReturnValue(1_010);

    renderWithProviders(<NetworkStatus endpoint="https://rpc.example" fetcher={fetcher} now={now} />);

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(RPC_REQUEST_TIMEOUT_MS);
    });

    await waitFor(() => expect(screen.getByText('Offline')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('RPC unreachable');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Stellar RPC getHealth request failed',
      expect.objectContaining({ endpoint: 'https://rpc.example', error: expect.any(Error) })
    );
  });

  test('ignores stale heartbeat responses after a newer offline result', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolveFirstHeartbeat!: (response: Response) => void;
    const firstHeartbeat = new Promise<Response>((resolve) => {
      resolveFirstHeartbeat = resolve;
    });
    const fetcher = jest
      .fn<typeof fetch>()
      .mockReturnValueOnce(firstHeartbeat)
      .mockRejectedValueOnce(new TypeError('network down'));
    const now = jest.fn<() => number>().mockReturnValueOnce(1_000).mockReturnValueOnce(2_000).mockReturnValueOnce(2_030);

    renderWithProviders(<NetworkStatus endpoint="https://rpc.example" fetcher={fetcher} now={now} />);

    await act(async () => {
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });

    await waitFor(() => expect(screen.getByText('Offline')).toBeTruthy());

    await act(async () => {
      resolveFirstHeartbeat({
        ok: true,
        status: 200,
        json: async () => ({ result: { status: 'healthy' } }),
      } as Response);
    });

    expect(screen.getByText('Offline')).toBeTruthy();
    expect(screen.queryByText('Healthy')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      'Stellar RPC getHealth request failed',
      expect.objectContaining({ endpoint: 'https://rpc.example', error: expect.any(TypeError) })
    );
  });
});
