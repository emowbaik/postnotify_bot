# Security Policy and Audit

## Reporting a Vulnerability

Do not open a public issue containing credentials or exploit details. Use the repository's private **Security → Advisories → Report a vulnerability** flow. Revoke any exposed Discord, Google, or GitHub credential before sending the report.

Include affected revision, reproduction steps, impact, and suggested mitigation. Never include a live token in logs, screenshots, or test fixtures.

## Audit Snapshot

- **Initial audit date:** 2026-08-10
- **Initial revision:** `55dc808a7a482f86aebebcfa7546f24466bbcd1d`
- **Remediation verification date:** 2026-08-10
- **Re-audit date:** 2026-08-11
- **Re-audit revision:** `7a1ca58a17e50e4b6bb474ab32dcf5ca80eb099a`
- **Scope:** 31 tracked files, 189 reachable commits, dependency tree, workflow, live repository settings, integrations, scanners, and outbound network boundaries
- **Automated checks:** 26 tests passed; strict TypeScript passed; `npm audit` found 0 known vulnerabilities; all 94 packages have verified registry signatures; workflow security assertions passed; CodeQL checks passed

| Severity | Open findings | Remediated findings |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 0 | 2 |
| Medium | 0 | 3 |
| Low | 2 | 2 |

> [!IMPORTANT]
> All seven historical findings remain remediated. Re-audit found two low-severity defense-in-depth gaps below; neither exposes a credential by itself, and neither is recorded as fixed.

## Open Findings

### SEC-008 — Low — Repository-secret configuration lacks strict bounds

**Status:** Open — configured targets, Discord IDs, and mentions are checked mainly for presence. Multiline TikTok targets can create command-shaped GitHub Actions log lines, while oversized mentions can build Discord payloads beyond the platform content limit. Exploitation requires repository-secret administration, which already grants privileged configuration access.

**OWASP:** A04 Insecure Design
**CWE:** CWE-20 Improper Input Validation; CWE-117 Improper Output Neutralization for Logs

[`src/config/env.ts`](src/config/env.ts) should enforce conservative character sets, counts, and lengths for TikTok usernames, Discord snowflakes, mentions, and CSV aggregates. Every configured or platform-supplied value written to logs should pass through [`safeLogValue()`](src/log.ts). Add regressions for multiline targets and oversized mentions.

### SEC-009 — Low — Default branch accepts unsigned direct pushes

**Status:** Open — live settings show no branch protection or ruleset, no required status checks, and the latest 30 commits are unsigned. Only owner `emowbaik` currently has direct access, limiting exposure.

**OWASP:** A08 Software and Data Integrity Failures
**CWE:** CWE-353 Missing Support for Integrity Check

Add a `master` branch ruleset requiring pull requests, successful CodeQL checks, conversation resolution, and no force-push/deletion. Evaluate verified-signature enforcement against automated `state.json` commits before enabling it so monitoring remains operational.

## Remediated Findings

### SEC-001 — High — Mutable actions ran with broad credentials

**Status:** Remediated — Actions use reviewed immutable SHAs, Bun is exact-pinned, bot/API secrets exist only on the monitoring step, checkout does not persist credentials, and the credential-bearing monitor job has no `actions: write`. Permanent run cleanup is preserved in a separate job with only `actions: write`, no checkout, and no bot/API secrets. Monitoring and state persistence remain one queued job deliberately: splitting after Discord delivery would weaken the final state boundary and risk duplicate notifications.

**OWASP:** A08 Software and Data Integrity Failures
**CWE:** CWE-829 Inclusion of Functionality from Untrusted Control Sphere

[`.github/workflows/live-monitor.yml`](.github/workflows/live-monitor.yml) references `actions/checkout@v4`, `oven-sh/setup-bun@v2`, and `liskin/gh-workflow-keepalive@v1`. Tags are mutable; only a verified full commit SHA is immutable. The main job also exposes ten repository secrets through job-level `env`, grants `contents: write` and `actions: write`, and persists checkout credentials.

A compromised action tag can read bot/API credentials, use the job token, alter later steps, and potentially capture `LOOP_TOKEN` when the trigger step runs.

**Fix:**

1. Pin every action to a reviewed full 40-character commit SHA.
2. Move bot/API secrets from job-level `env` to the live-check step only.
3. Move run deletion and its `actions: write` into a separate secret-free job without checkout.
4. Set checkout `persist-credentials: false`; inject the short-lived token only into state and dispatch steps.
5. Pin the Bun runtime to a reviewed exact version.

### SEC-002 — High — Removed unnecessary long-lived classic PAT with `repo` scope

**Status:** Remediated — self-dispatch uses `${{ github.token }}` and application/workflow/documentation contain no `LOOP_TOKEN` dependency. Repository secret deletion and account PAT revocation are deployment actions, not source claims.

**OWASP:** A01 Broken Access Control
**CWE:** CWE-250 Execution with Unnecessary Privileges

[`README.md`](README.md) instructs users to create a classic PAT with full `repo` scope, and the workflow stores it as `LOOP_TOKEN`. Current GitHub documentation states that `repository_dispatch` triggered with the repository `GITHUB_TOKEN` **does create** another workflow run. The job already has `contents: write`, so a separate broad, long-lived PAT is unnecessary.

Compromise of this PAT can expose every repository granted to it, not only this workflow.

**Fix:** use `${{ github.token }}` for `POST /repos/{owner}/{repo}/dispatches`, remove `LOOP_TOKEN` from workflow and documentation, then revoke the existing PAT. If a separate identity remains necessary, use a repository-scoped fine-grained PAT or GitHub App with only required permission and expiry.

### SEC-003 — Medium — Remote image SSRF blocked

