# Contributing

Issues and pull requests are welcome.

1. Create a focused branch from `main`.
2. Install Bun 1.4 or newer, then run `bun run check` and `bun test`.
3. Add or update tests for behavior changes.
4. Keep `action.yml`, the English README, and the Chinese README consistent when inputs or outputs change.

The action intentionally has no runtime package dependencies. Prefer APIs supported by both Bun and GitHub's managed Node.js action host unless a dependency provides a clear security or maintenance benefit.
