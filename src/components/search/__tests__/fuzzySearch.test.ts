/**
 * Fuzzy Search Tests
 */

import {
  normalizeText,
  tokenize,
  levenshteinDistance,
  tokenSimilarity,
  fuzzyMatchToken,
  fuzzyMatch,
  positionWeightedMatch,
  multiFieldFuzzyMatch,
} from '../fuzzySearch';

describe('Fuzzy Search', () => {
  describe('normalizeText', () => {
    it('should lowercase text', () => {
      expect(normalizeText('Hello World')).toBe('hello world');
    });

    it('should handle separators', () => {
      expect(normalizeText('snake_case-kebab/slash')).toBe('snake case kebab slash');
    });

    it('should trim whitespace', () => {
      expect(normalizeText('  hello world  ')).toBe('hello world');
    });

    it('should handle multiple spaces', () => {
      expect(normalizeText('hello    world')).toBe('hello world');
    });
  });

  describe('tokenize', () => {
    it('should split text into tokens', () => {
      expect(tokenize('hello world test')).toEqual(['hello', 'world', 'test']);
    });

    it('should handle separators', () => {
      expect(tokenize('hello_world-test/case')).toEqual(['hello', 'world', 'test', 'case']);
    });

    it('should return empty array for empty text', () => {
      expect(tokenize('')).toEqual([]);
    });
  });

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should calculate distance for different strings', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5);
      expect(levenshteinDistance('hello', '')).toBe(5);
    });
  });

  describe('tokenSimilarity', () => {
    it('should return 100 for exact match', () => {
      expect(tokenSimilarity('test', 'test')).toBe(100);
    });

    it('should return 85 for starts-with match', () => {
      expect(tokenSimilarity('tes', 'test')).toBe(85);
    });

    it('should return 70 for contains match', () => {
      expect(tokenSimilarity('st', 'test')).toBe(70);
    });

    it('should calculate fuzzy match score', () => {
      const score = tokenSimilarity('tst', 'test');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(70);
    });

    it('should return 0 for no match', () => {
      expect(tokenSimilarity('xyz', 'abc')).toBe(0);
    });
  });

  describe('fuzzyMatchToken', () => {
    it('should find best match in tokens', () => {
      const haystack = ['hello', 'world', 'test'];
      expect(fuzzyMatchToken('hel', haystack)).toBe(85);
    });

    it('should handle empty haystack', () => {
      expect(fuzzyMatchToken('test', [])).toBe(0);
    });

    it('should handle empty query', () => {
      expect(fuzzyMatchToken('', ['hello'])).toBe(0);
    });
  });

  describe('fuzzyMatch', () => {
    it('should match query to haystack', () => {
      const score = fuzzyMatch('hello world', 'hello there world');
      expect(score).toBeGreaterThan(0);
    });

    it('should handle multi-token queries', () => {
      const score = fuzzyMatch('hel wor', 'hello world');
      expect(score).toBeGreaterThan(50);
    });

    it('should return 0 for no match', () => {
      expect(fuzzyMatch('xyz', 'abc def')).toBe(0);
    });
  });

  describe('positionWeightedMatch', () => {
    // Uses a partial query ('tes') rather than an exact token match: an
    // exact match already scores the maximum 100 from tokenSimilarity, which
    // leaves the positional boost multiplier no headroom to show a
    // difference once it's clamped back down to 100.
    it('should boost matches at beginning', () => {
      const score1 = positionWeightedMatch('tes', 'test case');
      const score2 = positionWeightedMatch('tes', 'something test');
      expect(score1).toBeGreaterThan(score2);
    });

    it('should boost early matches', () => {
      const score1 = positionWeightedMatch('tes', 'test case more');
      const score2 = positionWeightedMatch('tes', 'case test more');
      expect(score1).toBeGreaterThan(score2);
    });
  });

  describe('multiFieldFuzzyMatch', () => {
    it('should search multiple fields', () => {
      const fields = {
        name: 'test',
        description: 'a test function',
      };
      const score = multiFieldFuzzyMatch('test', fields);
      expect(score).toBeGreaterThan(0);
    });

    it('should weight fields appropriately', () => {
      const fields1 = {
        name: 'test',
        description: 'unrelated',
      };
      const fields2 = {
        name: 'unrelated',
        description: 'test',
      };
      const score1 = multiFieldFuzzyMatch('test', fields1);
      const score2 = multiFieldFuzzyMatch('test', fields2);
      expect(score1).toBeGreaterThan(score2);
    });

    it('should apply custom weights', () => {
      // name and description must differ in match quality, otherwise a
      // weighted average of two identical scores is the same regardless of
      // how the weight is distributed between them.
      const fields = {
        name: 'test',
        description: 'unrelated content',
      };
      const score1 = multiFieldFuzzyMatch('test', fields, { name: 1.0, description: 3.0 });
      const score2 = multiFieldFuzzyMatch('test', fields, { name: 3.0, description: 1.0 });
      expect(score1).toBeLessThan(score2);
    });
  });
});
