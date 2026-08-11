# Security Policy and Audit

## Reporting a Vulnerability

Do not open a public issue containing credentials or exploit details. Use the repository's private **Security → Advisories → Report a vulnerability** flow. Revoke any exposed Discord, Google, or GitHub credential before sending the report.

Include affected revision, reproduction steps, impact, and suggested mitigation. Never include a live token in logs, screenshots, or test fixtures.

## Audit Snapshot

- **Initial audit date:** 2026-08-10
- **Initial revision:** `55dc808a7a482f86aebebcfa7546f24466bbcd1d`
- **Re-audit date:** 2026-08-11
- **Re-audit revision:** `7a1ca58a17e50e4b6bb474ab32dcf5ca80eb099a`
- **Final remediation verification date:** 2026-08-11
- **Verified runtime revision:** `236fc50ff316c13d1343fe099e2c5203258b83e3`
- **Scope:** tracked source, reachable history, dependency tree, workflow, live repository settings, integrations, scanners, branch rules, and outbound network boundaries
- **Automated checks:** 39 tests passed; strict TypeScript passed; `npm audit` found 0 known vulnerabilities; all 94 packages have verified registry signatures and 36 verified attestations; workflow security assertions passed; both CodeQL checks passed

| Severity | Open findings | Remediated findings |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 0 | 2 |
| Medium | 0 | 3 |
| Low | 0 | 4 |

> [!IMPORTANT]
> All nine findings are remediated and verified at their final consumer boundaries. Required signed commits remain deferred because current owner and `github-actions[bot]` commits are unsigned; enabling that rule would break protected maintenance or state persistence.

## Open Findings

No open findings.

## Remediated Findings

### SEC-008 — Low — Repository-secret configuration strictly bounded

**Status:** Remediated — pure configuration parsing rejects control/format characters, malformed targets, over-limit lists, invalid Discord snowflakes, and ambiguous or oversized mentions before logging or network use. Discord routes and mentions are revalidated at final send boundaries. Configured and external identifiers use bounded one-line logging, and TikTok identifiers are URL encoded.

**OWASP:** A04 Insecure Design
**CWE:** CWE-20 Improper Input Validation; CWE-117 Improper Output Neutralization for Logs

**Verification:** 34 configuration, Discord, logging, state, API, preview, and orchestration regressions passed on remediation commit `05adb8a`; production repository-secret configuration completed the monitor app/state steps; both CodeQL analyses succeeded. Validation failures name only the affected secret variable and never echo supplied values.

### SEC-009 — Low — Default-branch and operational-state integrity enforced

**Status:** Remediated — active zero-bypass ruleset `20684394` protects `master` from deletion, force pushes, and direct changes; all changes require a pull request plus strict GitHub CodeQL checks `Analyze (actions)` and `Analyze (javascript-typescript)` from Integration ID `15368`. Active zero-bypass ruleset `20685862` protects `refs/heads/postnotify-state` from deletion and non-fast-forward pushes while permitting ordinary fast-forward runtime commits.

**OWASP:** A08 Software and Data Integrity Failures
**CWE:** CWE-353 Missing Support for Integrity Check

**Verification:** divergent owner pushes to `master` returned `GH013` and required PR plus both checks. PR [#1](https://github.com/emowbaik/postnotify_bot/pull/1) proved the protected merge journey; PR [#2](https://github.com/emowbaik/postnotify_bot/pull/2) merged the state architecture after both CodeQL checks passed. State branch force-push and deletion probes returned `GH013`; normal fast-forward writes passed. Under both active rulesets, production run `31478492426` loaded state, ran the app, and persisted state successfully. `github-actions[bot]` commit `a34105d39c0a0eb20c0735180b552b95291caf89` descends directly from canary `7a2876de07aa35b5701982679b9b1cca791d3e96`, removed only the ignored `verificationCanary`, preserved four active sessions/four active video mappings/zero platform errors, and left `master` fixed at `236fc50ff316c13d1343fe099e2c5203258b83e3`.

GitHub rejected GitHub Actions Integration ID `15368` as a bypass actor on this user-owned repository (`HTTP 422`). RepositoryRole administrator bypass was tested and rejected as final design because it would let the owner bypass every rule. Required signed commits remain deferred until both owner maintenance and automated state commits can produce verified signatures.

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
- Runtime state is loaded from an exact `postnotify-state` commit and stale runs refuse to overwrite newer branch state.
- Workflow token permissions are explicit; unspecified permissions default to none.
- Both branch rulesets are active with zero bypass actors; direct, force, and deletion probes fail closed.

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

- Remediation workflow revision `236fc50ff316c13d1343fe099e2c5203258b83e3` reached production through CodeQL-approved PR [#2](https://github.com/emowbaik/postnotify_bot/pull/2).
- Production run [`31478492426`](https://github.com/emowbaik/postnotify_bot/actions/runs/31478492426) completed checkout, exact state load, dependency installation, live monitoring, dedicated state persistence, five-minute wait, and self-dispatch successfully under both active rulesets.
- State commit `a34105d39c0a0eb20c0735180b552b95291caf89` was authored by `github-actions[bot]`, fast-forwarded canary `7a2876de07aa35b5701982679b9b1cca791d3e96`, removed the ignored canary, and left source revision unchanged.
- Cleanup job `93737733511` completed successfully without checkout or bot/API secrets; CodeQL check history remained available.
- Self-dispatch created successor run [`31478909191`](https://github.com/emowbaik/postnotify_bot/actions/runs/31478909191) on the same protected source revision.
- Repository secret `LOOP_TOKEN` remains deleted. Account-level PAT revocation cannot be verified through repository APIs and remains a manual account action.
- Repository-wide default workflow permission remains read-only; job permissions are explicit.

### Repository Security Services

- Secret scanning and push protection are enabled; current open alerts: 0.
- Dependabot vulnerability alerts and automatic security-update PRs are enabled and unpaused; current open alerts: 0; current open Dependabot PRs: 0.
- CodeQL default setup is enabled for GitHub Actions and JavaScript/TypeScript with weekly scans; initial run [`31393645930`](https://github.com/emowbaik/postnotify_bot/actions/runs/31393645930) completed successfully; current open alerts: 0.
- Non-provider patterns and validity checks remain unavailable: GitHub returned HTTP 200 for exact enable requests but retained `disabled`. GitHub documents validity checks as requiring an organization-owned Team/Enterprise repository with GitHub Secret Protection; this repository is user-owned and public. Enabling them requires moving the repository to an eligible organization and licensing Secret Protection.

Security probes must use local mock servers and fake credentials. Never target production metadata services or include real secrets in fixtures.