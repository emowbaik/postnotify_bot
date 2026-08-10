# Security Remediation

- [x] Pin GitHub Actions and Bun to immutable versions.
- [x] Enforce `package-lock.json` with `npm ci`.
- [x] Scope bot secrets to runtime step and disable checkout credential persistence.
- [x] Replace classic `LOOP_TOKEN` self-dispatch with short-lived `GITHUB_TOKEN`.
- [x] Remove broad workflow-run deletion permission.
- [x] Block non-HTTPS and non-public remote image targets.
- [x] Pin validated DNS answers to HTTPS connections and revalidate redirects.
- [x] Stream remote images under byte limits; enforce raster MIME/format and pixel limits.
- [x] Sanitize untrusted platform titles before console logging.
- [x] Ignore all `.env` variants except `.env.example`.
- [x] Update README and SECURITY.md.
- [x] Run full local verification.
- [x] Push safely and run live GitHub Actions journey.

## Review

Local verification passed: 26/26 tests, strict TypeScript, 0 dependency vulnerabilities, valid workflow YAML, and clean diff check. Live run `31388883516` passed every step and dispatched successor `31389309246`; state had no changes, so no state commit was expected. Repository `LOOP_TOKEN` secret was deleted. Account PAT revocation remains user-verifiable only.