// ============================================================
// DCP 评审中心 v1.6.5 — Backend
//
// Changelog since v1.6.4:
// - Fixed "新建工作项" redirect: use parent window projectUuid instead of stored value
// - Fixed reviewer-workspace exchange API path for project UUID resolution
// ============================================================
import { Logger } from '@ones-op/node-logger'
import { storage } from '@ones-op/sdk/node'
import type { PluginResponse } from '@ones-op/node-types'
import { OPFetch, getOpenApiToken } from '@ones-op/fetch'
import { Notify, NotifyWay } from '@ones-op/node-ability'

// ============================================================
// 实体引用
// ============================================================
const baseCfg = storage.entity('dcp_base_config')
const phaseTpl = storage.entity('dcp_phase_template')
const matTpl = storage.entity('dcp_material_template')
const indTpl = storage.entity('dcp_indicator_template')
const roleTpl = storage.entity('dcp_reviewer_role')
const review = storage.entity('dcp_review')
const matItem = storage.entity('dcp_review_material')
const indData = storage.entity('dcp_review_indicator')
const rvReviewer = storage.entity('dcp_review_reviewer')
const linkedIssue = storage.entity('dcp_linked_issue')
const resolution = storage.entity('dcp_resolution')
const supplement = storage.entity('dcp_supplement')
const auditLog = storage.entity('dcp_audit_log')
const checkItem = storage.entity('dcp_checklist_item')
const checkResult = storage.entity('dcp_checklist_result')

const ALL_ENTITIES = [matItem, indData, rvReviewer, linkedIssue, resolution, supplement, auditLog]

// ============================================================
// 工具
// ============================================================
async function qAll(e: any, filter?: (v: any) => boolean) {
  const allItems: any[] = []
  let cursor: string | null = null
  let safety = 0
  while (safety < 100) {
    safety++
    const q = e.query().limit(200)
    if (cursor) q.cursor(cursor)
    const result = await q.getMany()
    if (!result || !Array.isArray(result.data)) break
    for (const d of result.data) {
      allItems.push({ _key: d.key, ...(d.value || {}) })
    }
    const pi = result.page_info
    if (pi && pi.has_more && pi.end_cursor) {
      cursor = pi.end_cursor
    } else {
      break
    }
  }
  return filter ? allItems.filter((d: any) => filter(d)) : allItems
}

