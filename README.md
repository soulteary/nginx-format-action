# Nginx Format Action

[![CI](https://github.com/soulteary/nginx-format-action/actions/workflows/ci.yml/badge.svg)](https://github.com/soulteary/nginx-format-action/actions/workflows/ci.yml)

Check or format Nginx configuration files in GitHub Actions with
[soulteary/nginx-formatter](https://github.com/soulteary/nginx-formatter).

The action downloads an official formatter release, verifies its SHA-256 checksum, and runs it on an isolated copy of your configuration. `check` mode never changes the workspace. `write` mode only replaces files after the complete formatting pass succeeds and preserves their permissions.

[中文文档](README_CN.md)

## What's new in v1.1.0

- The default formatter moves from `v2.3.0` to `v2.6.1`. It no longer adds a blank line between the last `location` block and its parent's closing brace, or a space before the closing parenthesis of an `if` condition with a quoted operand.
- The new `extensions` input selects which files to scan in a directory, with `.conf` as the default. Each selected file is formatted separately, so additional extensions such as `.nginx` are processed too.
- The four supported runner archives for `v2.6.1` are checked against SHA-256 digests pinned in the source. The existing `v2.3.0` digests remain available for the same additional verification when that version is selected explicitly.

This upgrade spans several formatter releases, so existing configurations may produce different formatting. Set `version: v2.3.0` to keep the previous formatter and reproduce its output. The release workflow publishes the `v1.1` and `v1.1.0` Action references below after validation.

## Quick start

Create `.github/workflows/nginx-format.yml`. This complete pull-request workflow checks every `.conf` file in the repository and fails with file annotations when formatting is required:

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
      - uses: actions/checkout@v7
      - uses: soulteary/nginx-format-action@v1
        with:
          path: .
          mode: check
```

`@v1` follows the latest compatible v1 release. Use `@v1.1.0` to pin this Action to that release. The `version` input below selects the `nginx-formatter` binary and is independent of the Action version.

| Action reference | Behavior | Recommended use |
| --- | --- | --- |
| `@v1` | Moves to the latest compatible v1 release | Most workflows |
| `@v1.1` | Moves to the latest compatible v1.1 patch | Controlled patch updates |
| `@v1.1.0` | Exact stable release tag | Exact release selection |
| `@<commit-sha>` | Immutable source revision | Strict supply-chain pinning |

## Examples

### Check one Nginx directory

Use a directory path to recursively check regular files matching `extensions` (`.conf` by default). This example also includes `.nginx` files:

```yaml
- uses: soulteary/nginx-format-action@v1
  with:
    path: deploy/nginx
    mode: check
    version: v2.6.1
    extensions: conf,nginx
```

### Format one file

`write` mode changes the checked-out file but never commits or pushes it:

```yaml
- uses: soulteary/nginx-format-action@v1
  with:
    path: nginx/nginx.conf
    mode: write
    indent: 4
    indent-char: space
```

### Format and commit manually

This workflow runs only when started manually, formats the `nginx` directory, and commits a change only when necessary:

```yaml
name: Format Nginx

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  format:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - id: nginx-format
        uses: soulteary/nginx-format-action@v1
        with:
          path: nginx
          mode: write

      - name: Commit formatted files
        if: steps.nginx-format.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -- nginx
          git commit -m "style: format Nginx configuration"
          git push
```

Do not grant `contents: write` to workflows that run untrusted pull-request code. The recommended pull-request example uses read-only permissions and `check` mode.

### Read outputs without blocking a workflow

Use `continue-on-error` only when formatting differences are informational. GitHub will still render this action step as failed when differences exist, even though the job continues:

```yaml
- id: nginx-format
  continue-on-error: true
  uses: soulteary/nginx-format-action@v1
  with:
    path: nginx
    mode: check

- name: Report result
  if: always()
  env:
    CHANGED: ${{ steps.nginx-format.outputs.changed }}
    CHANGED_FILES: ${{ steps.nginx-format.outputs.changed-files }}
  run: |
    echo "Changed: $CHANGED"
    printf '%s\n' "$CHANGED_FILES"
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `path` | `.` | A file or directory inside `GITHUB_WORKSPACE`. Directories are scanned recursively for regular files matching `extensions` (default `.conf`); symlinks are skipped. A single file can use any extension. |
| `mode` | `check` | `check` reports differences and fails; `write` applies formatting in place. |
| `indent` | `2` | Indentation width from 1 to 16. |
| `indent-char` | `space` | `space`, `tab`, `\s`, or `\t`. |
| `version` | `v2.6.1` | Exact `nginx-formatter` release version. Pinning makes runs reproducible. |
| `extensions` | `.conf` | Comma-separated extensions to scan when `path` is a directory. A leading dot is optional and matching is case-insensitive. Each selected file is formatted separately. Check mode can only vouch for the files it scans, so widen this (for example `conf,nginx`) if your configuration uses other names. |
| `annotations` | `true` | Add workflow annotations for changed files. |

## Outputs

| Output | Description |
| --- | --- |
| `changed` | `true` when formatting differs, otherwise `false`. |
| `changed-files` | Newline-separated paths that differ. |
| `formatter-version` | Formatter version used by the action. |

## Behavior and security

- Supports Linux and macOS runners on x64 and arm64, matching upstream release assets. Windows is not supported because `nginx-formatter` does not currently publish Windows binaries.
- Rejects targets outside `GITHUB_WORKSPACE`.
- Verifies the release archive against the upstream checksum file before execution. The default `v2.6.1` assets are also checked against digests pinned in this action's source; the `v2.3.0` pins are retained for workflows that explicitly select the previous version.
- Uses `RUNNER_TOOL_CACHE` to avoid downloading the same verified formatter version repeatedly in a job.
- Formats a temporary copy first. Parse or download failures do not partially modify the workspace.
- Copies only regular files matching the configured `extensions` (default `.conf`) for directory targets, avoiding unrelated checkout data and symlink escapes.
- Preserves existing file permissions in `write` mode.
- Does not commit or push changes and does not require write permissions.

For the most reproducible supply chain, pin both this action and the formatter version. A major tag is convenient, while a full action commit SHA is immutable.

## Development

Bun 1.4 or newer is used for development, syntax checks, and tests. The action has no runtime package dependencies.

GitHub currently executes JavaScript actions through the runtime declared in `action.yml`, so `runs.using: node24` remains as the GitHub-managed action host. Consumers do not need to install Node.js or Bun.

```bash
bun run check
bun test
```

The CI workflow also runs the action itself against formatted and unformatted fixtures.

## Releasing

Stable releases use full-version tags such as `v1.1.0` and moving compatibility aliases such as `v1` and `v1.1`. See [RELEASING.md](RELEASING.md) for the validated release workflow, exact publishing commands, and the owner-confirmed first Marketplace publication step.

## License

[Apache License 2.0](LICENSE)
