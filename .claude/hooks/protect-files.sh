#!/usr/bin/env bash
# PreToolUse hook: 阻止编辑受保护文件
# exit 2 → Claude 收到 stderr 提示并放弃这次编辑
set -e

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // ""')

[ -z "$file" ] && exit 0

# 1. OpenAPI codegen 产物（应走 /codegen types 再生成）
if [[ "$file" == *"/api/generated/"* ]]; then
  echo "禁止手改 $file — 这是 OpenAPI codegen 产物。" >&2
  echo "   改后端 Pydantic schema 后跑 \`/codegen types\` 重新生成。" >&2
  exit 2
fi

# 2. .env 文件（密钥，应该只改 .env.example）
if [[ "$file" == *"/.env" ]] && [[ "$file" != *".env.example"* ]]; then
  echo "禁止直接编辑 $file — 含密钥，应由用户本地维护。" >&2
  echo "   如需新增配置项，改 .env.example，让用户同步到本地 .env。" >&2
  exit 2
fi

# 3. 已存在的 Alembic migration（可能已在库里跑过，改了会失去幂等）
if [[ "$file" == *"alembic/versions/"*".py" ]] && [ -f "$file" ]; then
  echo "禁止手改已存在的 Alembic migration $file" >&2
  echo "   migrations 写完应视为不可变。如需调整 schema，新建一个 migration。" >&2
  exit 2
fi

# 4. 锁文件（package-lock.json / uv.lock / poetry.lock）
if [[ "$file" == *"/package-lock.json" || "$file" == *"/pnpm-lock.yaml" || "$file" == *"/uv.lock" || "$file" == *"/poetry.lock" ]]; then
  echo "禁止手改锁文件 $file — 由包管理器自动维护。" >&2
  echo "   若要升级依赖，跑对应 \`npm install\` / \`uv lock\`。" >&2
  exit 2
fi

# 5. 时间戳存证相关字段（红线 R-05）
# 注意：这条在代码层面由 Service 强制，hook 层面无法检测字段级改动
# 但如果有人直接改 migration 试图修改 proof_hash 列属性，第 3 条会拦住

exit 0