async function writeAudit(rvUuid: string, op: string, action: string, target: string, detail: string, result = 'success') {
  const k = `${rvUuid}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  await auditLog.set(k, {
    review_uuid: rvUuid, timestamp: Date.now(), operator_uuid: op || '',
    action, target, detail, result,
  })
}

function jsonArr(s: string): any[] {
  try { const a = JSON.parse(s); return Array.isArray(a) ? a : [] } catch { return [] }
}

function makeUuid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// ---- 通知 ---- 

const NOTIFY_WAY_MAP: Record<string, NotifyWay> = {
  email: NotifyWay.Email,
  wechat: NotifyWay.WeChat,
  dingtalk: NotifyWay.DingDing,
  feishu: NotifyWay.Lark,
  youdao: NotifyWay.YouDu,
}

async function getNotifyConfig(): Promise<any> {
  try {
    const cfg = await baseCfg.get('notify_config')
    if (cfg && (cfg as any).value) return JSON.parse((cfg as any).value)
  } catch { /* ignore */ }
  // 默认配置
  return {
    enabled: true,
    on_review_start: true,
    on_all_submitted: true,
    on_resolution: true,
    channels: { email: true, wechat: false, dingtalk: false, feishu: false, youdao: false },
  }
}

// 评审撤回配置
async function getReviewRecallConfig(): Promise<any> {
  try {
    const cfg = await baseCfg.get('review_recall_config')
    if (cfg && (cfg as any).value) return JSON.parse((cfg as any).value)
  } catch { /* ignore */ }
  return {
    enabled: false,
    allowedBeforeResolution: true,
    requireReason: true,
    clearSubmittedOpinions: true,
  }
}

async function sendNotification(
  title: string, body: string, url: string, toUsers: string[], channels?: Record<string, boolean>
): Promise<{ attempted: string[]; succeeded: string[]; failed: { channel: string; error: string }[] }> {
  const cfg = await getNotifyConfig()
  const result = { attempted: [] as string[], succeeded: [] as string[], failed: [] as { channel: string; error: string }[] }
  if (!cfg.enabled) return result
  const ch = channels || cfg.channels
  for (const [key, enabled] of Object.entries(ch)) {
    if (!enabled) continue
    const way = NOTIFY_WAY_MAP[key]
    if (!way) continue
    result.attempted.push(key)
    try {
      await Notify({
        Title: title,
        ToUsers: toUsers,
        NotifyWay: way,
        MessageBody: [{ Body: body, Url: url }],
      })
      result.succeeded.push(key)
      Logger.info(`[DCP] Notification sent: ${key} to ${toUsers.length} users`)
    } catch (e: any) {
      result.failed.push({ channel: key, error: e.message || String(e) })
      Logger.error(`[DCP] Notification failed (${key}):`, e.message)
    }
  }
  return result
}

// external API 兼容：路径参数可能在 req.params 或需从 URL 中提取
function getParam(req: any, name: string): string {
  if (req.params?.[name]) return req.params[name]
  // query string 参数（如 ?review_type=dcp）—— ONES external API 不提供 req.query，手动解析
  if (req.query?.[name] !== undefined) return String(req.query[name])
  const rawUrl = req.url || req.path || ''
  const qIdx = rawUrl.indexOf('?')
  if (qIdx >= 0) {
    const qs = rawUrl.slice(qIdx + 1)
    for (const pair of qs.split('&')) {
      const eq = pair.indexOf('=')
      const k = eq >= 0 ? pair.slice(0, eq) : pair
      const v = eq >= 0 ? pair.slice(eq + 1) : ''
      if (decodeURIComponent(k) === name) return decodeURIComponent(v)
    }
  }
  // 去掉 query string，防止正则把 ?xxx 也匹配进去
  const url = rawUrl.split('?')[0]
  // 匹配 /{name}/{value}（如 /review_uuid/xxx）
  const named = url.match(new RegExp(`/${name}/([^/]+)`))
  if (named) return named[1]
  // review_uuid 出现在 /dcp/review/{uuid} 或 /dcp/review/{uuid}/子路径
  if (name === 'review_uuid') {
    const rv = url.match(/\/dcp\/review\/([^/]+)/)
    if (rv) return rv[1]
  }
  // project_uuid 出现在 /by-project/{uuid}
  if (name === 'project_uuid') {
    const pj = url.match(new RegExp('/by-project/([^/]+)'))
    if (pj) return pj[1]
  }
  // template_id 出现在 /material/{value}/file
  if (name === 'template_id') {
    const tid = url.match(new RegExp('/material/([^/]+)'))
    if (tid) return tid[1]
  }
  // team_uuid 出现在 /team/{uuid}
  if (name === 'team_uuid') {
    const tm = url.match(/\/team\/([^/]+)/)
    if (tm) return tm[1]
  }
  // review_type 只从 params/query 取，不走路径兜底（否则会误匹配 URL 末尾段）
  if (name === 'review_type') return ''
  // 最后一个兜底：匹配路径末尾段（如 /dcp/review/{value} 无子路径时）
  const last = url.match(/\/([^/]+)\/?$/)
  if (last && last[1] !== name) return last[1]
  return ''
}

// ============================================================
// 生命周期
// ============================================================
export function Install() { Logger.info('[DCP] Install') }
export function Disable() { Logger.info('[DCP] Disable') }
export function UnInstall() { Logger.info('[DCP] UnInstall') }

// ============================================================
// 项目元数据解析（project_uuid → name/identifier/real_uuid）
// ============================================================
async function findProjectByGraphQL(teamUUID: string, realUUID: string, identifier: string): Promise<any> {
  const gqlRes = await OPFetch(
    `/project/api/project/team/${teamUUID}/items/graphql?t=dcp_project_meta`,
    {
      method: 'POST',
      teamUUID,
      headers: { 'Content-Type': 'application/json' },
      data: {
        query: `{
          buckets(
            groupBy: { projects: {} },
            pagination: { limit: 100, after: "", preciseCount: true }
          ) {
            projects(
              limit: 10000,
              filterGroup: [
                { visibleInProject_equal: true, isArchive_equal: false }
              ]
            ) {
              uuid
              identifier
              name
              key
            }
          }
        }`,
        variables: {},
      },
    }
  ) as any

  const buckets =
    gqlRes?.data?.data?.buckets ||
    gqlRes?.data?.buckets ||
    gqlRes?.buckets ||
    []

  const projects = buckets.flatMap((bucket: any) => bucket.projects || [])
  return projects.find((p: any) => p.uuid === realUUID || p.identifier === identifier) || null
}

async function findProjectByStamp(teamUUID: string, realUUID: string): Promise<any> {
  const stampRes = await OPFetch(
    `/project/api/project/team/${teamUUID}/project/${realUUID}/stamps/data?t=project`,
    {
      method: 'POST',
      teamUUID,
      headers: { 'Content-Type': 'application/json' },
      data: { project: 0 },
    }
  ) as any
  const stampData = stampRes?.data || stampRes
  return stampData?.project?.projects?.[0] || null
}

async function resolveProjectMeta(teamUUID: string, projectKey: string): Promise<Record<string, string>> {
  let identifier = projectKey
  let realUUID = ''

  // Step 1: exchange API → real UUID + identifier（失败不致命）
  try {
    const exchRes = await OPFetch(
      `/project/api/ones-project/team/${teamUUID}/projects/exchange/${projectKey}`,
      { teamUUID }
    )
    const exchData = exchRes?.data || exchRes || {}
    identifier = exchData.identifier || projectKey
    realUUID = exchData.project_uuid || ''
  } catch (err: any) {
    Logger.info(`[DCP][project-meta] exchange failed, key=${projectKey}, err=${err?.message || err}`)
  }

  // Step 2: GraphQL → project name（失败不致命）
  let project: any = null
  if (realUUID || identifier) {
    try {
      project = await findProjectByGraphQL(teamUUID, realUUID, identifier)
    } catch (err: any) {
      Logger.info(`[DCP][project-meta] graphql failed, key=${projectKey}, realUUID=${realUUID}, err=${err?.message || err}`)
    }
  }

  // Step 3: stamps 兜底 → project name
  if (!project && realUUID) {
    try {
      project = await findProjectByStamp(teamUUID, realUUID)
    } catch (err: any) {
      Logger.info(`[DCP][project-meta] stamp failed, key=${projectKey}, realUUID=${realUUID}, err=${err?.message || err}`)
    }
  }

  return {
    project_identifier: project?.identifier || identifier || projectKey,
    project_real_uuid: project?.uuid || realUUID || '',
    project_name: project?.name || identifier || projectKey,
  }
}

export async function Enable() {
  Logger.info('[DCP v1.18.0] Enable — 状态机迁移 + ReviewerWorkspace ready')

  // 状态机迁移：为旧数据回填 review_state / round_no / round_state
  try {
    const allReviews = await qAll(review)
    let migrated = 0
    for (const rv of allReviews) {
      if (rv.review_state) continue  // 已有 review_state，跳过
      const derivedState = getEffectiveState(rv)
      await review.set(rv.review_uuid, {
        ...rv,
        review_state: derivedState,
        round_no: Number(rv.round_no) || 1,
        round_state: stateToRoundState(derivedState),
        state_history_json: JSON.stringify([{
          state: derivedState,
          at: Date.now(),
          by: 'system',
          reason: '迁移：从旧 status 回填',
          round_no: Number(rv.round_no) || 1,
          from_state: '',
        }]),
      })
      migrated++
    }
    if (migrated > 0) {
      Logger.info(`[DCP] 状态机迁移完成：${migrated} 条评审单已回填 review_state`)
    }
  } catch (e) {
    Logger.info('[DCP] 状态机迁移跳过（可能已迁移或无数据）')
  }

  const n = await roleTpl.query().count()
  if (n > 0) return
  const roles = [
    { role_name: 'Chair', must_vote: true, has_veto: true },
    { role_name: '研发VP', must_vote: true, has_veto: false },
    { role_name: '市场VP', must_vote: true, has_veto: false },
    { role_name: '财务代表', must_vote: true, has_veto: true },
    { role_name: '质量代表', must_vote: true, has_veto: true },
    { role_name: '供应链代表', must_vote: true, has_veto: false },
  ]
  for (let i = 0; i < roles.length; i++) {
    await roleTpl.set(`role_${i}`, { ...roles[i], sort_order: i })
  }
  Logger.info('[DCP] Default reviewer roles initialized')
}

export function Upgrade(oldVersion: any) {
  Logger.info('[DCP v1.5.3] Upgrade from:', JSON.stringify(oldVersion))
  Logger.info('[DCP v1.5.0] Entity migration: file fields on dcp_review_material already registered')
}

// ============================================================
// ProjectCustomComponent — 数据复制
// ============================================================
export async function copyPluginDataForDCP(_req: any): Promise<PluginResponse> {
  return { body: { code: 200, body: { state: 0, message: 'success' } } }
}

// ============================================================
// IPD 流程图默认布局
// ============================================================
const DEFAULT_IPD_FLOW_LAYOUT = {
  stages: [
    { code: 'concept', name: '概念', shape: 'taper', widthRatio: 1.1 },
    { code: 'plan', name: '计划', shape: 'taper', widthRatio: 1.5 },
    { code: 'develop', name: '开发', shape: 'rect', widthRatio: 2.8 },
    { code: 'confirm', name: '确认', shape: 'rect', widthRatio: 1.5 },
    { code: 'release', name: '发布', shape: 'rect', widthRatio: 1.4 },
  ],
  markers: [
    { phaseCode: 'DCP1', reviewType: 'dcp', stage: 'concept', position: 1, side: 'top', shape: 'diamond' },
    { phaseCode: 'TR1', reviewType: 'tr', stage: 'concept', position: 1, side: 'bottom', shape: 'triangle' },
    { phaseCode: 'TR2', reviewType: 'tr', stage: 'plan', position: 0.35, side: 'bottom', shape: 'triangle' },
    { phaseCode: 'DCP2', reviewType: 'dcp', stage: 'plan', position: 1, side: 'top', shape: 'diamond' },
    { phaseCode: 'TR3', reviewType: 'tr', stage: 'plan', position: 1, side: 'bottom', shape: 'triangle' },
    { phaseCode: 'DCP3', reviewType: 'dcp', stage: 'develop', position: 0.55, side: 'top', shape: 'diamond' },
    { phaseCode: 'TR4', reviewType: 'tr', stage: 'develop', position: 0.5, side: 'bottom', shape: 'triangle' },
    { phaseCode: 'DCP4', reviewType: 'dcp', stage: 'develop', position: 1, side: 'top', shape: 'diamond' },
    { phaseCode: 'TR5', reviewType: 'tr', stage: 'develop', position: 1, side: 'bottom', shape: 'triangle' },
    { phaseCode: 'DCP5', reviewType: 'dcp', stage: 'confirm', position: 1, side: 'top', shape: 'diamond' },
    { phaseCode: 'TR6', reviewType: 'tr', stage: 'confirm', position: 1, side: 'bottom', shape: 'triangle' },
  ],
}

// ============================================================
// 决议规则配置（resolution_rule_config）
// DCP/TR 分别配置发布人、提交要求、通过规则、可选决议结果
// 存储于 dcp_base_config，key=resolution_rule_config，value=JSON 字符串
// ============================================================
const DEFAULT_RESOLUTION_RULES: any = {
  dcp: {
    publisher: { mode: 'single_role', role: 'Chair' },
    submitRequirement: { mode: 'vote_scope_roles' },
    passRule: {
      mode: 'min_approval_count',
      minCount: 3,
      approvalConclusions: ['pass', 'conditional_pass'],
      voteScope: { mode: 'must_vote_roles', selectedRoles: [], excludeRoles: ['Chair'] },
      rejectOnAnyVeto: true,
    },
    allowedConclusions: ['pass', 'conditional_pass', 'reject'],
  },
  tr: {
    publisher: { mode: 'single_role', role: '' },
    submitRequirement: { mode: 'must_vote_roles' },
    passRule: {
      mode: 'all_required_submitted',
      approvalConclusions: ['pass', 'conditional_pass'],
      rejectConclusions: ['fail', 'rework', 'reject'],
      voteScope: { mode: 'must_vote_roles', selectedRoles: [], excludeRoles: [] },
      rejectOnAnyVeto: true,
    },
    allowedConclusions: ['pass', 'conditional_pass', 'fail', 'rework'],
  },
}

// 从规则配置中获取唯一决议角色（兼容旧版 publisher.roles 数组）
function getPublisherRole(rule: any): string {
  if (!rule?.publisher) return ''
  if (rule.publisher.role) return rule.publisher.role
  if (Array.isArray(rule.publisher.roles) && rule.publisher.roles.length > 0) return rule.publisher.roles[0]
  return ''
}

// 深度合并：以默认规则为骨架，savedR 中存在的字段覆盖默认值
function deepMergeRule(defaultR: any, savedR: any): any {
  if (!savedR || typeof savedR !== 'object' || Array.isArray(savedR)) return defaultR
  const result: any = {}
  for (const k of Object.keys(defaultR)) {
    const dv = defaultR[k]
    const sv = savedR[k]
    if (dv && typeof dv === 'object' && !Array.isArray(dv)) {
      result[k] = deepMergeRule(dv, sv)
    } else if (Array.isArray(dv)) {
      result[k] = Array.isArray(sv) ? sv : dv
    } else {
      result[k] = sv !== undefined ? sv : dv
    }
  }
  // 保留 savedR 中的额外字段
  for (const k of Object.keys(savedR)) {
    if (result[k] === undefined) result[k] = savedR[k]
  }
  return result
}

async function getResolutionRuleConfig(): Promise<any> {
  try {
    const row = await baseCfg.get('resolution_rule_config')
    if (row && (row as any).value) {
      const saved = JSON.parse((row as any).value)
      const migrated = migrateRuleConfig(saved)
      return {
        dcp: deepMergeRule(DEFAULT_RESOLUTION_RULES.dcp, migrated.dcp),
        tr: deepMergeRule(DEFAULT_RESOLUTION_RULES.tr, migrated.tr),
      }
    }
  } catch { /* 使用默认值 */ }
  return JSON.parse(JSON.stringify(DEFAULT_RESOLUTION_RULES))
}

// 迁移旧配置：passRule.excludeRoles → passRule.voteScope.excludeRoles
function migrateRuleConfig(saved: any): any {
  if (!saved || typeof saved !== 'object') return saved
  const result = JSON.parse(JSON.stringify(saved))
  for (const rt of ['dcp', 'tr']) {
    const rule = result[rt]
    if (!rule) continue
    // 迁移 publisher.roles → publisher.role
    if (rule.publisher) {
      if (Array.isArray(rule.publisher.roles) && rule.publisher.roles.length > 0) {
        rule.publisher.role = rule.publisher.role || rule.publisher.roles[0]
      }
      rule.publisher.mode = 'single_role'
      delete rule.publisher.roles
    }
    // passRule 迁移
    if (!rule.passRule) continue
    const pr = rule.passRule
    // 如果有旧的 excludeRoles 但没有 voteScope，迁移
    if (pr.excludeRoles && !pr.voteScope) {
      pr.voteScope = { mode: 'must_vote_roles', selectedRoles: [], excludeRoles: pr.excludeRoles }
      delete pr.excludeRoles
    }
    // 如果 voteScope 存在但缺字段，补齐
    if (pr.voteScope) {
      pr.voteScope.mode = pr.voteScope.mode || 'must_vote_roles'
      pr.voteScope.selectedRoles = pr.voteScope.selectedRoles || []
      pr.voteScope.excludeRoles = pr.voteScope.excludeRoles || []
    }
  }
  return result
}

async function getResolutionRuleByType(reviewType: string): Promise<any> {
  const cfg = await getResolutionRuleConfig()
  const type = reviewType === 'tr' ? 'tr' : 'dcp'
  return cfg[type] || JSON.parse(JSON.stringify(DEFAULT_RESOLUTION_RULES[type]))
}

// 按 review_type 过滤角色模板
function filterRolesByType(roleTemplates: any[], reviewType: string): any[] {
  return roleTemplates.filter((rt: any) => (rt.review_type || 'dcp') === reviewType)
}

// 解析计票范围内的角色名称列表
function resolveVoteScopeRoleNames(rule: any, roleTemplates: any[]): string[] {
  const scope = rule.passRule?.voteScope || {}
  const mode = scope.mode || 'must_vote_roles'
  const excludeRoles = scope.excludeRoles || []
  const selectedRoles = scope.selectedRoles || []
  let roles: any[]
  if (mode === 'all_reviewers') {
    roles = roleTemplates
  } else if (mode === 'selected_roles') {
    roles = roleTemplates.filter((rt: any) => selectedRoles.includes(rt.role_name))
  } else {
    roles = roleTemplates.filter((rt: any) => rt.must_vote)
  }
  return roles.map((rt: any) => rt.role_name).filter((n: string) => !excludeRoles.includes(n))
}

// 校验通过规则（发布决议时调用）
function validatePassRule(
  passRule: any, allRvrs: any[], roleTemplates: any[], fc: string,
): { ok: boolean; error?: string } {
  const mode = passRule.mode || 'min_approval_count'
  const approvalConclusions = passRule.approvalConclusions || ['pass', 'conditional_pass']

  // 一票否决检查（仅对 pass 结论生效）
  if (passRule.rejectOnAnyVeto && fc === 'pass') {
    const vetoRoleNames = roleTemplates.filter((rt: any) => rt.has_veto).map((rt: any) => rt.role_name)
    const vetoRejects = allRvrs.filter((r: any) =>
      vetoRoleNames.includes(r.role_name) && (r.submitted_at > 0) &&
      !approvalConclusions.includes(r.conclusion),
    )
    if (vetoRejects.length > 0) {
      return { ok: false, error: `存在否决权角色投了反对票，不可决议为「通过」：${vetoRejects.map((r: any) => r.role_name).join('、')}` }
    }
  }

  // 非通过结论不校验通过规则
  if (fc !== 'pass') return { ok: true }

  if (mode === 'min_approval_count') {
    const scopeNames = resolveVoteScopeRoleNames({ passRule }, roleTemplates)
    const candidates = allRvrs.filter((r: any) => scopeNames.includes(r.role_name))
    const approvals = candidates.filter((r: any) => approvalConclusions.includes(r.conclusion))
    const minCount = passRule.minCount || 3
    // 区分规则不可达 vs 投票未达标
    if (candidates.length < minCount) {
      return { ok: false, error: `当前评审单可计票评审人只有 ${candidates.length} 人，但规则要求至少 ${minCount} 人通过，请补充评审人或调整规则。` }
    }
    if (approvals.length < minCount) {
      return { ok: false, error: `决议为「通过」需至少 ${minCount} 位评审人投通过/有条件通过，当前仅 ${approvals.length} 位` }
    }
  } else if (mode === 'all_required_approved') {
    const mustVoteNames = roleTemplates.filter((rt: any) => rt.must_vote).map((rt: any) => rt.role_name)
    const notApproved = allRvrs.filter((r: any) =>
      mustVoteNames.includes(r.role_name) && (r.submitted_at > 0) &&
      !approvalConclusions.includes(r.conclusion),
    )
    if (notApproved.length > 0) {
      return { ok: false, error: `以下必投角色未投通过/有条件通过：${notApproved.map((r: any) => r.role_name).join('、')}` }
    }
  }
  // all_required_submitted 模式：只要求已提交，不校验通过数
  return { ok: true }
}

// 决议规则可达性校验（保存配置/发起评审时调用）
function validateResolutionRuleReachability(rule: any, roleTemplates: any[], reviewType: string): string {
  const rtLabel = reviewType.toUpperCase()
  // 校验 1：决议角色不能为空
  const publisherRole = getPublisherRole(rule)
  if (!publisherRole) {
    return `${rtLabel} 决议角色未配置，请选择一个允许发布决议的角色。`
  }
  // 校验 1.5：决议角色必须存在于当前 review_type 的角色模板中
  if (!roleTemplates.some((rt: any) => rt.role_name === publisherRole)) {
    return `${rtLabel} 决议角色「${publisherRole}」不在当前${rtLabel}角色列表中，请重新配置。`
  }
  // 校验 2：可选决议结果不能为空
  if (!rule.allowedConclusions?.length) {
    return `${rtLabel} 可选最终决议结果不能为空，请至少选择一个结果。`
  }
  // 校验 3：允许"通过"时必须有有效通过规则
  if (rule.allowedConclusions.includes('pass') && !rule.passRule?.mode) {
    return `${rtLabel} 允许最终决议为"通过"，请配置对应的通过规则。`
  }
  // 校验 4/5：min_approval_count 的 minCount 不能大于可计票角色数
  if (rule.allowedConclusions.includes('pass') && rule.passRule?.mode === 'min_approval_count') {
    const scopeNames = resolveVoteScopeRoleNames(rule, roleTemplates)
    const minCount = Number(rule.passRule.minCount || 0)
    if (scopeNames.length === 0) {
      return `${rtLabel} 计票范围内没有可计票角色，请调整计票范围或角色配置。`
    }
    if (minCount > scopeNames.length) {
      return `${rtLabel} 计票范围内最多只有 ${scopeNames.length} 个角色可计票，最少通过人数不能设置为 ${minCount}。`
    }
  }
  // 校验 6：提交要求必须覆盖计票范围
  const submitMode = rule.submitRequirement?.mode || 'must_vote_roles'
  const voteScopeMode = rule.passRule?.voteScope?.mode || 'must_vote_roles'
  if (rule.passRule?.mode === 'min_approval_count') {
    if (submitMode === 'must_vote_roles' && voteScopeMode === 'all_reviewers') {
      return `${rtLabel} 通过规则依赖全部评审人投票，但发布前只要求必投角色提交。请改为"全部评审人提交"或"计票范围内角色全部提交"。`
    }
    if (submitMode === 'publisher_only') {
      return `${rtLabel} 通过规则要求至少 N 人通过，但发布前只要求发布人存在。请改为其他提交要求。`
    }
  }
  return '' // 校验通过
}

// 结论文案映射
function conclusionLabel(value: string): string {
  return ({
    pass: '通过',
    conditional_pass: '有条件通过',
    reject: '驳回',
    fail: '不通过',
    rework: '返工',
  } as Record<string, string>)[value] || '未记录'
}

// 判断评审单是否满足决议前置条件（按 submitRequirement.mode 判断）
// 排除决议角色——决议人不参与前置评审提交
function isResolutionReady(rule: any, reviewers: any[], roleTemplates: any[]): boolean {
  const publisherRole = getPublisherRole(rule)
  const frontReviewers = publisherRole ? reviewers.filter((r: any) => r.role_name !== publisherRole) : reviewers
  const submitMode = rule?.submitRequirement?.mode || 'must_vote_roles'
  if (submitMode === 'publisher_only') return true
  if (submitMode === 'all_reviewers') {
    return frontReviewers.length > 0 && frontReviewers.every((r: any) => r.submitted_at > 0)
  }
  if (submitMode === 'vote_scope_roles') {
    const scopeNames = resolveVoteScopeRoleNames(rule, roleTemplates)
    const scopeReviewers = frontReviewers.filter((r: any) => scopeNames.includes(r.role_name))
    if (scopeReviewers.length === 0) return false
    return scopeReviewers.every((r: any) => r.submitted_at > 0)
  }
  // must_vote_roles
  const mustVoteNames = roleTemplates.filter((rt: any) => rt.must_vote || rt.has_veto).map((rt: any) => rt.role_name)
  const mustReviewers = frontReviewers.filter((r: any) => mustVoteNames.includes(r.role_name))
  if (mustReviewers.length === 0) return false
  return mustReviewers.every((r: any) => r.submitted_at > 0)
}

// ============================================================
// 状态机 — 完整状态流转
// ============================================================

// 主状态枚举
const REVIEW_STATES = [
  'draft', 'ready', 'reviewing', 'awaiting_resolution',
  'resolution_published', 'remediation_pending', 're_reviewing',
  'completed', 'rejected', 'canceled', 'archived',
] as const

// 合法流转表
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:               ['ready', 'reviewing', 'canceled'],
  ready:               ['reviewing', 'draft', 'canceled'],
  reviewing:           ['awaiting_resolution', 'remediation_pending', 'draft', 'canceled'],
  awaiting_resolution: ['resolution_published', 'remediation_pending', 'reviewing', 'canceled'],
  resolution_published:['completed', 'rejected', 'remediation_pending'],
  remediation_pending: ['re_reviewing', 'canceled'],
  re_reviewing:        ['awaiting_resolution', 'canceled'],
  completed:           ['archived'],
  rejected:            ['draft', 'archived'],
  canceled:            ['archived', 'draft', 'reviewing'],
  archived:            [],
}

// review_state → 旧 status 兼容映射
function stateToStatus(reviewState: string): string {
  switch (reviewState) {
    case 'draft': case 'ready': case 'canceled': return 'draft'
    case 'reviewing': case 'awaiting_resolution': case 're_reviewing': case 'remediation_pending': return 'reviewing'
    case 'completed': case 'archived': return 'completed'
    case 'rejected': return 'rejected'
    default: return 'draft'
  }
}

// review_state → round_state 映射
function stateToRoundState(reviewState: string): string {
  switch (reviewState) {
    case 'draft': case 'ready': return 'draft'
    case 'reviewing': return 'running'
    case 'awaiting_resolution': return 'waiting_resolution'
    case 'resolution_published': return 'resolved'
    case 'remediation_pending': return 'remediation_pending'
    case 're_reviewing': return 're_reviewing'
    case 'completed': case 'rejected': case 'canceled': case 'archived': return 'closed'
    default: return 'draft'
  }
}

// 从实体读取有效 review_state（兼容旧数据：review_state 为空时从 status 推导）
function getEffectiveState(rv: any): string {
  if (rv.review_state) return rv.review_state
  // 旧数据兼容：status → review_state
  const s = rv.status || 'draft'
  if (s === 'draft') return 'draft'
  if (s === 'reviewing') return 'reviewing'
  if (s === 'completed') return 'completed'
  if (s === 'rejected') return 'rejected'
  return 'draft'
}

// 追加状态历史记录，返回新 JSON 字符串
function appendStateHistory(rv: any, newState: string, by: string, reason: string): string {
  const history = jsonArr(rv.state_history_json || '[]')
  history.push({
    state: newState,
    at: Date.now(),
    by: by || '',
    reason: reason || '',
    round_no: Number(rv.round_no || 1),
    from_state: getEffectiveState(rv),
  })
  // 保留最近 100 条，防止 32KB 溢出
  if (history.length > 100) history.splice(0, history.length - 100)
  return JSON.stringify(history)
}

// 校验流转合法性
function isValidTransition(from: string, to: string): boolean {
  const valid = VALID_TRANSITIONS[from] || []
  return valid.includes(to)
}

// 执行状态流转（写入 review 实体 + 历史记录）
// 不单独 set——调用方在已有的 review.set 中合并新字段
function buildStateTransition(rv: any, newState: string, by: string, reason: string, extra?: Record<string, any>): Record<string, any> {
  const currentState = getEffectiveState(rv)
  const historyJson = appendStateHistory(rv, newState, by, reason)
  const newStatus = stateToStatus(newState)
  const newRoundState = stateToRoundState(newState)
  // 进入 re_reviewing 时开启新轮次
  let newRoundNo = Number(rv.round_no || 1)
  if (newState === 're_reviewing' && currentState === 'remediation_pending') {
    newRoundNo = newRoundNo + 1
  }
  return {
    ...extra,
    review_state: newState,
    status: newStatus,
    round_no: newRoundNo,
    round_state: newRoundState,
    state_history_json: historyJson,
    updated_at: Date.now(),
  }
}

// ============================================================
// 配置
// ============================================================
export async function getPluginConfig(_req: any): Promise<PluginResponse> {
  const keys = ['default_resolution_template', 'remediation_issue_type']
  const config: any = {}
  for (const k of keys) {
    const v = await baseCfg.get(k)
    config[k] = (v as any)?.value || ''
  }
  // IPD 流程图布局
  let ipdFlowLayout: any = DEFAULT_IPD_FLOW_LAYOUT
  try {
    const fl = await baseCfg.get('ipd_flow_layout')
    if (fl && (fl as any).value) {
      ipdFlowLayout = JSON.parse((fl as any).value)
    }
  } catch { /* 使用默认值 */ }
  const withType = (arr: any[]) => arr.map((x: any) => ({ ...x, review_type: x.review_type || 'dcp' }))
  return { body: {
    config,
    ipd_flow_layout: ipdFlowLayout,
    notify_config: await getNotifyConfig(),
    review_recall_config: await getReviewRecallConfig(),
    resolution_rule_config: await getResolutionRuleConfig(),
    phases: withType(await qAll(phaseTpl)),
    materials: withType(await qAll(matTpl)),
    indicators: withType(await qAll(indTpl)),
    roles: withType(await qAll(roleTpl)),
    checklistItems: withType(await qAll(checkItem)),
  }}
}

export async function savePluginConfig(req: any): Promise<PluginResponse> {
  try {
    const b = (req.body || {}) as any
    const operator_uuid = b.operator_uuid || ''
    if (b.config) {
      for (const [k, v] of Object.entries(b.config)) {
        await baseCfg.set(k as string, { key: k, value: v as string })
      }
    }
    const replace = async (store: any, items: any[], prefix: string, allowedExtra: string[] = []) => {
      const old = await qAll(store)
      const oldKeys = new Set(old.map((o: any) => o._key))
      if (Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          const { _key, dependencies, ...clean } = items[i]
          // 只对 phase 实体保留 dependencies
          const withDeps = allowedExtra.includes('dependencies') ? { ...clean, dependencies: dependencies || '[]' } : clean
          const key = `${prefix}_${i}`
          const rt = (clean as any).review_type || 'dcp'
          await store.set(key, { ...withDeps, review_type: rt, sort_order: clean.sort_order ?? i })
          oldKeys.delete(key)
        }
      }
      for (const k of oldKeys) {
        try { await store.delete(k) } catch { /* key 可能已不存在 */ }
      }
    }
    if (b.phases) await replace(phaseTpl, b.phases, 'phase', ['dependencies'])
    if (b.materials) await replace(matTpl, b.materials, 'mat')
    if (b.indicators) await replace(indTpl, b.indicators, 'ind')
    if (b.roles) await replace(roleTpl, b.roles, 'role')
    if (b.checklistItems) await replace(checkItem, b.checklistItems, 'chk')
    if (b.notify_config) await baseCfg.set('notify_config',
      { key: 'notify_config', value: typeof b.notify_config === 'string' ? b.notify_config : JSON.stringify(b.notify_config) })
    if (b.review_recall_config) await baseCfg.set('review_recall_config',
      { key: 'review_recall_config', value: typeof b.review_recall_config === 'string' ? b.review_recall_config : JSON.stringify(b.review_recall_config) })
    if (b.ipd_flow_layout) await baseCfg.set('ipd_flow_layout',
      { key: 'ipd_flow_layout', value: typeof b.ipd_flow_layout === 'string' ? b.ipd_flow_layout : JSON.stringify(b.ipd_flow_layout) })
    if (b.resolution_rule_config) {
      const rawRule = typeof b.resolution_rule_config === 'string'
        ? JSON.parse(b.resolution_rule_config)
        : b.resolution_rule_config
      // 保存前做可达性校验
      const allRoles = await qAll(roleTpl)
      for (const rt of ['dcp', 'tr']) {
        const rule = rawRule[rt]
        if (!rule) continue
        const typeRoles = filterRolesByType(allRoles, rt)
        const err = validateResolutionRuleReachability(rule, typeRoles, rt)
        if (err) {
          return { body: { error: err }, statusCode: 400 }
        }
      }
      await baseCfg.set('resolution_rule_config', { key: 'resolution_rule_config', value: JSON.stringify(rawRule) })
    }
    Logger.info(`[DCP] Config saved by ${operator_uuid || 'unknown'}`)
    return { body: { ok: true } }
  } catch (err: any) {
    Logger.error('[DCP] Config save failed:', err.message)
    return { body: { error: err.message }, statusCode: 500 }
  }
}

// ============================================================
// 创建评审单
// ============================================================
export async function createReview(req: any): Promise<PluginResponse> {
  const b = (req.body || {}) as any
  const { project_uuid, phase_code, review_title, meeting_time, creator_uuid, review_type } = b
  if (!project_uuid || !phase_code) {
    return { body: { error: '缺少 project_uuid / phase_code' }, statusCode: 400 }
  }
  const rvUuid = makeUuid()
  const now = Date.now()
  const reviewType = review_type || 'dcp'
  // 生成唯一编号: {项目标识}{YYYYMMDD}{两位序号}，序号计数器存 base_config
  const projectIdentifier = b.project_identifier || ''
  let reviewNumber = ''
  try {
    const d = new Date()
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    // entity key 只允许小写字母 /^[_a-z0-9]{1,64}$/，projectIdentifier 转小写
    const seqKey = `review_seq_${projectIdentifier.toLowerCase()}_${dateStr}`
    let seq = 1
    try {
      const seqRow = await baseCfg.get(seqKey)
      if (seqRow && (seqRow as any).value) { seq = parseInt(String((seqRow as any).value), 10) + 1 }
    } catch { /* key 不存在，首次创建 */ }
    await baseCfg.set(seqKey, { key: seqKey, value: String(seq) })
    reviewNumber = `${reviewType === 'tr' ? 'TR-' : ''}${projectIdentifier}${dateStr}${String(seq).padStart(2, '0')}`
  } catch (e: any) {
    // 编号生成失败不阻塞创建，用时间戳兜底
    reviewNumber = `${reviewType === 'tr' ? 'TR-' : ''}${projectIdentifier}${Date.now()}`
    Logger.info(`[DCP] review_number generation failed, fallback: ${reviewNumber}`)
  }
  await review.set(rvUuid, {
    review_uuid: rvUuid, project_uuid, phase_code,
    review_title: review_title || 'DCP评审', meeting_time: meeting_time || 0,
    status: 'draft',
    review_state: 'draft',
    round_no: 1,
    round_state: 'draft',
    state_history_json: JSON.stringify([{
      state: 'draft', at: now, by: creator_uuid || 'system',
      reason: '创建评审单', round_no: 1, from_state: '',
    }]),
    creator_uuid: creator_uuid || '',
    created_at: now, updated_at: now,
    review_number: reviewNumber,
    review_type: reviewType,
  })
  // 带出材料模板
  const mats = await qAll(matTpl, (v: any) => jsonArr(v.applicable_phases).includes(phase_code) && (v.review_type || 'dcp') === reviewType)
  for (const m of mats) {
    await matItem.set(`${rvUuid}_mat_${m._key}`, {
      review_uuid: rvUuid, template_id: m._key, submit_status: 'pending',
      notes: '', updated_by: '', updated_at: 0,
    })
  }
  // 带出指标模板
  const inds = await qAll(indTpl, (v: any) => jsonArr(v.applicable_phases).includes(phase_code) && (v.review_type || 'dcp') === reviewType)
  for (const i of inds) {
    await indData.set(`${rvUuid}_ind_${i._key}`, {
      review_uuid: rvUuid, template_id: i._key, current_value: 0,
      notes: '', risk_color: 'green', updated_by: '', updated_at: 0,
    })
  }
  await writeAudit(rvUuid, creator_uuid || '', '创建评审', rvUuid,
    `创建${reviewType === 'tr' ? 'TR' : 'DCP'}评审单: ${reviewNumber} - ${phase_code} - ${review_title || 'DCP评审'}`)
  return { body: { review_uuid: rvUuid, review_number: reviewNumber, materials_count: mats.length, indicators_count: inds.length } }
}

// ============================================================
// 删除评审单（仅草稿，仅创建者）
// ============================================================
export async function deleteReview(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { operator_uuid } = b
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  if (rv.status !== 'draft') return { body: { error: '仅草稿状态的评审单可删除' }, statusCode: 403 }
  if (operator_uuid && (rv as any).creator_uuid && operator_uuid !== (rv as any).creator_uuid) {
    return { body: { error: '仅创建者可删除' }, statusCode: 403 }
  }
  // 删除关联子实体
  const [mats, inds, chkResults, linkedIssues, auditLogs] = await Promise.all([
    qAll(matItem, (v: any) => v.review_uuid === rid),
    qAll(indData, (v: any) => v.review_uuid === rid),
    qAll(checkResult, (v: any) => v.review_uuid === rid),
    qAll(linkedIssue, (v: any) => v.review_uuid === rid),
    qAll(auditLog, (v: any) => v.review_uuid === rid),
  ])
  for (const m of mats) await matItem.delete((m as any)._key)
  for (const i of inds) await indData.delete((i as any)._key)
  for (const c of chkResults) await checkResult.delete((c as any)._key)
  for (const l of linkedIssues) await linkedIssue.delete((l as any)._key)
  for (const a of auditLogs) await auditLog.delete((a as any)._key)
  await review.delete(rid)
  await writeAudit(rid, operator_uuid || '', '删除评审', rid,
    `删除DCP评审单: ${(rv as any).phase_code || ''}`)
  return { body: { ok: true } }
}

// ============================================================
// 重新发起评审（从已驳回的评审单复制配置，创建新 draft 评审单）
// ============================================================
export async function recreateReview(req: any): Promise<PluginResponse> {
  const srcRid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const operator_uuid = b.operator_uuid || ''
  if (!srcRid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }

  const srcRv = await review.get(srcRid) as any
  if (!srcRv) return { body: { error: '源评审单不存在' }, statusCode: 404 }
  if (srcRv.status !== 'rejected') {
    return { body: { error: '仅已驳回的评审单可重新发起' }, statusCode: 400 }
  }

  // 创建新评审单
  const newRid = makeUuid()
  const now = Date.now()
  // 生成编号
  const projectIdentifier = srcRv.project_identifier || b.project_identifier || ''
  let reviewNumber = ''
  try {
    const d = new Date()
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const seqKey = `review_seq_${projectIdentifier.toLowerCase()}_${dateStr}`
    let seq = 1
    try {
      const seqRow = await baseCfg.get(seqKey)
      if (seqRow && (seqRow as any).value) { seq = parseInt(String((seqRow as any).value), 10) + 1 }
    } catch { /* key 不存在 */ }
    await baseCfg.set(seqKey, { key: seqKey, value: String(seq) })
    reviewNumber = `${projectIdentifier}${dateStr}${String(seq).padStart(2, '0')}`
  } catch {
    reviewNumber = `${projectIdentifier}${Date.now()}`
  }

  // 复制评审人（从快照或实体），先于 review.set 以便写入 reviewers_json
  const snapReviewers = jsonArr(srcRv.reviewers_json || '[]')
  const srcReviewers = snapReviewers.length > 0 ? snapReviewers
    : await qAll(rvReviewer, (v: any) => v.review_uuid === srcRid)
  const newReviewers = srcReviewers.map((r: any) => ({
    role_name: r.role_name,
    reviewer_uuid: r.reviewer_uuid,
    reviewer_name: r.reviewer_name || '',
    submitted_at: 0,
    conclusion: '',
    risk_level: '',
    opinion_summary: '',
  }))

  await review.set(newRid, {
    review_uuid: newRid,
    project_uuid: srcRv.project_uuid,
    phase_code: srcRv.phase_code,
    review_title: srcRv.review_title || 'DCP评审',
    meeting_time: 0,
    status: 'draft',
    review_state: 'draft',
    round_no: 1,
    round_state: 'draft',
    state_history_json: JSON.stringify([{
      state: 'draft', at: now, by: operator_uuid || 'system',
      reason: `重新发起（源: ${srcRv.review_number || srcRid}）`, round_no: 1, from_state: '',
    }]),
    creator_uuid: operator_uuid || srcRv.creator_uuid || '',
    created_at: now,
    updated_at: now,
    review_number: reviewNumber,
    reviewers_json: JSON.stringify(newReviewers),
  })

  // 复制材料（含文件附件）
  const srcMats = await qAll(matItem, (v: any) => v.review_uuid === srcRid)
  for (const m of srcMats) {
    const { _key, review_uuid, ...matData } = m
    await matItem.set(`${newRid}_mat_${m.template_id}`, {
      ...matData,
      review_uuid: newRid,
      submit_status: m.file_data ? 'submitted' : 'pending',
      notes: '',
      updated_by: '',
      updated_at: 0,
    })
  }

  // 复制指标
  const srcInds = await qAll(indData, (v: any) => v.review_uuid === srcRid)
  for (const i of srcInds) {
    const { _key, review_uuid, ...indData } = i
    await indData.set(`${newRid}_ind_${i.template_id}`, {
      ...indData,
      review_uuid: newRid,
    })
  }

  await writeAudit(newRid, operator_uuid, '创建评审', newRid,
    `重新发起评审（源: ${srcRv.review_number || srcRid}）: ${reviewNumber} - ${srcRv.phase_code}`)
  await writeAudit(srcRid, operator_uuid, '重新发起', newRid,
    `基于此评审单重新发起: ${reviewNumber}`)

  return { body: {
    review_uuid: newRid,
    review_number: reviewNumber,
    materials_count: srcMats.length,
    indicators_count: srcInds.length,
    reviewers_count: newReviewers.length,
  } }
}

// ============================================================
// 获取评审单详情（聚合）
// ============================================================
export async function getReviewDetail(req: any): Promise<PluginResponse> {
  try {
    const rid = getParam(req, 'review_uuid')
    Logger.info(`[DCP] getReviewDetail start, rid=${rid}`)
    if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
    const rv = await review.get(rid)
    Logger.info(`[DCP] getReviewDetail review.get ok, rv=${JSON.stringify(rv)?.substring(0, 200)}`)
    if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
    // 补充阶段名称
    const allPhases = await qAll(phaseTpl)
    const phMap = new Map(allPhases.map((p: any) => [p.phase_code, p.phase_name]))
    const rvWithPhase = { ...(rv as any), phase_name: phMap.get((rv as any).phase_code) || '', review_type: (rv as any).review_type || 'dcp' }
    // 优先读 reviewers_json 快照（绕过 qAll 不可见问题），兜底读实体
    const snapReviewers = jsonArr((rv as any).reviewers_json || '[]')
    Logger.info(`[DCP] getReviewDetail before Promise.all, rid=${rid}`)
    const [materials, indicators, entityReviewers, issues, resList, supps] = await Promise.all([
      qAll(matItem, (v: any) => v.review_uuid === rid),
      qAll(indData, (v: any) => v.review_uuid === rid),
      qAll(rvReviewer, (v: any) => v.review_uuid === rid),
      qAll(linkedIssue, (v: any) => v.review_uuid === rid),
      qAll(resolution, (v: any) => v.review_uuid === rid),
      qAll(supplement, (v: any) => v.review_uuid === rid),
    ])
    Logger.info(`[DCP] getReviewDetail Promise.all ok: mats=${materials.length}, inds=${indicators.length}, entity_rvrs=${entityReviewers.length}, snap_rvrs=${snapReviewers.length}, issues=${issues.length}, res=${resList.length}, supps=${supps.length}`)
    // 优先使用实体数据（source of truth），实体为空时兜底读快照
    let reviewers = entityReviewers.length > 0 ? entityReviewers : snapReviewers
    // 投影到当前轮次：如果 reviewer 的 round_no 不匹配当前轮次，视为未提交
    // （修复 confirmRemediation/transitionReview 重置实体时 qAll 返回空导致实体未更新的问题）
    const _projRoundNo = (rv as any).round_no || 1
    reviewers = reviewers.map((r: any) => {
      if ((r.round_no || 1) !== _projRoundNo) {
        return { ...r, submitted_at: 0, conclusion: '', risk_level: '', opinion_summary: '', round_no: _projRoundNo }
      }
      return r
    })
    const allMatTpls = await qAll(matTpl)
    const matsWithTpl = materials.map((m: any) => ({
      ...m, template: allMatTpls.find((t: any) => t._key === m.template_id) || null,
    }))
    const allIndTpls = await qAll(indTpl)
    const indsWithTpl = indicators.map((i: any) => ({
      ...i, template: allIndTpls.find((t: any) => t._key === i.template_id) || null,
    }))
    Logger.info(`[DCP] getReviewDetail building response`)
    const _rvEffState = getEffectiveState(rv)
    const _currentRoundNo = (rv as any).round_no || 1
    // 整改关联工作项
    const remediationIssues = issues.filter((v: any) => v.link_type === 'remediation')
    const remediationAllDone = remediationIssues.length > 0 && remediationIssues.every((v: any) => v.issue_status === 'done')
    return { body: {
      review: { ...rvWithPhase, effective_state: _rvEffState, round_no: _currentRoundNo },
      materials: matsWithTpl,
      indicators: indsWithTpl,
      reviewers,
      linked_issues: issues,
      remediation_issues: remediationIssues,
      remediation_all_done: remediationAllDone,
      resolution: resList.find((r: any) => (r.round_no || 1) === _currentRoundNo) || null,
      resolutions: resList.sort((a: any, b: any) => (a.round_no || 1) - (b.round_no || 1)),
      supplements: supps.sort((a: any, b: any) => (b.submitted_at || 0) - (a.submitted_at || 0)),
      checklist: jsonArr((rv as any).checklist_json || '[]'),
      state_history: jsonArr((rv as any).state_history_json || '[]'),
      available_transitions: VALID_TRANSITIONS[_rvEffState] || [],
    }}
  } catch (e: any) {
    // ONES SDK 异常可能不是标准 Error，把完整对象序列化用于诊断
    let errDetail = ''
    try {
      if (e instanceof Error) {
        errDetail = e.message
      } else if (typeof e === 'string') {
        errDetail = e
      } else {
        errDetail = JSON.stringify(e)
      }
    } catch { errDetail = String(e) }
    Logger.error(`[DCP] getReviewDetail error: ${errDetail}`, e?.stack || '')
    return { body: { error: `加载详情失败: ${errDetail}` }, statusCode: 500 }
  }
}

// ============================================================
// 按项目列出评审单
// ============================================================
export async function listReviewsByProject(req: any): Promise<PluginResponse> {
  const puid = getParam(req, 'project_uuid')
  const rvType = getParam(req, 'review_type') || ''
  if (!puid) return { body: { error: '缺少 project_uuid' }, statusCode: 400 }
  let rvs = await qAll(review, (v: any) => v.project_uuid === puid && (!rvType || (v.review_type || 'dcp') === rvType))
  // 补充阶段名称映射
  const allPhases = await qAll(phaseTpl)
  const phMap = new Map(allPhases.map((p: any) => [p.phase_code, p.phase_name]))
  // 预加载角色模板（用于决议条件判断）
  const allRoleTpls = await qAll(roleTpl)
  // 预加载决议规则（按 review_type）
  const ruleCache: Record<string, any> = {}
  const enriched = await Promise.all(rvs.map(async (r: any) => {
    const reviewers = await qAll(rvReviewer, (v: any) => v.review_uuid === r.review_uuid)
    const submitted = reviewers.filter((rvr: any) => rvr.submitted_at > 0).length
    const issues = await qAll(linkedIssue, (v: any) => v.review_uuid === r.review_uuid)
    const reviewsMats = await qAll(matItem, (v: any) => v.review_uuid === r.review_uuid)
    const matSubmitted = reviewsMats.filter((m: any) => !!m.file_data).length
    const resolutions = await qAll(resolution, (v: any) => v.review_uuid === r.review_uuid)
    const res = resolutions[0] || null
    const final_conclusion = res?.final_conclusion || ''

    // 决议状态展示字段
    let resolution_status = ''
    let resolution_label = ''
    let resolution_pending = false
    if (res) {
      resolution_status = 'published'
      resolution_label = conclusionLabel(res.final_conclusion)
    } else if (r.status === 'draft') {
      resolution_status = 'not_started'
      resolution_label = '未发起'
    } else if (r.status === 'reviewing') {
      const rType = r.review_type || 'dcp'
      if (!ruleCache[rType]) ruleCache[rType] = await getResolutionRuleByType(rType)
      const rule = ruleCache[rType]
      const roleTpls = filterRolesByType(allRoleTpls, rType)
      const ready = isResolutionReady(rule, reviewers, roleTpls)
      resolution_pending = ready
      resolution_status = ready ? 'pending' : 'reviewing'
      resolution_label = ready ? '待决议' : '评审中'
    } else {
      resolution_status = 'missing'
      resolution_label = '未记录'
    }

    return {
      ...r,
      effective_state: getEffectiveState(r),
      phase_name: phMap.get(r.phase_code) || '',
      reviewer_total: reviewers.length,
      reviewer_done: submitted,
      linked_issue_count: issues.length,
      material_total: reviewsMats.length,
      material_submitted: matSubmitted,
      final_conclusion,
      resolution_status,
      resolution_label,
      resolution_pending,
      resolution_published_at: res?.published_at || 0,
      resolution_published_by_name: res?.published_by_name || '',
    }
  }))
  enriched.sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0))
  // 返回已通过阶段列表（决议为 pass/conditional_pass，供前端依赖检查）
  const allProjReviews = await qAll(review, (v: any) => v.project_uuid === puid)
  const passedPhases: string[] = []
  for (const r of allProjReviews) {
    const res = await qAll(resolution, (v: any) => v.review_uuid === r.review_uuid)
    const fc = res[0]?.final_conclusion || ''
    if (fc === 'pass' || fc === 'conditional_pass') {
      passedPhases.push(r.phase_code)
    }
  }
  return { body: { reviews: enriched, passedPhases: [...new Set(passedPhases)] } }
}

// ============================================================
// 团队全部评审（总览用）
// ============================================================
export async function listTeamReviews(req: any): Promise<PluginResponse> {
  const rvs = await qAll(review)
  const allPhases = await qAll(phaseTpl)
  const phMap = new Map(allPhases.map((p: any) => [p.phase_code, p.phase_name]))
  
  // 提取 team_uuid（多种兜底）
  let tuid = getParam(req, 'team_uuid') || getParam(req, 'teamUUID') || ''
  if (!tuid) {
    // ONES external API 路径为 /project/api/project/team/{uuid}/dcp/...
    const fullUrl = req.url || req.path || req.originalUrl || ''
    const m = fullUrl.match(/\/team\/([A-Za-z0-9_-]+)/)
    if (m) tuid = m[1]
  }
  if (!tuid) {
    // 尝试从查询参数取
    tuid = (req.query || {}).team_uuid || (req.query || {}).teamUUID || ''
  }
  // 🔍 诊断日志（排查 getParam 为何失败，确认修复后可移除）
  if (!tuid) {
    Logger.info('[WARN][listTeamReviews] team_uuid 提取失败', JSON.stringify({
      url: req.url,
      path: req.path,
      params: JSON.stringify(req.params || {}),
      query: JSON.stringify(req.query || {}),
    }))
  }
  
  // 批量解析项目元数据
  const projectKeys = [...new Set(rvs.map((r: any) => r.project_uuid).filter(Boolean))] as string[]
  const projectMetaMap: Record<string, any> = {}
  if (tuid && projectKeys.length > 0) {
    Logger.info(`[listTeamReviews] 解析 ${projectKeys.length} 个项目元数据, team=${tuid}`)
    await Promise.all(projectKeys.map(async (key) => {
      projectMetaMap[key] = await resolveProjectMeta(tuid, key)
    }))
  } else if (projectKeys.length > 0) {
    Logger.info(`[WARN][listTeamReviews] 跳过项目元数据解析: tuid=${JSON.stringify(tuid)}, projectKeys=${JSON.stringify(projectKeys)}`)
  }
  
  let total = 0, reviewing = 0, completed = 0, linkedTotal = 0
  const enriched = await Promise.all(rvs.map(async (r: any) => {
    total++
    if (r.status === 'reviewing') reviewing++
    if (r.status === 'completed' || r.status === 'rejected') completed++
    const reviewers = await qAll(rvReviewer, (v: any) => v.review_uuid === r.review_uuid)
    const submitted = reviewers.filter((rvr: any) => rvr.submitted_at > 0).length
    const issues = await qAll(linkedIssue, (v: any) => v.review_uuid === r.review_uuid)
    linkedTotal += issues.length
    const reviewsMats = await qAll(matItem, (v: any) => v.review_uuid === r.review_uuid)
    const matSubmitted = reviewsMats.filter((m: any) => !!m.file_data).length
    const meta = projectMetaMap[r.project_uuid] || {}
    return {
      ...r,
      effective_state: getEffectiveState(r),
      project_identifier: meta.project_identifier || r.project_uuid,
      project_real_uuid: meta.project_real_uuid || '',
      project_name: meta.project_name || r.project_uuid,
      review_type: r.review_type || 'dcp',
      phase_name: phMap.get(r.phase_code) || '',
      reviewer_total: reviewers.length,
      reviewer_done: submitted,
      linked_issue_count: issues.length,
      material_total: reviewsMats.length,
      material_submitted: matSubmitted,
    }
  }))
  enriched.sort((a: any, b: any) => (b.created_at || 0) - (a.created_at || 0))
  return { body: {
    reviews: enriched,
    stats: { total, reviewing_count: reviewing, completed_count: completed, linked_issue_count: linkedTotal },
  }}
}

// ============================================================
// 我的评审（按评审人 UUID 筛选待办/已办）
// ============================================================
export async function listMyReviews(req: any): Promise<PluginResponse> {
  // ONES external API 无 req.query，从 URL 解析
  const url = req.url || ''
  const qm = url.match(/[?&]reviewer_uuid=([^&]+)/)
  const reviewerUuid = qm ? decodeURIComponent(qm[1]) : ((req.body || {}).reviewer_uuid || '')
  if (!reviewerUuid) {
    return { body: { error: '缺少 reviewer_uuid' }, statusCode: 400 }
  }
  const allRvs = await qAll(review)
  const allPhases = await qAll(phaseTpl)
  const phMap = new Map(allPhases.map((p: any) => [p.phase_code, p.phase_name]))

  // 提取 team_uuid 用于解析项目名称
  let tuid = getParam(req, 'team_uuid') || getParam(req, 'teamUUID') || ''
  if (!tuid) {
    const fullUrl = req.url || req.path || req.originalUrl || ''
    const m = fullUrl.match(/\/team\/([A-Za-z0-9_-]+)/)
    if (m) tuid = m[1]
  }

  // 批量解析项目元数据
  const projectKeys = [...new Set(allRvs.map((r: any) => r.project_uuid).filter(Boolean))] as string[]
  const projectMetaMap: Record<string, any> = {}
  if (tuid && projectKeys.length > 0) {
    await Promise.all(projectKeys.map(async (key) => {
      try { projectMetaMap[key] = await resolveProjectMeta(tuid, key) } catch {}
    }))
  }

  // 预加载决议规则配置（避免循环内重复查询）
  const resRules = await getResolutionRuleConfig()

  const results: any[] = []
  for (const r of allRvs) {
    if (r.status !== 'reviewing' && r.status !== 'completed' && r.status !== 'rejected') continue
    // 优先从实体查询评审人，兜底从 reviewers_json 快照读取
    let rvrs = await qAll(rvReviewer, (v: any) => v.review_uuid === r.review_uuid)
    if (rvrs.length === 0) {
      const snap = jsonArr((r as any).reviewers_json || '[]')
      rvrs = snap.map((s: any) => s._key ? s : { ...s, _key: `${r.review_uuid}_snap_${Math.random().toString(36).slice(2, 6)}` })
    }
    const my = rvrs.find((v: any) => v.reviewer_uuid === reviewerUuid)
    if (!my) continue
    // 按 round_no 判断是否已提交当前轮次（旧数据 round_no 缺失时视为 1）
    const reviewRoundNo = (r as any).round_no || 1
    const myRoundNo = (my as any).round_no || 1
    const mySubmittedCurrentRound = my.submitted_at > 0 && myRoundNo === reviewRoundNo
    const issues = await qAll(linkedIssue, (v: any) => v.review_uuid === r.review_uuid)
    const allResolutions = await qAll(resolution, (v: any) => v.review_uuid === r.review_uuid)
    const hasResolution = allResolutions.some((res: any) => (res.round_no || 1) === reviewRoundNo)
    const rvType = (r as any).review_type || 'dcp'
    const rule = resRules[rvType] || {}
    const publisherRole = getPublisherRole(rule)
    const isPublisher = publisherRole && my.role_name === publisherRole
    // 按 submitRequirement 判断是否满足决议条件
    const allRoleTpls = filterRolesByType(await qAll(roleTpl), rvType)
    // 投影到当前轮次：旧轮次的提交数据视为未提交（与 getReviewDetail/submitOpinion 保持一致）
    const _listRoundNo = (r as any).round_no || 1
    const rvrsProjected = rvrs.map((rvr: any) => {
      if ((rvr.round_no || 1) !== _listRoundNo) {
        return { ...rvr, submitted_at: 0, conclusion: '', risk_level: '', opinion_summary: '', round_no: _listRoundNo }
      }
      return rvr
    })
    const resolutionReady = isResolutionReady(rule, rvrsProjected, allRoleTpls)
    const isResolutionPending = !!(isPublisher && resolutionReady && !hasResolution && r.status === 'reviewing')
    const meta = projectMetaMap[r.project_uuid] || {}
    results.push({
      review_uuid: r.review_uuid,
      review_number: r.review_number || '',
      project_uuid: r.project_uuid,
      project_name: meta.project_name || r.project_uuid,
      phase_code: r.phase_code,
      phase_name: phMap.get(r.phase_code) || '',
      review_title: r.review_title,
      status: r.status,
      effective_state: getEffectiveState(r),
      review_type: r.review_type || 'dcp',
      meeting_time: r.meeting_time,
      created_at: r.created_at,
      reviewer_total: rvrs.length,
      reviewer_done: rvrs.filter((v: any) => v.submitted_at > 0).length,
      linked_issue_count: issues.length,
      my_role: my.role_name,
      my_submitted: mySubmittedCurrentRound,
      my_conclusion: mySubmittedCurrentRound ? (my.conclusion || '') : '',
      is_publisher: !!isPublisher,
      resolution_pending: isResolutionPending,
    })
  }
  results.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
  // 拆分三类：待我评审 / 待我决议 / 已完成
  // 决议人不进入"待我评审"；"待我决议"只在前置评审满足提交要求后出现
  // 使用 effective_state 做精确分类：reviewing/re_reviewing → 待评审；awaiting_resolution → 待决议
  const review_pending = results.filter(r => 
    (r.effective_state === 'reviewing' || r.effective_state === 're_reviewing') 
    && !r.my_submitted && !r.is_publisher
  )
  const resolution_pending = results.filter(r => r.resolution_pending)
  const done = results.filter(r => 
    r.my_submitted || r.status === 'completed' || r.status === 'rejected'
    || r.effective_state === 'remediation_pending'
    || r.effective_state === 'resolution_published'
  )
  return { body: { reviews: results, review_pending, resolution_pending, done, pending: review_pending } }
}

// ============================================================
// 发起评审（draft → reviewing）
// ============================================================
export async function startReview(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  if (rv.status !== 'draft') return { body: { error: '当前状态不可发起评审' }, statusCode: 400 }

  // 校验 0：前置依赖检查——前置阶段的决议必须为"通过"或"有条件通过"
  const reviewType = (rv as any).review_type || 'dcp'
  const phaseTplRow = await qAll(phaseTpl, (v: any) => v.phase_code === (rv as any).phase_code && (v.review_type || 'dcp') === reviewType)
  const deps = jsonArr(phaseTplRow[0]?.dependencies || '[]')
  if (deps.length) {
    const projReviews = await qAll(review, (v: any) => v.project_uuid === (rv as any).project_uuid)
    const passedPhases = new Set<string>()
    for (const r of projReviews) {
      if (!deps.includes(r.phase_code)) continue
      const res = await qAll(resolution, (v: any) => v.review_uuid === r.review_uuid)
      const fc = res[0]?.final_conclusion || ''
      if (fc === 'pass' || fc === 'conditional_pass') {
        passedPhases.add(r.phase_code)
      }
    }
    const unmet = deps.filter((d: string) => !passedPhases.has(d))
    if (unmet.length) {
      return { body: { error: `前置阶段未通过决议，无法发起评审。需先通过（决议为"通过"或"有条件通过"）: ${unmet.join(', ')}` }, statusCode: 400 }
    }
  }

  // 校验 1：所有 must_vote 或 has_veto 角色都已指定评审人
  const snapReviewers = jsonArr((rv as any).reviewers_json || '[]')
  const entityReviewersStart = await qAll(rvReviewer, (v: any) => v.review_uuid === rid)
  const reviewers = entityReviewersStart.length > 0 ? entityReviewersStart : snapReviewers
  if (reviewers.length === 0) {
    return { body: { error: '请先添加评审人' }, statusCode: 400 }
  }
  const roleTemplates = filterRolesByType(await qAll(roleTpl), reviewType)
  const requiredRoles = roleTemplates.filter((rt: any) => rt.must_vote || rt.has_veto)
  const missingRoles: string[] = []
  for (const rt of requiredRoles) {
    const hasReviewer = reviewers.some((rvr: any) => rvr.role_name === rt.role_name)
    if (!hasReviewer) missingRoles.push(rt.role_name)
  }
  if (missingRoles.length > 0) {
    return { body: { error: `以下角色尚未指定评审人：${missingRoles.join('、')}` }, statusCode: 400 }
  }

  // 校验 1.2：决议角色必须已指定且唯一
  const _startRule = await getResolutionRuleByType(reviewType)
  const _publisherRole = getPublisherRole(_startRule)
  if (_publisherRole) {
    const publisherReviewers = reviewers.filter((rvr: any) => rvr.role_name === _publisherRole)
    if (publisherReviewers.length === 0) {
      return { body: { error: `决议角色「${_publisherRole}」必须指定 1 名评审人` }, statusCode: 400 }
    }
    if (publisherReviewers.length > 1) {
      return { body: { error: `决议角色「${_publisherRole}」只能指定 1 名评审人` }, statusCode: 400 }
    }
  } else {
    return { body: { error: `${reviewType.toUpperCase()} 决议角色未配置，请先在插件配置中设置。` }, statusCode: 400 }
  }

  // 校验 1.5：决议规则可达性校验——按实际评审人检查 minCount 是否可达
  const _rule = await getResolutionRuleByType(reviewType)
  if (_rule.passRule?.mode === 'min_approval_count' && _rule.allowedConclusions?.includes('pass')) {
    const scopeNames = resolveVoteScopeRoleNames(_rule, roleTemplates)
    const actualCandidates = reviewers.filter((r: any) => scopeNames.includes(r.role_name))
    const minCount = Number(_rule.passRule.minCount || 0)
    if (actualCandidates.length < minCount) {
      return { body: { error: `当前评审单可计票评审人只有 ${actualCandidates.length} 人，但决议规则要求至少 ${minCount} 人通过。请补充评审人或调整决议规则。` }, statusCode: 400 }
    }
  }

  // 校验 2：必填交付物必须已上传文件
  const allMatTpls = await qAll(matTpl)
  const materials = await qAll(matItem, (v: any) => v.review_uuid === rid)
  const requiredMats = materials.filter((m: any) => {
    const tpl = allMatTpls.find((t: any) => t._key === m.template_id)
    return tpl && (tpl as any).required
  })
  const unsubmittedRequired = requiredMats.filter((m: any) => !m.file_data)
  if (unsubmittedRequired.length > 0) {
    const names = unsubmittedRequired.map((m: any) => {
      const tpl = allMatTpls.find((t: any) => t._key === m.template_id)
      return (tpl as any)?.material_name || m.template_id
    })
    return { body: { error: `以下必填评审资料尚未上传：${names.join('、')}` }, statusCode: 400 }
  }

  // 校验 3：关键指标不能有红色（超出红线阈值）
  const indicators = await qAll(indData, (v: any) => v.review_uuid === rid)
  const redIndicators = indicators.filter((ind: any) => ind.risk_color === 'red')
  if (redIndicators.length > 0) {
    const allIndTpls = await qAll(indTpl)
    const names = redIndicators.map((ind: any) => {
      const tpl = allIndTpls.find((t: any) => t._key === ind.template_id)
      return (tpl as any)?.indicator_name || ind.template_id
    })
    return { body: { error: `以下关键指标已超出红线阈值，请修正后再发起评审：${names.join('、')}` }, statusCode: 400 }
  }

  const now = Date.now()
  // 初始化 checklist：从模板复制到 review.checklist_json
  const phaseItems = await qAll(checkItem, (v: any) => v.phase_code === (rv as any).phase_code && (v.review_type || 'dcp') === reviewType)
  let checklistJson = (rv as any).checklist_json || '[]'
  if (phaseItems.length > 0) {
    const initList = phaseItems.map((item: any) => ({
      template_id: item._key,
      role_name: item.role_name,
      item_text: item.item_text,
      sort_order: item.sort_order,
      status: 'unchecked',
      checked_by: '',
      checked_at: 0,
    }))
    checklistJson = JSON.stringify(initList)
  }
  const opUuid = (req.body || {} as any).operator_uuid || ''
  const stateFields = buildStateTransition(rv, 'reviewing', opUuid, '发起评审', { checklist_json: checklistJson })
  await review.set(rid, { ...rv, ...stateFields })
  await writeAudit(rid, opUuid, '启动评审', rid,
    `评审已发起，共 ${reviewers.length} 名评审人`)

  // 通知评审人（非阻塞）
  const notCfg = await getNotifyConfig()
  if (notCfg.enabled && notCfg.on_review_start) {
    const uuids = reviewers.map((r: any) => r.reviewer_uuid).filter(Boolean)
    if (uuids.length > 0) {
      const phaseName = (rv as any).phase_code || ''
      const reviewTitle = (rv as any).review_title || 'DCP评审'
      sendNotification(
        `DCP评审通知 — ${phaseName}`,
        `您被指定为「${phaseName} ${reviewTitle}」的评审人，请前往评审工作台提交评审意见。`,
        `${(rv as any).project_uuid ? `/project/${(rv as any).project_uuid}` : ''}`,
        uuids,
      )
    }
  }

  return { body: { ok: true, status: 'reviewing', review_state: 'reviewing' } }
}

// ============================================================
// 撤回评审（reviewing → draft）
// ============================================================
export async function recallReview(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { operator_uuid, reason } = b

  if (!rid || !operator_uuid) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }

  const cfg = await getReviewRecallConfig()
  if (!cfg.enabled) {
    return { body: { error: '管理员未开启评审撤回功能' }, statusCode: 403 }
  }

  if (rv.status !== 'reviewing') {
    return { body: { error: '仅评审中的评审单可以撤回' }, statusCode: 400 }
  }
  // 精确状态校验：reviewing / awaiting_resolution 可撤回
  const _recallEffState = getEffectiveState(rv)
  if (_recallEffState !== 'reviewing' && _recallEffState !== 'awaiting_resolution') {
    return { body: { error: '当前状态不可撤回' }, statusCode: 400 }
  }

  if (rv.creator_uuid !== operator_uuid) {
    return { body: { error: '仅评审发起人可以撤回评审' }, statusCode: 403 }
  }

  const hasResolution = (await qAll(resolution, (v: any) => v.review_uuid === rid)).length > 0
  if (hasResolution) {
    return { body: { error: '评审已发布决议，不可撤回' }, statusCode: 400 }
  }

  if (cfg.requireReason && !String(reason || '').trim()) {
    return { body: { error: '请填写撤回原因' }, statusCode: 400 }
  }

  const now = Date.now()

  // 重置评审人提交状态
  const allReviewers = await qAll(rvReviewer, (v: any) => v.review_uuid === rid)
  const resetReviewers: any[] = []
  for (const r of allReviewers) {
    const reset = {
      ...r,
      conclusion: '',
      risk_level: 'medium',
      opinion_summary: '',
      submitted_at: 0,
    }
    await rvReviewer.set(r._key, reset)
    resetReviewers.push(reset)
  }

  // 重置 checklist
  let checklistJson = (rv as any).checklist_json || '[]'
  try {
    const cl = jsonArr(checklistJson)
    for (const item of cl) {
      item.status = 'unchecked'
      item.checked_by = ''
      item.checked_at = 0
    }
    checklistJson = JSON.stringify(cl)
  } catch { /* ignore */ }

  // 回到 draft 状态，清空决议通知状态
  const stateFields = buildStateTransition(rv, 'canceled', operator_uuid, `撤回评审：${reason || '未填写'}`, {
    checklist_json: checklistJson,
    reviewers_json: JSON.stringify(resetReviewers),
  })
  // canceled 的兼容 status = draft
  await review.set(rid, { ...rv, ...stateFields })

  await writeAudit(rid, operator_uuid, '撤回评审', rid,
    `评审已撤回，回到草稿状态。原因：${reason || '未填写'}`)

  return { body: { ok: true, status: 'draft', review_state: 'canceled' } }
}

// ============================================================
// 更新评审单基础信息（会议时间等）
// ============================================================
export async function updateReviewBasicInfo(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { operator_uuid, meeting_time, review_title } = b

  if (!rid || !operator_uuid) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }

  if (rv.creator_uuid !== operator_uuid) {
    return { body: { error: '仅评审发起人可以修改会议时间' }, statusCode: 403 }
  }

  if (rv.status !== 'draft' && rv.status !== 'reviewing') {
    return { body: { error: '当前状态不可修改会议时间' }, statusCode: 400 }
  }

  const hasResolution = (await qAll(resolution, (v: any) => v.review_uuid === rid)).length > 0
  if (hasResolution) {
    return { body: { error: '评审已发布决议，不可修改会议时间' }, statusCode: 400 }
  }

  const next: any = {
    ...rv,
    meeting_time: Number(meeting_time || 0),
    updated_at: Date.now(),
  }

  if (typeof review_title === 'string') {
    next.review_title = review_title.trim() || rv.review_title
  }

  await review.set(rid, next)

  await writeAudit(rid, operator_uuid, '修改会议时间', rid,
    `会议时间修改为: ${next.meeting_time ? new Date(next.meeting_time).toLocaleString('zh-CN') : '未设置'}`)

  return { body: { ok: true, review: next } }
}

// ============================================================
// 材料文件上传
// ============================================================
export async function uploadMaterialFile(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { template_id, file_name, object_key } = b
  if (!rid || !template_id || !file_name) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  // 材料权限：仅 reviewing（第1轮）或 remediation_pending（整改轮）可上传
  const effState = getEffectiveState(rv)
  const currentRoundNo = (rv as any).round_no || 1
  const canUpload =
    (effState === 'reviewing' && currentRoundNo === 1) ||
    effState === 'remediation_pending' ||
    effState === 'draft'
  if (!canUpload) {
    return { body: { error: '当前状态下不可修改材料' }, statusCode: 403 }
  }
  const key = `${rid}_mat_${template_id}`
  const ex = (await matItem.get(key)) as any
  if (!ex) return { body: { error: '材料项不存在' }, statusCode: 404 }
  await matItem.set(key, {
    review_uuid: rid, template_id,
    submit_status: (ex.submit_status === 'approved' || ex.submit_status === 'rejected') ? ex.submit_status : 'submitted',
    notes: ex.notes ?? '',
    updated_by: b.updated_by || '', updated_at: Date.now(),
    file_name, file_data: object_key || ex.file_data || '', file_size: b.file_size || 0,
    uploaded_at: Date.now(),
    round_no: currentRoundNo,
  })
  await writeAudit(rid, b.operator_uuid || b.updated_by || '', '上传材料', template_id,
    `上传材料文件: ${file_name}`)
  return { body: { ok: true, file_name } }
}

// ============================================================
// 清除材料文件（仅草稿状态可操作）
// ============================================================
export async function removeMaterialFile(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { template_id } = b
  if (!rid || !template_id) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  // 材料删除：仅 draft / reviewing（第1轮）/ remediation_pending 可操作
  const effState = getEffectiveState(rv)
  const currentRoundNo = (rv as any).round_no || 1
  const canRemove =
    effState === 'draft' ||
    (effState === 'reviewing' && currentRoundNo === 1) ||
    effState === 'remediation_pending'
  if (!canRemove) {
    return { body: { error: '当前状态下不可清除文件' }, statusCode: 403 }
  }
  const key = `${rid}_mat_${template_id}`
  const ex = (await matItem.get(key)) as any
  if (!ex) return { body: { error: '材料项不存在' }, statusCode: 404 }
  await matItem.set(key, {
    review_uuid: rid, template_id,
    submit_status: 'draft',
    notes: ex.notes ?? '',
    updated_by: b.updated_by || '', updated_at: Date.now(),
    file_name: '', file_data: '', file_size: 0,
    uploaded_at: 0,
  })
  await writeAudit(rid, b.operator_uuid || b.updated_by || '', '删除材料', template_id,
    `清除材料文件`)
  return { body: { ok: true } }
}

// ============================================================
// 获取材料上传预签名 URL（对象存储）
// ============================================================
export async function getMaterialUploadUrl(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const tid = getParam(req, 'template_id')
  if (!rid || !tid) return { body: { error: '缺少必要字段' }, statusCode: 400 }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  // 检查材料项存在
  const key = `${rid}_mat_${tid}`
  const ex = await matItem.get(key)
  if (!ex) return { body: { error: '材料项不存在' }, statusCode: 404 }
  // 生成对象存储 key（ONES 对象存储不支持 / 路径分隔符）
  const ts = Date.now()
  const objKey = `dcp_files-${rid}-${tid}-${ts}`
  const { object } = storage
  const result = await object.upload(objKey) as any
  if (result?.code) {
    // ObjectError
    return { body: { error: `获取上传地址失败: ${result.message || result.code}` }, statusCode: 500 }
  }
  return { body: {
    url: result.getWebUrl(),
    fields: result.getFields(),
    object_key: objKey,
  }}
}

// ============================================================
// 获取材料下载预签名 URL（对象存储）
// ============================================================
export async function getMaterialDownloadUrl(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const tid = getParam(req, 'template_id')
  if (!rid || !tid) return { body: { error: '缺少必要字段' }, statusCode: 400 }
  const key = `${rid}_mat_${tid}`
  const ex = (await matItem.get(key)) as any
  if (!ex) return { body: { error: '材料项不存在' }, statusCode: 404 }
  const objKey = ex.file_data || ''
  if (!objKey) return { body: { error: '该材料未上传文件' }, statusCode: 404 }
  const { object } = storage
  const result = await object.download(objKey) as any
  if (result?.code) {
    return { body: { error: `获取下载地址失败: ${result.message || result.code}` }, statusCode: 500 }
  }
  return { body: { url: result.getWebUrl() }}
}

// ============================================================
// 材料预览（后端代理获取文件内容，base64 返回，绕过 Content-Disposition: attachment）
// ============================================================
export async function getMaterialPreview(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const tid = getParam(req, 'template_id')
  if (!rid || !tid) return { body: { error: '缺少必要字段' }, statusCode: 400 }
  const key = `${rid}_mat_${tid}`
  const ex = (await matItem.get(key)) as any
  if (!ex) return { body: { error: '材料项不存在' }, statusCode: 404 }
  const objKey = ex.file_data || ''
  if (!objKey) return { body: { error: '该材料未上传文件' }, statusCode: 404 }
  const fileName = ex.file_name || 'unknown'
  const { object } = storage
  const result = await object.download(objKey) as any
  if (result?.code) {
    return { body: { error: `获取下载地址失败: ${result.message || result.code}` }, statusCode: 500 }
  }
  // 用 internal URL 后端请求文件内容
  const internalUrl = result.getUrl()
  try {
    const fetchRes = await OPFetch(internalUrl, { responseType: 'arraybuffer', timeout: 30000 } as any)
    const buf = Buffer.from(fetchRes.data as ArrayBuffer)
    const base64 = buf.toString('base64')
    // 根据文件扩展名推断 MIME
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
      txt: 'text/plain', csv: 'text/csv',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      zip: 'application/zip', rar: 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
    }
    const mime = mimeMap[ext] || 'application/octet-stream'
    return { body: { content: base64, mime, file_name: fileName } }
  } catch (e: any) {
    return { body: { error: `预览获取失败: ${e.message || e}` }, statusCode: 500 }
  }
}

// ============================================================
// 材料状态
// ============================================================
export async function updateMaterialStatus(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { template_id, submit_status, notes } = b
  if (!rid || !template_id || !submit_status) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  if (rv.status === 'completed' || rv.status === 'rejected') {
    return { body: { error: '评审已结束，不可修改材料' }, statusCode: 403 }
  }
  const key = `${rid}_mat_${template_id}`
  const ex = await matItem.get(key)
  if (!ex) return { body: { error: '材料项不存在' }, statusCode: 404 }
  await matItem.set(key, {
    review_uuid: rid, template_id, submit_status,
    notes: notes ?? (ex as any).notes ?? '',
    updated_by: b.updated_by || '', updated_at: Date.now(),
    file_name: (ex as any).file_name ?? '',
    file_size: (ex as any).file_size ?? 0, uploaded_at: (ex as any).uploaded_at ?? 0,
  })
  return { body: { ok: true } }
}

// ============================================================
// 指标
// ============================================================
export async function updateIndicators(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { indicators, operator_uuid } = b
  if (!rid || !Array.isArray(indicators)) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  if (rv.status === 'completed' || rv.status === 'rejected') {
    return { body: { error: '评审已结束，不可修改指标' }, statusCode: 403 }
  }
  const now = Date.now(); const tpls = await qAll(indTpl)
  for (const ind of indicators) {
    const key = `${rid}_ind_${ind.template_id}`
    const ex = await indData.get(key)
    if (!ex) continue
    const tpl = tpls.find((t: any) => t._key === ind.template_id) as any
    let color = 'green'; const v = Number(ind.current_value ?? 0)
    if (tpl) {
      if (tpl.threshold_type === '高于阈值预警') {
        if (v > tpl.red_threshold) color = 'red'
        else if (v > tpl.yellow_threshold) color = 'yellow'
      } else if (tpl.threshold_type === '低于阈值预警') {
        if (v < tpl.red_threshold) color = 'red'
        else if (v < tpl.yellow_threshold) color = 'yellow'
      }
    }
    await indData.set(key, {
      review_uuid: rid, template_id: ind.template_id, current_value: v,
      notes: ind.notes ?? (ex as any).notes ?? '', risk_color: color,
      updated_by: operator_uuid || '', updated_at: now,
    })
  }
  return { body: { ok: true } }
}

// ============================================================
// 评审人维护
// ============================================================
export async function updateReviewers(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const reviewers = Array.isArray(b.reviewers) ? b.reviewers : null
  if (!rid || !reviewers) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  if (rv.status !== 'draft') {
    return { body: { error: '评审已发起，不可修改评审人' }, statusCode: 403 }
  }

  const _rvType = (rv as any).review_type || 'dcp'
  const roleTemplates = filterRolesByType(await qAll(roleTpl), _rvType)
  const roleNames = new Set(roleTemplates.map((r: any) => r.role_name))
  const normalized = reviewers
    .filter((r: any) => r && r.role_name && r.reviewer_uuid)
    .map((r: any) => ({
      role_name: String(r.role_name),
      reviewer_uuid: String(r.reviewer_uuid),
    }))

  for (const r of normalized) {
    if (!roleNames.has(r.role_name)) {
      return { body: { error: `未知评审角色：${r.role_name}` }, statusCode: 400 }
    }
  }

  // 校验：必投或否决权角色必须指定评审人
  const requiredRoles = roleTemplates.filter((rt: any) => rt.must_vote || rt.has_veto)
  const submittedRoleNames = new Set(normalized.map((r: any) => r.role_name))
  const missingRequired = requiredRoles.filter((rt: any) => !submittedRoleNames.has(rt.role_name)).map((rt: any) => rt.role_name)
  if (missingRequired.length > 0) {
    return { body: { error: `以下角色为必选，请先指定评审人：${missingRequired.join('、')}` }, statusCode: 400 }
  }

  // 校验：同一用户不允许担任多个角色
  const uuidToRoles: Record<string, string[]> = {}
  for (const r of normalized) {
    if (!uuidToRoles[r.reviewer_uuid]) uuidToRoles[r.reviewer_uuid] = []
    uuidToRoles[r.reviewer_uuid].push(r.role_name)
  }
  const multiRoleUsers = Object.entries(uuidToRoles).filter(([, roles]) => roles.length > 1)
  if (multiRoleUsers.length > 0) {
    const desc = multiRoleUsers.map(([uuid, roles]) => `${uuid}(${roles.join('/')})`).join('、')
    return { body: { error: `同一评审单中，一个用户不能同时担任多个评审角色：${desc}` }, statusCode: 400 }
  }

  // 校验：决议角色必须指定且唯一
  const _rule = await getResolutionRuleByType(_rvType)
  const publisherRole = getPublisherRole(_rule)
  if (publisherRole) {
    const publisherEntries = normalized.filter((r: any) => r.role_name === publisherRole)
    if (publisherEntries.length === 0) {
      return { body: { error: `决议角色「${publisherRole}」必须指定 1 名评审人` }, statusCode: 400 }
    }
    if (publisherEntries.length > 1) {
      return { body: { error: `决议角色「${publisherRole}」只能指定 1 名评审人` }, statusCode: 400 }
    }
  }

  // 按 sort_order 排序，稳定 key
  const ordered = normalized.sort((a, b) => {
    const ai = roleTemplates.find((r: any) => r.role_name === a.role_name)?.sort_order ?? 9999
    const bi = roleTemplates.find((r: any) => r.role_name === b.role_name)?.sort_order ?? 9999
    return ai - bi
  })

  // 删除旧评审人
  const old = await qAll(rvReviewer, (v: any) => v.review_uuid === rid)
  for (const o of old) await rvReviewer.delete(o._key)

  // 写入新评审人，收集 payload 直接返回（不同请求内 qAll 回读）
  const savedPayload: any[] = []
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i]
    const key = `${rid}_rvr_${i}`
    const value = {
      review_uuid: rid,
      reviewer_uuid: r.reviewer_uuid,
      role_name: r.role_name,
      conclusion: '', risk_level: 'medium', opinion_summary: '',
      submitted_at: 0,
    }
    await rvReviewer.set(key, value)
    savedPayload.push({ _key: key, ...value })
  }

  // 写 reviewers_json 快照到 dcp_review（兜底读取）
  try {
    await review.set(rid, { ...rv, reviewers_json: JSON.stringify(savedPayload), updated_at: Date.now() })
  } catch {}

  await writeAudit(rid, (req.body || {} as any).operator_uuid || '', '更新评审人', rid,
    `评审人已更新，共 ${savedPayload.length} 人`)
  return { body: { ok: true, saved_count: savedPayload.length, reviewers: savedPayload } }
}

// ============================================================
// 诊断接口：直接读实体 key 验证存储行为
// ============================================================
export async function debugReviewerStorage(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
  const all = await qAll(rvReviewer)
  const matched = all.filter((v: any) => v.review_uuid === rid)
  const direct: any[] = []
  for (let i = 0; i < 10; i++) {
    const key = `${rid}_rvr_${i}`
    const val = await rvReviewer.get(key)
    direct.push({ key, value: val })
  }
  return { body: { rid, total_count: all.length, matched_count: matched.length, matched, direct } }
}

// ============================================================
// 诊断接口：dump listMyReviews 原始数据
// ============================================================
export async function debugMyReviews(req: any): Promise<PluginResponse> {
  const url = req.url || ''
  const qm = url.match(/[?&]reviewer_uuid=([^&]+)/)
  const reviewerUuid = qm ? decodeURIComponent(qm[1]) : ((req.body || {}).reviewer_uuid || '')
  
  const allRvs = await qAll(review)
  const diag: any[] = []
  for (const r of allRvs) {
    const rvrs = await qAll(rvReviewer, (v: any) => v.review_uuid === r.review_uuid)
    const my = rvrs.find((v: any) => v.reviewer_uuid === reviewerUuid)
    diag.push({
      review_uuid: r.review_uuid,
      status: r.status,
      phase_code: r.phase_code,
      total_rvrs: rvrs.length,
      rvr_uuids: rvrs.map((v: any) => v.reviewer_uuid),
      matched: !!my,
      my_submitted: my ? !!(my.submitted_at > 0) : null,
    })
  }
  const passedFilter = diag.filter(d => {
    const r = allRvs.find((v: any) => v.review_uuid === d.review_uuid)
    return r && (r.status === 'reviewing' || r.status === 'completed' || r.status === 'rejected')
  })
  return { body: { reviewer_uuid: reviewerUuid, all_reviews: diag, passed_filter: passedFilter } }
}

// ============================================================
// 提交评审意见
// ============================================================
export async function submitOpinion(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { reviewer_uuid, role_name, conclusion, risk_level, opinion_summary } = b
  if (!rid || !reviewer_uuid || !role_name || !conclusion) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  if (rv.status !== 'reviewing') {
    return { body: { error: '当前状态不可提交评审意见' }, statusCode: 400 }
  }
  // 精确状态校验：仅 reviewing / re_reviewing 可提交意见
  const _effState = getEffectiveState(rv)
  if (_effState !== 'reviewing' && _effState !== 're_reviewing') {
    return { body: { error: '当前状态不可提交评审意见' }, statusCode: 400 }
  }
  // 优先从实体查询评审人，兜底从 reviewers_json 快照读取
  const currentRoundNo = (rv as any).round_no || 1
  let all = await qAll(rvReviewer, (v: any) => v.review_uuid === rid)
  if (all.length === 0) {
    const snap = jsonArr((rv as any).reviewers_json || '[]')
    all = snap.map((s: any) => s._key ? s : { ...s, _key: `${rid}_snap_${Math.random().toString(36).slice(2, 6)}` })
  }
  // 按 uuid+role 查找评审人（不限制 round_no，兼容实体未被更新的情况）
  const target = all.find((r: any) =>
    r.reviewer_uuid === reviewer_uuid && r.role_name === role_name)
  if (!target) return { body: { error: '未找到该评审人的记录' }, statusCode: 404 }
  // 检查是否已在当前轮次提交（round_no 不匹配视为未提交）
  if (target.submitted_at > 0 && (target.round_no || 1) === currentRoundNo) {
    return { body: { error: '该评审人在当前轮次已提交过意见' }, statusCode: 409 }
  }

  // 评审人选「有条件通过」时，必须已创建至少 1 个整改工作项
  if (conclusion === 'conditional_pass') {
    const remediationItems = await qAll(linkedIssue,
      (v: any) => v.review_uuid === rid && v.link_type === 'remediation' && v.linked_by === reviewer_uuid)
    if (remediationItems.length === 0) {
      return { body: { error: '选择「有条件通过」时，必须先创建至少 1 个整改工作项' }, statusCode: 400 }
    }
  }

  const ts = Date.now()
  const newData = {
    review_uuid: rid, reviewer_uuid, role_name,
    conclusion, risk_level: risk_level || 'medium',
    opinion_summary: opinion_summary || '',
    submitted_at: ts,
    round_no: currentRoundNo,
  }
  await rvReviewer.set(target._key, newData)
  // 同步更新 reviewers_json 快照，确保 qAll 回退路径读到最新数据
  // 同时检查是否满足决议前置条件 → 合并状态流转到同一次 set
  const curSnap = jsonArr((rv as any).reviewers_json || '[]')
  const updatedSnap = curSnap.map((s: any) =>
    (s.reviewer_uuid === reviewer_uuid && s.role_name === role_name)
      ? { ...s, ...newData, _key: s._key || target._key }
      : s
  )
  // 检查决议前置条件
  const _rvType = (rv as any).review_type || 'dcp'
  const _rule = await getResolutionRuleByType(_rvType)
  const _pubRole = getPublisherRole(_rule)
  let _ready = false
  if (_pubRole && updatedSnap.length > 0) {
    const _allRoleTpls = filterRolesByType(await qAll(roleTpl), _rvType)
    _ready = isResolutionReady(_rule, updatedSnap, _allRoleTpls)
  }
  // 合并 review.set：快照更新 + 可能的状态流转
  let reviewUpdate: any = { ...rv, reviewers_json: JSON.stringify(updatedSnap), updated_at: ts }
  let transitioned = false
  if (_ready) {
    const currentState = getEffectiveState(rv)
    if (currentState === 'reviewing' || currentState === 're_reviewing') {
      const stateFields = buildStateTransition(rv, 'awaiting_resolution', reviewer_uuid, '前置评审完成，进入待决议')
      reviewUpdate = { ...reviewUpdate, ...stateFields }
      transitioned = true
    }
  }
  try {
    await review.set(rid, reviewUpdate)
  } catch (e: any) {
    Logger.info(`[DCP] submitOpinion review.set failed (snapshot may be stale): ${e?.message || e}`)
  }
  await writeAudit(rid, reviewer_uuid, '提交评审意见', role_name,
    `评审意见: ${conclusion} | 风险: ${risk_level || 'medium'}`)

  // 满足决议前置条件 → 通知唯一决议人
  const notCfg2 = await getNotifyConfig()
  if (_ready && notCfg2.enabled && notCfg2.on_all_submitted) {
    const publisher = updatedSnap.find((r: any) => r.role_name === _pubRole)
    if (publisher && publisher.reviewer_uuid) {
      const phaseName = (rv as any).phase_code || ''
      sendNotification(
        `${_rvType.toUpperCase()}决议通知 — ${phaseName}`,
        `「${phaseName}」评审已满足决议条件，请前往发布决议。`,
        `${(rv as any).project_uuid ? `/project/${(rv as any).project_uuid}` : ''}`,
        [publisher.reviewer_uuid],
      )
    }
  }

  return { body: { ok: true } }
}

// ============================================================
// 关联工作项
// ============================================================
export async function linkIssue(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { issue_uuid, issue_number, issue_title, issue_type, issue_status, linked_by } = b
  const linkType = b.link_type || 'general'
  if (!rid || !issue_uuid) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  // 检查是否已关联
  const existing = await qAll(linkedIssue,
    (v: any) => v.review_uuid === rid && v.issue_uuid === issue_uuid)
  if (existing.length > 0) {
    return { body: { error: '该工作项已关联' }, statusCode: 409 }
  }
  const rv = await review.get(rid)
  const currentRoundNo = rv ? ((rv as any).round_no || 1) : 1
  const key = `${rid}_li_${issue_uuid}`
  await linkedIssue.set(key, {
    review_uuid: rid, issue_uuid,
    issue_number: issue_number || '', issue_title: issue_title || '',
    issue_type: issue_type || '', issue_status: issue_status || '',
    linked_by: linked_by || '', linked_by_name: (b as any).linked_by_name || '', linked_at: Date.now(),
    link_type: linkType, round_no: currentRoundNo,
  })
  await writeAudit(rid, linked_by || '', linkType === 'remediation' ? '关联整改工作项' : '关联工作项', issue_uuid,
    `${linkType === 'remediation' ? '关联整改工作项' : '关联工作项'}: ${issue_number || issue_uuid}`)
  return { body: { ok: true } }
}

export async function getLinkedIssues(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
  const issues = await qAll(linkedIssue, (v: any) => v.review_uuid === rid)
  issues.sort((a: any, b: any) => (b.linked_at || 0) - (a.linked_at || 0))
  return { body: { issues } }
}

// ============================================================
// 创建工作项并自动关联评审单
// ============================================================
export async function createIssue(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
  const tuid = getParam(req, 'team_uuid')
  if (!tuid) return { body: { error: '无法获取 team_uuid' }, statusCode: 400 }

  // 获取评审单信息
  const rvs = await qAll(review, (v: any) => v.review_uuid === rid)
  if (rvs.length === 0) return { body: { error: '评审单不存在' }, statusCode: 404 }
  const rv = rvs[0]

  const b = (req.body || {}) as any
  const {
    title,
    issue_type_scope_uuid,  // 项目内 IssueTypeScope.uuid
    issue_type_uuid,        // 全局工作项类型 UUID
    assignee_uuid,
    project_uuid,
  } = b
  if (!title) {
    return { body: { error: '缺少 title' }, statusCode: 400 }
  }

  // 解析项目真实 UUID
  let projectID = project_uuid || rv.project_uuid || ''
  try {
    const exchRes = await OPFetch(
      `/project/api/ones-project/team/${tuid}/projects/exchange/${projectID}`,
      { teamUUID: tuid }
    ) as any
    if (exchRes?.data?.project_uuid || exchRes?.project_uuid) projectID = exchRes?.data?.project_uuid || exchRes?.project_uuid
  } catch {}

  // 创建时使用全局 issue_type_uuid（成功 HAR 证实 tasks/add3 用全局 UUID）
  const typeUuid = issue_type_uuid || ''
  const typeScopeUuid = issue_type_scope_uuid || ''

  try {
    let res: any = null
    const errors: any[] = []

    // 内部 API 多路径级联尝试
    const internalPaths = [
      `/project/api/project/team/${tuid}/tasks/add3`,
      `/project/api/project/team/${tuid}/tasks`,
      `/project/api/project/team/${tuid}/items`,
      `/project/api/project/team/${tuid}/task`,
      `/project/api/ones-project/team/${tuid}/tasks`,
    ]
    for (const path of internalPaths) {
      if (res?.data?.uuid || res?.data?.tasks?.[0]?.uuid) break
      try {
        const isAdd3 = path.endsWith('/add3')
        const add3Body = isAdd3 ? {
          tasks: [{
            uuid: Array.from({length: 16}, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]).join(''),
            project_uuid: projectID,
            issue_type_uuid: typeUuid || undefined,
            field_values: [
              { field_uuid: 'field001', value: title },
              { field_uuid: 'field006', value: projectID },
              { field_uuid: 'field007', value: typeUuid },
            ],
          }],
        } : {
          assignee: assignee_uuid || rv.creator_uuid || '',
          title,
          project_uuid: projectID,
          issue_type_uuid: typeUuid || undefined,
        }
        res = await OPFetch(path, {
          method: 'POST',
          teamUUID: tuid,
          headers: { 'Content-Type': 'application/json' },
          data: add3Body,
        }) as any
        if (isAdd3 && res?.data?.tasks?.[0]?.uuid) {
          const t = res.data.tasks[0]
          res.data = { uuid: t.uuid, display_id: t.display_id, issue_number: t.display_id }
        }
        if (res?.data?.uuid || res?.data?.issue_uuid) break
      } catch (innerErr: any) {
        errors.push({
          path,
          message: innerErr?.message || '',
          status: innerErr?.response?.status || innerErr?.status,
          data: innerErr?.response?.data || innerErr?.data,
          errcode: innerErr?.response?.data?.errcode || innerErr?.data?.errcode,
        })
        Logger.error('[DCP] create issue internal API failed:', JSON.stringify(errors[errors.length - 1]))
      }
    }

    const issueData = res?.data || res || {}
    const issueUuid = issueData.uuid || issueData.issue_uuid || ''
    const issueNumber = issueData.display_id || issueData.issue_number || ''

    if (!issueUuid) {
      // 所有内部 API 路径都失败，返回 fallback URL
      const fallbackUrl = `#/team/${tuid}/project/${projectID}/task/create`
      const errDetail = errors[0]?.errcode || errors[0]?.message || '未知错误'
      return { body: {
        error: `创建工作项失败：${errDetail}`,
        detail: {
          project_uuid: projectID,
          issue_type_uuid: typeUuid,
          issue_type_scope_uuid: typeScopeUuid,
          errors,
        },
        fallback_url: fallbackUrl,
      }, statusCode: 500 }
    }

    // 自动关联到评审单
    const key = `${rid}_li_${issueUuid}`
    await linkedIssue.set(key, {
      review_uuid: rid,
      issue_uuid: issueUuid,
      issue_number: issueNumber,
      issue_title: title,
      issue_type: issue_type_uuid || typeScopeUuid || '',
      issue_status: 'open',
      linked_by: b.linked_by || assignee_uuid || rv.creator_uuid || '',
      linked_by_name: b.linked_by_name || '',
      linked_at: Date.now(),
    })

    await writeAudit(rid, assignee_uuid || rv.creator_uuid || '', '创建工作项', issueUuid,
      `创建工作项并关联: ${issueNumber || issueUuid} - ${title}`)

    return { body: { ok: true, issue_uuid: issueUuid, issue_number: issueNumber } }
  } catch (e: any) {
    const errMsg = e?.message || e?.errcode || '未知错误'
    Logger.error('[DCP] createIssue error:', errMsg, e)
    const fallbackUrl = `#/team/${tuid}/project/${projectID}/task/create`
    return { body: { error: `创建工作项失败: ${errMsg}`, fallback_url: fallbackUrl }, statusCode: 500 }
  }
}

