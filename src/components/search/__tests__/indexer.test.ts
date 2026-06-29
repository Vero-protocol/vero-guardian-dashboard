/**
 * Indexer Tests
 */

import {
  createEmptyIndex,
  buildIndex,
  buildTokenMap,
  searchIndex,
  getContractsByType,
  getContractTypes,
  validateIndex,
} from '../StateStateStateStateStateStateStateStateStateStateindexer';
import type { ContractMetadata } from '../StateStateStateStateStateStateStateStateStateStatetypes';

describe('Search Indexer', () => {
  const mockContracts: ContractMetadata[] = [
    {
      id: 'contract-1',
      address: 'CA123456',
      name: 'Task Registry',
      description: 'Tracks GitHub PRs as smart contract data entries',
      type: 'task',
      tags: ['registry', 'task', 'github'],
      functions: [
        {
          id: 'register-task',
          name: 'registerTask',
          description: 'Registers a new task',
          tags: ['write', 'task'],
        },
        {
          id: 'get-task',
          name: 'getTask',
          description: 'Retrieves task details',
          tags: ['read', 'query'],
        },
      ],
    },
    {
      id: 'contract-2',
      address: 'CA234567',
      name: 'Vote Ledger',
      description: 'Stores guardian approval signals',
      type: 'vote',
      tags: ['vote', 'governance', 'approval'],
      functions: [
        {
          id: 'cast-vote',
          name: 'castVote',
          description: 'Cast a vote on a proposal',
          tags: ['write', 'vote'],
        },
      ],
    },
  ];

  describe('createEmptyIndex', () => {
    it('should create empty index', () => {
      const index = createEmptyIndex();
      expect(index.contracts).toEqual([]);
      expect(index.tokenMap).toEqual(new Map());
      expect(index.version).toBe(1);
    });
  });

  describe('buildTokenMap', () => {
    it('should build token map from contracts', () => {
      const tokenMap = buildTokenMap(mockContracts);
      expect(tokenMap.size).toBeGreaterThan(0);
    });

    it('should include contract tokens', () => {
      const tokenMap = buildTokenMap(mockContracts);
      expect(tokenMap.has('task')).toBe(true);
      expect(tokenMap.has('registry')).toBe(true);
    });

    it('should include function tokens', () => {
      const tokenMap = buildTokenMap(mockContracts);
      expect(tokenMap.has('registertask')).toBe(true);
    });

    it('should map tokens to contract/function IDs', () => {
      const tokenMap = buildTokenMap(mockContracts);
      const taskMatches = tokenMap.get('task');
      expect(taskMatches).toBeDefined();
      expect(taskMatches!.size).toBeGreaterThan(0);
    });
  });

  describe('buildIndex', () => {
    it('should build complete index', () => {
      const index = buildIndex(mockContracts);
      expect(index.contracts).toEqual(mockContracts);
      expect(index.tokenMap.size).toBeGreaterThan(0);
      expect(index.generatedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('searchIndex', () => {
    const index = buildIndex(mockContracts);

    it('should return empty results for empty query', () => {
      const results = searchIndex('', index);
      expect(results).toEqual([]);
    });

    it('should find contracts by name', () => {
      const results = searchIndex('task registry', index);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].contract.name).toBe('Task Registry');
    });

    it('should find contracts by type', () => {
      const results = searchIndex('vote', index);
      expect(results.some((r) => r.contract.type === 'vote')).toBe(true);
    });

    it('should find functions', () => {
      const results = searchIndex('register', index);
      expect(results.some((r) => r.function?.name === 'registerTask')).toBe(true);
    });

    it('should filter by type', () => {
      const results = searchIndex('task', index, { typeFilter: ['task'] });
      expect(results.every((r) => r.contract.type === 'task')).toBe(true);
    });

    it('should respect minScore', () => {
      const highScoreResults = searchIndex('task', index, { minScore: 80 });
      expect(highScoreResults.every((r) => r.score >= 80)).toBe(true);
    });

    it('should limit results', () => {
      const results = searchIndex('task', index, { maxResults: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should rank results by score', () => {
      const results = searchIndex('task', index);
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });
  });

  describe('getContractsByType', () => {
    const index = buildIndex(mockContracts);

    it('should get contracts by type', () => {
      const taskContracts = getContractsByType('task', index);
      expect(taskContracts.every((c) => c.type === 'task')).toBe(true);
    });

    it('should return empty array for unknown type', () => {
      const results = getContractsByType('unknown', index);
      expect(results).toEqual([]);
    });
  });

  describe('getContractTypes', () => {
    const index = buildIndex(mockContracts);

    it('should get all contract types', () => {
      const types = getContractTypes(index);
      expect(types).toContain('task');
      expect(types).toContain('vote');
    });

    it('should return sorted types', () => {
      const types = getContractTypes(index);
      expect(types).toEqual([...types].sort());
    });
  });

  describe('validateIndex', () => {
    it('should validate valid index', () => {
      const index = buildIndex(mockContracts);
      const validation = validateIndex(index);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('should detect missing fields', () => {
      const invalidContracts: ContractMetadata[] = [
        {
          ...mockContracts[0],
          id: '', // missing id
        },
      ];
      const index = buildIndex(invalidContracts);
      const validation = validateIndex(index);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should detect duplicate contract IDs', () => {
      const duplicateContracts = [...mockContracts, mockContracts[0]];
      const index = buildIndex(duplicateContracts);
      const validation = validateIndex(index);
      expect(validation.valid).toBe(false);
    });

    it('should detect duplicate function IDs', () => {
      const invalidContract: ContractMetadata = {
        ...mockContracts[0],
        id: 'test',
        functions: [
          mockContracts[0].functions[0],
          mockContracts[0].functions[0], // duplicate
        ],
      };
      const index = buildIndex([invalidContract]);
      const validation = validateIndex(index);
      expect(validation.valid).toBe(false);
    });
  });
});
