# DCP 评审中心 v2 — AGENTS.md

ONES 团队级 DCP/TR 评审插件。支持 DCP 阶段决策评审和 TR 技术评审、多人异步评审、关联工作项、不可覆盖决议快照和审计追溯。

## 怎么跑起来

```bash
npm install && op init          # 安装依赖 + 初始化
npm run debug                  # 本地后端调试
npm run packup                 # 打包 .opk
./scripts/deploy.sh <opk文件>  # 直推升级到 demo688 环境（scripts/.env 存凭证，gitignored）
```

构建前必清缓存：`rm -rf node_modules/.cache web/dist`，否则 dist JS hash 不变 = 旧代码。

## 技术栈

- 前端：React 17 + TypeScript + Webpack（模块：dcp-review-tab、dcp-reviewer-workspace、dcp-sidebar 含子模块 dcp-template-config / dcp-review-overview、dcp-config-page、dcp-team-overview）
- 后端：Node.js External API（backend/src/index.ts 4452 行 + task-event-handler.ts），47 个 API 端点
- 存储：15 个 ONES Entity（dcp_base_config ~ dcp_checklist_result）
- 平台：ONES Open Platform，plugin.yaml 声明 3 个 Ability（ProjectCustomComponent、SidebarMenu、TaskEventHandler）

## 目录与约定

```
config/plugin.yaml    # 插件声明（实体、API、模块、权限、能力）
backend/src/index.ts  # 全部后端 API（4452 行）
backend/src/task-event-handler.ts  # 工作项事件钩子（taskPreAction/taskActionDone）—必须在 index.ts re-export，否则 packup 不打包→500
web/src/modules/      # 前端模块
scripts/deploy.sh     # 自动部署+五步验证脚本
docs/                 # 技术方案、需求方案
```

## 当前状态

- 版本：v1.31.9（plugin.yaml），host 1.11.33
- 技术方案文档标注 v1.11.32、需求方案标注 v1.11.33——**已严重滞后**（实际已迭代到 v1.31.x，新增 TR 评审、评审撤回、整改补充、IPD 流程布局、统计报表等）
- git: main 分支，4e839c9，工作区干净
- 部署：160 个 .opk 文件在根目录（.gitignore 已含 `*.opk`，不会被 git 跟踪）

## 下一步

- docs/技术方案.md 和 docs/需求方案.md 需要按 v1.31.x 现状同步更新