// ============================================================
// 发布决议（按 review_type 规则配置，全部提交后，不可覆盖）
// ============================================================
export async function publishResolution(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const {
    final_conclusion,    // pass | conditional_pass | reject | fail | rework
    condition_notes,
    publisher_uuid,
    publisher_name,
  } = b
  // 兼容旧字段
  const fc = final_conclusion || b.resolution_result
  const cn = condition_notes || b.resolution_body || ''
  const puuid = publisher_uuid || b.operator_uuid || ''

  if (!rid || !fc) {
    return { body: { error: '缺少 final_conclusion' }, statusCode: 400 }
  }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  if (rv.status !== 'reviewing') {
    return { body: { error: '当前状态不可发布决议' }, statusCode: 400 }
  }
  // 精确状态校验：reviewing / re_reviewing / awaiting_resolution 可发布决议
  const effState = getEffectiveState(rv)
  if (effState !== 'reviewing' && effState !== 'awaiting_resolution' && effState !== 're_reviewing') {
    return { body: { error: '当前状态不可发布决议' }, statusCode: 400 }
  }

  // 按 review_type 获取决议规则配置
  const reviewType = (rv as any).review_type || 'dcp'
  const rule = await getResolutionRuleByType(reviewType)

  // 兼容旧版中文结论
  let normalizedFc = fc
  const CN_MAP: any = { '通过': 'pass', '有条件通过': 'conditional_pass', '否决': 'reject', '不通过': 'fail', '返工': 'rework' }
  if (!rule.allowedConclusions.includes(fc)) {
    if (CN_MAP[fc]) {
      normalizedFc = CN_MAP[fc]
    } else {
      return { body: { error: `当前评审类型不支持该决议结果：${fc}` }, statusCode: 400 }
    }
  }
  if (!rule.allowedConclusions.includes(normalizedFc)) {
    return { body: { error: `当前评审类型（${reviewType.toUpperCase()}）不支持该决议结果：${normalizedFc}` }, statusCode: 400 }
  }

  // 读取评审人（优先实体查询，兜底快照）
  const snap = jsonArr((rv as any).reviewers_json || '[]')
  let allRvrs = await qAll(rvReviewer, (v: any) => v.review_uuid === rid)
  if (allRvrs.length === 0) {
    allRvrs = snap
  }
  if (allRvrs.length === 0) {
    return { body: { error: '未找到评审人记录' }, statusCode: 400 }
  }
  // 投影到当前轮次：旧轮次的提交数据视为未提交
  const _pubRoundNo = (rv as any).round_no || 1
  allRvrs = allRvrs.map((r: any) => {
    if ((r.round_no || 1) !== _pubRoundNo) {
      return { ...r, submitted_at: 0, conclusion: '', risk_level: '', opinion_summary: '', round_no: _pubRoundNo }
    }
    return r
  })

  // 校验：操作人必须是评审人
  const publisherReviewer = allRvrs.find((r: any) => r.reviewer_uuid === puuid)
  if (!publisherReviewer) {
    return { body: { error: '当前用户不是该评审单的评审人，不能发布决议' }, statusCode: 403 }
  }

  // 校验：发布人角色必须是唯一决议角色
  const publisherRole = getPublisherRole(rule)
  if (!publisherRole) {
    return { body: { error: `${reviewType.toUpperCase()} 决议角色未配置，请先在插件配置中设置允许发布 ${reviewType.toUpperCase()} 决议的角色。` }, statusCode: 400 }
  }
  const publisherReviewers = allRvrs.filter((r: any) => r.role_name === publisherRole)
  if (publisherReviewers.length !== 1) {
    return { body: { error: `决议角色「${publisherRole}」必须且只能指定 1 名评审人` }, statusCode: 400 }
  }
  if (publisherReviewers[0].reviewer_uuid !== puuid) {
    return { body: { error: `当前用户不是该评审单的决议人（决议角色：${publisherRole}），不能发布决议` }, statusCode: 403 }
  }

  // 按 review_type 过滤角色模板
  const roleTemplates = filterRolesByType(await qAll(roleTpl), reviewType)

  // 校验：提交要求
  const submitMode = rule.submitRequirement.mode || 'must_vote_roles'
  if (submitMode === 'must_vote_roles') {
    const mustVoteRoleNames = roleTemplates.filter((rt: any) => rt.must_vote).map((rt: any) => rt.role_name)
    const unsubmitted = allRvrs.filter((r: any) => {
      if (!mustVoteRoleNames.includes(r.role_name)) return false
      return r.submitted_at === 0 || !r.submitted_at
    })
    if (unsubmitted.length > 0) {
      return { body: {
        error: `仍有 ${unsubmitted.length} 名评审人未提交意见`,
        unsubmitted: unsubmitted.map((r: any) => `${r.role_name}`),
      }, statusCode: 400 }
    }
  } else if (submitMode === 'all_reviewers') {
    const unsubmitted = allRvrs.filter((r: any) => r.submitted_at === 0 || !r.submitted_at)
    if (unsubmitted.length > 0) {
      return { body: {
        error: `仍有 ${unsubmitted.length} 名评审人未提交意见`,
        unsubmitted: unsubmitted.map((r: any) => `${r.role_name}`),
      }, statusCode: 400 }
    }
  } else if (submitMode === 'vote_scope_roles') {
    // 计票范围内角色全部提交
    const scopeNames = resolveVoteScopeRoleNames(rule, roleTemplates)
    const unsubmitted = allRvrs.filter((r: any) => {
      if (!scopeNames.includes(r.role_name)) return false
      return r.submitted_at === 0 || !r.submitted_at
    })
    if (unsubmitted.length > 0) {
      return { body: {
        error: `仍有 ${unsubmitted.length} 名评审人未提交意见`,
        unsubmitted: unsubmitted.map((r: any) => `${r.role_name}`),
      }, statusCode: 400 }
    }
  }
  // publisher_only 模式：只要求发布人存在，不校验其他人

  // 校验：通过规则
  const passResult = validatePassRule(rule.passRule, allRvrs, roleTemplates, normalizedFc)
  if (!passResult.ok) {
    return { body: { error: passResult.error }, statusCode: 400 }
  }

  // 按当前轮次判断是否已有决议（支持多轮决议）
  const currentRoundNo = (rv as any).round_no || 1
  const existing = await qAll(resolution,
    (v: any) => v.review_uuid === rid && (v.round_no || 1) === currentRoundNo)
  if (existing.length > 0) {
    return { body: { error: `第${currentRoundNo}轮决议已发布，不可覆盖` }, statusCode: 409 }
  }

  const now = Date.now()
  const snapshotNumber = `DCP-RES-R${currentRoundNo}-${now.toString(36).toUpperCase()}`

  // conditional_pass / rework 必须填写条件说明
  if ((normalizedFc === 'conditional_pass' || normalizedFc === 'rework') && !cn.trim()) {
    return { body: { error: '有条件通过/返工必须填写条件说明' }, statusCode: 400 }
  }
  // conditional_pass / rework 必须至少创建一个整改项
  if (normalizedFc === 'conditional_pass' || normalizedFc === 'rework') {
    const remediationItems = await qAll(linkedIssue,
      (v: any) => v.review_uuid === rid && v.link_type === 'remediation')
    if (remediationItems.length === 0) {
      return { body: { error: '有条件通过/返工必须至少创建一个整改工作项，请在整改项区域创建后再发布决议' }, statusCode: 400 }
    }
  }

  // 决议实体 — 多轮使用轮次相关 key
  const resKey = currentRoundNo > 1 ? `${rid}_r${currentRoundNo}` : rid
  await resolution.set(resKey, {
    review_uuid: rid,
    final_conclusion: normalizedFc,
    condition_notes: cn,
    based_on_votes: JSON.stringify(allRvrs.map((r: any) => ({
      reviewer_uuid: r.reviewer_uuid,
      role_name: r.role_name,
      conclusion: r.conclusion || '',
      risk_level: r.risk_level || 'medium',
      opinion_summary: r.opinion_summary || '',
      submitted_at: r.submitted_at || 0,
    }))),
    snapshot_number: snapshotNumber,
    published_by: puuid,
    published_by_name: publisher_name || '',
    published_at: now,
    round_no: currentRoundNo,
  })
  // 根据决议结论确定目标状态
  let targetState: string
  let newStatus: string
  if (normalizedFc === 'pass') {
    targetState = 'completed'; newStatus = 'completed'
  } else if (normalizedFc === 'conditional_pass') {
    // 有条件通过 → 先进入 resolution_published，再进入 remediation_pending
    targetState = 'remediation_pending'; newStatus = 'reviewing'
  } else if (normalizedFc === 'rework') {
    targetState = 'remediation_pending'; newStatus = 'reviewing'
  } else {
    // reject / fail
    targetState = 'rejected'; newStatus = 'rejected'
  }
  const fcLabel = normalizedFc === 'pass' ? '通过' : normalizedFc === 'conditional_pass' ? '有条件通过' : normalizedFc === 'fail' ? '不通过' : normalizedFc === 'rework' ? '返工' : '驳回'
  const stateFields = buildStateTransition(rv, targetState, puuid, `决议：${fcLabel}`)
  await review.set(rid, { ...rv, ...stateFields })
  await writeAudit(rid, puuid, '发布决议', rid,
    `决议已发布: ${normalizedFc} [${snapshotNumber}]`)

  // 通知创建者 + 所有评审人（决议发布后）
  const notCfg3 = await getNotifyConfig()
  if (notCfg3.enabled && notCfg3.on_resolution) {
    const notUsers: string[] = []
    // 创建者
    const cid = (rv as any).creator_uuid
    if (cid && cid !== puuid) notUsers.push(cid)
    // 所有评审人（排除发布人自己）
    for (const r of allRvrs) {
      if (r.reviewer_uuid && r.reviewer_uuid !== puuid && !notUsers.includes(r.reviewer_uuid)) {
        notUsers.push(r.reviewer_uuid)
      }
    }
    if (notUsers.length > 0) {
      const phaseName = (rv as any).phase_code || ''
      const fcLabel = normalizedFc === 'pass' ? '通过' : normalizedFc === 'conditional_pass' ? '有条件通过' : normalizedFc === 'fail' ? '不通过' : normalizedFc === 'rework' ? '返工' : '驳回'
      sendNotification(
        `${reviewType.toUpperCase()}决议结果 — ${phaseName}`,
        `「${phaseName}」决议已发布：${fcLabel}。详情请查看评审单。`,
        `${(rv as any).project_uuid ? `/project/${(rv as any).project_uuid}` : ''}`,
        notUsers,
      )
    }
  }

  return { body: { ok: true, snapshot_number: snapshotNumber, status: newStatus, review_state: targetState } }
}

