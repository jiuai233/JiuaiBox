# Pi 换机配置

通过安装脚本恢复 Pi 提示词、Prism 主题、插件与技能。首次恢复后需重新登录模型提供商。

## 快速恢复

前置条件：Git、Node.js 24 或更高版本、npm，以及可访问 GitHub、npm 与飞书开放平台的网络。macOS 和 Linux 使用 Bash；Windows 使用 Git Bash。安装脚本在 macOS 验证。

```bash
git clone https://github.com/jiuai233/JiuaiBox.git
cd JiuaiBox
bash pi/install.sh
pi
```

在 Pi 中运行 `/login`，登录 OpenAI Codex、Google Antigravity 等所需提供商。压缩与搜索摘要使用 `opencode-go/deepseek-v4.1-flash`，需为 OpenCode Go 配置授权。默认主模型为 `openai-codex/gpt-6.1-sol`；模型不可用时，通过 `/model` 选择可用模型，并同步 `settings.json` 中的主模型、子代理模型与 `enabledModels`。

## 恢复范围

- **交互与提示词**：全局 `system.md`、高思考等级、全屏界面、隐藏思考正文；ADHD 输出模式由插件控制。
- **配色**：Prism 深色主题，粉色强调、青色链接、紫色代码与彩虹思考状态栏。
- **插件**：搜索与网页读取、Google 搜索及图片生成、任务清单、结构化提问、子代理、计划模式、权限管理、压缩模型、运行中压缩、记忆、状态栏、吞吐显示、工具标记和模型快速模式。
- **技能**：工程修改规范、界面设计与审查技能、产物文案检查；飞书认证与表格技能从官方源安装。
- **细节设置**：模型窗口覆盖、90% 上下文压缩水位、独立子代理上下文、记忆策略与搜索策略。

Pi 固定为 `1.0.4`；15 个插件固定至当前 npm 版本或 Git 提交。安装完成后应用运行中压缩续跑回调补丁，保留本机行为。`versions.json` 与 `agent/settings.json` 是版本清单。npm 的传递依赖仍由包管理器解析，此配置不提供完整依赖树锁定。

## 认证与权限

公开配置不包含 API 密钥、OAuth 令牌、浏览器 Cookie、会话记录、私人记忆、数据库、请求抓包与模型目录缓存。已有本机认证和历史数据保持原样；新电脑需重新授权。模型目录通过 `pi update --models` 刷新。

权限配置沿用个人开发设置：多数工具与外部目录操作直接允许；`.env`、SSH 密钥目录、Pi `auth.json` 及 `rm -rf` 命令受限制，`sudo` 请求确认。此配置适合个人可信工作区，启用第三方项目之前需审查代码与权限。

模型快速模式与子代理 `fast` 设置保留。可在 `/fast` 中调整。

## 已有配置与备份

脚本写入 `~/.pi/agent/`。已有同名配置和本仓库内置技能先移动到 `~/.pi/agent/backups/jiuaibox-<时间戳>/`；认证、会话、私人记忆及其他未管理文件不移动。插件安装或联网步骤失败时，已复制配置和备份保留，修复网络后可重跑脚本。

仅复制本仓库配置、跳过 Pi 与插件安装和飞书技能下载：

```bash
bash pi/install.sh --config-only
```

安装脚本使用 `~/.pi/agent/`，不读取自定义 `PI_CODING_AGENT_DIR`。若已有 Pi 与固定版本不同，脚本在写配置前停止；退出所有 Pi 会话后可安装基线版本：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.0.4
```

修改主题后通过 `/settings` → `Theme` 选择，或执行 `/reload`。第三方技能来源与许可证见 [THIRD_PARTY.md](THIRD_PARTY.md)。

## 可选的本机工具

飞书技能需要另行安装 `@larksuite/cli` 并完成应用配置和用户授权。TapTap Maker 技能依赖 Cindy 宿主与对应插件，由宿主安装。

`examples/mcp.macos.json` 提供 macOS meatshell MCP 示例；安装 meatshell 后可将其复制为 `~/.pi/agent/mcp.json`。该示例不会自动启用，其他操作系统需替换可执行文件路径。

搜索配置允许读取本机浏览器登录态，并允许 `198.18.0.0/15` 范围用于 Fake-IP 代理环境；不使用对应浏览器登录或代理时，可调整 `web-search.json`。

## 更新与验证

修改公共配置后提交对应文件。插件升级时更新 `agent/settings.json` 中的版本；Pi 升级时同步 `versions.json` 并重新验证恢复。私人状态不复制回仓库。

```bash
node --test pi/test/*.test.mjs
node pi/scripts/check-public.mjs
```
