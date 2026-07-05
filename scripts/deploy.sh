#!/bin/bash
# DCP评审中心插件自动升级脚本
# 用法: ./scripts/deploy.sh <opk文件路径>
# 环境变量: ONES_BASE_URL, ONES_EMAIL, ONES_PASSWORD, ONES_TEAM_UUID, ONES_ORG_UUID

set -euo pipefail

# 自动加载同目录 .env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

OPK_FILE="${1:-}"
if [[ -z "$OPK_FILE" ]]; then
  echo "用法: $0 <opk文件路径>"
  exit 1
fi
if [[ ! -f "$OPK_FILE" ]]; then
  echo "错误: 文件不存在: $OPK_FILE"
  exit 1
fi

BASE_URL="${ONES_BASE_URL:-https://demo688.ones.pro}"
EMAIL="${ONES_EMAIL:?请设置 ONES_EMAIL}"
PASSWORD="${ONES_PASSWORD:?请设置 ONES_PASSWORD}"
TEAM_UUID="${ONES_TEAM_UUID:-7xrUyuCf}"
ORG_UUID="${ONES_ORG_UUID:-MVUtevnf}"

echo "=== DCP评审中心插件自动升级 ==="
echo "环境: $BASE_URL"
echo "团队: $TEAM_UUID"
echo "文件: $OPK_FILE"
echo ""

# 1. 登录
echo "[1/3] 登录中..."
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/project/api/project/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -c /tmp/ones_cookies.txt -D /tmp/ones_headers.txt)

TOKEN=$(grep -i 'Ones-Auth-Token' /tmp/ones_headers.txt | sed 's/.*: //' | tr -d '\r\n')
if [[ -z "$TOKEN" ]]; then
  echo "错误: 登录失败，未获取到 token"
  echo "$LOGIN_RESP" | head -5
  exit 1
fi
echo "  ✓ 登录成功"

# 2. 上传 OPK
echo "[2/3] 上传 OPK..."
UPLOAD_RESP=$(curl -s -X POST "$BASE_URL/project/api/project/team/$TEAM_UUID/plugin/upload_opk" \
  -H "Ones-Check-Id: $TEAM_UUID" \
  -H "Ones-Check-Point: team" \
  -H "Ones-Plugin-Id: built_in_apis" \
  -H "Ones-Auth-Token: $TOKEN" \
  -b /tmp/ones_cookies.txt \
  -F "file=@$OPK_FILE" \
  -F "organization_uuid=$ORG_UUID")

INSTANCE_UUID=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['instance_uuid'])" 2>/dev/null)
if [[ -z "$INSTANCE_UUID" ]]; then
  echo "错误: 上传失败"
  echo "$UPLOAD_RESP" | head -10
  exit 1
fi
NEW_VERSION=$(echo "$UPLOAD_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['new_version'])" 2>/dev/null)
echo "  ✓ 上传成功 (instance: $INSTANCE_UUID, 新版本: $NEW_VERSION)"

# 3. 触发升级
echo "[3/3] 触发升级..."
UPGRADE_RESP=$(curl -s -X POST "$BASE_URL/project/api/project/team/$TEAM_UUID/plugin/upgrade" \
  -H "Content-Type: application/json;charset=UTF-8" \
  -H "Ones-Check-Id: $TEAM_UUID" \
  -H "Ones-Check-Point: team" \
  -H "Ones-Plugin-Id: built_in_apis" \
  -H "Ones-Auth-Token: $TOKEN" \
  -b /tmp/ones_cookies.txt \
  -d "{\"instance_uuid\":\"$INSTANCE_UUID\"}")

RESULT=$(echo "$UPGRADE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'])" 2>/dev/null)
if [[ "$RESULT" == "True" ]]; then
  echo "  ✓ 升级成功! 版本: $NEW_VERSION"
else
  echo "错误: 升级失败"
  echo "$UPGRADE_RESP"
  exit 1
fi

# 清理
rm -f /tmp/ones_cookies.txt /tmp/ones_headers.txt
echo ""
echo "=== 完成 ==="