// 兼容旧名
export async function generateResolution(req: any): Promise<PluginResponse> {
  return publishResolution(req)
}

// ============================================================
// 补充/纠偏说明
// ============================================================
export async function addSupplement(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { note_type, note_title, note_content, submitted_by } = b
  if (!rid || !note_type || !note_title || !note_content) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  if (!['supplement', 'rectification'].includes(note_type)) {
    return { body: { error: 'note_type 必须为 supplement 或 rectification' }, statusCode: 400 }
  }
  const key = `${rid}_supp_${Date.now()}`
  await supplement.set(key, {
    review_uuid: rid, note_type, note_title, note_content,
    submitted_by: submitted_by || '', submitted_at: Date.now(),
  })
  const label = note_type === 'supplement' ? '补充说明' : '纠偏说明'
  await writeAudit(rid, submitted_by || '', `添加${label}`, rid, `${label}: ${note_title}`)
  return { body: { ok: true } }
}

// ============================================================
// Checklist 勾选/取消
// ============================================================
export async function checkChecklist(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { template_id, status, reviewer_uuid } = b
  if (!rid || !template_id || !status) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  if (!['unchecked', 'pass', 'fail'].includes(status)) {
    return { body: { error: 'status 必须为 unchecked / pass / fail' }, statusCode: 400 }
  }
  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }
  // 使用 effective_state 精确判断（reviewing / re_reviewing 可操作）
  const _chkEffState = getEffectiveState(rv)
  if (_chkEffState !== 'reviewing' && _chkEffState !== 're_reviewing') {
    return { body: { error: '当前状态不可操作 checklist' }, statusCode: 400 }
  }
  const cl = jsonArr((rv as any).checklist_json || '[]')
  const idx = cl.findIndex((c: any) => c.template_id === template_id)
  if (idx === -1) return { body: { error: '检查项不存在' }, statusCode: 404 }

  // 权限：操作人必须是对应角色的评审人，且不是决议发布角色
  const item = cl[idx]
  const snapReviewers = jsonArr((rv as any).reviewers_json || '[]')
  const myReviewer = snapReviewers.find((r: any) => r.reviewer_uuid === reviewer_uuid)
  if (!myReviewer) return { body: { error: '你不是本评审的评审人' }, statusCode: 403 }
  // 决议发布角色不可操作 checklist（按 review_type 规则配置判断）
  const _rvType = (rv as any).review_type || 'dcp'
  const _rule = await getResolutionRuleByType(_rvType)
  const _pubRole = getPublisherRole(_rule)
  if (_pubRole && myReviewer.role_name === _pubRole) {
    return { body: { error: '决议发布角色不可操作 checklist' }, statusCode: 403 }
  }
  if (myReviewer.role_name !== item.role_name) {
    return { body: { error: '该检查项不属于你的角色' }, statusCode: 403 }
  }

  cl[idx] = { ...item, status, checked_by: reviewer_uuid, checked_at: Date.now() }
  await review.set(rid, { ...rv, checklist_json: JSON.stringify(cl), updated_at: Date.now() })
  return { body: { ok: true, item: cl[idx] } }
}