**Status:** Remediated — image URLs require HTTPS, credentials and custom ports are rejected, every DNS answer must be public, validated addresses are pinned into TLS lookup, and every redirect is resolved and validated again.

**OWASP:** A10 Server-Side Request Forgery
**CWE:** CWE-918 Server-Side Request Forgery

[`downloadImage()`](src/discord/thumbnail-generator.ts) accepts any `http:` or `https:` URL and follows redirects by default. A local audit probe supplied `http://127.0.0.1:<port>/internal-image`; the generator made the request and rendered the returned image.

A malicious or compromised platform response can make the GitHub runner request loopback, private-network, link-local, or metadata endpoints. A valid image response may then be uploaded to Discord.

**Fix:** require HTTPS where supported, resolve hostnames, reject loopback/private/link-local/reserved addresses for IPv4 and IPv6, disable automatic redirects, and repeat validation for every redirect target. Prefer explicit platform CDN allowlists where stable.

### SEC-004 — Medium — Image buffering and decompression limits enforced

**Status:** Remediated — body streaming stops immediately above 15 MiB, declared oversized responses are rejected before reads, raster MIME/format checks reject SVG, and Sharp enforces a 40-million-pixel ceiling.

**OWASP:** A04 Insecure Design
**CWE:** CWE-400 Uncontrolled Resource Consumption

When `Content-Length` is missing or false, [`downloadImage()`](src/discord/thumbnail-generator.ts) calls `response.arrayBuffer()` before checking the 15 MiB limit. A fast chunked response can consume much more memory before rejection. Compressed images also lack an explicit pixel/dimension limit before Sharp processing.

**Fix:** stream response body, count bytes, cancel immediately above 15 MiB, validate an expected image content type, and set conservative Sharp input pixel/dimension limits. Keep current timeout as defense in depth.

### SEC-005 — Medium — Frozen dependency resolution enforced

**Status:** Remediated — workflow runs only `npm ci` against tracked `package-lock.json`; unlocked fallback was removed.

**OWASP:** A08 Software and Data Integrity Failures
**CWE:** CWE-494 Download of Code Without Integrity Check

The workflow runs:

```sh
bun install --frozen-lockfile || bun install
```

Repository tracks `package-lock.json`, not `bun.lock`. Bun may migrate the npm lockfile, but the fallback explicitly accepts an unfrozen install. Semver ranges can then resolve newer package code than the reviewed lockfile. Current lock hashes are present, but this workflow path does not guarantee they remain authoritative.

**Fix:** either run `npm ci` against committed `package-lock.json`, or generate and review `bun.lock`, commit it, and run only `bun install --frozen-lockfile`. Never fall back to an unlocked install in CI.

### SEC-006 — Low — Common environment files ignored

**Status:** Remediated — `.env*` is ignored and `.env.example` is the sole explicit exception.

**CWE:** CWE-312 Cleartext Storage of Sensitive Information

[`.gitignore`](.gitignore) ignores `.env` only. Bun commonly loads `.env.local`, `.env.development`, `.env.production`, and `.env.test`; none currently match an ignore rule and each can be committed accidentally.

**Fix:** ignore `.env*` and explicitly allow a secret-free `.env.example` if needed. No tracked environment file or credential was found during this audit.

### SEC-007 — Low — Platform log injection neutralized

**Status:** Remediated — external titles are converted to one control-free, whitespace-normalized, 300-character, JSON-serialized value before console output. Discord and preview values remain unchanged.

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
npm ci --ignore-scripts
npm run typecheck
npm test
npm audit --omit=dev
git diff --check
```

Remediation regressions prove private/local targets are rejected before network requests, public DNS answers pass, redirects are revalidated, oversized streams stop at the sixteenth 1 MiB chunk, SVG is rejected before body consumption, and command-shaped titles remain one bounded JSON log value.

### Live GitHub Actions Verification

- Hardened run [`31388883516`](https://github.com/emowbaik/postnotify_bot/actions/runs/31388883516) completed successfully on remediation commit `7a90d5f`.
- Pinned Bun `1.3.14`, `npm ci`, monitoring, state step, five-minute wait, and `${{ github.token }}` self-dispatch all completed successfully.
- Monitor result was 0 live, 3 offline, 0 errors; no state change occurred, so the successful state step correctly produced no commit.
- Self-dispatch created successor run [`31389309246`](https://github.com/emowbaik/postnotify_bot/actions/runs/31389309246) on latest `master`; its setup, install, monitor, and state steps also succeeded.
- Completed run logs contained zero `LOOP_TOKEN`, GitHub PAT prefix, raw Discord token assignment, raw YouTube key assignment, or bearer-header matches.
- Repository secret `LOOP_TOKEN` was deleted and absence verified. Account-level PAT revocation cannot be verified through repository APIs and remains a manual account action.
- Repository-wide default workflow permission remains read-only; job permissions are explicit.

### Repository Security Services

- Secret scanning and push protection are enabled; current open alerts: 0.
- Dependabot vulnerability alerts and automatic security-update PRs are enabled and unpaused; current open alerts: 0; current open Dependabot PRs: 0.
- CodeQL default setup is enabled for GitHub Actions and JavaScript/TypeScript with weekly scans; initial run [`31393645930`](https://github.com/emowbaik/postnotify_bot/actions/runs/31393645930) completed successfully; current open alerts: 0.
- Non-provider patterns and validity checks remain unavailable: GitHub returned HTTP 200 for exact enable requests but retained `disabled`. GitHub documents validity checks as requiring an organization-owned Team/Enterprise repository with GitHub Secret Protection; this repository is user-owned and public. Enabling them requires moving the repository to an eligible organization and licensing Secret Protection.

Security probes must use local mock servers and fake credentials. Never target production metadata services or include real secrets in fixtures.