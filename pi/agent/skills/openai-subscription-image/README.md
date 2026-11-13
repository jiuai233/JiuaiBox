# OpenAI 订阅生图独立包

一份可搬走的 Skill 与 Python 程序，支持文字生图、最多5张参考图编辑、型号/质量/尺寸/背景选择、原始回执保存和已保存结果恢复。复用 Pi Video Studio 同一份图片引擎，不需要整个视频工程、Node、FFmpeg、GPU 或 Colab。

## 使用条件

- 安装 uv；Python 3.12+ 和依赖通过 `uv sync` 准备，依赖与锁定版本见 `pyproject.toml` 和 `uv.lock`。
- 当前电脑已通过 `codex login` 使用 ChatGPT 账号登录。程序只读当前用户的 `~/.codex/auth.json` 中 `tokens.access_token` 与 `tokens.account_id`；登录与令牌刷新由 Codex 管理。仅配置 API key 的登录不适用于此订阅接口。
- 本包不含账号、登录令牌、Python本体、依赖安装包或制作素材。预览和本地结果恢复可以离线运行，真实生成需要联网。

## 安装与第一次使用

在本目录执行，命令适用于 macOS、Linux 和 PowerShell：

```sh
uv sync
codex login
uv run python -B scripts/image.py --task-file examples/generate.json --out runs/first --model gpt-image-2.5-sunburst --quality high --size 1536x1024
```

已有有效 Codex ChatGPT 登录时可跳过 `codex login`。最后一条只是预览，不读登录、不生成。实际生成时在同一命令后加 `--execute`。候选目录必须是新路径。

`examples/complex-scene.json` 是三人物、机械鸟、倒茶、玻璃蝴蝶、橘猫与中文招牌的复杂提示，替换 `--task-file` 即可使用。

### 选择型号和参数

- `--model gpt-image-2.6-flare`：快速生成与迭代，省略型号时的默认值。
- `--model gpt-image-2.6-sunburst`：精细生成与编辑。
- 可显式选择 `gpt-image-2.5-flare`、`gpt-image-2.5-sunburst` 或 `gpt-image-2`。
- `--quality low|medium|high|auto`；`--size 1536x1024`；`--background auto|opaque|transparent`。

`gpt-image-2.6-flare` 已通过当前 Codex 订阅完成实际生图；两款2.5型号请求均已在源工程通过订阅出图。请求型号、质量和尺寸会与实际响应分别记录，服务未返回实际模型名时不补填。

### 编辑原图

先将自己的原图保存为 `examples/source.png`，或修改 `examples/edit.json` 里的参考路径。图片路径相对任务JSON：

```sh
uv run python -B scripts/image.py --task-file examples/edit.json --out runs/edit-001 --model gpt-image-2.5-sunburst --quality high --size 1536x1024 --execute
```

参考图自动进入编辑端点。最多5张；提示中的 `{{ref:ID}}` 对应任务里各参考的 `id`。`--prompt-file` 与可重复的 `--image` 是另一种直接输入方式。

### 恢复已收到的图片

```sh
uv run python -B scripts/image.py recover --out runs/first --execute
```

只解码原 `response.json`，不联网、不再生成。若网络中断且图片响应未保存，此命令不能查询远端未完成任务。登录过期时通过 Codex 更新登录后再发起新的已授权任务。

## 给后续 agent 使用

可直接让 agent 读取本目录 `SKILL.md`。如宿主会自动发现技能，将整个 `openai-subscription-image` 文件夹放入该宿主实际扫描的技能目录；例如项目的 `.agents/skills/`。保留 `scripts/`、`src/`、`schemas/` 等所有目录，不要只复制 `SKILL.md`。程序路径相对技能目录，任务和输出可放任意已授权制作目录。

## 结果文件

- `request.json`：实际请求参数和输入图片数据。
- `response.json`：原始响应与输出图片数据。
- `receipt.json`：请求ID、生成ID、用量、实际参数或提供方错误。
- `run.json`：提示、参考映射、哈希、执行状态和图片摘要。
- `image-0.*`：按真实编码保存的图片。

请求发送到 `https://chatgpt.com/backend-api/codex/images/generations` 或 `images/edits`。一次执行最多提交一次生成，不自动重试、不自动切换型号或回退旧路径。

## 离线自检与来源

```sh
uv run python -B scripts/self_check.py --out runs/self-check.json
```

自检核对包内文件哈希，使用本地模拟登录检查认证字段映射，运行生成/编辑预览，再用本地模拟响应检查落盘和恢复；不读取真实登录、不发送HTTP、不实际生图。报告写入 `--out`，临时夹具自动清理。

`MANIFEST.json` 记录包内文件SHA-256和源版本信息。服务协议依据为 [Codex ImagesClient](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/endpoint/images.rs) 和 [请求结构](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/images.rs)。