// ============================================================
// 审计日志
// ============================================================
export async function getAuditLog(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
  const logs = await qAll(auditLog, (v: any) => v.review_uuid === rid)
  logs.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
  return { body: { logs } }
}

// ============================================================
// 手动催办（催办评审人 / 催办决议人）
// ============================================================
export async function remindReview(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { target, operator_uuid, operator_name } = b

  if (!rid || !target || !operator_uuid) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  if (target !== 'reviewers' && target !== 'resolution') {
    return { body: { error: 'target 必须为 reviewers 或 resolution' }, statusCode: 400 }
  }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }

  // 权限校验：仅评审发起人可催办
  if (rv.creator_uuid !== operator_uuid) {
    return { body: { error: '仅评审发起人可催办' }, statusCode: 403 }
  }

  // 状态校验：仅评审中可催办
  if (rv.status !== 'reviewing') {
    return { body: { error: '当前状态不可催办' }, statusCode: 400 }
  }
  const _remindEffState = getEffectiveState(rv)
  if (_remindEffState !== 'reviewing' && _remindEffState !== 'awaiting_resolution' && _remindEffState !== 're_reviewing') {
    return { body: { error: '当前状态不可催办' }, statusCode: 400 }
  }

  // 通知配置校验
  const notifyCfg = await getNotifyConfig()
  if (!notifyCfg.enabled) {
    return { body: { error: '通知功能未开启' }, statusCode: 400 }
  }
  // 兼容旧配置：如果没有 on_manual_remind 字段，视为开启
  if (notifyCfg.on_manual_remind === false) {
    return { body: { error: '手动催办功能未开启' }, statusCode: 400 }
  }

  // 冷却校验
  const cooldown = Number(notifyCfg.remind_cooldown_seconds || 60) * 1000
  const recent = await qAll(auditLog, (v: any) =>
    v.review_uuid === rid &&
    v.action === '手动催办' &&
    v.target === target &&
    Date.now() - Number(v.timestamp || 0) < cooldown
  )
  if (recent.length > 0) {
    return { body: { error: '催办过于频繁，请稍后再试' }, statusCode: 429 }
  }

  // 读取评审人（优先实体查询，兜底快照）
  const snapReviewers = jsonArr((rv as any).reviewers_json || '[]')
  const entityReviewers = await qAll(rvReviewer, (v: any) => v.review_uuid === rid)
  const reviewers = entityReviewers.length > 0 ? entityReviewers : snapReviewers
  if (reviewers.length === 0) {
    return { body: { error: '暂无需要催办的评审人' }, statusCode: 400 }
  }

  const reviewType = (rv as any).review_type || 'dcp'
  const rule = await getResolutionRuleByType(reviewType)
  const publisherRole = getPublisherRole(rule)
  const phaseName = (rv as any).phase_code || ''
  const reviewTitle = (rv as any).review_title || 'DCP评审'
  const rtLabel = reviewType.toUpperCase()
  const url = (rv as any).project_uuid ? `/project/${(rv as any).project_uuid}` : ''

  if (target === 'reviewers') {
    // 催办评审人：排除决议角色，仅催办未提交的前置评审人
    const pendingReviewers = reviewers.filter((r: any) => {
      if (!r.reviewer_uuid) return false
      if (publisherRole && r.role_name === publisherRole) return false
      return Number(r.submitted_at || 0) <= 0
    })
    if (pendingReviewers.length === 0) {
      return { body: { error: '暂无需要催办的评审人' }, statusCode: 400 }
    }

    const toUsers = pendingReviewers.map((r: any) => r.reviewer_uuid)
    const sendResult = await sendNotification(
      `${rtLabel}评审催办 — ${phaseName}`,
      `您有待处理的「${phaseName} ${reviewTitle}」评审意见，请尽快前往评审工作台提交。`,
      url,
      toUsers,
    )

    // 审计日志（detail 上限 2048，截断接收人列表）
    const recipientSummary = pendingReviewers.slice(0, 20).map((r: any) => ({ uuid: r.reviewer_uuid, role_name: r.role_name }))
    const detail = JSON.stringify({
      target, recipient_count: pendingReviewers.length,
      recipients: recipientSummary, channels: sendResult.attempted,
    }).slice(0, 2048)
    await writeAudit(rid, operator_uuid, '手动催办', target, detail)

    return { body: {
      ok: true, target: 'reviewers',
      recipient_count: pendingReviewers.length,
      recipients: pendingReviewers.map((r: any) => ({ uuid: r.reviewer_uuid, role_name: r.role_name })),
      channels: sendResult.attempted,
    }}
  }

  // target === 'resolution'：催办决议人
  const roleTemplates = filterRolesByType(await qAll(roleTpl), reviewType)
  const ready = isResolutionReady(rule, reviewers, roleTemplates)
  if (!ready) {
    return { body: { error: '当前评审单尚未进入待决议状态' }, statusCode: 400 }
  }

  // 确认尚未发布决议
  const existingRes = await qAll(resolution, (v: any) => v.review_uuid === rid)
  const hasPublished = existingRes.some((r: any) => Number(r.published_at || 0) > 0)
  if (hasPublished) {
    return { body: { error: '当前评审单尚未进入待决议状态' }, statusCode: 400 }
  }

  // 找到唯一决议人
  const publisher = reviewers.find((r: any) => r.role_name === publisherRole && r.reviewer_uuid)
  if (!publisher) {
    return { body: { error: '未找到决议人' }, statusCode: 400 }
  }

  const sendResult = await sendNotification(
    `${rtLabel}决议催办 — ${phaseName}`,
    `「${phaseName} ${reviewTitle}」已满足决议条件，请尽快前往评审单发布决议。`,
    url,
    [publisher.reviewer_uuid],
  )

  const detail = JSON.stringify({
    target, recipient_count: 1,
    recipients: [{ uuid: publisher.reviewer_uuid, role_name: publisher.role_name }],
    channels: sendResult.attempted,
  }).slice(0, 2048)
  await writeAudit(rid, operator_uuid, '手动催办', target, detail)

  return { body: {
    ok: true, target: 'resolution',
    recipient_count: 1,
    recipients: [{ uuid: publisher.reviewer_uuid, role_name: publisher.role_name }],
    channels: sendResult.attempted,
  }}
}

