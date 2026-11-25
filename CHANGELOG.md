# Changelog

## [Unreleased]

## [1.1.1] - 2026-11-26

Update the default Nginx Formatter from v2.6.1 to the already published v2.6.3.

- Pin SHA-256 checksums for Darwin/Linux AMD64 and ARM64 v2.6.3 binaries.
- Keep check mode read-only and write mode's complete-pass-before-replace behavior.
- Refresh Bun validation dependencies and workflow Actions.

The Action inputs are unchanged. Explicit `version` inputs keep selecting that version; omitted versions now select v2.6.3. Users requiring exact output should pin both this Action and the formatter version.
