/**
 * Fuzzy Search Implementation
 * Provides token-based fuzzy matching for on-chain state search
 */

/**
 * Normalizes search text by lowercasing and handling separators
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes normalized text into searchable tokens
 */
export function tokenize(text: string): string[] {
  return normalizeText(text).split(' ').filter(Boolean);
}

/**
 * Levenshtein distance algorithm for fuzzy matching
 * Returns distance between two strings (0 = exact match)
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculates similarity score between two tokens (0-100)
 * Higher score = better match
 */
export function tokenSimilarity(needle: string, haystack: string): number {
  if (!needle) return 0;

  // Exact match
  if (needle === haystack) return 100;

  // Starts with needle
  if (haystack.startsWith(needle)) return 85;

  // Contains needle as substring
  if (haystack.includes(needle)) return 70;

  // Fuzzy match using subsequence
  let haystackIdx = 0;
  let matched = 0;

  for (const char of needle) {
    haystackIdx = haystack.indexOf(char, haystackIdx);
    if (haystackIdx === -1) return 0;
    matched += 1;
    haystackIdx += 1;
  }

  // Calculate fuzzy score based on character distance
  const distance = haystackIdx - matched;
  const matchRatio = matched / needle.length;
  const fuzzyScore = Math.max(20, Math.min(60, matchRatio * 100 - distance * 2));

  return fuzzyScore;
}

/**
 * Fuzzy match a query token against haystack tokens
 * Returns the best score found
 */
export function fuzzyMatchToken(queryToken: string, haystackTokens: string[]): number {
  if (!queryToken || haystackTokens.length === 0) return 0;

  return Math.max(...haystackTokens.map((token) => tokenSimilarity(queryToken, token)));
}

/**
 * Fuzzy match entire query against haystack
 * Combines scores from all query tokens
 */
export function fuzzyMatch(query: string, haystack: string): number {
  const queryTokens = tokenize(query);
  const haystackTokens = tokenize(haystack);

  if (queryTokens.length === 0 || haystackTokens.length === 0) return 0;

  // Sum scores for each query token
  const totalScore = queryTokens.reduce((sum, queryToken) => {
    const tokenScore = fuzzyMatchToken(queryToken, haystackTokens);
    return sum + tokenScore;
  }, 0);

  // Average score across query tokens
  return totalScore / queryTokens.length;
}

/**
 * Position-weighted fuzzy match - gives higher scores to matches at the beginning
 */
export function positionWeightedMatch(query: string, haystack: string): number {
  const baseScore = fuzzyMatch(query, haystack);
  if (baseScore === 0) return 0;

  const normalizedQuery = normalizeText(query);
  const normalizedHaystack = normalizeText(haystack);

  // Boost score if match is at the beginning
  if (normalizedHaystack.startsWith(normalizedQuery)) {
    return baseScore * 1.3;
  }

  // Slight boost if query appears early in text
  const queryPos = normalizedHaystack.indexOf(normalizedQuery);
  if (queryPos !== -1 && queryPos < normalizedHaystack.length * 0.3) {
    return baseScore * 1.15;
  }

  return baseScore;
}

/**
 * Multi-field fuzzy search with field weighting
 */
export function multiFieldFuzzyMatch(
  query: string,
  fields: Record<string, string>,
  fieldWeights: Record<string, number> = {},
): number {
  const defaultWeights: Record<string, number> = {
    name: 1.5,
    label: 1.5,
    description: 1.0,
    tags: 0.8,
    ...fieldWeights,
  };

  let totalScore = 0;
  let totalWeight = 0;

  for (const [fieldName, fieldValue] of Object.entries(fields)) {
    if (!fieldValue) continue;

    const weight = defaultWeights[fieldName] || 1.0;
    const score = positionWeightedMatch(query, fieldValue);

    totalScore += score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}