// ============================================================
// 别名：ONES 平台可能自动生成的函数名
// ============================================================
export async function getDcpConfig(req: any): Promise<PluginResponse> {
  return getPluginConfig(req)
}

export async function getDcpReviews(req: any): Promise<PluginResponse> {
  const puid = getParam(req, 'project_uuid')
  if (puid) return listReviewsByProject(req)
  return listTeamReviews(req)
}

// ============================================================
// 获取项目工作项类型列表（调用 ONES Open API）
// ============================================================
export async function listIssueTypes(req: any): Promise<PluginResponse> {
  const tuid = getParam(req, 'team_uuid')
  const puid = getParam(req, 'project_uuid')
  if (!tuid || !puid) return { body: { error: '缺少 team_uuid 或 project_uuid' }, statusCode: 400 }

  // 解析项目真实 UUID
  let projectID = puid
  try {
    const exchRes = await OPFetch(
      `/project/api/ones-project/team/${tuid}/projects/exchange/${projectID}`,
      { teamUUID: tuid }
    ) as any
    if (exchRes?.data?.project_uuid || exchRes?.project_uuid) projectID = exchRes?.data?.project_uuid || exchRes?.project_uuid
  } catch {}

  // 多路径级联获取工作项类型（不同 ONES 版本路径不同）
  const internalPaths = [
    `/project/api/project/team/${tuid}/projects/${projectID}/work_item_types`,
    `/project/api/project/team/${tuid}/projects/${projectID}/task_types`,
    `/project/api/project/team/${tuid}/projects/${projectID}/types`,
    `/project/api/project/team/${tuid}/projects/${projectID}/setting/task_types`,
    `/project/api/project/team/${tuid}/projects/${projectID}/field-config/types`,
    `/project/api/project/team/${tuid}/work_item_types`,
    `/project/api/project/team/${tuid}/task_types`,
    `/project/api/project/team/${tuid}/items/types`,
  ]

  // 方式一：ONES 内部 API（OPFetch 自动鉴权）— 优先 GraphQL
  let types: any[] = []

  // GraphQL 端点（HAR 验证在 demo688 可用）
  try {
    const gqlRes = await OPFetch(`/project/api/project/team/${tuid}/items/graphql?t=issueTypes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { query: '{ issueTypes(orderBy: { namePinyin: ASC }) { uuid name } }', variables: {} },
    }) as any
    const raw = gqlRes?.data?.issueTypes || []
    if (Array.isArray(raw) && raw.length > 0) {
      types = raw.map((t: any) => ({ uuid: t.uuid || '', name: t.name || '' })).filter((t: any) => t.name)
    }
  } catch {}

  // 传统 REST 多路径级联
  if (types.length === 0) {
    for (const path of internalPaths) {
    if (types.length > 0) break
    try {
      const res = await OPFetch(path) as any
      const data = res?.data || res || {}
      const raw = data.work_item_types || data.task_types || data.types || data.items || data.list || data.results || data.data || data || []
      if (Array.isArray(raw) && raw.length > 0) {
        types = raw.map((t: any) => ({
          uuid: t.uuid || t.issue_type_uuid || t.id || '',
          name: t.name || t.issue_type_name || t.type_name || t.display_name || '',
        })).filter((t: any) => t.name)
        if (types.length > 0) break
      }
    } catch {}
  }
  }

  if (types.length > 0) {
    return { body: { issue_types: types } }
  }

  // 方式二：Open API v2/v1（需要 Bearer token + origin）
  const origin = (req.body || {}).ones_origin || ''
  if (!origin) return { body: { issue_types: [] } }

  try {
    const token = await getOpenApiToken({ teamID: tuid })
    let res: any = null
    try {
      res = await OPFetch(`${origin}/openapi/v2/project/issueTypes?teamID=${tuid}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      }) as any
    } catch {}
    if (!res?.data?.issue_types?.length) {
      try {
        res = await OPFetch(`${origin}/openapi/v1/project/issueTypes?teamID=${tuid}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        }) as any
      } catch {}
    }
    const raw = res?.data?.issue_types || res?.data || []
    types = raw.map((t: any) => ({
      uuid: t.uuid || t.issue_type_uuid,
      name: t.name || t.issue_type_name,
    }))
  } catch {}

  return { body: { issue_types: types } }
}

// ============================================================
// 状态机 API — 手动状态流转 / 查询状态 / 查询轮次
// ============================================================

// POST /review/:review_uuid/transition — 手动触发状态流转
export async function transitionReview(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  const b = (req.body || {}) as any
  const { target_state, operator_uuid, reason } = b
  if (!rid || !target_state || !operator_uuid) {
    return { body: { error: '缺少必要字段' }, statusCode: 400 }
  }
  if (!REVIEW_STATES.includes(target_state as any)) {
    return { body: { error: `无效的目标状态: ${target_state}` }, statusCode: 400 }
  }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }

  const currentState = getEffectiveState(rv)
  if (!isValidTransition(currentState, target_state)) {
    return { body: { error: `非法状态流转: ${currentState} → ${target_state}` }, statusCode: 400 }
  }

  // 权限校验：仅发起人可手动流转
  if ((rv as any).creator_uuid !== operator_uuid) {
    return { body: { error: '仅评审发起人可触发状态流转' }, statusCode: 403 }
  }

  // 进入 re_reviewing 时重置评审人提交状态（开启新轮次）
  let extra: Record<string, any> = {}
  if (target_state === 're_reviewing') {
    const newRoundNo = ((rv as any).round_no || 1) + 1
    // 优先查实体，兜底快照
    const snapRvrs = jsonArr((rv as any).reviewers_json || '[]')
    const entityRvrs = await qAll(rvReviewer, (v: any) => v.review_uuid === rid)
    const allReviewers = entityRvrs.length > 0 ? entityRvrs : snapRvrs
    // 更新快照 JSON
    const resetReviewers = allReviewers.map((r: any) => ({
      ...r, round_no: newRoundNo, conclusion: '', risk_level: '', opinion_summary: '', submitted_at: 0,
    }))
    extra.reviewers_json = JSON.stringify(resetReviewers)
    // 同步重置 rvReviewer 实体（submitOpinion / listMyReviews 优先读实体）
    for (const r of entityRvrs) {
      await rvReviewer.set(r._key, {
        ...r,
        round_no: newRoundNo,
        submitted_at: 0,
        conclusion: '',
        risk_level: '',
        opinion_summary: '',
      })
    }
    // 重置 checklist
    let cl = jsonArr((rv as any).checklist_json || '[]')
    for (const item of cl) { item.status = 'unchecked'; item.checked_by = ''; item.checked_at = 0 }
    extra.checklist_json = JSON.stringify(cl)
  }

  const stateFields = buildStateTransition(rv, target_state, operator_uuid, reason || `手动流转: ${currentState} → ${target_state}`, extra)
  await review.set(rid, { ...rv, ...stateFields })
  await writeAudit(rid, operator_uuid, '状态流转', target_state,
    `${currentState} → ${target_state}${reason ? ' | ' + reason : ''}`)

  return {
    body: {
      ok: true,
      review_state: target_state,
      status: stateToStatus(target_state),
      round_no: stateFields.round_no,
      round_state: stateToRoundState(target_state),
      previous_state: currentState,
    }
  }
}

// GET /review/:review_uuid/state — 查询完整状态信息
export async function getReviewState(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }

  const currentState = getEffectiveState(rv)
  const history = jsonArr((rv as any).state_history_json || '[]')

  // 可流转到的目标状态
  const availableTransitions = VALID_TRANSITIONS[currentState] || []

  return {
    body: {
      review_uuid: rid,
      review_state: currentState,
      status: (rv as any).status,
      round_no: Number((rv as any).round_no || 1),
      round_state: (rv as any).round_state || stateToRoundState(currentState),
      state_history: history,
      available_transitions: availableTransitions,
    }
  }
}

// GET /review/:review_uuid/rounds — 查询轮次信息
export async function getReviewRounds(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }

  const history = jsonArr((rv as any).state_history_json || '[]')
  const currentRoundNo = Number((rv as any).round_no || 1)

  // 从状态历史中提取轮次信息
  const rounds: any[] = []
  let currentRound: any = null
  for (const entry of history) {
    const rno = Number(entry.round_no || 1)
    if (!currentRound || currentRound.round_no !== rno) {
      if (currentRound) rounds.push(currentRound)
      currentRound = {
        round_no: rno,
        started_at: entry.at,
        started_by: entry.by,
        start_state: entry.state,
        states: [entry],
      }
    } else {
      currentRound.states.push(entry)
      currentRound.end_state = entry.state
      currentRound.ended_at = entry.at
    }
  }
  if (currentRound) rounds.push(currentRound)

  // 获取每轮的决议快照
  const resolutions = await qAll(resolution, (v: any) => v.review_uuid === rid)

  return {
    body: {
      review_uuid: rid,
      current_round_no: currentRoundNo,
      current_round_state: (rv as any).round_state || stateToRoundState(getEffectiveState(rv)),
      total_rounds: rounds.length,
      rounds: rounds.map((r: any) => ({
        round_no: r.round_no,
        started_at: r.started_at,
        ended_at: r.ended_at || 0,
        start_state: r.start_state,
        end_state: r.end_state || r.start_state,
        state_count: r.states.length,
        resolution: resolutions.find((res: any) => {
          // 决议时间在该轮次的开始和结束之间
          const publishedAt = Number(res.published_at || 0)
          return publishedAt >= r.started_at && (!r.ended_at || publishedAt <= r.ended_at)
        }) || null,
      })),
    }
  }
}

// ============================================================
// 事件处理 — 工作项状态变更（整改闭环被动通知）
// ============================================================

function parseEvent(payload: any) {
  const evt = payload?.body?.eventID ? payload.body : (payload?.eventID ? payload : {})
  const ctx = evt?.eventContext || {}
  return {
    eventID: evt?.eventID || '',
    teamUUID: ctx?.teamID || '',
    userUUID: ctx?.triggerUserID || '',
    timestamp: evt?.timestamp || Date.now(),
    data: evt?.eventData || {},
  }
}

// 判断状态是否属于"已完成"类型（非状态名，是状态类型 category）
async function checkStatusIsDone(teamUUID: string, statusID: string, statusName: string): Promise<boolean> {
  // 方式一：GraphQL 反查 status category
  if (teamUUID && statusID) {
    try {
      const res = await OPFetch(
        `/project/api/project/team/${teamUUID}/items/graphql?t=statusCategory`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          data: { query: `{ issueStatus(uuid: "${statusID}") { uuid name category } }` },
        }
      ) as any
      const category = res?.data?.issueStatus?.category
      if (category !== undefined && category !== null) {
        return Number(category) === 2 // 2 = 已完成
      }
    } catch {}
  }
  // 方式二：兜底——状态名关键词匹配
  const doneKeywords = ['完成', '关闭', '已关闭', 'done', 'complete', 'closed', '已交付', 'resolved', '已解决']
  return doneKeywords.some(k => statusName.toLowerCase().includes(k.toLowerCase()))
}

// 事件 handler — 工作项状态变更
export async function onIssueStatusChanged(payload: any) {
  try {
    const evt = parseEvent(payload)
    const data = evt.data as any
    const teamUUID = evt.teamUUID
    const issueID = data?.issueID || ''
    const newStatus = data?.newStatus || {}
    if (!issueID) return { body: {} }

    // 检查是否是整改关联工作项
    const items = await qAll(linkedIssue,
      (v: any) => v.issue_uuid === issueID && v.link_type === 'remediation')
    if (items.length === 0) return { body: {} }

    // 判断新状态是否属于"已完成"类型
    const isDone = await checkStatusIsDone(teamUUID, newStatus.id || '', newStatus.name || '')

    // 更新快照（通常只有一条记录）
    for (const item of items) {
      await linkedIssue.set(item._key, {
        ...item,
        issue_status: isDone ? 'done' : (newStatus.name || ''),
      })
    }

    // 如果是已完成，检查该评审单所有整改项是否全部完成
    if (isDone) {
      const rid = items[0].review_uuid
      const allRemediation = await qAll(linkedIssue,
        (v: any) => v.review_uuid === rid && v.link_type === 'remediation')
      const allDone = allRemediation.every((v: any) => v.issue_status === 'done')

      if (allDone) {
        // 通知决议人 + 评审发起人
        const rv = await review.get(rid)
        if (rv) {
          const resolutions = await qAll(resolution, (v: any) => v.review_uuid === rid)
          const publisherUUID = resolutions[0]?.published_by || ''
          const creatorUUID = (rv as any).creator_uuid || ''
          // 合并通知对象（去重）
          const notifyTargets = [...new Set([publisherUUID, creatorUUID].filter(Boolean))] as string[]

          const notCfg = await getNotifyConfig()
          if (notCfg.enabled && notifyTargets.length > 0) {
            const phaseName = (rv as any).phase_code || ''
            const title = (rv as any).review_title || phaseName
            sendNotification(
              `${((rv as any).review_type || 'dcp').toUpperCase()}评审整改完成 — ${phaseName}`,
              `「${title}」的 ${allRemediation.length} 个整改项已全部完成，请确认。`,
              (rv as any).project_uuid ? `/project/${(rv as any).project_uuid}` : '',
              notifyTargets,
            )
          }
        }
      }
    }
  } catch (e: any) {
    Logger.error(`[DCP] onIssueStatusChanged error: ${e?.message || e}`)
  }
  return { body: {} }
}

// ============================================================
// 整改闭环 — 查询 / 刷新 / 确认
// ============================================================

// GET /review/:review_uuid/remediation — 查询整改关联工作项
export async function getRemediationIssues(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }

  const items = await qAll(linkedIssue,
    (v: any) => v.review_uuid === rid && v.link_type === 'remediation')
  items.sort((a: any, b: any) => (a.linked_at || 0) - (b.linked_at || 0))

  const allDone = items.length > 0 && items.every((v: any) => v.issue_status === 'done')

  return {
    body: {
      items,
      total: items.length,
      done_count: items.filter((v: any) => v.issue_status === 'done').length,
      all_done: allDone,
    }
  }
}

// POST /review/:review_uuid/remediation/refresh — 手动刷新整改项状态（兜底）
export async function refreshRemediationStatus(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
  const tuid = getParam(req, 'team_uuid')
  if (!tuid) return { body: { error: '无法获取 team_uuid' }, statusCode: 400 }

  const items = await qAll(linkedIssue,
    (v: any) => v.review_uuid === rid && v.link_type === 'remediation')

  for (const item of items) {
    try {
      const res = await OPFetch(
        `/project/api/project/team/${tuid}/tasks/${item.issue_uuid}`,
        { method: 'GET', teamUUID: tuid }
      ) as any
      const statusName = res?.status?.name || res?.data?.status?.name || res?.status || ''
      const statusID = res?.status?.id || res?.data?.status?.id || res?.status_uuid || ''
      if (statusName) {
        const isDone = await checkStatusIsDone(tuid, statusID, statusName)
        await linkedIssue.set(item._key, {
          ...item,
          issue_status: isDone ? 'done' : statusName,
        })
      }
    } catch {}
  }

  const updated = await qAll(linkedIssue,
    (v: any) => v.review_uuid === rid && v.link_type === 'remediation')
  const allDone = updated.length > 0 && updated.every((v: any) => v.issue_status === 'done')

  return {
    body: {
      items: updated,
      total: updated.length,
      done_count: updated.filter((v: any) => v.issue_status === 'done').length,
      all_done: allDone,
    }
  }
}

// POST /review/:review_uuid/remediation/confirm — 决议人确认整改完成
export async function confirmRemediation(req: any): Promise<PluginResponse> {
  const rid = getParam(req, 'review_uuid')
  if (!rid) return { body: { error: '缺少 review_uuid' }, statusCode: 400 }
  const tuid = getParam(req, 'team_uuid')
  const b = (req.body || {}) as any
  const { publisher_uuid, next_action } = b
  // next_action: 'complete' | 're_review'

  if (!publisher_uuid) return { body: { error: '缺少 publisher_uuid' }, statusCode: 400 }
  if (!next_action || !['complete', 're_review'].includes(next_action)) {
    return { body: { error: 'next_action 必须为 complete 或 re_review' }, statusCode: 400 }
  }

  const rv = await review.get(rid)
  if (!rv) return { body: { error: '评审单不存在' }, statusCode: 404 }

  const effState = getEffectiveState(rv)
  if (effState !== 'remediation_pending') {
    return { body: { error: '当前状态不可确认整改' }, statusCode: 400 }
  }

  // 校验：至少有一个整改项
  const items = await qAll(linkedIssue,
    (v: any) => v.review_uuid === rid && v.link_type === 'remediation')
  if (items.length === 0) {
    return { body: { error: '请先创建或关联整改工作项' }, statusCode: 400 }
  }

  // 校验：所有整改项已完成
  const notDone = items.filter((v: any) => v.issue_status !== 'done')
  if (notDone.length > 0) {
    return {
      body: {
        error: `仍有 ${notDone.length} 个整改项未完成`,
        pending: notDone.map((v: any) => v.issue_title || v.issue_uuid),
      },
      statusCode: 400
    }
  }

  const now = Date.now()

  // 1. 给每个整改工作项发评论（备注）
  if (tuid) {
    const reviewNumber = (rv as any).review_number || rid
    const commentText = `整改已由决议人确认完成（评审单 ${reviewNumber}）。本工作项已锁定，请勿再修改。`
    for (const item of items) {
      try {
        await OPFetch(
          `/project/api/project/team/${tuid}/items/graphql?t=addComment`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            teamUUID: tuid,
            data: {
              query: `mutation { addComment(input: { issueID: "${item.issue_uuid}", content: "${commentText.replace(/"/g, '\\"')}" }) { success } }`,
            },
          }
        )
      } catch (e: any) {
        Logger.error(`[DCP] addComment for ${item.issue_uuid} failed: ${e?.message || e}`)
      }
    }
  }

  // 2. 锁定工作项（更新 linkedIssue.locked）
  for (const item of items) {
    await linkedIssue.set(item._key, {
      ...item,
      locked: 'locked',
      locked_at: now,
      locked_by: publisher_uuid,
    })
  }

  // 3. 评审单状态流转
  const targetState = next_action === 're_review' ? 're_reviewing' : 'completed'
  const reason = next_action === 're_review'
    ? '整改完成，发起复审'
    : '整改完成，评审通过'

  // 如果是复审，round_no + 1，重置 reviewers_json 中评审人 submitted_at
  let newRoundNo = (rv as any).round_no || 1
  let newReviewersJson = (rv as any).reviewers_json || '[]'
  if (next_action === 're_review') {
    newRoundNo = newRoundNo + 1
    const snap = jsonArr(newReviewersJson)
    newReviewersJson = JSON.stringify(snap.map((r: any) => ({
      ...r,
      round_no: newRoundNo,
      submitted_at: 0,
      conclusion: '',
      risk_level: '',
      opinion_summary: '',
    })))
    // 同步重置 rvReviewer 实体（submitOpinion / listMyReviews 优先读实体）
    const entityRvrs = await qAll(rvReviewer, (v: any) => v.review_uuid === rid)
    for (const r of entityRvrs) {
      await rvReviewer.set(r._key, {
        ...r,
        round_no: newRoundNo,
        submitted_at: 0,
        conclusion: '',
        risk_level: '',
        opinion_summary: '',
      })
    }
  }

  const stateFields = buildStateTransition(rv, targetState, publisher_uuid, reason)
  // 复审时重置 checklist
  if (next_action === 're_review') {
    let cl = jsonArr((rv as any).checklist_json || '[]')
    for (const item of cl) { item.status = 'unchecked'; item.checked_by = ''; item.checked_at = 0 }
    stateFields.checklist_json = JSON.stringify(cl)
  }
  await review.set(rid, {
    ...rv,
    ...stateFields,
    round_no: newRoundNo,
    reviewers_json: newReviewersJson,
  })

  await writeAudit(rid, publisher_uuid, '确认整改完成', rid,
    `整改项 ${items.length} 个全部完成，${next_action === 're_review' ? '进入复审' : '评审完成'}`)

  // 4. 通知整改负责人工作项已锁定
  const notCfg = await getNotifyConfig()
  if (notCfg.enabled) {
    const ownerUUIDs = [...new Set(items.map((v: any) => v.linked_by).filter(Boolean))] as string[]
    if (ownerUUIDs.length > 0) {
      sendNotification(
        `${((rv as any).review_type || 'dcp').toUpperCase()}整改已确认 — ${(rv as any).phase_code || ''}`,
        `「${(rv as any).review_title || (rv as any).phase_code}」整改已由决议人确认完成，关联工作项已锁定。`,
        (rv as any).project_uuid ? `/project/${(rv as any).project_uuid}` : '',
        ownerUUIDs,
      )
    }
  }

  return { body: { ok: true, review_state: targetState, round_no: newRoundNo } }
}
