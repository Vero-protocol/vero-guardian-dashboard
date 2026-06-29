/**
 * Search Index Management
 * Builds and maintains an efficient index of contracts and functions
 */

import type { ContractMetadata, SearchIndex, SearchOptions, RankedSearchResult, SearchResult } from './StateStateStateStateStatetypes';
import { multiFieldFuzzyMatch, tokenize, normalizeText } from './StateStateStateStateStatefuzzySearch';

/**
 * Creates an empty search index
 */
export function createEmptyIndex(): SearchIndex {
  return {
    version: 1,
    generatedAt: Date.now(),
    contracts: [],
    tokenMap: new Map(),
  };
}

/**
 * Builds a token map for quick lookup (maps tokens to contract/function IDs)
 */
export function buildTokenMap(contracts: ContractMetadata[]): Map<string, Set<string>> {
  const tokenMap = new Map<string, Set<string>>();

  for (const contract of contracts) {
    const contractTokens = new Set<string>();

    // Contract-level tokens
    const contractTexts = [
      contract.name,
      contract.description,
      contract.type,
      ...contract.tags,
    ];

    for (const text of contractTexts) {
      for (const token of tokenize(text)) {
        contractTokens.add(token);
        if (!tokenMap.has(token)) {
          tokenMap.set(token, new Set());
        }
        tokenMap.get(token)!.add(`contract:${contract.id}`);
      }
    }

    // Function-level tokens
    for (const func of contract.functions) {
      const funcTokens = new Set<string>();
      const funcTexts = [
        func.name,
        func.description,
        ...func.tags,
        ...(func.params || []),
        func.returns || '',
      ];

      for (const text of funcTexts) {
        for (const token of tokenize(text)) {
          funcTokens.add(token);
          if (!tokenMap.has(token)) {
            tokenMap.set(token, new Set());
          }
          tokenMap.get(token)!.add(`function:${contract.id}:${func.id}`);
        }
      }
    }
  }

  return tokenMap;
}

/**
 * Builds a complete search index from contracts
 */
export function buildIndex(contracts: ContractMetadata[]): SearchIndex {
  return {
    version: 1,
    generatedAt: Date.now(),
    contracts,
    tokenMap: buildTokenMap(contracts),
  };
}

/**
 * Searches contracts and functions using the index
 */
export function searchIndex(
  query: string,
  index: SearchIndex,
  options: SearchOptions = {},
): RankedSearchResult[] {
  if (!query.trim()) {
    return [];
  }

  const {
    maxResults = 10,
    minScore = 20,
    searchFields = ['name', 'description', 'tags'],
    typeFilter = undefined,
  } = options;

  const results: SearchResult[] = [];
  const normalizedQuery = normalizeText(query);

  // Filter contracts by type if specified
  const contracts = typeFilter
    ? index.contracts.filter((c) => typeFilter.includes(c.type))
    : index.contracts;

  // Search contracts
  for (const contract of contracts) {
    const contractFields: Record<string, string> = {
      name: contract.name,
      label: contract.name,
      description: contract.description,
      tags: contract.tags.join(' '),
    };

    const contractScore = multiFieldFuzzyMatch(normalizedQuery, contractFields);

    if (contractScore >= minScore) {
      results.push({
        contract,
        score: contractScore,
        matchType: 'contract',
        highlightedText: contract.name,
      });
    }

    // Search functions within this contract
    for (const func of contract.functions) {
      const funcFields: Record<string, string> = {
        name: func.name,
        label: func.name,
        description: func.description,
        tags: func.tags.join(' '),
      };

      const funcScore = multiFieldFuzzyMatch(normalizedQuery, funcFields);

      if (funcScore >= minScore) {
        results.push({
          contract,
          function: func,
          score: funcScore,
          matchType: 'function',
          highlightedText: func.name,
        });
      }
    }
  }

  // Sort by score and limit results
  const rankedResults = results
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Secondary sort: functions first, then by name
      if ((a.function ? 1 : 0) !== (b.function ? 1 : 0)) {
        return (b.function ? 1 : 0) - (a.function ? 1 : 0);
      }
      return a.highlightedText.localeCompare(b.highlightedText);
    })
    .slice(0, maxResults)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }));

  return rankedResults;
}

