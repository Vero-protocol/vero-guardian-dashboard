import { renderHook, act } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { useSocketIO } from '@/hooks/useSocketIO';
import {
  getSocket,
  resetSocketClientForTests,
} from '@/services/socketClient';

type MockedSocketKeys = 'on' | 'off' | 'emit' | 'disconnect' | 'connect' | 'removeAllListeners' | 'onAny';
type MockSocket = Pick<jest.Mocked<Socket>, MockedSocketKeys> & {
  onAny: jest.Mock;
  connected: boolean;
  auth: Record<string, unknown>;
};

function getMockedSocket(): MockSocket {
  return getSocket() as unknown as MockSocket;
}

jest.mock('socket.io-client', () => {
  const mockSocket: MockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    connect: jest.fn(),
    removeAllListeners: jest.fn(),
    connected: false,
    auth: {},
    onAny: jest.fn(),
  };

  return {
    io: jest.fn(() => mockSocket),
  };
});

const mockUseEvents = jest.fn().mockReturnValue({
  emit: jest.fn(),
  timeline: [],
  clear: jest.fn(),
});

jest.mock('@/hooks/useEvents', () => ({
  useEvents: (opts?: { maxEvents?: number }) => mockUseEvents(opts),
}));

const mockInvalidateChainState = jest.fn();
jest.mock('@/hooks/useChainState', () => ({
  invalidateChainState: (...args: unknown[]) => mockInvalidateChainState(...args),
}));

const OLD_ENV = process.env;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV };
  process.env.NEXT_PUBLIC_SOCKET_IO_URL = 'http://localhost:3001';
});

afterEach(() => {
  process.env = OLD_ENV;
  resetSocketClientForTests();
  jest.clearAllMocks();
});

describe('useSocketIO', () => {
  it('returns initial disconnected status', () => {
    const { result } = renderHook(() => useSocketIO({ autoConnect: false }));
    expect(result.current.status).toBe('disconnected');
    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastEvent).toBeNull();
  });

  it('connects on autoConnect by default', () => {
    renderHook(() => useSocketIO());
    expect(getSocket()).not.toBeNull();
  });

  it('respects autoConnect=false', () => {
    renderHook(() => useSocketIO({ autoConnect: false }));
    expect(getSocket()).toBeNull();
  });

  it('connect function triggers connection', () => {
    const { result } = renderHook(() => useSocketIO({ autoConnect: false }));
    act(() => {
      result.current.connect();
    });
    expect(getSocket()).not.toBeNull();
  });

  it('disconnect function disconnects', () => {
    const { result } = renderHook(() => useSocketIO({ autoConnect: true }));
    act(() => {
      result.current.disconnect();
    });
    expect(getSocket()).toBeNull();
  });

  it('receives lastEvent when Socket.IO event fires', () => {
    const { result } = renderHook(() =>
      useSocketIO({ autoConnect: true, invalidateOnEvent: false }),
    );

    const socket = getMockedSocket();
    const onAnyCalls = (socket.onAny as jest.Mock).mock.calls;
    const onAnyHandler = onAnyCalls[0]?.[0];

    act(() => {
      if (onAnyHandler) {
        onAnyHandler('vote:cast', { prId: 42 });
      }
    });

    expect(result.current.lastEvent).toEqual({
      event: 'vote:cast',
      data: { prId: 42 },
    });
  });

  it('calls invalidateChainState on events', () => {
    renderHook(() => useSocketIO({ autoConnect: true, invalidateOnEvent: true }));

    const socket = getMockedSocket();
    const onAnyCalls = (socket.onAny as jest.Mock).mock.calls;
    const onAnyHandler = onAnyCalls[0]?.[0];

    act(() => {
      if (onAnyHandler) {
        onAnyHandler('pr:update', { id: 42 });
      }
    });

    expect(mockInvalidateChainState).toHaveBeenCalledWith(
      expect.arrayContaining(['prs', 'dashboard']),
      'websocket',
    );
  });

  it('invokes useEvents emit when events arrive', () => {
    const mockEmit = jest.fn();
    mockUseEvents.mockReturnValue({
      emit: mockEmit,
      timeline: [],
      clear: jest.fn(),
    });

    renderHook(() => useSocketIO({ autoConnect: true }));

    const socket = getMockedSocket();
    const onAnyCalls = (socket.onAny as jest.Mock).mock.calls;
    const onAnyHandler = onAnyCalls[0]?.[0];

    act(() => {
      if (onAnyHandler) {
        onAnyHandler('reputation:change', { score: 100 });
      }
    });

    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reputation_change',
        resource: 'socket.io',
      }),
    );
  });

  it('updateToken calls socket client updateAuthToken', () => {
    const { result } = renderHook(() => useSocketIO({ autoConnect: true }));
    const socket = getMockedSocket();
    socket.connected = true;

    act(() => {
      result.current.updateToken('new-token');
    });

    expect(socket.auth).toEqual({ token: 'new-token' });
    expect(socket.disconnect).toHaveBeenCalled();
    expect(socket.connect).toHaveBeenCalled();
  });
});
