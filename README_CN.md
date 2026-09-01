# Nginx Format Action

[![CI](https://github.com/soulteary/nginx-format-action/actions/workflows/ci.yml/badge.svg)](https://github.com/soulteary/nginx-format-action/actions/workflows/ci.yml)

基于 [soulteary/nginx-formatter](https://github.com/soulteary/nginx-formatter)，在 GitHub Actions 中检查或格式化 Nginx 配置文件。

Action 会下载 `nginx-formatter` 官方发布包并校验 SHA-256，在隔离的临时副本中完成格式化。`check` 模式不会修改工作区；`write` 模式仅在整次格式化成功后替换文件，并保留原有文件权限。

[English](README.md)

## 快速开始

创建 `.github/workflows/nginx-format.yml`。下面是完整的 Pull Request 检查工作流：它会检查仓库中的所有 `.conf` 文件，并在需要格式化时通过文件标注提示问题并让工作流失败。

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

`@v1` 会跟随最新的 v1 兼容版本；使用 `@v1.0.0` 可以固定到首个稳定版本。下面的 `version` 参数用于选择 `nginx-formatter` 二进制版本，与 Action 自身版本相互独立。

| Action 引用 | 行为 | 推荐场景 |
| --- | --- | --- |
| `@v1` | 跟随最新的 v1 兼容版本 | 大多数工作流 |
| `@v1.0` | 跟随最新的 v1.0 补丁版本 | 受控补丁更新 |
| `@v1.0.0` | 固定到准确的稳定版本标签 | 指定准确发布版本 |
| `@<commit-sha>` | 固定到不可变源码提交 | 严格供应链固定 |

## 使用示例

### 检查一个 Nginx 配置目录

传入目录后，会递归检查其中所有普通 `.conf` 文件：

```yaml
- uses: soulteary/nginx-format-action@v1
  with:
    path: deploy/nginx
    mode: check
    version: v2.3.0
```

### 格式化单个文件

`write` 模式会修改检出的文件，但不会自动提交或推送：

```yaml
- uses: soulteary/nginx-format-action@v1
  with:
    path: nginx/nginx.conf
    mode: write
    indent: 4
    indent-char: space
```

### 手动格式化并提交

下面的工作流仅支持手动触发，会格式化 `nginx` 目录，并只在存在变化时创建提交：

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

不要为运行不可信 Pull Request 代码的工作流授予 `contents: write`。推荐的 Pull Request 示例仅使用只读权限和 `check` 模式。

### 读取输出但不阻断工作流

只应在格式差异仅用于提示时使用 `continue-on-error`。存在差异时，GitHub 仍会把 Action 步骤显示为失败，但任务会继续执行：

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

## 输入参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `path` | `.` | `GITHUB_WORKSPACE` 内的文件或目录。目录会递归处理普通 `.conf` 文件并跳过软链接；单文件模式不限制扩展名。 |
| `mode` | `check` | `check` 检测差异并让步骤失败；`write` 就地写入格式化结果。 |
| `indent` | `2` | 缩进宽度，范围为 1～16。 |
| `indent-char` | `space` | 可选 `space`、`tab`、`\s` 或 `\t`。 |
| `version` | `v2.3.0` | 指定 `nginx-formatter` 的精确发布版本，保证运行结果可复现。 |
| `annotations` | `true` | 为存在差异的文件生成 GitHub 工作流标注。 |

## 输出参数

| 输出 | 说明 |
| --- | --- |
| `changed` | 存在格式差异时为 `true`，否则为 `false`。 |
| `changed-files` | 存在差异的文件路径，以换行分隔。 |
| `formatter-version` | 本次使用的格式化器版本。 |

## 行为与安全性

- 支持 Linux、macOS 的 x64 和 arm64 Runner，与上游发布包保持一致。由于上游暂未提供 Windows 二进制，当前不支持 Windows。
- 拒绝访问 `GITHUB_WORKSPACE` 之外的路径。
- 执行前使用上游校验文件验证发布包 SHA-256；默认 v2.3.0 的发布资产还会与 Action 源码中固定的摘要进行二次核对。
- 使用 `RUNNER_TOOL_CACHE` 缓存已校验的格式化器，避免同一任务重复下载。
- 始终先格式化临时副本；下载或解析失败不会导致工作区被部分修改。
- 目录模式只复制普通 `.conf` 文件，避免复制无关仓库内容及软链接逃逸。
- `write` 模式保留文件原有权限。
- 不提交、不推送代码，也不需要仓库写权限。

如需最严格的供应链可复现性，建议同时固定 Action 的完整提交 SHA 和 `version` 参数；`@v1` 更便于使用，但并非不可变引用。

## 开发

项目开发、语法检查和测试统一使用 Bun 1.4 或更高版本；Action 运行时不依赖任何第三方软件包。

GitHub 当前仍通过 `action.yml` 声明的运行时执行 JavaScript Action，因此保留 `runs.using: node24` 作为 GitHub 托管的 Action 宿主。使用者不需要自行安装 Node.js 或 Bun。

```bash
bun run check
bun test
```

CI 还会使用本 Action 对已格式化和未格式化的测试配置执行集成验证。

## 发布

稳定版本使用 `v1.0.0` 这类完整版本标签，并维护 `v1`、`v1.0` 这类可移动兼容引用。经过校验的发布流程和准确命令见 [RELEASING_CN.md](RELEASING_CN.md)。

## 许可证

[Apache License 2.0](LICENSE)
