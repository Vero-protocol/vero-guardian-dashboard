# Contributing to Vero Guardian Dashboard

Thanks for your interest in contributing. This guide covers everything you need
to go from a fresh clone to a merged pull request: local setup, branch and
commit conventions, the test/lint commands CI runs, and how to link your pull
request to the issue it resolves.

Code style is documented separately in [STYLEGUIDE.md](./STYLEGUIDE.md) —
read it before writing UI code. Architecture, environment variables, and the
relayer/webhook flow are documented in [README.md](./README.md).

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Running the App](#running-the-app)
- [Quality Checks](#quality-checks)
  - [Tests](#tests)
  - [Lint](#lint)
  - [Type Check](#type-check)
  - [Build](#build)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)
  - [Linking a PR to Its Issue](#linking-a-pr-to-its-issue)
  - [PR Checklist](#pr-checklist)
- [Writing Tests](#writing-tests)
- [Code Style](#code-style)
- [Security Issues](#security-issues)

---

## Code of Conduct

Be respectful, assume good faith, and keep discussion focused on the code.
Review comments should be about the change, not the contributor. Harassment or
abusive behavior in issues, pull requests, or discussions is not tolerated.

---

## Prerequisites

| Requirement | Version / Notes |
| --- | --- |
| Node.js | 20.x (CI runs Node 20; 18+ works locally) |
| npm | 9+ — the repo uses `package-lock.json`, so use npm, not yarn or pnpm |
| Git | Any recent version |
| [Freighter](https://www.freighter.app/) | Browser extension, required for wallet-connected features |
| Stellar testnet account | Fund one with [Friendbot](https://friendbot.stellar.org) |

You can browse most of the dashboard without a wallet, but voting, reputation,
and admin/role-gated features need a funded testnet account.

---

## Local Development Setup

```bash
# 1. Fork the repo on GitHub, then clone your fork
git clone https://github.com/<your-username>/vero-guardian-dashboard.git
cd vero-guardian-dashboard

# 2. Add the upstream remote so you can stay in sync
git remote add upstream https://github.com/madisonsc52-del/vero-guardian-dashboard.git

# 3. Install dependencies (use `npm ci` for an exact lockfile install)
npm install

# 4. Copy the environment template
cp .env.example .env.local
```

Fill in `.env.local` as needed. The defaults in `.env.example` point at Stellar
testnet and are enough for local UI work. Values you are most likely to set:

- `NEXT_PUBLIC_SOROBAN_RPC_URL` / `NEXT_PUBLIC_HORIZON_URL` — testnet defaults.
- `NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT` — account holding the role map, needed for
  admin-gated UI.
- `GITHUB_TOKEN` — used by server-side PR metadata lookups.
- `GITHUB_WEBHOOK_SECRET` — required by the relayer; unsigned webhook requests
  are rejected with `401`.

**Never commit secrets.** `.env.local` is git-ignored; if you add a new variable,
document it in `.env.example` with an empty or safe placeholder value and in the
Environment Variables section of `README.md`.

Before starting work, sync with upstream:

```bash
git checkout main
git pull upstream main
```

---

## Running the App

```bash
# Next.js dashboard on http://localhost:3000
npm run dev

# Webhook relayer (separate Express server, index.js)
npm run relayer

# Fire a simulated, signed GitHub webhook at the running relayer
npm run simulate

# Production build + serve
npm run build
npm start
```

---

## Quality Checks

Run all four locally before pushing — these are exactly what
`.github/workflows/ci.yml` runs on every push and pull request. A PR that fails
CI will not be reviewed until it is green.

```bash
npm test          # Jest + React Testing Library
npm run lint      # next lint (ESLint, next/core-web-vitals)
npx tsc --noEmit  # TypeScript type check
npm run build     # Next.js production build
```

### Tests

```bash
# Run the full suite
npm test

# Watch mode while developing
npm run test:watch

# Run a single file or pattern
npm test -- src/tests/wallet.test.tsx
npm test -- -t "casts a vote"

# Coverage report
npm test -- --coverage
```

Tests must pass with no new failures and no new console errors. Do not commit
`.only` or `.skip` markers.

### Lint

```bash
npm run lint
```

ESLint extends `next/core-web-vitals` (see `.eslintrc.json`). Fix warnings rather
than suppressing them; if a disable comment is genuinely required, scope it to a
single line and explain why in a comment.

### Type Check

```bash
npx tsc --noEmit
```

The codebase is TypeScript-first. Avoid `any` and non-null assertions where a
proper type or narrowing works; add or extend types in `src/types` when needed.

### Build

```bash
npm run build
```

Catches issues the dev server tolerates, such as invalid `'use client'`
boundaries, server/client import mistakes, and missing static exports.

---

## Branch Naming

Always branch off an up-to-date `main`. Never commit directly to `main`.

```
<type>/<short-kebab-summary>
```

Optionally include the issue number for traceability:
`<type>/<issue-number>-<short-kebab-summary>`.

| Prefix | Use for |
| --- | --- |
| `feat/` | New feature or user-facing capability |
| `fix/` | Bug fix |
| `docs/` | Documentation only (README, STYLEGUIDE, this file) |
| `refactor/` | Restructuring with no behavior change |
| `test/` | Adding or improving tests |
| `chore/` | Tooling, dependencies, CI, config |
| `perf/` | Performance work |
| `security/` | Security hardening or CVE remediation |

Examples:

```bash
git checkout -b docs/142-add-contributing-guide
git checkout -b feat/batch-tx-builder-presets
git checkout -b fix/wallet-reconnect-race
```

Keep branches short-lived and scoped to one issue. Use lowercase and hyphens —
no spaces, underscores, or `#` characters.

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/), matching
the existing history:

```
<type>(<optional scope>): <imperative summary>
```

```
feat: implement Diff Engine for on-chain vs repository state audits
fix(wallet): clear stale public key on network switch
docs: add CONTRIBUTING.md
chore(deps-dev): bump jest and @types/jest
```

Keep the summary under ~72 characters, use the imperative mood ("add", not
"added"), and put context, tradeoffs, or migration notes in the body.

---

## Pull Requests

1. Push your branch to your fork: `git push -u origin <branch-name>`.
2. Open a PR against `main` with a descriptive Conventional-Commit-style title.
3. In the description, explain **what** changed and **why**, and include
   screenshots or a short clip for any UI change (light *and* dark mode — the
   app ships both themes).
4. Link the issue your PR resolves (see below). **This is required.**
5. Make sure CI is green, then request review. Keep the branch updated with
   `git pull --rebase upstream main` if `main` moves ahead.

Reviewers may ask for changes; push follow-up commits to the same branch rather
than opening a new PR. Squash-merge is the default merge strategy.

### Linking a PR to Its Issue

**Every pull request must reference the issue it resolves using a GitHub closing
keyword, on its own line in the PR description:**

```
Closes #ISSUE_NUMBER
```

For example, a PR that resolves issue 142 includes:

```
Closes #142
```

Why it matters: GitHub automatically closes the linked issue when the PR is
merged into `main`, keeps the issue tracker accurate, and gives reviewers the
original requirements and acceptance criteria in one click.

Notes:

- Put the keyword in the **PR description body**, not only in a commit message
  or the PR title — GitHub links reliably from the description.
- `Closes #N`, `Fixes #N`, and `Resolves #N` all work. Use `Closes #N` by default,
  and `Fixes #N` for bug fixes if you prefer.
- Closing multiple issues requires one keyword per issue:
  `Closes #142` and `Closes #143` — `Closes #142, #143` will not link both.
- If the PR is only *related* to an issue and should not close it, write
  `Refs #142` or `Part of #142` instead.
- If no issue exists yet, open one first and describe the problem, then link it.
  This keeps the roadmap and contributor history reviewable.

### PR Checklist

Copy this into your PR description and tick each box:

```markdown
- [ ] Branch follows the `<type>/<short-kebab-summary>` convention
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] Tests added or updated for the change
- [ ] UI changes verified in light and dark mode, and keyboard accessible
- [ ] New env vars documented in `.env.example` and `README.md`
- [ ] No secrets, keys, or `.env.local` values committed
- [ ] Docs updated (`README.md` / `STYLEGUIDE.md`) if behavior or patterns changed
- [ ] PR description contains `Closes #ISSUE_NUMBER`
```

---

## Writing Tests

Tests use [Jest](https://jestjs.io/) with
[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
and the jsdom environment, configured in `jest.config.js` and `jest.setup.js`.

- Place tests in a `__tests__` directory next to the code under test, or in
  `src/tests` for cross-cutting suites — both patterns exist today.
- Name files `*.test.ts` or `*.test.tsx`. Node/relayer tests live in the
  root `__tests__` directory (for example `__tests__/webhook.test.js`) and use
  `supertest`.
- Import modules through the `@/` alias, which maps to `src/`.
- Query by accessible role, label, or text rather than test IDs or class names,
  mirroring the accessibility patterns required by `STYLEGUIDE.md`.
- Mock network, wallet, and Stellar SDK boundaries; tests must never hit the
  live Horizon or Soroban endpoints.
- Shared helpers live in `test-utils` (for example the IndexedDB mock).

Bug fixes should include a regression test that fails before the fix and passes
after it.

---

## Code Style

All UI and component work must follow **[STYLEGUIDE.md](./STYLEGUIDE.md)**,
which is the source of truth for:

- Component composition, provider order, and the app shell in `src/app`.
- Where code belongs: `src/components`, `src/context`, `src/hooks`,
  `src/services`, `src/types`, `src/utils`.
- Card, button, layout, and loading-state class patterns.
- Theme handling (Tailwind `darkMode: 'class'`), color usage, and typography.
- Accessibility rules — `aria-label`, `aria-live`, focus rings, and
  `AccessControl` for role-gated features.

General conventions on top of the style guide:

- Keep provider-dependent components as client components with `'use client'`.
- Prefer small, focused modules; multi-file components expose an `index.ts`.
- Match the surrounding file's formatting; do not reformat unrelated code, since
  noisy diffs slow reviews.

---

## Security Issues

Do **not** open a public issue for a vulnerability. Report it privately to the
maintainers through GitHub Security Advisories on this repository. Include
reproduction steps and affected versions. Please avoid posting private keys,
tokens, or account secrets anywhere in the repo, including test fixtures.

---

Thanks for contributing to Vero Guardian Dashboard. 🛡️

## Writing the pull request description

**Every pull request needs a detailed description.** A one-line summary, a
restatement of the issue title, or "fixes the issue" is not enough, and a PR
that arrives with one will be sent back before review.

Write it for a reviewer who has *not* read the issue. Cover:

- **What was wrong** — the problem or gap, and the behaviour before your change.
- **What you did** — the approach you took, and any alternative you considered
  and rejected, with the reason.
- **What to look at** — anything subtle, risky, or that you are unsure about.
  Flagging your own uncertainty speeds review up; it does not count against you.
- **How you verified it** — tests you added, commands you ran, manual checks.

Two things this is not: it is not a diff summary — the diff already says which
lines changed, and the description should say *why*. And it is not a place to
hide problems. If something is incomplete or a known limitation remains, say so
explicitly.

Keep the `Closes #<issue-number>` reference in the description itself. GitHub
ignores closing keywords written in PR comments, so a link posted as a comment
will not close the issue on merge.
