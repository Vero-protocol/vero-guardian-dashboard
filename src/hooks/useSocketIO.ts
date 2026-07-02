'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  connectSocket,
  disconnectSocket,
  onSocketEvent,
  onSocketStatus,
  getSocketStatus,
  updateAuthToken,
  type SocketConnectionStatus,
  type SocketStateEvent,
} from '@/services/socketClient';
import { invalidateChainState } from '@/hooks/useChainState';
import { useEvents } from '@/hooks/useEvents';

export type SocketIOEventName =
  | 'pr:update'
  | 'pr:created'
  | 'vote:cast'
  | 'transaction:new'
  | 'reputation:change'
  | 'role:change'
  | 'alert:new'
  | 'network:status'
  | 'contract:event'
  | string;

export interface UseSocketIOOptions {
  url?: string;
  autoConnect?: boolean;
  authToken?: string;
  subscribeEvents?: SocketIOEventName[];
  invalidateOnEvent?: boolean;
}

export interface UseSocketIOResult {
  status: SocketConnectionStatus;
  isConnected: boolean;
  lastEvent: SocketStateEvent | null;
  connect: (authToken?: string) => void;
  disconnect: () => void;
  updateToken: (token: string) => void;
}

export function useSocketIO(options: UseSocketIOOptions = {}): UseSocketIOResult {
  const {
    url,
    autoConnect = true,
    authToken,
    invalidateOnEvent = true,
  } = options;

  const [status, setStatus] = useState<SocketConnectionStatus>(getSocketStatus);
  const [lastEvent, setLastEvent] = useState<SocketStateEvent | null>(null);
  const { emit } = useEvents({ maxEvents: 200 });
  const connectedRef = useRef(false);

  useEffect(() => {
    const unsubStatus = onSocketStatus((newStatus) => {
      setStatus(newStatus);
      connectedRef.current = newStatus === 'connected';
    });

    const unsubEvent = onSocketEvent((event) => {
      setLastEvent(event);

      if (invalidateOnEvent) {
        const cacheKeys = resolveCacheKeys(event.event, event.data);
        if (cacheKeys.length > 0) {
          invalidateChainState(cacheKeys, 'websocket');
        }
      }

      emit({
        type: mapEventToProtocolType(event.event),
        resource: 'socket.io',
        resourceId: event.event,
        metadata: {
          eventName: event.event,
          timestamp: Date.now(),
        },
      });
    });

    return () => {
      unsubStatus();
      unsubEvent();
    };
  }, [emit, invalidateOnEvent]);

  useEffect(() => {
    if (!autoConnect) return;

    try {
      connectSocket(url, authToken);
    } catch {
      setStatus('error');
    }

    return () => {
      disconnectSocket();
    };
  }, [autoConnect, url, authToken]);

  const connect = useCallback((token?: string) => {
    try {
      connectSocket(url, token);
    } catch {
      setStatus('error');
    }
  }, [url]);

  const disconnect = useCallback(() => {
    disconnectSocket();
  }, []);

  const updateToken = useCallback((token: string) => {
    updateAuthToken(token);
  }, []);

  return {
    status,
    isConnected: status === 'connected',
    lastEvent,
    connect,
    disconnect,
    updateToken,
  };
}

function resolveCacheKeys(eventName: string, _data: unknown): string[] {
  void _data;
  switch (eventName) {
    case 'pr:update':
    case 'pr:created':
      return ['prs', 'dashboard'];
    case 'vote:cast':
      return ['prs', 'votes', 'reputation', 'dashboard'];
    case 'transaction:new':
      return ['transactions', 'dashboard'];
    case 'reputation:change':
      return ['reputation', 'dashboard'];
    case 'role:change':
      return ['role', 'dashboard'];
    case 'alert:new':
      return ['alerts', 'dashboard'];
    case 'network:status':
      return ['network', 'dashboard'];
    case 'contract:event':
      return ['dashboard'];
    default:
      if (eventName.startsWith('pr:')) return ['prs', 'dashboard'];
      if (eventName.startsWith('vote:')) return ['prs', 'votes', 'dashboard'];
      if (eventName.startsWith('account:')) return [`account:${eventName.slice(8)}`, 'dashboard'];
      return ['dashboard'];
  }
}

function mapEventToProtocolType(eventName: string): string {
  if (eventName.startsWith('pr:')) return 'task_registered';
  if (eventName.startsWith('vote:')) return 'vote';
  if (eventName.startsWith('reputation:')) return 'reputation_change';
  if (eventName.startsWith('transaction:')) return 'transaction';
  return eventName;
}
