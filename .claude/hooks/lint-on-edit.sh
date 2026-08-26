#!/usr/bin/env bash
# PostToolUse hook: Edit/Write 后对新改的 .py/.ts/.tsx 跑 linter
# 发现错误通过 JSON additionalContext 反馈给 Claude（非阻塞）
set -e

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

# 文件为空或不存在 → 静默退出
[ -z "$file" ] && exit 0
[ ! -f "$file" ] && exit 0

root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
output=""

# ------- Python（ruff）-------
if [[ "$file" == *.py ]]; then
  if command -v ruff >/dev/null 2>&1; then
    out=$(ruff check "$file" 2>&1) || true
    if [ -n "$out" ] && ! echo "$out" | grep -q "All checks passed"; then
      output="[ruff] $file"$'\n'"$out"
    fi
  fi
fi

# ------- TypeScript/TSX（eslint，仅当前端已 init）-------
if [[ "$file" == *.ts || "$file" == *.tsx ]]; then
  if [ -x "$root/miniapp/node_modules/.bin/eslint" ]; then
    rel="${file#$root/miniapp/}"
    out=$(cd "$root/miniapp" && ./node_modules/.bin/eslint --quiet "$rel" 2>&1) || true
    if [ -n "$out" ]; then
      output="[eslint] $file"$'\n'"$out"
    fi
  fi
fi

# 有输出 → 走 JSON additionalContext 反馈给 Claude
if [ -n "$output" ]; then
  jq -n --arg ctx "$output" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: $ctx
    }
  }'
fi

exit 0
