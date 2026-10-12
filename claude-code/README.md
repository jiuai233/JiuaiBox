# Claude Code 全局 CLAUDE.md

`CLAUDE.md` 是 Claude Code 的全局用户指令，每个会话都会加载。

## 安装

```bash
cp claude-code/CLAUDE.md ~/.claude/CLAUDE.md
```

已有 `~/.claude/CLAUDE.md` 时，把内容合并进去，不要直接覆盖。

## 依赖

`no-negative-echo` skill 需另行安装到 `~/.claude/skills/no-negative-echo`，来源：<https://github.com/LB623/no-negative-echo>。Pi 配置中的同名 skill 位于 `pi/agent/skills/no-negative-echo`。
