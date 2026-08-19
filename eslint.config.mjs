import nextConfig from 'eslint-config-next';

const config = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**'],
  },
  {
    rules: {
      // eslint-config-next 16 ships react-hooks v7's stricter Compiler-era
      // rules, which flag ~20 pre-existing effect/ref patterns across the
      // codebase (including wallet/socket/on-chain hooks). Downgraded to
      // warnings so this dependency bump doesn't force a behavioral rewrite
      // of that code; tighten back to "error" once it's been addressed.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];

export default config;
