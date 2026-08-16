# Contributing to Vero Guardian Dashboard

Thank you for your interest in contributing to the Vero Guardian Dashboard! This document outlines our development workflow, contribution guidelines, and quality standards.

---

## Table of Contents

- [Code of Conduct & Community](#code-of-conduct--community)
- [Getting Started & Local Setup](#getting-started--local-setup)
- [Development Workflow](#development-workflow)
  - [Branch Naming](#branch-naming)
  - [Commit Messages](#commit-messages)
  - [Linking Pull Requests to Issues](#linking-pull-requests-to-issues)
- [Coding Standards & Style Guide](#coding-standards--style-guide)
- [Testing & Quality Verification](#testing--quality-verification)
- [Pull Request Guidelines](#pull-request-guidelines)
- [GrantFox OSS Campaign Guidelines](#grantfox-oss-campaign-guidelines)

---

## Code of Conduct & Community

We strive to maintain an open, welcoming, diverse, and inclusive environment. Please treat fellow contributors with respect, constructiveness, and professional courtesy at all times.

---

## Getting Started & Local Setup

### Prerequisites

- **Node.js**: Version 18 or 20 (LTS recommended)
- **npm**: Version 9+
- **Browser Wallet**: [Freighter](https://www.freighter.app/) extension installed (for testing wallet interactions)
- **Stellar Account**: Testnet account funded via [Stellar Laboratory Friendbot](https://laboratory.stellar.org/#account-creator?network=test)

### Installation

1. **Fork and Clone the Repository:**

   ```bash
   git clone https://github.com/<your-username>/vero-guardian-dashboard.git
   cd vero-guardian-dashboard
   ```

2. **Add Upstream Remote:**

   ```bash
   git remote add upstream https://github.com/Vero-protocol/vero-guardian-dashboard.git
   git fetch upstream
   ```

3. **Install Dependencies:**

   ```bash
   npm install
   ```

4. **Configure Environment Variables:**

   ```bash
   cp .env.example .env.local
   ```

   Update `.env.local` with your local or testnet endpoints (defaults point to public testnet Horizon and Soroban RPC).

5. **Start the Local Development Server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser.

6. **(Optional) Run Webhook Relayer & Simulation:**

   ```bash
   # In terminal 1:
   GITHUB_WEBHOOK_SECRET=devsecret npm run relayer

   # In terminal 2:
   GITHUB_WEBHOOK_SECRET=devsecret npm run simulate
   ```

---

## Development Workflow

### Branch Naming

Create a feature or fix branch originating from the latest `upstream/main`:

```bash
git checkout -b <type>/<short-description> upstream/main
```

Use standardized branch prefixes:
- `feat/` — New features or enhancements (e.g., `feat/gas-metrics-export`)
- `fix/` — Bug fixes (e.g., `fix/wallet-reconnect-race`)
- `docs/` — Documentation updates (e.g., `docs/add-contributing-guidelines`)
- `chore/` — Maintenance, dependency bumps, or toolchain configs (e.g., `chore/update-eslint`)
- `refactor/` — Code refactoring without changing user-facing functionality

### Commit Messages

We follow conventional commit format:

```text
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

Example:
```text
feat(wallet): support Rabet provider reconnection on mount
fix(relayer): handle empty payload HMAC gracefully
docs(contributing): add guidelines for issue resolution
```

### Linking Pull Requests to Issues

Every Pull Request must explicitly link to the issue it addresses. Use standard GitHub closing keywords in the PR description:

```markdown
Closes #ISSUE_NUMBER
```

Or:
```markdown
Fixes #ISSUE_NUMBER
Resolves #ISSUE_NUMBER
```

> **Important**: Explicit linking via `Closes #N` is required by GrantFox automated campaign verifications to track and reward contributor deliveries.

---

## Coding Standards & Style Guide

- **TypeScript**: All new code should be written in strict TypeScript without `any` unless strictly necessary.
- **Components & Architecture**: Adhere to the guidelines in [STYLEGUIDE.md](STYLEGUIDE.md) for UI components, Tailwind CSS styling, dark/light theme classes, and layout structures.
- **Security & Privacy**:
  - Never commit raw private keys, secrets, or unencrypted wallet credentials.
  - User inputs and scanner outputs must be sanitized before rendering (avoid `dangerouslySetInnerHTML`).
  - Follow the principle of least privilege when configuring network calls and relayer endpoints.

---

## Testing & Quality Verification

Before opening a pull request, ensure all linters, type checks, test suites, and production builds pass locally:

1. **Type Checking:**
   ```bash
   npx tsc --noEmit
   ```

2. **Linting:**
   ```bash
   npm run lint
   ```

3. **Unit & Component Tests:**
   ```bash
   npm test
   ```

   Run tests with CI flags:
   ```bash
   npm test -- --ci
   ```

4. **Production Build Verification:**
   ```bash
   npm run build
   ```

---

## Pull Request Guidelines

1. **Keep PRs Focused**: Keep PRs scoped to a single feature or bug fix. Avoid mixing unrelated changes.
2. **Include Tests**: Add unit or integration tests (`__tests__/*.test.tsx` or `*.test.ts`) covering your new functionality or regression cases.
3. **Update Documentation**: If your PR introduces new components, endpoints, or environment variables, update `README.md`, `STYLEGUIDE.md`, or the relevant doc files.
4. **Fill Out the PR Description**: Provide a clear summary of changes, rationale, issue reference (`Closes #N`), and verification steps / test evidence.

---

## GrantFox OSS Campaign Guidelines

For contributors participating via GrantFox:

1. Ensure the issue has been assigned to you or is open for active contribution.
2. Target PRs to the default branch (`main` or `dev` as specified in the issue).
3. Include `Closes #<issue_number>` in the PR description to ensure automated credit and verification.
4. Provide verification output (e.g. test results) directly in your PR description.
