# Lessons

- Audit/report completion is not remediation completion. Say **finding documented** until source/workflow changes exist and acceptance checks pass; say **fixed** only after final-boundary verification.
- Before each targeted edit, compare exact current file context with `HEAD`. If edit tool reports inaccurate context or adds unrelated changes, stop, inspect diff, and restore everything outside approved scope.