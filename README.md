# Nginx Format Action

[![CI](https://github.com/soulteary/nginx-format-action/actions/workflows/ci.yml/badge.svg)](https://github.com/soulteary/nginx-format-action/actions/workflows/ci.yml)

Check or format Nginx configuration files in GitHub Actions with
[soulteary/nginx-formatter](https://github.com/soulteary/nginx-formatter).

The action downloads an official formatter release, verifies its SHA-256 checksum, and runs it on an isolated copy of your configuration. `check` mode never changes the workspace. `write` mode only replaces files after the complete formatting pass succeeds and preserves their permissions.

[中文文档](README_CN.md)

## Quick start

The recommended pull-request workflow fails when a configuration is not formatted:

```yaml
name: Nginx format

on:
  pull_request:
    paths:
      - "**/*.conf"

permissions:
  contents: read

jobs:
  format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: soulteary/nginx-format-action@v1
        with:
          path: nginx
          mode: check
```

To format files in a workflow without committing them automatically:

```yaml
- uses: soulteary/nginx-format-action@v1
  with:
    path: nginx/nginx.conf
    mode: write
    indent: 4
    indent-char: space
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `path` | `.` | A file or directory inside `GITHUB_WORKSPACE`. Directories are scanned recursively for regular `.conf` files; symlinks are skipped. A single file can use any extension. |
| `mode` | `check` | `check` reports differences and fails; `write` applies formatting in place. |
| `indent` | `2` | Indentation width from 1 to 16. |
| `indent-char` | `space` | `space`, `tab`, `\s`, or `\t`. |
| `version` | `v2.2.0` | Exact `nginx-formatter` release version. Pinning makes runs reproducible. |
| `annotations` | `true` | Add workflow annotations for changed files. |

## Outputs

| Output | Description |
| --- | --- |
| `changed` | `true` when formatting differs, otherwise `false`. |
| `changed-files` | Newline-separated paths that differ. |
| `formatter-version` | Formatter version used by the action. |

Outputs remain available when a `check` step uses `continue-on-error: true`:

```yaml
- id: nginx-format
  continue-on-error: true
  uses: soulteary/nginx-format-action@v1

- if: always()
  run: echo '${{ steps.nginx-format.outputs.changed-files }}'
```

## Behavior and security

- Supports Linux and macOS runners on x64 and arm64, matching upstream release assets. Windows is not supported because `nginx-formatter` does not currently publish Windows binaries.
- Rejects targets outside `GITHUB_WORKSPACE`.
- Verifies the release archive against the upstream checksum file before execution. The default v2.2.0 assets are also checked against digests pinned in this action's source.
- Uses `RUNNER_TOOL_CACHE` to avoid downloading the same verified formatter version repeatedly in a job.
- Formats a temporary copy first. Parse or download failures do not partially modify the workspace.
- Copies only regular `.conf` files for directory targets, avoiding unrelated checkout data and symlink escapes.
- Preserves existing file permissions in `write` mode.
- Does not commit or push changes and does not require write permissions.

For the most reproducible supply chain, pin both this action and the formatter version. A major tag is convenient, while a full action commit SHA is immutable.

## Development

Node.js 24 or newer is required. The action has no runtime npm dependencies.

```bash
npm run check
npm test
```

The CI workflow also runs the action itself against formatted and unformatted fixtures.

## License

[Apache License 2.0](LICENSE)
