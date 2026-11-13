---
name: openai-subscription-image
description: "通过现有 Codex 订阅登录生成或编辑图片，选择 GPT Image 2.6/2.5 Flare/Sunburst，处理多图参考、关键帧、局部修改和已保存结果恢复。"
compatibility: "uv、Python 3.12+；需要本机通过 Codex CLI 使用 ChatGPT 账号登录，读取 ~/.codex/auth.json。程序直接调用图片端点。"
---

# OpenAI 订阅生图

本技能与程序在同一个目录，可独立使用。将下文 `<技能目录>` 换成此 `SKILL.md` 所在的绝对目录，通过 `uv sync --project <技能目录>` 准备环境；提示和输出放当前用户的制作项目，不写回安装目录。真实生成读取 `~/.codex/auth.json` 的 ChatGPT 登录，登录与令牌刷新由 Codex CLI 管理。首次登录执行 `codex login`。

## 生成图片

把用户的主体、数量、动作接触、机位、光线、风格和文字要求写入任务文件，例如：
```json
{"prompt":"雨夜机械修理铺，三名人物，暖色台灯与冷色窗光。","prompt_mode":"authored"}
```
用户要求实际出图时执行：
```text
uv run --project <技能目录> python -B <技能目录>/scripts/image.py --task-file <任务.json> --out <新的候选目录> --model gpt-image-2.6-sunburst --quality high --size 1536x1024 --execute
```
只要预览或方案时去掉 `--execute`。预览不读取登录、不联网、不创建候选目录。这里已固定 OpenAI 订阅，不需要 `--provider`。

用户指定型号就传 `--model`。[GPT Image 2.6 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare) 的型号为 `gpt-image-2.6-flare`，适合快速生成与迭代；[GPT Image 2.6 Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst) 的型号为 `gpt-image-2.6-sunburst`，适合细节要求高的生成与精确编辑。`gpt-image-2.6-flare` 已通过当前 Codex 订阅完成实际生图；`gpt-image-2.6-sunburst` 已核对官方文档和本地请求预览，尚未实际出图验证。`gpt-image-2.5-flare` 与 `gpt-image-2.5-sunburst` 已有订阅出图记录。省略型号默认使用 `gpt-image-2.6-flare`。脚本当前支持的质量为 `low/medium/high/auto`，背景可用 `--background auto/opaque/transparent`。

## 参考编辑

先实际查看原图，提示以修改点开头，再写保持项。任务中的参考路径相对该任务JSON；最多5张，按数组顺序上传：
```json
{"prompt":"把 {{ref:source}} 的蓝色衣服改为红色，保留人物、姿态和机位。","generation":{"task_mode":"edit","references":[{"id":"source","path":"source.png","role":"待编辑原图"}]}}
```
继续使用同一命令，换成编辑任务与新候选目录。有参考时自动选择编辑端点。可选 `sha256` 校验素材来源，提示中的 `{{ref:ID}}` 绑定真实上传顺序。普通图像参考是生成引导，不是像素锁。

单独文本文件也可使用 `--prompt-file <提示.txt>`；参考图用可重复的 `--image <图片>`，不与 `--task-file` 混用。

## 检查结果与恢复

读取候选目录的 `run.json` 和 `receipt.json`，再实际打开 `image-0.png/jpg/webp`。核对请求ID、generation_id、输入输出哈希、真实尺寸/质量及画面是否满足需求。服务可能调整参数；没有返回模型名时记录请求型号，不补造实际模型身份。

已经保存 `response.json` 而图片未落盘时：
```text
uv run --project <技能目录> python -B <技能目录>/scripts/image.py recover --out <原候选目录> --execute
```
只恢复原响应里的图片，不联网、不再生成。还没保存图片响应的中断请求保留原ID和现场，不能用本地恢复代替重新提交的决定。登录失效时通过 Codex 更新登录；不复制登录内容到制作目录或交付包。

服务拒绝和认证错误保留原回执；按真实内容与提供方结果处理，不加本地关键词黑名单或靠改标签重发同一内容。程序参数、安装和离线自检见 [README](README.md)。
