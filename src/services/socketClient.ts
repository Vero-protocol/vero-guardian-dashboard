'use client';

import { io, type Socket } from 'socket.io-client';

export type SocketConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SocketStateEvent {
  event: string;
  data: unknown;
}

type StatusListener = (status: SocketConnectionStatus) => void;
type EventListener = (event: SocketStateEvent) => void;
type ErrorListener = (error: string) => void;

const eventListeners = new Set<EventListener>();
const statusListeners = new Set<StatusListener>();
const errorListeners = new Set<ErrorListener>();

let socket: Socket | null = null;
let connectionStatus: SocketConnectionStatus = 'disconnected';
let activeUrl = '';
let authToken: string | undefined;

function notifyStatus(status: SocketConnectionStatus): void {
  connectionStatus = status;
  statusListeners.forEach((listener) => {
    try {
      listener(status);
    } catch {
      /* isolate listener errors */
    }
  });
}

function notifyEvent(event: SocketStateEvent): void {
  eventListeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* isolate listener errors */
    }
  });
}

function notifyError(error: string): void {
  errorListeners.forEach((listener) => {
    try {
      listener(error);
    } catch {
      /* isolate listener errors */
    }
  });
}

function getDefaultUrl(): string {
  const url = process.env.NEXT_PUBLIC_SOCKET_IO_URL;
  if (!url) {
    throw new Error(
      'Socket.IO URL not configured. Set NEXT_PUBLIC_SOCKET_IO_URL env var.',
    );
  }
  return url;
}

export function connectSocket(url?: string, token?: string): void {
  const targetUrl = url?.trim() || getDefaultUrl();
  authToken = token;

  if (socket && activeUrl === targetUrl && socket.connected) {
    return;
  }

  disconnectSocket();
  activeUrl = targetUrl;
  notifyStatus('connecting');

  socket = io(targetUrl, {
    auth: token ? { token } : undefined,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => notifyStatus('connected'));
  socket.on('disconnect', () => notifyStatus('disconnected'));
  socket.on('connect_error', (err) => {
    notifyError(err.message);
    notifyStatus('error');
  });

  socket.on('reconnect_attempt', () => notifyStatus('connecting'));
  socket.on('reconnect', () => notifyStatus('connected'));

  socket.onAny((event, ...args) => {
    const data = args.length === 1 ? args[0] : args;
    notifyEvent({ event, data });
  });
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  activeUrl = '';
  notifyStatus('disconnected');
}

export function updateAuthToken(token: string): void {
  authToken = token;
  if (socket) {
    socket.auth = { token };
    if (socket.connected) {
      socket.disconnect();
      socket.connect();
    }
  }
}

export function subscribeSocketEvents(
  eventName: string,
  handler: (data: unknown) => void,
): () => void {
  if (!socket) {
    return () => {};
  }
  socket.on(eventName, handler);
  return () => {
    socket?.off(eventName, handler);
  };
}

export function onSocketEvent(listener: EventListener): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

export function onSocketStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function onSocketError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

export function getSocketStatus(): SocketConnectionStatus {
  return connectionStatus;
}

export function getSocket(): Socket | null {
  return socket;
}

export function emitSocketEvent(event: string, ...args: unknown[]): void {
  socket?.emit(event, ...args);
}

export function resetSocketClientForTests(): void {
  eventListeners.clear();
  statusListeners.clear();
  errorListeners.clear();
  disconnectSocket();
  connectionStatus = 'disconnected';
  activeUrl = '';
  authToken = undefined;
}
