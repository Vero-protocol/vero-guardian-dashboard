/**
 * Global On-Chain State Search Module
 * Main entry point for all search functionality
 */

export type {
  ContractFunction,
  ContractMetadata,
  SearchIndex,
  SearchResult,
  RankedSearchResult,
  IndexerOptions,
  SearchOptions,
} from './StateStateStateStateStatetypes';

// Indexer exports
export {
  createEmptyIndex,
  buildIndex,
  buildTokenMap,
  searchIndex,
  getTokenSuggestions,
  getContractsByType,
  getContractTypes,
  validateIndex,
} from './StateStateStateStateStateindexer';

// Fuzzy search exports
export {
  normalizeText,
  tokenize,
  levenshteinDistance,
  tokenSimilarity,
  fuzzyMatchToken,
  fuzzyMatch,
  positionWeightedMatch,
  multiFieldFuzzyMatch,
} from './StateStateStateStateStatefuzzySearch';

// Hook exports
export { useSearchIndex } from './StateStateStateStateStateuseSearchIndex';
export type { UseSearchIndexOptions, UseSearchIndexState } from './StateStateStateStateStateuseSearchIndex';

// Component exports
export { SearchInput } from './StateStateStateStateStateSearchInput';
export type { SearchInputProps } from './StateStateStateStateStateSearchInput';

export { SearchResults } from './StateStateStateStateStateSearchResults';
export type { SearchResultsProps } from './StateStateStateStateStateSearchResults';

export { GlobalSearchPanel } from './StateStateStateStateStateGlobalSearchPanel';
export type { GlobalSearchPanelProps } from './StateStateStateStateStateGlobalSearchPanel';
