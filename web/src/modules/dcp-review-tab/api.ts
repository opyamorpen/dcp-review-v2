import { getTeamUUID, getAppID, DcpApiError } from '../../api'

function buildUrl(url: string): string {
  const tu = getTeamUUID()
  if (!tu) throw new DcpApiError('未获取到团队 UUID，请从 ONES 项目页面进入。', 0)
  return `/project/api/project/team/${tu}${url}`
}

function callApi<T = any>(url: string, options: { method?: string; body?: string } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const fullUrl = buildUrl(url)
    const xhr = new XMLHttpRequest()
    xhr.open(options.method || 'GET', fullUrl, true)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('Ones-Plugin-Id', '709xehle')
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText)
          // addition API: { body: {...} }, external API: { data: {...} }
          resolve(json.body || json.data || json)
        }
        catch { reject(new Error(`JSON parse error`)) }
      } else {
        // 尝试从响应体提取 error 字段
        let msg = `${xhr.status}`
        try {
          const json = JSON.parse(xhr.responseText)
          msg = json.body?.error || json.data?.error || json.error || xhr.responseText.substring(0, 200)
        } catch { msg = xhr.responseText.substring(0, 200) }
        reject(new Error(msg))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(options.body || null)
  })
}

// ---- 基础 ----
export const getPluginConfig = () => callApi('/dcp/config')
export const savePluginConfig = (data: any) => callApi('/dcp/config', { method: 'POST', body: JSON.stringify(data) })

// ---- 用户搜索（加载团队成员，客户端过滤） ----
let _memberCache: { uuid: string; name: string; email: string; avatar: string }[] | null = null

async function fetchTeamMembers(tu: string): Promise<{ uuid: string; name: string; email: string; avatar: string }[]> {
  // 团队 members 列表（已验证可行）
  try {
    const res = await fetch(`/project/api/project/team/${tu}/members?limit=200`, { credentials: 'include' })
    if (res.ok) {
      const json = await res.json()
      // ONES 返回格式: { members: [...] }，也可能 { data: [...] }
      const list = json.members || json.data || json || []
      return (Array.isArray(list) ? list : []).map((u: any) => ({
        uuid: u.uuid || '',
        name: u.name || u.email || u.uuid || '',
        email: u.email || '',
        avatar: u.avatar || '',
      }))
    }
  } catch { /* 静默失败 */ }

  return []
}

// 获取团队成员名称映射（UUID → 姓名）
let _nameMapCache: Record<string, string> | null = null
export async function resolveReviewerNames(uuids: string[]): Promise<Record<string, string>> {
  if (!_nameMapCache) {
    const members = await fetchTeamMembers(getTeamUUID())
    _nameMapCache = {}
    for (const m of members) _nameMapCache[m.uuid] = m.name
  }
  const result: Record<string, string> = {}
  for (const uid of uuids) {
    result[uid] = _nameMapCache[uid] || uid
  }
  return result
}

export async function searchUsers(keyword: string): Promise<{ uuid: string; name: string; email: string; avatar: string }[]> {
  const tu = getTeamUUID()
  if (!tu) throw new DcpApiError('未获取到团队 UUID', 0)

  // 首次加载全部团队成员并缓存
  if (!_memberCache) {
    _memberCache = await fetchTeamMembers(tu)
  }

  if (!keyword || !keyword.trim()) return _memberCache.slice(0, 20)
  const kw = keyword.trim().toLowerCase()
  return _memberCache.filter(u =>
    u.name.toLowerCase().includes(kw) || u.email.toLowerCase().includes(kw)
  ).slice(0, 20)
}

// ---- 评审单 ----
export const createReview = (data: any) => callApi('/dcp/review', { method: 'POST', body: JSON.stringify(data) })
export const getReviewDetail = (uuid: string) => callApi(`/dcp/review/${uuid}`)
export const listReviewsByProject = (puuid: string, reviewType?: string, projectAliases: string[] = []) => {
  const params = new URLSearchParams()
  if (reviewType) params.set('review_type', reviewType)
  const aliases = [...new Set(projectAliases.filter(alias => alias && alias !== puuid))]
  if (aliases.length > 0) params.set('project_aliases', aliases.join(','))
  const query = params.toString()
  return callApi(`/dcp/reviews/by-project/${puuid}${query ? `?${query}` : ''}`)
}
export const listTeamReviews = () => callApi('/dcp/reviews/team')
export const startReview = (uuid: string, data?: any) => callApi(`/dcp/review/${uuid}/start`, { method: 'POST', body: JSON.stringify(data || {}) })
export const recallReview = (uuid: string, data?: any) => callApi(`/dcp/review/${uuid}/recall`, { method: 'POST', body: JSON.stringify(data || {}) })
export const updateReviewBasicInfo = (uuid: string, data?: any) => callApi(`/dcp/review/${uuid}/basic-info`, { method: 'POST', body: JSON.stringify(data || {}) })
export const deleteReview = (uuid: string, data?: any) => callApi(`/dcp/review/${uuid}`, { method: 'DELETE', body: JSON.stringify(data || {}) })
export const recreateReview = (uuid: string, data?: any) => callApi(`/dcp/review/${uuid}/recreate`, { method: 'POST', body: JSON.stringify(data || {}) })

