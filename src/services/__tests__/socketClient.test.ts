import type { Socket } from 'socket.io-client';
import {
  connectSocket,
  disconnectSocket,
  getSocketStatus,
  onSocketEvent,
  onSocketStatus,
  onSocketError,
  resetSocketClientForTests,
  emitSocketEvent,
  getSocket,
} from '@/services/socketClient';

type MockedSocket = jest.Mocked<Pick<Socket, 'on' | 'off' | 'emit' | 'disconnect' | 'connect' | 'removeAllListeners'>> & {
  onAny: jest.Mock;
  connected: boolean;
  auth: Record<string, unknown>;
};

function getMockedSocket(): MockedSocket {
  return getSocket() as unknown as MockedSocket;
}

jest.mock('socket.io-client', () => {
  const mockSocket: MockedSocket = {
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

const { io } = jest.requireMock('socket.io-client') as {
  io: jest.Mock;
};

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

describe('socketClient', () => {
  it('connects with URL from env var', () => {
    connectSocket();
    expect(io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({ autoConnect: true }),
    );
  });

  it('connects with a custom URL', () => {
    connectSocket('ws://custom:8080');
    expect(io).toHaveBeenCalledWith(
      'ws://custom:8080',
      expect.objectContaining({ autoConnect: true }),
    );
  });

  it('passes auth token when provided', () => {
    connectSocket(undefined, 'test-token');
    expect(io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({ auth: { token: 'test-token' } }),
    );
  });

  it('throws when no URL is configured', () => {
    process.env.NEXT_PUBLIC_SOCKET_IO_URL = '';
    expect(() => connectSocket()).toThrow('Socket.IO URL not configured');
  });

  it('returns connection status', () => {
    expect(getSocketStatus()).toBe('disconnected');
    connectSocket();
    expect(getSocketStatus()).toBe('connecting');
  });

  it('notifies status listeners', () => {
    const listener = jest.fn();
    const unsub = onSocketStatus(listener);

    connectSocket();

    const mockSocket = getMockedSocket();
    const onCalls = (mockSocket.on as jest.Mock).mock.calls;
    const connectHandler = onCalls.find(
      ([event]: [string]) => event === 'connect',
    )?.[1];

    if (connectHandler) {
      connectHandler();
    }

    expect(listener).toHaveBeenCalledWith('connected');
    unsub();
  });

  it('notifies event listeners on any event', () => {
    const listener = jest.fn();
    const unsub = onSocketEvent(listener);

    connectSocket();
    const mockSocket = getMockedSocket();
    const onAnyCalls = (mockSocket.onAny as jest.Mock).mock.calls;
    const onAnyHandler = onAnyCalls[0]?.[0];

    if (onAnyHandler) {
      onAnyHandler('pr:update', { id: 42 });
    }

    expect(listener).toHaveBeenCalledWith({
      event: 'pr:update',
      data: { id: 42 },
    });
    unsub();
  });

  it('notifies error listeners on connect_error', () => {
    const listener = jest.fn();
    const unsub = onSocketError(listener);

    connectSocket();
    const mockSocket = getMockedSocket();
    const onCalls = (mockSocket.on as jest.Mock).mock.calls;
    const errorHandler = onCalls.find(
      ([event]: [string]) => event === 'connect_error',
    )?.[1];

    if (errorHandler) {
      errorHandler(new Error('connection refused'));
    }

    expect(listener).toHaveBeenCalledWith('connection refused');
    unsub();
  });

  it('emits events', () => {
    connectSocket();
    const mockSocket = getMockedSocket();
    emitSocketEvent('test:event', { foo: 'bar' });
    expect(mockSocket.emit as jest.Mock).toHaveBeenCalledWith('test:event', { foo: 'bar' });
  });

  it('disconnects and resets', () => {
    connectSocket();
    disconnectSocket();
    expect(getSocketStatus()).toBe('disconnected');
    expect(getSocket()).toBeNull();
  });

  it('reset cleans all listeners', () => {
    const statusListener = jest.fn();
    const eventListener = jest.fn();
    const errorListener = jest.fn();

    onSocketStatus(statusListener);
    onSocketEvent(eventListener);
    onSocketError(errorListener);

    resetSocketClientForTests();

    // After reset, previously registered listeners are cleared
    // Connect to trigger status change
    connectSocket();
    expect(statusListener).not.toHaveBeenCalled();
    expect(eventListener).not.toHaveBeenCalled();
    expect(errorListener).not.toHaveBeenCalled();
  });
});
