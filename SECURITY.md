# Security Policy and Audit

## Reporting a Vulnerability

Do not open a public issue containing credentials or exploit details. Use the repository's private **Security → Advisories → Report a vulnerability** flow. Revoke any exposed Discord, Google, or GitHub credential before sending the report.

Include affected revision, reproduction steps, impact, and suggested mitigation. Never include a live token in logs, screenshots, or test fixtures.

## Audit Snapshot

- **Date:** 2026-08-10
- **Revision:** `55dc808a7a482f86aebebcfa7546f24466bbcd1d`
- **Scope:** tracked source, tests, workflow, dependency manifests, current Git history, and outbound network boundaries
- **Automated checks:** 19 tests passed; strict TypeScript passed; `npm audit` found 0 known vulnerabilities

| Severity | Open findings |
|---|---:|
| Critical | 0 |
| High | 2 |
| Medium | 3 |
| Low | 2 |

> [!IMPORTANT]
> No committed credential or known vulnerable npm package was found. Open findings are workflow hardening and outbound-network issues; they still require remediation.

## Open Findings

### SEC-001 — High — Mutable actions run with broad credentials

**OWASP:** A08 Software and Data Integrity Failures
**CWE:** CWE-829 Inclusion of Functionality from Untrusted Control Sphere

[`.github/workflows/live-monitor.yml`](.github/workflows/live-monitor.yml) references `actions/checkout@v4`, `oven-sh/setup-bun@v2`, and `liskin/gh-workflow-keepalive@v1`. Tags are mutable; only a verified full commit SHA is immutable. The main job also exposes ten repository secrets through job-level `env`, grants `contents: write` and `actions: write`, and persists checkout credentials.

A compromised action tag can read bot/API credentials, use the job token, alter later steps, and potentially capture `LOOP_TOKEN` when the trigger step runs.

**Fix:**

1. Pin every action to a reviewed full 40-character commit SHA.
2. Move bot/API secrets from job-level `env` to the live-check step only.
3. Split monitoring, state push, and run cleanup into separate jobs: monitoring gets only `contents: read`, state push gets only `contents: write`, and cleanup gets only `actions: write`.
4. Set checkout `persist-credentials: false` outside the isolated state-push job.
5. Pin the Bun runtime to a reviewed exact version.

### SEC-002 — High — Unnecessary long-lived classic PAT with `repo` scope

**OWASP:** A01 Broken Access Control
**CWE:** CWE-250 Execution with Unnecessary Privileges

[`README.md`](README.md) instructs users to create a classic PAT with full `repo` scope, and the workflow stores it as `LOOP_TOKEN`. Current GitHub documentation states that `repository_dispatch` triggered with the repository `GITHUB_TOKEN` **does create** another workflow run. The job already has `contents: write`, so a separate broad, long-lived PAT is unnecessary.

Compromise of this PAT can expose every repository granted to it, not only this workflow.

**Fix:** use `${{ github.token }}` for `POST /repos/{owner}/{repo}/dispatches`, remove `LOOP_TOKEN` from workflow and documentation, then revoke the existing PAT. If a separate identity remains necessary, use a repository-scoped fine-grained PAT or GitHub App with only required permission and expiry.

### SEC-003 — Medium — Remote image downloader permits SSRF

**OWASP:** A10 Server-Side Request Forgery
**CWE:** CWE-918 Server-Side Request Forgery

[`downloadImage()`](src/discord/thumbnail-generator.ts) accepts any `http:` or `https:` URL and follows redirects by default. A local audit probe supplied `http://127.0.0.1:<port>/internal-image`; the generator made the request and rendered the returned image.

A malicious or compromised platform response can make the GitHub runner request loopback, private-network, link-local, or metadata endpoints. A valid image response may then be uploaded to Discord.

**Fix:** require HTTPS where supported, resolve hostnames, reject loopback/private/link-local/reserved addresses for IPv4 and IPv6, disable automatic redirects, and repeat validation for every redirect target. Prefer explicit platform CDN allowlists where stable.

### SEC-004 — Medium — Image size limit applies after full buffering

**OWASP:** A04 Insecure Design
**CWE:** CWE-400 Uncontrolled Resource Consumption

When `Content-Length` is missing or false, [`downloadImage()`](src/discord/thumbnail-generator.ts) calls `response.arrayBuffer()` before checking the 15 MiB limit. A fast chunked response can consume much more memory before rejection. Compressed images also lack an explicit pixel/dimension limit before Sharp processing.

**Fix:** stream response body, count bytes, cancel immediately above 15 MiB, validate an expected image content type, and set conservative Sharp input pixel/dimension limits. Keep current timeout as defense in depth.

### SEC-005 — Medium — Dependency installation can abandon frozen resolution

**OWASP:** A08 Software and Data Integrity Failures
**CWE:** CWE-494 Download of Code Without Integrity Check

The workflow runs:

```sh
bun install --frozen-lockfile || bun install
```

Repository tracks `package-lock.json`, not `bun.lock`. Bun may migrate the npm lockfile, but the fallback explicitly accepts an unfrozen install. Semver ranges can then resolve newer package code than the reviewed lockfile. Current lock hashes are present, but this workflow path does not guarantee they remain authoritative.

**Fix:** either run `npm ci` against committed `package-lock.json`, or generate and review `bun.lock`, commit it, and run only `bun install --frozen-lockfile`. Never fall back to an unlocked install in CI.

### SEC-006 — Low — Common environment files are not ignored

**CWE:** CWE-312 Cleartext Storage of Sensitive Information

[`.gitignore`](.gitignore) ignores `.env` only. Bun commonly loads `.env.local`, `.env.development`, `.env.production`, and `.env.test`; none currently match an ignore rule and each can be committed accidentally.

**Fix:** ignore `.env*` and explicitly allow a secret-free `.env.example` if needed. No tracked environment file or credential was found during this audit.

### SEC-007 — Low — Platform text can inject forged workflow log lines

**CWE:** CWE-117 Improper Output Neutralization for Logs

TikTok and YouTube titles are written directly to GitHub Actions logs. Titles containing newlines can create forged lines such as `::warning::...`, distort audit trails, or invoke supported runner log commands.

**Fix:** replace CR/LF and other control characters before logging, cap logged lengths, and serialize untrusted values as one-line JSON. Discord payload and preview rendering can retain the original normalized text.

## Controls That Passed

- No Google API key, GitHub token, Discord bot token, private key, or tracked `.env` file found in current files.
- High-confidence credential scan across reachable Git history found no match.
- `npm audit`: 0 critical, high, moderate, low, or informational advisories across 94 installed dependencies.
- No `eval`, dynamic `Function`, child-process execution, SQL query, DOM injection sink, `pull_request_target`, force push, or untrusted event interpolation found.
- SVG text uses XML escaping before Sharp rendering.
- Discord `allowed_mentions` restricts pings to explicitly configured role/user/everyone mentions.
- YouTube errors are normalized; API keys are not logged in request URLs or error messages.
- External Discord, TikTok, YouTube, and image requests have deadlines.
- State path is fixed in production, corrupt state is preserved, and writes use same-directory atomic rename.
- Workflow token permissions are explicit; unspecified permissions default to none.

## Verification Commands

```sh
npm test
npm run typecheck
npm audit --json
git status --short
git diff --check
```

Security probes must use local mock servers and fake credentials. Never target production metadata services or include real secrets in fixtures.