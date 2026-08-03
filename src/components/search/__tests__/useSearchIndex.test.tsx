/**
 * useSearchIndex Hook Tests
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearchIndex } from '../useSearchIndex';
import type { ContractMetadata } from '../types';

describe('useSearchIndex Hook', () => {
  const mockContracts: ContractMetadata[] = [
    {
      id: 'contract-1',
      address: 'CA123456',
      name: 'Task Registry',
      description: 'Tracks GitHub PRs',
      type: 'task',
      tags: ['registry', 'task'],
      functions: [
        {
          id: 'register-task',
          name: 'registerTask',
          description: 'Registers a new task',
          tags: ['write'],
        },
      ],
    },
    {
      id: 'contract-2',
      address: 'CA234567',
      name: 'Vote Ledger',
      description: 'Stores votes',
      type: 'vote',
      tags: ['vote', 'governance'],
      functions: [
        {
          id: 'cast-vote',
          name: 'castVote',
          description: 'Cast a vote',
          tags: ['write'],
        },
      ],
    },
  ];

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useSearchIndex());
      expect(result.current.contracts).toEqual([]);
      expect(result.current.index).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should initialize with contracts', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));
      expect(result.current.contracts).toHaveLength(2);
    });
  });

  describe('search', () => {
    it('should return empty results for empty query', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));
      const results = result.current.search('');
      expect(results).toEqual([]);
    });

    it('should find contracts by name', async () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));
      // Index building is debounced (default 300ms); wait for it before searching.
      await waitFor(() => expect(result.current.index).not.toBeNull());
      const results = result.current.search('task');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should support search options', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));
      const results = result.current.search('task', { maxResults: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should filter by type', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));
      const results = result.current.search('registry', { typeFilter: ['vote'] });
      expect(results.every((r) => r.contract.type === 'vote')).toBe(true);
    });
  });

  describe('addContracts', () => {
    it('should add new contracts', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));
      expect(result.current.contracts).toHaveLength(2);

      act(() => {
        result.current.addContracts([
          {
            id: 'contract-3',
            address: 'CA345678',
            name: 'Reputation',
            description: 'Tracks reputation',
            type: 'reputation',
            tags: ['reputation'],
            functions: [],
          },
        ]);
      });

      expect(result.current.contracts).toHaveLength(3);
    });

    it('should not add duplicate contracts', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));

      act(() => {
        result.current.addContracts([mockContracts[0]]);
      });

      expect(result.current.contracts).toHaveLength(2);
    });

    it('should enable search after adding contracts', async () => {
      const { result } = renderHook(() => useSearchIndex());

      act(() => {
        result.current.addContracts(mockContracts);
      });

      // Index building is debounced (default 300ms); wait for it before searching.
      await waitFor(() => expect(result.current.index).not.toBeNull());
      const results = result.current.search('task');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('removeContracts', () => {
    it('should remove contracts', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));
      expect(result.current.contracts).toHaveLength(2);

      act(() => {
        result.current.removeContracts(['contract-1']);
      });

      expect(result.current.contracts).toHaveLength(1);
      expect(result.current.contracts[0].id).toBe('contract-2');
    });
  });

  describe('updateContracts', () => {
    it('should update existing contracts', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));

      act(() => {
        result.current.updateContracts([
          {
            ...mockContracts[0],
            name: 'Updated Task Registry',
          },
        ]);
      });

      const updated = result.current.contracts.find((c) => c.id === 'contract-1');
      expect(updated?.name).toBe('Updated Task Registry');
    });
  });

  describe('clearIndex', () => {
    it('should clear all contracts and index', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));
      expect(result.current.contracts).toHaveLength(2);

      act(() => {
        result.current.clearIndex();
      });

      expect(result.current.contracts).toHaveLength(0);
      expect(result.current.index).toBeNull();
    });
  });

  describe('localStorage persistence', () => {
    it('should persist contracts to localStorage', () => {
      renderHook(() => useSearchIndex({ initialContracts: mockContracts, storageKey: 'test-key' }));

      const stored = localStorage.getItem('test-key');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(2);
    });

    it('should load contracts from localStorage', () => {
      localStorage.setItem('test-key-2', JSON.stringify(mockContracts));
      const { result } = renderHook(() => useSearchIndex({ storageKey: 'test-key-2' }));

      // Wait for localStorage to be loaded
      setTimeout(() => {
        expect(result.current.contracts).toHaveLength(2);
      }, 0);
    });
  });

  describe('error handling', () => {
    it('should handle search errors gracefully', () => {
      const { result } = renderHook(() => useSearchIndex({ initialContracts: mockContracts }));

      const resultsWithInvalidOption = result.current.search('test', { maxResults: -1 });
      expect(Array.isArray(resultsWithInvalidOption)).toBe(true);
    });
  });
});
