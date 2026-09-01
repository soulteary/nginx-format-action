# 发布说明

稳定版本使用 `v1.0.0` 这类语义化版本标签。发布工作流会校验标签、执行 Bun 测试和真实的 `nginx-formatter` 集成测试、创建 GitHub Release，并把对应的主版本和次版本引用（例如 `v1`、`v1.0`）移动到本次发布提交。

[English](RELEASING.md)

## 发布 v1.0.0

1. 确认 `package.json` 中的版本为 `"version": "1.0.0"`，并且所有发布内容均已合入 `main`。
2. 确认 `main` 分支最新一次 CI 已通过。
3. 创建并推送带说明的版本标签：

   ```bash
   git switch main
   git pull --ff-only
   git tag -a v1.0.0 -m "Nginx Format Action v1.0.0"
   git push origin v1.0.0
   ```

4. 等待 **Release** 工作流完成。工作流会创建 `v1.0.0` GitHub Release 并更新 `v1` 和 `v1.0`，使用方可以选择以下引用方式：

   ```yaml
   - uses: soulteary/nginx-format-action@v1       # 跟随 v1 最新兼容版本
   - uses: soulteary/nginx-format-action@v1.0     # 跟随 v1.0 最新补丁版本
   - uses: soulteary/nginx-format-action@v1.0.0   # 固定到准确的发布标签
   ```

5. 检查自动生成的 Release Notes，并在一个实际使用仓库中验证示例工作流。

当标签与 `package.json` 中的版本不一致，或标签提交不属于 `main` 时，工作流会在发布前停止。重新运行已成功发布的工作流是安全的：已有 GitHub Release 不会被覆盖，但主版本和次版本引用会再次接受校验并更新。

## 后续版本

- 补丁版本：把 `package.json` 更新为 `1.0.1`，合并后推送 `v1.0.1`，工作流会把 `v1` 和 `v1.0` 移动到新提交。
- 次版本：把 `package.json` 更新为 `1.1.0`，合并后推送 `v1.1.0`，工作流会更新 `v1` 并创建或更新 `v1.1`；`v1.0` 保持不变。
- 主版本：把 `package.json` 更新为 `2.0.0`，把文档示例更新为 `@v2`，然后推送 `v2.0.0`。工作流会创建或更新 `v2` 和 `v2.0`，不会改变 v1 系列引用。

不要移动 `v1.0.0` 这类完整版本标签。只有 `v1`、`v1.0` 这类主版本和次版本引用允许随兼容版本发布而移动。若使用方需要严格不可变，应固定到 Action 的完整提交 SHA。
