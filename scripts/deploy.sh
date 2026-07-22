#!/bin/bash
# DCP评审中心插件自动升级脚本
# 用法: ./scripts/deploy.sh <opk文件路径>
# 环境变量: ONES_BASE_URL, ONES_EMAIL, ONES_PASSWORD, ONES_TEAM_UUID, ONES_ORG_UUID
#
# 验证流程（参考 opkx-deployment-executor-verification 规范）：
#   1. 上传 OPK + 触发升级
#   2. 轮询等待 upgrade API 返回 success
#   3. 反查 Runtime：调用插件 config API 确认后端正常
#   4. 反查业务：调用 reviews API 确认存储正常
#   只有全部通过才判定为"部署完成"

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
APP_ID="${ONES_APP_ID:-709xehle}"
PLUGIN_ID="dev_${APP_ID}"

echo "=== DCP评审中心插件自动升级 ==="
echo "环境: $BASE_URL"
echo "团队: $TEAM_UUID"
echo "文件: $OPK_FILE"
echo ""

# 提取 OPK 中的目标版本
OPK_VERSION=$(cd /tmp && rm -rf opk_ver && mkdir opk_ver && cd opk_ver && gunzip -c "$(cd /root/dcp-review-v2 && pwd)/$OPK_FILE" 2>/dev/null | tar xf - config/plugin.yaml 2>/dev/null && grep "^  version:" config/plugin.yaml | awk '{print $2}' | head -1)
rm -rf /tmp/opk_ver
if [[ -z "$OPK_VERSION" ]]; then
  OPK_VERSION="未知"
fi
echo "目标版本: $OPK_VERSION"
echo ""

# 1. 登录
echo "[1/4] 登录中..."
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

# 2. 上传 + 升级
echo "[2/4] 上传 OPK + 触发升级..."
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
  echo "  ✓ 升级指令已接受"
else
  echo "错误: 升级失败"
  echo "$UPGRADE_RESP"
  exit 1
fi

# 3. 反查 Runtime：调用插件 config API（轮询等待插件重启完成）
echo "[3/4] 验证 Runtime..."
CONFIG_OK=false
for i in $(seq 1 15); do
  sleep 5
  CONFIG_HTTP=$(curl -s -o /tmp/ones_config_resp.txt -w "%{http_code}" \
    "$BASE_URL/project/api/project/team/$TEAM_UUID/dcp/config" \
    -H "Ones-Check-Id: $TEAM_UUID" \
    -H "Ones-Check-Point: team" \
    -H "Ones-Plugin-Id: $PLUGIN_ID" \
    -H "Ones-Auth-Token: $TOKEN" \
    -b /tmp/ones_cookies.txt)

  if [[ "$CONFIG_HTTP" == "200" ]]; then
    CONFIG_DATA_OK=$(python3 -c "
import json
d=json.load(open('/tmp/ones_config_resp.txt'))
data=d.get('data',{})
print('OK' if 'config' in data or data.get('ok')==True else 'FAIL')
" 2>/dev/null)
    if [[ "$CONFIG_DATA_OK" == "OK" ]]; then
      CONFIG_OK=true
      echo "  ✓ config API 正常 (HTTP 200, 数据有效) [第 ${i} 次轮询]"
      break
    fi
  fi
  echo "  ⏳ 等待插件重启... [第 ${i} 次轮询, HTTP $CONFIG_HTTP]"
done

if [[ "$CONFIG_OK" != "true" ]]; then
  echo "错误: Runtime 健康检查失败 — 插件未在预期时间内恢复"
  cat /tmp/ones_config_resp.txt | head -5
  exit 1
fi

# 4. 反查业务：reviews API
echo "[4/4] 验证业务功能..."
REVIEWS_HTTP=$(curl -s -o /tmp/ones_reviews_resp.txt -w "%{http_code}" \
  "$BASE_URL/project/api/project/team/$TEAM_UUID/dcp/reviews/team" \
  -H "Ones-Check-Id: $TEAM_UUID" \
  -H "Ones-Check-Point: team" \
  -H "Ones-Plugin-Id: $PLUGIN_ID" \
  -H "Ones-Auth-Token: $TOKEN" \
  -b /tmp/ones_cookies.txt)

if [[ "$REVIEWS_HTTP" != "200" ]]; then
  echo "错误: 业务 API 健康检查失败 (HTTP $REVIEWS_HTTP)"
  cat /tmp/ones_reviews_resp.txt | head -5
  exit 1
fi
REVIEWS_COUNT=$(python3 -c "
import json
d=json.load(open('/tmp/ones_reviews_resp.txt'))
r=d.get('data',{}).get('reviews',[])
print(len(r))
" 2>/dev/null)
echo "  ✓ reviews API 正常 (HTTP 200, $REVIEWS_COUNT 条记录)"

# 清理
rm -f /tmp/ones_cookies.txt /tmp/ones_headers.txt /tmp/ones_config_resp.txt /tmp/ones_reviews_resp.txt

echo ""
echo "=== 部署验证完成 ==="
echo "环境: $BASE_URL"
echo "插件: DCP评审中心 ($APP_ID)"
echo "版本: $NEW_VERSION"
echo "Runtime 健康检查: PASSED"
echo "业务功能验证: PASSED"
echo "最终结论: 升级成功"
