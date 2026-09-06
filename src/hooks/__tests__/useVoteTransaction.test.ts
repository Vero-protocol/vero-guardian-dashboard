import { renderHook, act } from '@testing-library/react';
import { useVoteTransaction, type VoteTxState } from '@/hooks/useVoteTransaction';
import { castVote } from '@/services/contractClient';
import { appendAuditEvent } from '@/utils/logger';

jest.mock('@/services/contractClient', () => ({ castVote: jest.fn() }));
jest.mock('@/utils/logger', () => ({ appendAuditEvent: jest.fn(() => Promise.resolve()) }));

const mockCastVote = castVote as jest.MockedFunction<typeof castVote>;

const OPTS = {
  prId: 42,
  publicKey: 'GPUBKEY',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

afterEach(() => jest.clearAllMocks());

describe('useVoteTransaction', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useVoteTransaction(OPTS));
    expect(result.current.state).toEqual({
      status: 'idle',
      txHash: null,
      errorKind: null,
      errorMessage: null,
    });
  });

  it('transitions idle → pending → success on a successful vote', async () => {
    mockCastVote.mockResolvedValue('abc123');
    const { result } = renderHook(() => useVoteTransaction(OPTS));

    let returnedState!: VoteTxState;
    await act(async () => {
      returnedState = await result.current.submit();
    });

    expect(returnedState).toEqual({
      status: 'success',
      txHash: 'abc123',
      errorKind: null,
      errorMessage: null,
    });
    expect(result.current.state).toEqual(returnedState);
    expect(mockCastVote).toHaveBeenCalledWith(
      OPTS.prId,
      OPTS.publicKey,
      OPTS.horizonUrl,
      OPTS.networkPassphrase,
      undefined,
      'approve',
    );
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'vote_submitted', status: 'success' }),
    );
  });

  it('classifies a Horizon failure as network_error', async () => {
    mockCastVote.mockRejectedValue(new Error('Horizon submission failed'));
    const { result } = renderHook(() => useVoteTransaction(OPTS));

    let returnedState!: VoteTxState;
    await act(async () => {
      returnedState = await result.current.submit();
    });

    expect(returnedState.status).toBe('error');
    expect(returnedState.errorKind).toBe('network_error');
    expect(result.current.state).toEqual(returnedState);
    expect(appendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'vote_failed',
        metadata: expect.objectContaining({ errorKind: 'network_error' }),
      }),
    );
  });

  it('classifies a Freighter cancellation as user_rejected', async () => {
    mockCastVote.mockRejectedValue(new Error('User declined access'));
    const { result } = renderHook(() => useVoteTransaction(OPTS));

    let returnedState!: VoteTxState;
    await act(async () => {
      returnedState = await result.current.submit();
    });

    expect(returnedState.status).toBe('error');
    expect(returnedState.errorKind).toBe('user_rejected');
  });

  it('reset() returns state to idle', async () => {
    mockCastVote.mockRejectedValue(new Error('Horizon error'));
    const { result } = renderHook(() => useVoteTransaction(OPTS));

    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.state.status).toBe('error');

    act(() => result.current.reset());
    expect(result.current.state.status).toBe('idle');
  });
});
