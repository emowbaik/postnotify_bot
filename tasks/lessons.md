# Lessons

- Audit/report completion is not remediation completion. Say **finding documented** until source/workflow changes exist and acceptance checks pass; say **fixed** only after final-boundary verification.
- Before each targeted edit, compare exact current file context with `HEAD`. If edit tool reports inaccurate context or adds unrelated changes, stop, inspect diff, and restore everything outside approved scope.
- Treat nonzero pipeline output as failure even when later PowerShell statements reset `$LASTEXITCODE`; use `$ErrorActionPreference = 'Stop'` or explicit exit checks after every required command.
- Never use broad multi-replacement for an identifier such as `username` when only interpolation sites need sanitizing. Target complete log statements; compile immediately after each boundary file.
- Pure validation tests must import dependency-free parser/validator modules, not runtime wrappers that eagerly read `process.env` or import `.js` production modules under Node's TypeScript stripping mode.
- Permission hardening must preserve approved behavior. If a feature needs elevated scope, move it into a secret-free job with narrow job-level permission; do not silently remove the feature.