# macOS Codex 全局 AGENTS.md 配置

[`AGENTS.md`](./AGENTS.md) 是适用于 macOS 与 `zsh` 的 Codex 全局协作规则，目标位置为：

```text
~/.codex/AGENTS.md
```

它与仓库中的 Windows 版本分开维护，主要约束：

- 默认使用 macOS、`zsh` 和 `python3`；
- 避免假设系统自带 GNU 命令参数；
- 仓库存在 `.codegraph/` 时优先使用 CodeGraph；
- 修改前保护现有工作区，修改后检查差异并运行最小相关验证；
- 使用中文 Conventional Commit 风格。

## 安装

先创建配置目录，并备份已有文件：

```zsh
mkdir -p ~/.codex
if [[ -f ~/.codex/AGENTS.md ]]; then
  cp ~/.codex/AGENTS.md ~/.codex/AGENTS.md.bak
fi
```

然后在本目录执行：

```zsh
cp ./AGENTS.md ~/.codex/AGENTS.md
```

仓库中的文件不会自动与本机同步。更新前建议先比较本机版本，避免覆盖之后新增的个人规则。

## 可选：安装 CodeGraph

```zsh
npm install -g @colbymchenry/codegraph
codegraph install --target=codex --location=global --yes
```

重启 Codex 后，在需要建立索引的具体项目中执行：

```zsh
codegraph init
```

不要直接在用户主目录运行 `codegraph init`。
