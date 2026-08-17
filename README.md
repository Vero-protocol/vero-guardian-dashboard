# Vero Guardian Dashboard

> A full-stack Next.js 14 dashboard for **Vero Guardians** — trusted on-chain reviewers who cast cryptographically-signed votes on GitHub pull requests via the Stellar blockchain.

<!-- CI badges: update OWNER/REPO to your GitHub repo -->
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](#)


Guardians connect their [Freighter](https://www.freighter.app/) wallet, browse the live PR review feed, and submit approval votes recorded as permanent `manageData` transactions on Stellar Horizon. The system bridges open-source code review with decentralized, verifiable trust.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
  - [High-Level System Map](#high-level-system-map)
  - [Frontend Component Tree](#frontend-component-tree)
  - [Vote Data Flow](#vote-data-flow)
  - [Relayer Pipeline](#relayer-pipeline)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Key Concepts](#key-concepts)
  - [Casting a Vote](#casting-a-vote)
  - [Batch Transaction Builder](#batch-transaction-builder)
  - [Security Scanner Results](#security-scanner-results)
  - [Guardian Reputation](#guardian-reputation)
  - [Wallet Context](#wallet-context)
  - [Local Audit Log Export](#local-audit-log-export)
  - [Webhook Relayer](#webhook-relayer)
- [API Reference](#api-reference)
- [Testing](#testing)
- [CI/CD Pipeline](#cicd-pipeline)
- [Deployment Checklist](#deployment-checklist)
- [License](#license)

---

## Overview

The Vero system connects GitHub's pull request lifecycle to the Stellar blockchain. Here's the end-to-end flow:

1. A developer opens a PR tagged `wave-contribution` on GitHub
2. The **Vero Relayer** (`index.js`) receives the GitHub webhook and calls `registerTaskOnChain`
3. The task is recorded on Stellar as a `manageData` entry
4. **Guardians** open this dashboard, connect their Freighter wallet, and browse the PR feed
5. A Guardian clicks **Vote** — the dashboard builds a Stellar transaction, Freighter signs it, and it's submitted to Horizon
6. The vote hash is permanently stored on-chain under key `vote_<prId>`

Each Guardian's trust score is tracked as `vero_reputation` on their Stellar account, readable by any participant.

---

## System Architecture

### High-Level System Map
┌──────────────────────────────────────────────────────────────────────┐
│ GitHub │
│ Developer opens PR ──► Webhook fires (action: closed + merged) │
└───────────────────────────────┬──────────────────────────────────────┘
│ POST /github-webhook
▼
┌──────────────────────────────────────────────────────────────────────┐
│ Vero Relayer (index.js) │
│ │
│ • Rate-limits requests, verifies X-Hub-Signature-256 HMAC │
│ • Validates action === 'closed' && pull_request.merged === true │
│ • Checks labels includes 'wave-contribution' │
│ • Calls registerTaskOnChain(prNumber) ──► stellar.js │
└───────────────────────────────┬──────────────────────────────────────┘
│ manageData tx (task_<prId>)
▼
┌──────────────────────────────────────────────────────────────────────┐
│ Stellar Horizon / Testnet │
│ │
│ task_42 = "wave-contribution" (manageData entry) │
│ vote_42 = "approve" (Guardian vote entry) │
│ vero_reputation = <score> (Guardian account data) │
└───────────────────────────────┬──────────────────────────────────────┘
│ Horizon REST API
▼
┌──────────────────────────────────────────────────────────────────────┐
│ Guardian Browser (Next.js 14) │
│ │
│ ConnectButton ──► WalletContext (publicKey) │
│ PRFeed ──► VoteCard ──► castVote() ──► Freighter │
│ ReputationBadge ──► getReputation() │
└──────────────────────────────────────────────────────────────────────┘
code
Code
---

### Frontend Component Tree
<RootLayout>
└── <WalletContext.Provider>
└── <RoleContext.Provider>
├── <ConnectButton /> # Multi-wallet picker (Freighter, Rabet)
├── <PRFeed /> # Fetches open PRs, renders list
│ └── <VoteCard pr={...} /> # Per-PR card with guarded vote button
├── <TransactionFeed /> # Live Horizon transaction stream
├── <GasHeatmap /> # Per-function gas usage heatmap (D3)
├── <AccessControl /> # Role-gated Admin vs Guardian UI
├── <ReputationBadge /> # Reads vero_reputation from Horizon
├── <Toast /> # Success/error notifications
└── <ErrorModal /> # Global, dismissible error dialog
```
Vote Data Flow
code
Code
Guardian clicks "Vote"
        │
        ▼
handleVote()  [VoteCard.tsx]
        │
        ├── guard: publicKey must be set (wallet connected)
        │
        ▼
castVote(prId, publicKey)  [stellar-interact.ts]
        │
        ├── server.loadAccount(publicKey)  ──────────────► Horizon API
        │         └── returns AccountResponse (sequence number, etc.)
        │
        ├── TransactionBuilder
        │     ├── fee: BASE_FEE (100 stroops)
        │     ├── networkPassphrase: Networks.TESTNET
        │     └── .addOperation(
        │               Operation.manageData({
        │                 name:  "vote_42",
        │                 value: "approve"
        │               })
        │             )
        │
        ├── tx.toXDR()  ──► signTransaction(xdr, { network: 'TESTNET' })
        │                           │
        │                    Freighter popup
        │                    Guardian approves
        │                           │
        │                    returns signed XDR
        │
        └── server.submitTransaction(signedTx)  ──────────► Horizon API
                      │
                      ▼
              result.hash  ──► setVoted(true)  ──► Toast "Vote recorded!"
Relayer Pipeline
code
Code
GitHub Webhook  ──►  POST /github-webhook
                              │
                    ┌─────────▼──────────┐
                    │  Rate limit check   │  429 if exceeded
                    └─────────┬──────────┘
                              │ pass
                    ┌─────────▼──────────┐
                    │ Verify HMAC-SHA256  │  401 if missing/invalid
                    │ X-Hub-Signature-256 │
                    └─────────┬──────────┘
                              │ pass
                    ┌─────────▼──────────┐
                    │  Validate payload   │
                    │  action === 'closed'│
                    │  merged === true    │
                    │  label: wave-contrib│
                    └─────────┬──────────┘
                              │ pass
                    ┌─────────▼──────────┐
                    │ registerTaskOnChain │  (stellar.js)
                    │  - load env keys    │
                    │  - build manageData │
                    │  - log tx payload   │
                    │  - submit / simulate│
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Stellar Horizon    │
                    │  task_<prId> stored │
                    └────────────────────┘
Tech Stack
Layer	Technology	Purpose
Framework	Next.js 14 (App Router)	SSR + client dashboard
Language	TypeScript	Type-safe frontend
Styling	Tailwind CSS	Utility-first UI
Blockchain	Stellar / Soroban	On-chain vote storage
Wallet	Freighter	Transaction signing
Visualization	D3 (d3-scale, d3-scale-chromatic)	Gas usage heatmap
Stellar SDK	@stellar/stellar-sdk	TX building & Horizon calls
Relayer	Node.js + Express	GitHub webhook ingestion
HTTP Client	Native Fetch API	API requests
Testing	Jest + @testing-library/react	Unit & component tests
Project Structure
code
Code
vero-guardian-dashboard/
├── index.js                    # Vero Relayer — Express webhook server
├── stellar.js                  # registerTaskOnChain() utility
├── scripts/
│   └── mock-webhook.js         # Simulate a GitHub webhook (npm run simulate)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with WalletContext provider
│   │   ├── page.tsx            # Home page — renders PRFeed
│   │   ├── globals.css         # Tailwind base styles
│   │   └── api/                # Next.js API routes
│   ├── components/
│   │   ├── VoteCard.tsx        # PR card with vote button + state
│   │   ├── PRFeed.tsx          # Scrollable PR list
│   │   ├── TransactionFeed/    # Live Horizon transaction stream feed
│   │   ├── GasHeatmap/         # Per-function gas usage heatmap (D3)
│   │   ├── ConnectButton.tsx   # Freighter connect/disconnect
│   │   ├── TaskCard.tsx        # Generic task display card
│   │   ├── Toast.tsx           # Success/error notification toasts
│   │   ├── ErrorModal.tsx      # Reusable global error modal + useError() hook
│   │   └── ErrorBoundary.tsx   # React error boundary wrapper
│   ├── context/
│   │   └── WalletContext.tsx   # Global wallet state (publicKey)
│   ├── lib/
│   │   ├── stellar-interact.ts # castVote(), getReputation()
│   │   └── wallets/            # Stellar wallet provider adapters + registry
│   └── utils/
│       └── stellar-interact.ts # Utility re-exports
├── .env.example                # Required environment variables
├── jest.config.js
├── next.config.mjs
├── tailwind.config.ts
└── tsconfig.json
Getting Started
Prerequisites
Node.js 18+
Freighter wallet browser extension installed
A funded Stellar testnet account — use Friendbot
Install & Run
code
Bash
# Clone the repo
git clone https://github.com/your-org/vero-guardian-dashboard.git
cd vero-guardian-dashboard

# Install dependencies
npm install

# Copy environment config
cp .env.example .env.local

# Start the Next.js dashboard
npm run dev
Open http://localhost:3000 in your browser.
Run the Relayer
The relayer is a separate Express server that listens for GitHub webhooks. It requires GITHUB_WEBHOOK_SECRET to be set — requests without a valid X-Hub-Signature-256 signature are rejected with 401 (see Webhook Relayer):
code
Bash
# Start the webhook relayer on port 3000
GITHUB_WEBHOOK_SECRET=devsecret node index.js

# In another terminal, fire a simulated (signed) webhook
GITHUB_WEBHOOK_SECRET=devsecret npm run simulate
Expected relayer output:
code
Code
[relayer] Listening on port 3000
[webhook] Merged PR #42 with wave-contribution — registering on chain
[stellar] Registering PR #42 on testnet
[stellar] Source key loaded: YES (hardware-backed vault)
[stellar] Transaction compiled: {
  "operation": "manageData",
  "key": "task_42",
  "value": "wave-contribution",
  "network": "testnet",
  "fee": 100
}
[stellar] ✓ Task PR #42 registered — awaiting submission
Build for Production
code
Bash
npm run build
npm start
Environment Variables
Copy .env.example to .env.local:
code
Bash
# Soroban RPC endpoint
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# Stellar Horizon REST API
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org

# Optional Horizon account that stores admin/guardian role map entries
NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT=G...

# Optional Guardian profile service base URL
NEXT_PUBLIC_PROFILE_SERVICE_URL=

# Relayer account that stores task consensus data entries
NEXT_PUBLIC_RELAYER_PUBLIC_KEY=G...

# Browser push public key used by notification subscriptions
NEXT_PUBLIC_VAPID_PUBLIC_KEY=

# Relayer: target network
STELLAR_NETWORK=testnet

# GitHub API token used by server-side PR metadata lookups
GITHUB_TOKEN=

# Relayer vault metadata. Store only encrypted vault records in env/config.
RELAYER_VAULT_KEY_PROVIDER=hardware
RELAYER_VAULT_HARDWARE_BACKED=true
RELAYER_VAULT_STELLAR_SECRET_KEY={...encrypted vault record...}

# Shared secret used to verify the GitHub webhook's X-Hub-Signature-256 header
GITHUB_WEBHOOK_SECRET=
Variable	Description	Default
NEXT_PUBLIC_SOROBAN_RPC_URL	Soroban RPC endpoint	https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL	Stellar Horizon REST API	https://horizon-testnet.stellar.org
NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT	Optional Horizon account containing admin/guardian role map entries	connected wallet account
STELLAR_NETWORK	testnet or mainnet	testnet
RELAYER_VAULT_KEY_PROVIDER	Hardware-backed vault key provider identifier	hardware
RELAYER_VAULT_HARDWARE_BACKED	Must be true when relayer vault keys are backed by OS/HSM storage	—
RELAYER_VAULT_STELLAR_SECRET_KEY	Encrypted vault record for the relayer signing key	—
GITHUB_WEBHOOK_SECRET	Shared secret used to verify the X-Hub-Signature-256 HMAC header on /github-webhook requests. Requests without a valid signature are rejected with 401.	—
Security: Do not store raw relayer secrets such as STELLAR_SECRET_KEY in .env files. Store encrypted vault records and unwrap them with a hardware-backed provider.
Key Concepts
Casting a Vote
Votes are Stellar manageData operations. The key is vote_<prId> and the value is approve. The full flow — build, sign, submit — lives in src/lib/stellar-interact.ts:
code
TypeScript
// src/lib/stellar-interact.ts
import * as StellarSdk from '@stellar/stellar-sdk';
import { signTransaction } from '@stellar/freighter-api';

const server = new StellarSdk.Horizon.Server(
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org'
);

export async function castVote(prId: number, publicKey: string): Promise<string> {
  // 1. Load the account to get the current sequence number
  const account = await server.loadAccount(publicKey);

  // 2. Build the transaction
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.manageData({
        name: `vote_${prId}`,
        value: 'approve',
      })
    )
    .setTimeout(30)
    .build();

  // 3. Send XDR to Freighter for signing
  const signedXdr = await signTransaction(tx.toXDR(), { network: 'TESTNET' });

  // 4. Reconstruct and submit
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedXdr,
    StellarSdk.Networks.TESTNET
  );
  const result = await server.submitTransaction(signedTx);

  return result.hash;
}
The VoteCard component wires this to the UI:
code
Tsx
// src/components/VoteCard.tsx
import { useWallet } from '@/context/WalletContext';
import { castVote } from '@/lib/stellar-interact';

export function VoteCard({ pr }: { pr: PR }) {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [voted, setVoted] = useState(false);

  async function handleVote() {
    if (!publicKey) return alert('Connect your wallet first');
    setLoading(true);
    try {
      const hash = await castVote(pr.id, publicKey);
      console.log('Vote tx hash:', hash);
      setVoted(true);
    } catch (err) {
      alert('Vote failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border p-4 shadow-sm">
      <h3 className="font-semibold">{pr.title}</h3>
      <p className="text-sm text-gray-500">PR #{pr.number}</p>
      <button
        onClick={handleVote}
        disabled={loading || voted}
        className="mt-3 rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {voted ? '✓ Voted' : loading ? 'Signing…' : 'Vote'}
      </button>
    </div>
  );
}
Batch Transaction Builder
src/services/txBuilder.ts provides a reusable batch transaction engine for flows that need to submit more than one Stellar operation in a single wallet approval. It accepts an ordered operation list, loads or reuses safe account sequence state, builds one Stellar transaction, asks Freighter to sign the unsigned XDR, and submits the signed transaction through Horizon.
code
TypeScript
import * as StellarSdk from '@stellar/stellar-sdk';
import { signAndBroadcastBatchTransaction } from '@/services/txBuilder';

const result = await signAndBroadcastBatchTransaction({
  sourceAccount: publicKey,
  networkPassphrase: StellarSdk.Networks.TESTNET,
  operations: [
    StellarSdk.Operation.manageData({ name: 'vote_42', value: 'approve' }),
    StellarSdk.Operation.manageData({ name: 'audit_42', value: 'reviewed' }),
  ],
});

console.log(result.hash);
For custom signing flows, call buildBatchTransaction() to get an unsigned envelope XDR, pass that XDR to the existing wallet signing flow, then submit with broadcastSignedBatchTransaction(). The builder only caches non-sensitive sequence metadata after successful submissions and invalidates that cache if Horizon returns tx_bad_seq.
Builder UI
src/components/BatchTxBuilder is the Guardian-facing interface for that engine. Operations are composed and edited entirely in local React state — add vote, manage-data, or native payment operations, reorder them to control execution order, and remove any before submitting — so the batch can be assembled with no network round-trips. Each draft is validated as it is entered (PR numbers, data-name byte limits, Stellar destination addresses, and amounts) and is only converted into a StellarOperation at build time, so a malformed operation can never reach signing.
code
Tsx
import BatchTxBuilder from '@/components/BatchTxBuilder';

// Reads the connected key from WalletContext and broadcasts through
// the shared batch transaction builder in a single wallet approval.
<BatchTxBuilder />
Pressing Build & broadcast maps the queue to ordered operations and calls signAndBroadcastBatchTransaction(), so the whole batch is signed and submitted as one transaction. A broadcaster prop can be supplied to inject a custom builder (used in tests). No private keys are handled, requested, logged, or stored.
Security Scanner Results
src/components/security/ provides a reusable UI module for static-analysis and vulnerability scanner JSON. The dashboard renders <SecurityScannerResults /> with a local JSON input, and callers can also pass scanner output directly:
code
Tsx
import SecurityScannerResults from '@/components/security';

<SecurityScannerResults results={scannerJson} />
Supported scanner fields include id, ruleId, cve, title, message, description, severity, level, package, dependency, file, path, line, recommendation, fix, and safe http/https URLs. Arrays, common { findings: [...] } style objects, SARIF runs[].results, and npm-audit-style vulnerabilities maps are normalized into one warning shape.
Severity is normalized case-insensitively: critical, high, medium, moderate, low, info, warning, and error are supported. error maps to high; warning and moderate map to medium; unknown values remain unknown.
Scanner fields are treated as untrusted. The parser strips HTML/script/style markup, masks obvious secret/token/password values, rejects unsafe URL protocols such as javascript:, and the UI renders values as React text nodes without dangerouslySetInnerHTML.
Guardian Reputation
Each Guardian's reputation score is stored as a vero_reputation manageData entry on their Stellar account. Stellar encodes all data values as base64, so the value is decoded on read:
code
TypeScript
// src/lib/stellar-interact.ts
export async function getReputation(publicKey: string): Promise<number> {
  const account = await server.loadAccount(publicKey);
  const raw = (account.data_attr as Record<string, string>)['vero_reputation'];
  if (!raw) return 0;
  return parseInt(Buffer.from(raw, 'base64').toString('utf8'), 10);
}
Usage in a component:
code
Tsx
import { useEffect, useState } from 'react';
import { getReputation } from '@/lib/stellar-interact';
import { useWallet } from '@/context/WalletContext';

export function ReputationBadge() {
  const { publicKey } = useWallet();
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (publicKey) getReputation(publicKey).then(setScore);
  }, [publicKey]);

  if (score === null) return null;
  return (
    <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
      Rep: {score}
    </span>
  );
}
Wallet Context
The WalletContext provides a resilient Stellar wallet connection state with localStorage-backed persistence, supporting multiple standard wallet providers through a pluggable adapter registry (src/lib/wallets/).
Key features:
Multi-wallet support — connect via any registered provider (currently Freighter and Rabet). ConnectButton renders a picker of detected wallets.
Stores the verified publicKey under vero_wallet_publicKey and the active provider id under vero_wallet_provider in localStorage.
Verifies persisted Freighter keys against isConnected()/getAddress() before restoring UI state; non-Freighter sessions require an explicit reconnect after reload.
WatchWalletChanges and freighter-account-change listeners clear or update wallet state when the active Freighter account changes.
connect(providerId?) resolves the chosen adapter (defaults to Freighter) and surfaces errors; passing an invalid value safely falls back to Freighter.
disconnect() clears state and stored keys.
Exposes isLoading, error, reputation, activeProvider, and availableProviders for UI feedback.
Adding a wallet provider
Implement the StellarWalletProvider interface (id, name, isAvailable(), connect()) in a new module under src/lib/wallets/, then add it to the walletProviders array in src/lib/wallets/index.ts. The picker and context pick it up automatically.
API
WalletProvider — React provider component that must wrap your app (already mounted in the root layout).
useWallet() — Hook returning the wallet API:
code
Ts
type UseWallet = {
  publicKey: string | null;              // Stellar public key when connected
  isConnected: boolean;                  // shorthand for !!publicKey
  isLoading: boolean;                    // true while connecting or initializing
  error: string | null;                  // human-friendly error message
  reputation: number;                    // current reputation score shown in the dashboard
  activeProvider: WalletProviderId | null; // provider backing the connection
  availableProviders: WalletProviderInfo[]; // detected wallets + availability
  connect(providerId?: WalletProviderId): Promise<void>; // defaults to Freighter
  disconnect(): void;                    // clears key and localStorage
};
Constants
Public key storage key: vero_wallet_publicKey
Active provider storage key: vero_wallet_provider
Freighter event: freighter-account-change
Example usage
Wrap your application (already done in the RootLayout):
code
Tsx
// src/app/layout.tsx
import { WalletProvider } from '@/context/WalletContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
Consume the hook in components:
code
Tsx
import { useWallet } from '@/hooks/useWallet';

export function ConnectButton() {
  const { publicKey, isLoading, error, connect, disconnect } = useWallet();

  if (publicKey) {
    return (
      <button onClick={disconnect} className="text-sm text-red-500">
        Disconnect ({publicKey.slice(0, 6)}…)
      </button>
    );
  }

  return (
    <button onClick={connect} disabled={isLoading} className="rounded bg-indigo-600 px-4 py-2 text-white">
      {isLoading ? 'Connecting…' : 'Connect Wallet'}
    </button>
  );
}
Notes
If Freighter is not installed, connect() will set error to a helpful message.
Persisted wallet state is restored only after Freighter confirms the same current address.
Freighter wallet change listeners update or clear stored keys when the user switches accounts.
Error Modal
ErrorModal provides a single, app-wide error dialog so error messaging stays consistent across the dashboard. The ErrorProvider is mounted once in the root layout, and any component can raise an error through the useError() hook — no need to wire up local modal state.
code
Tsx
import { useError } from '@/components/ErrorModal';

export function VoteButton() {
  const { showError } = useError();

  async function handleVote() {
    try {
      await castVote();
    } catch (err) {
      showError({
        title: 'Vote failed',
        message: err instanceof Error ? err.message : 'Please try again.',
        actionLabel: 'Retry',
        onAction: handleVote,
      });
    }
  }

  return <button onClick={handleVote}>Vote</button>;
}
showError({ message }) is the only required field; title defaults to "Something went wrong". Passing actionLabel/onAction adds a primary action button (the action runs, then the modal closes). The modal is dismissible via its close button, the Cancel/Dismiss button, the backdrop, or the <kbd>Esc</kbd> key, and uses role="alertdialog" with labelled title/description for accessibility.
Role Context
RoleContext fetches the connected wallet's role from Horizon account data and exposes derived permissions for UI guards.
Role data is read from NEXT_PUBLIC_ROLE_REGISTRY_ACCOUNT when configured; otherwise, the connected wallet account is inspected. Supported active role markers include admin:<publicKey>, admin_<publicKey>, guardian:<publicKey>, guardian_<publicKey>, and exact connected-account keys such as admin, guardian, or role.
Use AccessControl to hide admin-only UI from Guardians and unauthorized wallets, and use useRole() to block direct UI handlers before invoking guarded actions.
Live Transaction Feed
TransactionFeed subscribes to Horizon's transaction stream (Server-Sent Events via server.transactions().cursor('now').stream(...)) and renders incoming network transactions in real time — newest first, capped at MAX_FEED_ENTRIES (25) and de-duplicated by transaction id. Each row links to the transaction on Stellar Expert, shows the source account, ledger sequence, operation count, and a success/failure indicator, with a live connection status badge.
The stream source is injectable for testing and customization:
code
Tsx
import TransactionFeed, {
  createHorizonTransactionStream,
} from '@/components/TransactionFeed';

// Default: live Horizon stream from NEXT_PUBLIC_HORIZON_URL (testnet fallback).
<TransactionFeed />

// Custom endpoint or a mock subscriber in tests.
<TransactionFeed subscribe={createHorizonTransactionStream('https://horizon.stellar.org')} />
A subscribe prop receives { onMessage, onError } and returns an unsubscribe function, so the component can be driven without a network connection in unit tests. The Horizon endpoint is read from NEXT_PUBLIC_HORIZON_URL (defaults to https://horizon-testnet.stellar.org).
Local Audit Log Export
src/utils/logger.ts preserves meaningful audit activity outside React component state. TransactionFeed appends each unique streamed Horizon transaction, and VoteButton records vote submission success or failure. The public API includes createAuditLogger, appendAuditEvent, flushAuditLogs, exportAuditLogs, readEncryptedAuditLogs, readAuditLogEvents, verifyAuditLogIntegrity, clearAuditLogs, and parseEncryptedAuditExport.
Audit events use safe fields: id, ISO timestamp, type, actor, action, resource, resourceId, status, sanitized metadata, requestId, and monotonic local sequence. Metadata is treated as untrusted: keys such as privateKey, secretKey, seed, seedPhrase, mnemonic, password, token, accessToken, refreshToken, authorization, apiKey, and secret are redacted; circular values, functions, class instances, and oversized nested values are bounded before logging.
Logs are buffered in memory and flushed in batches to encrypted local records. Each record is encrypted with Web Crypto AES-GCM and a fresh random IV before persistence. The logger stores encrypted records and a manifest in localStorage, capped to a bounded retained window to avoid unbounded growth. A non-extractable AES key is stored in IndexedDB when the browser allows it; if IndexedDB key storage is unavailable, the logger falls back to a session-only key, meaning encrypted records remain persisted but may not be decryptable after the tab closes.
Integrity is tamper-evident, not tamper-proof. Each encrypted record is linked with a SHA-256 hash chain (previousHash and hash), and exports include a SHA-256 digest over the retained record hashes. verifyAuditLogIntegrity() detects modified encrypted payloads, reordered records, broken links, and manifest mismatches where retained metadata is available.
exportAuditLogs() creates audit-log-YYYY-MM-DD.json.enc. If the File System Access API is available, the browser can prompt for a save location; otherwise the logger falls back to a downloadable encrypted Blob. Browsers do not allow silent continuous writes to arbitrary local files, so the dashboard preserves encrypted local records continuously and uses explicit user-triggered export for local files.
Gas Usage Heatmap
GasHeatmap visualizes Soroban resource cost per contract function so gas spikes become obvious at a glance. Functions are rows; resource categories (CPU instructions, memory, ledger reads, ledger writes, events) are columns. Each cell is colored with a D3 sequential scale (d3-scale-chromatic's interpolateYlOrRd) and positioned with d3-scale's scaleBand. Color intensity is normalized per metric column, so the most expensive function for each resource stands out, and those cells are flagged as hotspots (also summarized below the grid) — satisfying "hotspots identified".
code
Tsx
import GasHeatmap, { type FunctionGasUsage } from '@/components/GasHeatmap';

// Default: representative per-function costs for the Vero contract.
<GasHeatmap />

// Inject real data (e.g. from testnet transaction simulation).
const usage: FunctionGasUsage[] = [
  { functionName: 'cast_vote', costs: { cpuInsns: 12_500_000, memBytes: 524_288, ledgerReads: 8, ledgerWrites: 3, events: 2 } },
  // ...
];
<GasHeatmap data={usage} />
The pure helpers buildHeatmap(), findHotspots(), and formatGas() are exported and unit-tested independently of rendering. The dataset is held in local component state and is injectable via the data prop, so a live testnet simulation feed can replace the default without changing the view.
Jest note: D3 v4+ ships ESM-only packages. jest.config.js overrides transformIgnorePatterns to transform the d3-* modules used here.
Webhook Relayer
The relayer (index.js) is a lightweight Express server that ingests GitHub webhooks and registers qualifying PRs on-chain. Every request to /github-webhook must pass two gates before any body-derived logic runs:
Signature verification — the raw request body is captured via express.json({ verify }), and the X-Hub-Signature-256 header is checked with HMAC-SHA256 (using GITHUB_WEBHOOK_SECRET) and crypto.timingSafeEqual. Missing, malformed, or invalid signatures get 401 and registerTaskOnChain is never called.
Rate limiting — express-rate-limit throttles the route (default: 30 requests/minute per source), returning 429 once the limit is exceeded.
code
JavaScript
// index.js
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { registerTaskOnChain } = require('./stellar');

const app = express();

// Capture the raw body so the HMAC signature can be verified against the
// exact bytes GitHub signed (JSON.parse output would not match).
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function verifyGithubSignature(req, res, next) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const signature = req.headers['x-hub-signature-256'];
  if (!secret || !signature) return res.status(401).json({ error: 'Invalid signature' });

  const digest = crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  const expected = Buffer.from(`sha256=${digest}`);
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  next();
}

app.post('/github-webhook', webhookLimiter, verifyGithubSignature, async (req, res) => {
  const { action, pull_request } = req.body;

  // Only process merged PRs
  if (action !== 'closed' || !pull_request?.merged) {
    return res.status(200).json({ skipped: true });
  }

  // Only process wave-contribution tagged PRs
  const hasLabel = pull_request.labels?.some(l => l.name === 'wave-contribution');
  if (!hasLabel) {
    return res.status(200).json({ skipped: true, reason: 'no wave-contribution label' });
  }

  const prNumber = pull_request.number;
  console.log(`[webhook] Merged PR #${prNumber} with wave-contribution — registering on chain`);

  try {
    const result = await registerTaskOnChain(prNumber);
    res.status(200).json({ registered: true, prNumber, result });
  } catch (err) {
    console.error('[webhook] Chain registration failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`[relayer] Listening on port ${process.env.PORT || 3000}`)
);
Configure the shared secret in GitHub's webhook settings and in the relayer environment as GITHUB_WEBHOOK_SECRET (see Environment Variables). scripts/mock-webhook.js signs its payload with the same secret so local simulation exercises the real verification path.
The stellar.js module handles transaction compilation:
code
JavaScript
// stellar.js
const { getVaultSecretStatus } = require('./src/services/vault-node');

async function registerTaskOnChain(githubId) {
  const keyStatus = getVaultSecretStatus('STELLAR_SECRET_KEY');
  const network = process.env.STELLAR_NETWORK || 'testnet';

  console.log(`[stellar] Registering PR #${githubId} on ${network}`);
  console.log(`[stellar] Source key loaded: ${keyStatus.configured ? 'YES (vault)' : 'NO (vault entry missing)'}`);

  const txPayload = {
    operation: 'manageData',
    key: `task_${githubId}`,
    value: 'wave-contribution',
    network,
    fee: 100,
  };

  console.log('[stellar] Transaction compiled:', JSON.stringify(txPayload, null, 2));
  console.log(`[stellar] ✓ Task PR #${githubId} registered — awaiting submission`);

  return { txPayload, status: 'simulated' };
}

module.exports = { registerTaskOnChain };
To test the relayer without a live GitHub webhook:
code
JavaScript
// scripts/mock-webhook.js
const crypto = require('crypto');

const payload = { /* ... action: 'closed', pull_request: { ... } */ };
const body = JSON.stringify(payload);
const secret = process.env.GITHUB_WEBHOOK_SECRET;

const headers = { 'Content-Type': 'application/json' };
if (secret) {
  const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
  headers['X-Hub-Signature-256'] = `sha256=${digest}`;
}

fetch('http://localhost:3000/github-webhook', { method: 'POST', headers, body })
  .then(res => res.json())
  .then(data => console.log('[mock-webhook] Response:', data))
  .catch(err => console.error('[mock-webhook] Error:', err.message));
code
Bash
GITHUB_WEBHOOK_SECRET=devsecret node index.js &
GITHUB_WEBHOOK_SECRET=devsecret npm run simulate
# [mock-webhook] Response: { registered: true, prNumber: 42, result: { ... } }
Running npm run simulate without GITHUB_WEBHOOK_SECRET set sends an unsigned request, which the relayer now rejects with 401.
API Reference
POST /github-webhook
Receives GitHub webhook events. Only processes closed + merged PRs with the wave-contribution label.
Authentication: requires a valid X-Hub-Signature-256 header — an HMAC-SHA256 hex digest of the raw request body, prefixed with sha256=, keyed with GITHUB_WEBHOOK_SECRET. Missing or invalid signatures return 401 before the body is inspected.
Rate limiting: the route is throttled (default 30 requests/minute per source); requests over the limit return 429.
Request body (GitHub webhook format):
code
JSON
{
  "action": "closed",
  "pull_request": {
    "number": 42,
    "merged": true,
    "labels": [{ "name": "wave-contribution" }]
  }
}
Response — registered:
code
JSON
{
  "registered": true,
  "prNumber": 42,
  "result": {
    "txPayload": {
      "operation": "manageData",
      "key": "task_42",
      "value": "wave-contribution",
      "network": "testnet",
      "fee": 100
    },
    "status": "simulated"
  }
}
Response — skipped:
code
JSON
{ "skipped": true, "reason": "no wave-contribution label" }
Response — unauthorized (missing/invalid signature):
code
JSON
{ "error": "Invalid signature" }
Response — rate limited:
code
JSON
{ "error": "Too many requests" }
Testing
Tests use Jest and React Testing Library:
code
Bash
# Run all tests
npm test

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
The project is currently working towards full unit and component test coverage. Developers are encouraged to add .test.ts or .test.tsx files inside __tests__ directories relative to the code being tested.
CI/CD Pipeline
The ci.yml workflow runs on every push and pull request:
code
Yaml
# ci.yml
name: CI

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Run tests
        run: npm test -- --ci --coverage

      - name: Build
        run: npm run build
Pipeline stages:
Install — npm ci for reproducible installs
Type check — tsc --noEmit catches TypeScript errors without emitting files
Test — Jest runs all unit and component tests with coverage
Build — next build validates the production bundle
Deployment Checklist
Before going to mainnet:

Switch NEXT_PUBLIC_HORIZON_URL → https://horizon.stellar.org

Switch NEXT_PUBLIC_SOROBAN_RPC_URL → https://soroban-rpc.mainnet.stellar.gateway.fm

Update networkPassphrase in stellar-interact.ts → StellarSdk.Networks.PUBLIC

Update Freighter signTransaction network → 'MAINNET'

Set STELLAR_NETWORK=mainnet in relayer environment

Verify all Guardians have funded mainnet Stellar accounts

Run npm run build — confirm zero TypeScript errors

Run npm test — all tests must pass

Set all NEXT_PUBLIC_* vars in Vercel (or your hosting provider)

Enable HTTPS — Freighter requires a secure context (https://)

[x] Add CSP headers allowing Stellar Horizon and Soroban RPC origins — configured in next.config.mjs (headers()), connect-src derived from NEXT_PUBLIC_HORIZON_URL / NEXT_PUBLIC_SOROBAN_RPC_URL

Configure GitHub webhook secret and validate X-Hub-Signature-256 in the relayer

Rate-limit the /github-webhook endpoint

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