/**
 * Gets quick suggestions from tokens (O(1) lookup)
 */
export function getTokenSuggestions(query: string, index: SearchIndex, limit = 5): RankedSearchResult[] {
  if (!query.trim()) {
    return index.contracts
      .slice(0, limit)
      .map((contract, idx) => ({
        contract,
        score: 0,
        matchType: 'contract' as const,
        highlightedText: contract.name,
        rank: idx + 1,
      }));
  }

  const tokens = tokenize(query);
  const exactMatches = new Map<string, number>();
  const partialMatches = new Map<string, number>();

  for (const token of tokens) {
    // Check token map for exact matches
    const matchIds = index.tokenMap.get(token);
    if (matchIds) {
      for (const id of matchIds) {
        const current = exactMatches.get(id) || 0;
        exactMatches.set(id, current + 1);
      }
    }

    // Check token map for partial matches
    for (const [mapToken, ids] of index.tokenMap.entries()) {
      if (mapToken.includes(token) || token.includes(mapToken)) {
        for (const id of ids) {
          const current = partialMatches.get(id) || 0;
          partialMatches.set(id, current + 0.5);
        }
      }
    }
  }

  const results: RankedSearchResult[] = [];

  // Process exact matches
  for (const [id, score] of exactMatches.entries()) {
    const result = parseIndexId(id, index);
    if (result) {
      results.push({
        ...result,
        score: 50 + score * 10,
        rank: 0,
      });
    }
  }

  // Process partial matches (if not already exact match)
  for (const [id, score] of partialMatches.entries()) {
    if (!exactMatches.has(id)) {
      const result = parseIndexId(id, index);
      if (result) {
        results.push({
          ...result,
          score: 20 + score * 5,
          rank: 0,
        });
      }
    }
  }

  // Sort and rank
  return results
    .sort((a, b) => b.score - a.score || a.highlightedText.localeCompare(b.highlightedText))
    .slice(0, limit)
    .map((result, idx) => ({
      ...result,
      rank: idx + 1,
    }));
}

/**
 * Parses an index ID (format: "contract:id" or "function:contractId:functionId")
 */
function parseIndexId(id: string, index: SearchIndex): SearchResult | null {
  const [type, ...parts] = id.split(':');

  if (type === 'contract') {
    const contract = index.contracts.find((c) => c.id === parts[0]);
    return contract
      ? {
          contract,
          score: 0,
          matchType: 'contract',
          highlightedText: contract.name,
        }
      : null;
  }

  if (type === 'function') {
    const [contractId, funcId] = parts;
    const contract = index.contracts.find((c) => c.id === contractId);
    if (!contract) return null;

    const func = contract.functions.find((f) => f.id === funcId);
    return func
      ? {
          contract,
          function: func,
          score: 0,
          matchType: 'function',
          highlightedText: func.name,
        }
      : null;
  }

  return null;
}

/**
 * Gets contracts by type
 */
export function getContractsByType(type: string, index: SearchIndex): ContractMetadata[] {
  return index.contracts.filter((c) => c.type === type);
}

/**
 * Gets all unique contract types in the index
 */
export function getContractTypes(index: SearchIndex): string[] {
  const types = new Set(index.contracts.map((c) => c.type));
  return Array.from(types).sort();
}

/**
 * Validates and updates index (checks for duplicates, validates structure)
 */
export function validateIndex(index: SearchIndex): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const contract of index.contracts) {
    if (seenIds.has(contract.id)) {
      errors.push(`Duplicate contract ID: ${contract.id}`);
    }
    seenIds.add(contract.id);

    if (!contract.id || !contract.name || !contract.address) {
      errors.push(`Contract missing required fields: ${contract.id || 'unknown'}`);
    }

    const seenFunctionIds = new Set<string>();
    for (const func of contract.functions) {
      if (seenFunctionIds.has(func.id)) {
        errors.push(`Duplicate function ID in ${contract.id}: ${func.id}`);
      }
      seenFunctionIds.add(func.id);

      if (!func.id || !func.name) {
        errors.push(`Function missing required fields in ${contract.id}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
