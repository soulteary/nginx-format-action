# Nginx Format Action

[![CI](https://github.com/soulteary/nginx-format-action/actions/workflows/ci.yml/badge.svg)](https://github.com/soulteary/nginx-format-action/actions/workflows/ci.yml)

基于 [soulteary/nginx-formatter](https://github.com/soulteary/nginx-formatter)，在 GitHub Actions 中检查或格式化 Nginx 配置文件。

Action 会下载 `nginx-formatter` 官方发布包并校验 SHA-256，在隔离的临时副本中完成格式化。`check` 模式不会修改工作区；`write` 模式仅在整次格式化成功后替换文件，并保留原有文件权限。

[English](README.md)

## 快速开始

推荐在 Pull Request 中使用 `check` 模式，发现格式不一致时让工作流失败：

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

如需在工作流中直接格式化文件（Action 不会自动提交）：

```yaml
- uses: soulteary/nginx-format-action@v1
  with:
    path: nginx/nginx.conf
    mode: write
    indent: 4
    indent-char: space
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

当 `check` 步骤配置 `continue-on-error: true` 时，仍然可以读取输出：

```yaml
- id: nginx-format
  continue-on-error: true
  uses: soulteary/nginx-format-action@v1

- if: always()
  run: echo '${{ steps.nginx-format.outputs.changed-files }}'
```

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

需要 Node.js 24 或更高版本；运行时不依赖任何 npm 软件包。

```bash
npm run check
npm test
```

CI 还会使用本 Action 对已格式化和未格式化的测试配置执行集成验证。

## 许可证

[Apache License 2.0](LICENSE)
