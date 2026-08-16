# Security Policy

The Vero Protocol team takes the security of our software and the safety of our users seriously. We appreciate the efforts of security researchers and community members who responsibly disclose vulnerabilities.

---

## Supported Versions

Only the latest active version on the main branch is actively maintained with security updates and patches.

| Version / Branch | Supported          | Notes                              |
| ---------------- | ------------------ | ---------------------------------- |
| `main`           | :white_check_mark: | Actively supported and maintained  |
| `< 1.0.0`        | :x:                | Pre-release / unsupported          |

---

## Reporting a Vulnerability

If you discover a security vulnerability in the Vero Guardian Dashboard, relayer, or associated modules, please disclose it responsibly. **Do not create public GitHub issues or discussions for security vulnerabilities.**

### Disclosure Channels

Please report security issues using one of the following methods:

1. **GitHub Security Advisory (Recommended):** Submit a private vulnerability report directly through the repository via [GitHub Security Advisories](https://github.com/Vero-protocol/vero-guardian-dashboard/security/advisories/new).
2. **Email Disclosure:** Send details to the security team at **`security@vero-protocol.org`** (or open an encrypted report with the core maintainers).

### What to Include in Your Report

To help us triage and resolve the issue quickly, please include:
- A clear description of the vulnerability and its potential impact.
- Steps to reproduce the issue (proof-of-concept code, HTTP requests, or step-by-step reproduction instructions).
- Component(s) affected (e.g., Relayer webhook ingestion, authentication middleware, client-side wallet connectors, or sanitizer routines).
- Any proposed remediation or patch, if available.

---

## Response & Disclosure Process

When a vulnerability report is received:

1. **Acknowledgment:** We will acknowledge receipt of your report within **48 hours**.
2. **Triage & Assessment:** The security team will investigate and assess severity, typically within **3 to 5 business days**.
3. **Fix & Verification:** We will develop and verify a patch in a private fork or advisory workspace.
4. **Coordinated Disclosure:** Once the fix is verified and deployed, a public security advisory and CVE (if applicable) will be released with appropriate credit to the reporter.

---

## Scope & Security Best Practices

### In Scope
- Webhook signature verification and anti-forgery (`X-Hub-Signature-256`, HMAC-SHA256).
- Authentication and authorization bypasses in API routes (`/api/*`).
- Input validation, XSS, and HTML/script injection in scanner result modules and dynamic UI feeds.
- Relayer secret handling and secure hardware/vault storage interfaces.
- Wallet interaction security (Freighter/Rabet transaction serialization and validation).

### Out of Scope / Exclusions
- Denial of Service attacks against rate-limited public endpoints that do not result in service disruption or memory exhaustion.
- Attacks requiring physical access to a compromised client device or local browser storage tampering.
- Theoretical issues without demonstrable security impact.

---

Thank you for helping keep Vero Guardian Dashboard and the Stellar community safe!
