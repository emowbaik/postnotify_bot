# Lessons

- Audit/report completion is not remediation completion. Say **finding documented** until source/workflow changes exist and acceptance checks pass; say **fixed** only after final-boundary verification.
- Before each targeted edit, compare exact current file context with `HEAD`. If edit tool reports inaccurate context or adds unrelated changes, stop, inspect diff, and restore everything outside approved scope.
- Permission hardening must preserve approved behavior. If a feature needs elevated scope, move it into a secret-free job with narrow job-level permission; do not silently remove the feature.