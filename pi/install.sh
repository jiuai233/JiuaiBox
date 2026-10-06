#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:-}"
if [[ "$MODE" != "" && "$MODE" != "--config-only" ]]; then
  printf '用法：bash pi/install.sh [--config-only]\n' >&2
  exit 1
fi
command -v node >/dev/null || { echo '请先安装 Node.js 24 或更高版本。' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("需要 Node.js 24 或更高版本。"); process.exit(1); }'
export PI_CODING_AGENT_DIR="$HOME/.pi/agent"
PI_VERSION="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).pi" "$ROOT/versions.json")"
if [[ "$MODE" != "--config-only" ]]; then
  command -v npm >/dev/null || { echo '找不到 npm。' >&2; exit 1; }
  command -v git >/dev/null || { echo '找不到 Git。' >&2; exit 1; }
  if ! command -v pi >/dev/null; then
    npm install -g --ignore-scripts "@earendil-works/pi-coding-agent@$PI_VERSION"
  elif [[ "$(pi --version)" != "$PI_VERSION" ]]; then
    printf '当前 Pi 版本与配置基线 %s 不一致；请先退出所有 Pi 会话，再安装对应版本。\n' "$PI_VERSION" >&2
    exit 1
  fi
fi
node "$ROOT/scripts/restore.mjs"
if [[ "$MODE" == "--config-only" ]]; then exit 0; fi
while IFS= read -r source; do
  pi install "$source"
done < <(node -e 'for (const source of JSON.parse(require("fs").readFileSync(process.argv[1])).packages) console.log(source)' "$ROOT/agent/settings.json")
COMPACT_DIR="$PI_CODING_AGENT_DIR/npm/node_modules/pi-midrun-compact"
PATCH="$ROOT/patches/pi-midrun-compact-runtime.patch"
if git -C "$COMPACT_DIR" apply --check "$PATCH"; then
  git -C "$COMPACT_DIR" apply "$PATCH"
elif ! git -C "$COMPACT_DIR" apply --reverse --check "$PATCH"; then
  echo '运行中压缩补丁与已安装源码不匹配。' >&2
  exit 1
fi
pi update --models
SKILLS_VERSION="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1])).skillsCli" "$ROOT/versions.json")"
npx --yes "skills@$SKILLS_VERSION" add https://open.feishu.cn \
  --skill lark-shared lark-sheets --agent pi --global --copy --yes
printf '\n恢复完成。运行 pi，通过 /login 重新登录模型提供商。\n'
