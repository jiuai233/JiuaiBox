# 实施计划：同步 aliens 默认主题

- 范围：保留现有 MSI + Scoop 文档更新，仅将 `windows-terminal/README.md` 的默认主题同步为本机已验证的 `aliens`。
- 步骤：默认初始化命令改用内置 `aliens.omp.json`；将仓库自带 `blue-path` 说明调整为可选；检查 Markdown、路径和 diff。
- 非目标：不修改当前电脑配置，不新增 SVG 或安装脚本，不改主题 JSON。
- 验收：README 默认命令与 `$PROFILE` 一致，且明确烧瓶等图标由 Nerd Font 渲染。
- 风险与回滚：Oh My Posh 内置主题路径依赖 Scoop 安装位置；恢复默认命令即可回滚。
