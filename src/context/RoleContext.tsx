'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useWallet } from '@/context/WalletContext';
import { useNetwork } from '@/context/NetworkContext';
import { useChainState } from '@/hooks/useChainState';
import { fetchUserRole, type UserRole } from '@/services/roleClient';

interface RoleContextValue {
  role: UserRole;
  isAdmin: boolean;
  isGuardian: boolean;
  canVote: boolean;
  canManageTasks: boolean;
  isLoading: boolean;
  error: string | null;
  refreshRole: () => Promise<void>;
}

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

function getRoleErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to load wallet role';
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { publicKey, isLoading: isWalletLoading } = useWallet();
  const { networkConfig } = useNetwork();
  const [role, setRole] = useState<UserRole>('unauthorized');
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const { syncVersion: roleSyncVersion } = useChainState({
    cacheKeys: publicKey ? [`account:${publicKey}`, `role:${publicKey}`] : ['role'],
  });

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT && process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRY === 'true') {
      console.warn(
        '%c⚠️ SECURITY RISK: NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT is unconfigured and self-registry is enabled! Any wallet can grant themselves admin privileges.',
        'color: red; font-size: 14px; font-weight: bold;'
      );
    }
  }, []);

  const refreshRole = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!publicKey) {
      setRole('unauthorized');
      setError(null);
      setIsRoleLoading(false);
      return;
    }

    setIsRoleLoading(true);
    setError(null);

    try {
      const nextRole = await fetchUserRole(publicKey, networkConfig.horizonUrl);
      if (requestIdRef.current !== requestId) {
        return;
      }

      setRole(nextRole);
    } catch (roleError) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setRole('unauthorized');
      setError(getRoleErrorMessage(roleError));
    } finally {
      if (requestIdRef.current === requestId) {
        setIsRoleLoading(false);
      }
    }
  }, [publicKey, networkConfig.horizonUrl]);

  useEffect(() => {
    void refreshRole();

    return () => {
      requestIdRef.current += 1;
    };
  }, [refreshRole, roleSyncVersion]);

  const value = useMemo<RoleContextValue>(() => {
    const isAdmin = role === 'admin';
    const isGuardian = role === 'guardian';

    return {
      role,
      isAdmin,
      isGuardian,
      canVote: isAdmin || isGuardian,
      canManageTasks: isAdmin,
      isLoading: isWalletLoading || isRoleLoading,
      error,
      refreshRole,
    };
  }, [error, isRoleLoading, isWalletLoading, refreshRole, role]);

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}
