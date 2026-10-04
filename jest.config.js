const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured from tsconfig.json)
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

// D3 ships ESM-only packages that Jest must transform. next/jest sets its own
// transformIgnorePatterns, so override it after the async config is built to
// whitelist the d3 modules used by the gas heatmap.
const d3EsmModules = [
  'd3-scale',
  'd3-scale-chromatic',
  'd3-array',
  'd3-color',
  'd3-format',
  'd3-interpolate',
  'd3-time',
  'd3-time-format',
  'internmap',
].join('|');

module.exports = async () => {
  const config = await createJestConfig(customJestConfig)();
  config.transformIgnorePatterns = [
    `/node_modules/(?!(?:${d3EsmModules})/)`,
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  return config;
};
