# 技能来源与许可证

`agent/skills/` 包含以下技能的本地配置快照，恢复时复制为普通目录。

| 资源 | 上游 | 许可证 |
| --- | --- | --- |
| `better-accessibility`、`better-colors`、`better-interface`、`better-layout`、`better-typography`、`better-ui`、`better-writing`、`interface-review` | [jakubkrehel/skills](https://github.com/jakubkrehel/skills) | [MIT](licenses/interface-skills-MIT.txt) |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | [Apache 2.0](agent/skills/frontend-design/LICENSE.txt) |
| `no-negative-echo` | [LB623/no-negative-echo](https://github.com/LB623/no-negative-echo) | [MIT](licenses/no-negative-echo-MIT.txt) |
| `engineering-change-guidelines` | JiuaiBox 工程修改规范 | 本仓库自有内容 |

飞书 `lark-shared` 与 `lark-sheets` 通过 [官方技能源](https://open.feishu.cn/.well-known/skills/index.json) 安装，使用安装时的官方版本。第三方插件由 Pi 包管理器从 npm 或 Git 安装，遵循各自仓库许可证；版本及 Git 提交固定在 `agent/settings.json`。
