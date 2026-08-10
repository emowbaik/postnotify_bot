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

## Review

Security remediation verification remains passed: 26/26 tests, strict TypeScript, 0 dependency vulnerabilities, valid workflow YAML, isolated permissions, and clean diff checks. Workflow-run cleanup was restored in commits `ab15e01` and `8c69f0c`. Live cleanup reduced monitor history from 108 runs to one active run and zero completed runs. Live job `93619766209` deleted completed runs `31439004948` and `31438703329` while preserving active run `31439095109`; CodeQL retained all eight completed runs. Repository `LOOP_TOKEN` secret remains deleted. Account PAT revocation remains user-verifiable only.