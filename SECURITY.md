# Security Policy

Vero Guardian Dashboard is security tooling — its whole purpose is to help
projects review code and track verifiable trust — so we take reports of
vulnerabilities seriously and ask that you report them responsibly.

## Reporting a Vulnerability

**Do not open a public issue with exploit details.** Please report suspected
vulnerabilities privately through GitHub's private vulnerability reporting:

- [Report a vulnerability](https://github.com/Vero-protocol/vero-guardian-dashboard/security/advisories/new)

If the advisory form is unavailable, open an issue on the
[issue tracker](https://github.com/Vero-protocol/vero-guardian-dashboard/issues)
with a `[Security]` prefix in the title and keep the body free of exploit
code or reproduction steps that disclose the flaw — a maintainer will follow
up privately.

When you report, please include as much of the following as you can:

- The affected component or module (e.g. the relayer, an API route, a scanner
  parser, a wallet provider) and the version or commit you tested
- A description of the vulnerability and its impact
- Steps to reproduce (kept private), including any proof-of-concept
- Any suggested fix or mitigation, if you have one

Do **not** include secrets, credentials, or real private keys in your report.

## Response and Disclosure

We follow a coordinated-disclosure process:

1. **Acknowledgment** — we will acknowledge your report within **2 business
   days**.
2. **Triage** — we will assess severity and scope within **5 business days**
   and let you know our plan.
3. **Fix** — critical and high-severity issues are prioritized; timelines
   depend on severity and complexity. Fixes land on `main` and in the next
   release.
4. **Disclosure** — after a fix ships, we publish a GitHub security advisory
   describing the issue. We will credit you for the report (with your
   consent) and will not publicly disclose your report before the fix is
   available.

If you believe the issue is in a dependency rather than this project, please
also report it to the upstream project (e.g. Next.js, `@stellar/stellar-sdk`,
Express) where applicable.

## Supported Versions

The project is pre-1.0 and does not yet publish stable releases. Only the
latest state of `main` is supported:

| Version | Supported |
| --- | --- |
| `main` (latest) | ✅ Supported |
| Older commits / forks | ❌ Not supported |

## Scope

This policy covers the Vero Guardian Dashboard codebase, including:

- The relayer (`index.js`, `stellar.js`) and webhook signature verification
- API routes under `src/app/api` (e.g. vault, push, prs)
- Sanitizer and parser hardening in the security scanner and Diff Engine
  (`src/components/security`, `src/utils/diff.ts`, `src/audit-guard`)
- Wallet provider adapters and transaction building
- Dependency and supply-chain issues affecting the app

Recent fixes in these areas include a critical Next.js middleware auth-bypass
CVE patch, `npm audit` critical CVE and CodeQL alert remediation, and
sanitizer hardening against nested/script-tag bypasses — issues of this kind
should route through the process above.
