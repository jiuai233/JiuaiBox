# Codex 全局 AGENTS.md 配置

[`AGENTS.md`](./AGENTS.md) 是本机 Codex 使用的全局协作规则，原文件位于：

```text
%USERPROFILE%\.codex\AGENTS.md
```

它约束 Codex 在代码仓库中的调查、修改、验证和进度汇报方式，重点包括：

- 仓库存在 `.codegraph/` 时优先使用 CodeGraph 定位和理解代码；
- 修改前先调查并保护工作区中的现有改动；
- 搜索、读取和命令输出保持小范围、低噪声；
- 遇到错误时说明影响、替代方案及覆盖差异；
- 修改后检查差异，并优先运行最小相关验证。

## 使用

将本目录中的 `AGENTS.md` 复制到 Codex 配置目录：

```powershell
Copy-Item .\AGENTS.md "$env:USERPROFILE\.codex\AGENTS.md"
```

复制前请先备份已有文件；仓库中的版本不会自动同步到本机。