// ---- 材料 & 指标 ----
export const updateMaterialStatus = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/material-status`, { method: 'POST', body: JSON.stringify(data) })
export const uploadMaterialFile = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/material-upload`, { method: 'POST', body: JSON.stringify(data) })
export const removeMaterialFile = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/material-remove`, { method: 'POST', body: JSON.stringify(data) })
export const getMaterialUploadUrl = (reviewUuid: string, templateId: string) => callApi(`/dcp/review/${reviewUuid}/material/${templateId}/upload-url`)
export const getMaterialDownloadUrl = (reviewUuid: string, templateId: string) => callApi(`/dcp/review/${reviewUuid}/material/${templateId}/download-url`)
export const getMaterialPreview = (reviewUuid: string, templateId: string) => callApi(`/dcp/review/${reviewUuid}/material/${templateId}/preview`)
export const getAttachmentDownloadUrl = (reviewUuid: string, objectKey: string) => callApi(`/dcp/review/${reviewUuid}/material-attachment/download-url?object_key=${encodeURIComponent(objectKey)}`)
export const getAttachmentPreview = (reviewUuid: string, objectKey: string, fileName: string) => callApi(`/dcp/review/${reviewUuid}/material-attachment/preview?object_key=${encodeURIComponent(objectKey)}&file_name=${encodeURIComponent(fileName)}`)
export const updateIndicators = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/indicators`, { method: 'POST', body: JSON.stringify(data) })

// ---- 评审人 & 意见 ----
export const updateReviewers = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/reviewers`, { method: 'POST', body: JSON.stringify(data) })
export const submitOpinion = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/opinion`, { method: 'POST', body: JSON.stringify(data) })

// ---- 关联工作项 ----
export const linkIssue = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/link-issue`, { method: 'POST', body: JSON.stringify(data) })
export const getLinkedIssues = (uuid: string) => callApi(`/dcp/review/${uuid}/linked-issues`)

// ---- 决议 & 补充 ----
export const generateResolution = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/generate-resolution`, { method: 'POST', body: JSON.stringify(data) })
export const publishResolution = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/publish-resolution`, { method: 'POST', body: JSON.stringify(data) })
export const addSupplement = (uuid: string, data: any) => callApi(`/dcp/review/${uuid}/supplement`, { method: 'POST', body: JSON.stringify(data) })

// ---- 审计 ----
export const getAuditLog = (uuid: string) => callApi(`/dcp/review/${uuid}/audit-log`)

// ---- 催办 ----
export const remindReview = (uuid: string, data: { target: 'reviewers' | 'resolution'; operator_uuid: string; operator_name?: string }) =>
  callApi(`/dcp/review/${uuid}/remind`, { method: 'POST', body: JSON.stringify(data) })

// ---- 状态机 ----
export const transitionReview = (uuid: string, data: { target_state: string; operator_uuid: string; reason?: string }) =>
  callApi(`/dcp/review/${uuid}/transition`, { method: 'POST', body: JSON.stringify(data) })
export const getReviewState = (uuid: string) => callApi(`/dcp/review/${uuid}/state`)
export const getReviewRounds = (uuid: string) => callApi(`/dcp/review/${uuid}/rounds`)

// ---- 整改闭环 ----
export const getRemediationIssues = (uuid: string) => callApi(`/dcp/review/${uuid}/remediation`)
export const refreshRemediationStatus = (uuid: string) => callApi(`/dcp/review/${uuid}/remediation/refresh`, { method: 'POST' })
export const syncRemediationStatus = (uuid: string, items: any[]) =>
  callApi(`/dcp/review/${uuid}/remediation/sync`, { method: 'POST', body: JSON.stringify({ items }) })
export const confirmRemediation = (uuid: string, data: { publisher_uuid: string; next_action: 'complete' | 're_review' }) =>
  callApi(`/dcp/review/${uuid}/remediation/confirm`, { method: 'POST', body: JSON.stringify(data) })

// ---- Reviewer Profile ----
export const listReviewerProfiles = (reviewType?: string) =>
  callApi(`/dcp/reviewer-profiles${reviewType ? `?review_type=${reviewType}` : ''}`)
export const createReviewerProfile = (data: { profile_name: string; review_type: string; description?: string; role_assignments: { role_name: string; mode: 'single' | 'pool'; default_reviewer_uuid?: string; candidate_uuids?: string[] }[] }) =>
  callApi('/dcp/reviewer-profile', { method: 'POST', body: JSON.stringify(data) })
export const getReviewerProfile = (profileId: string) =>
  callApi(`/dcp/reviewer-profile/${profileId}`)
export const updateReviewerProfile = (profileId: string, data: any) =>
  callApi(`/dcp/reviewer-profile/${profileId}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteReviewerProfile = (profileId: string) =>
  callApi(`/dcp/reviewer-profile/${profileId}`, { method: 'DELETE' })

// ---- Project Binding ----
export const listProjectBindings = (projectUuid?: string) =>
  callApi(`/dcp/project-bindings${projectUuid ? `?project_uuid=${projectUuid}` : ''}`)
export const upsertProjectBinding = (data: { project_uuid: string; profile_id: string; review_type: string }) =>
  callApi('/dcp/project-binding', { method: 'POST', body: JSON.stringify(data) })
export const deleteProjectBinding = (bindingId: string) =>
  callApi(`/dcp/project-binding/${bindingId}`, { method: 'DELETE' })

// ---- Apply Profile to Review ----
export const applyProfileToReview = (reviewUuid: string, profileId: string) =>
  callApi(`/dcp/review/${reviewUuid}/apply-profile`, { method: 'POST', body: JSON.stringify({ profile_id: profileId }) })
