# Security Remediation

- [x] Pin GitHub Actions and Bun to immutable versions.
- [x] Enforce `package-lock.json` with `npm ci`.
- [x] Scope bot secrets to runtime step and disable checkout credential persistence.
- [x] Replace classic `LOOP_TOKEN` self-dispatch with short-lived `GITHUB_TOKEN`.
- [x] Isolate permanent workflow-run cleanup in a secret-free job with only `actions: write`.
- [x] Block non-HTTPS and non-public remote image targets.
- [x] Pin validated DNS answers to HTTPS connections and revalidate redirects.
- [x] Stream remote images under byte limits; enforce raster MIME/format and pixel limits.
- [x] Sanitize untrusted platform titles before console logging.
- [x] Ignore all `.env` variants except `.env.example`.
- [x] Update README and SECURITY.md.
- [x] Run full local verification.
- [x] Push safely and run live GitHub Actions journey.

## Workflow Run Cleanup Restoration

- [x] Restore completed-run deletion for `live-monitor.yml` in a separate least-privilege job.
- [x] Update README and security traceability without weakening credential boundaries.
- [x] Validate YAML, permission isolation, TypeScript, tests, and dependency audit.
- [x] Publish and run one live cleanup journey.
- [x] Verify old monitor runs are deleted while active/current run and other workflows remain.
- [x] Verify default-branch sync, required checks, alerts, PRs, and clean working tree.

## SEC-008 and SEC-009 Closure

- [x] Validate and bound every repository-secret configuration input.
- [x] Sanitize configured and external identifiers at log boundaries.
- [x] Revalidate Discord routes and mentions at final send boundaries.
- [x] Move runtime state to dedicated non-code `postnotify-state` history.
- [x] Protect `postnotify-state` against deletion and force pushes with zero bypasses.
- [x] Protect `master` through PRs and two strict CodeQL checks with zero bypasses.
- [x] Prove owner direct push, state force push, and state deletion are rejected.
- [x] Prove normal state fast-forward and automated bot persistence succeed.
- [x] Run production canary through app, state, wait, successor, and cleanup.
- [x] Verify alerts, PRs, temporary branches, local sync, and working tree.

## Review

All nine audit findings are remediated. Final gate: 39/39 tests, strict TypeScript, 0 dependency vulnerabilities, 94/94 verified package signatures, 36 attestations, valid workflow YAML, both CodeQL analyses successful, and zero open secret/Dependabot/code-scanning alerts. Rulesets `20684394` and `20685862` are active with zero bypasses. Protected production run `31478492426` created bot state commit `a34105d`, removed deterministic canary `7a2876d`, preserved runtime state, completed wait/self-dispatch, and created successor `31478909191`; cleanup job `93737733511` succeeded. Open PRs and temporary remote branches are zero. Account PAT revocation and real active-YouTube observation remain outside repository-verifiable closure.