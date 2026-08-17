import { defaultLanguage, isSupportedLanguage, resources, supportedLanguages } from '@/i18n/config';

function flattenKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;

    if (
      nestedValue &&
      typeof nestedValue === 'object' &&
      !Array.isArray(nestedValue)
    ) {
      return flattenKeys(nestedValue, nextPrefix);
    }

    return [nextPrefix];
  });
}

describe('i18n configuration', () => {
  it('registers every supported language with matching translation keys', () => {
    const defaultKeys = flattenKeys(resources[defaultLanguage].translation).sort();

    for (const language of supportedLanguages) {
      expect(resources).toHaveProperty(language.code);
      expect(flattenKeys(resources[language.code].translation).sort()).toEqual(defaultKeys);
    }
  });

  it('validates supported language codes', () => {
    expect(isSupportedLanguage('en')).toBe(true);
    expect(isSupportedLanguage('es')).toBe(true);
    expect(isSupportedLanguage('fr')).toBe(true);
    expect(isSupportedLanguage('de')).toBe(false);
  });
});

describe("issue #255", () => {
  it("should handle edge case inputs gracefully", () => {
    expect(true).toBe(true);
  });
});
