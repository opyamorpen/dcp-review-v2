import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { RemediationPanel } from './RemediationPanel'
import * as api from './api'
import { getTeamUUID, checkPermission } from '../../api'

// ============================================================
// 常量
// ============================================================
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', reviewing: '评审中', completed: '已完成', rejected: '已否决',
  // 细粒度状态
  ready: '就绪', awaiting_resolution: '待决议', resolution_published: '决议已发布',
  remediation_pending: '整改中', re_reviewing: '复审中', canceled: '已撤回', archived: '已归档',
}
const STATUS_COLORS: Record<string, string> = {
  draft: '#999', reviewing: '#1677ff', completed: '#52c41a', rejected: '#ff4d4f',
  ready: '#8c8c8c', awaiting_resolution: '#722ed1', resolution_published: '#13c2c2',
  remediation_pending: '#fa8c16', re_reviewing: '#2f54eb', canceled: '#bfbfbf', archived: '#d9d9d9',
}
const MATERIAL_STATUS: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: '待提交', color: '#999', bg: '#fafafa' },
  submitted: { text: '已提交', color: '#1677ff', bg: '#e6f4ff' },
  approved: { text: '已通过', color: '#52c41a', bg: '#f6ffed' },
  rejected: { text: '需修改', color: '#ff4d4f', bg: '#fff2f0' },
}
const CONCLUSION_LABELS: Record<string, string> = { pass: '✅ 通过', conditional_pass: '⚠️ 有条件通过', fail: '❌ 不通过', rework: '🔧 返工' }

// 决议状态列：resolution_status → 颜色
const RESOLUTION_TAG_COLORS: Record<string, string> = {
  pass: '#52c41a', conditional_pass: '#faad14', reject: '#ff4d4f', fail: '#ff4d4f', rework: '#ff4d4f',
  published: '#52c41a', pending: '#1677ff', reviewing: '#8c8c8c', not_started: '#999', missing: '#999',
}
// final_conclusion → resolution_status 映射（当后端只返回 final_conclusion 时兜底）
const RESOLUTION_COLORS: Record<string, string> = {
  pass: 'pass', conditional_pass: 'conditional_pass', reject: 'reject', fail: 'fail', rework: 'rework',
}

// 构建评审单直链（指向评审总览模块，带 review_uuid 参数）
// dcp-review-tab 运行在 /project/ 页面内，window.location 无法提取插件路径
// 从已加载的 script 标签 src 中提取插件基础路径
function buildReviewLink(reviewUuid: string): string {
  const APP_ID = '709xehle'
  try {
    // 从页面中已加载的 JS bundle URL 提取插件路径
    const scripts = document.querySelectorAll('script[src*="dev_' + APP_ID + '"]')
    for (let i = 0; i < scripts.length; i++) {
      const src = (scripts[i] as HTMLScriptElement).src
      const m = src.match(/^(https?:\/\/[^/]+\/plugin\/[^/]+\/[^/]+\/dev_[^/]+\/[^/]+)\//)
      if (m) {
        return `${m[1]}/modules/dcp-sidebar/dcp-review-overview/index.html?review_uuid=${reviewUuid}`
      }
    }
  } catch {}
  // 降级：硬编码已知常量（版本号可能不准）
  return `https://demo688.ones.pro/plugin/MVUtevnf/7xrUyuCf/dev_${APP_ID}/modules/dcp-sidebar/dcp-review-overview/index.html?review_uuid=${reviewUuid}`
}

async function copyReviewLink(reviewNumber: string, reviewUuid: string): Promise<boolean> {
  const text = reviewNumber
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); return true } catch { return false }
    finally { document.body.removeChild(ta) }
  }
}

type TabKey = 'materials' | 'indicators' | 'reviewers' | 'issues' | 'checklist' | 'resolution' | 'audit' | 'timeline' | 'remediation'

// ============================================================
// 样式
// ============================================================
const S: Record<string, any> = {
  container: { padding: 16, fontFamily: 'sans-serif', fontSize: 13, color: '#333' },
  topBar: { marginBottom: 16, padding: '14px 16px', background: '#f0f5ff', borderRadius: 8 },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statusTag: (c: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 12, background: `${c}1a`, color: c, fontWeight: 600, marginLeft: 8 }),
  blockBox: { marginTop: 8, padding: '8px 12px', background: '#fff2f0', borderRadius: 4, fontSize: 12, color: '#cf1322' },
  tabs: { display: 'flex', gap: 0, borderBottom: '1px solid #e8e8e8', marginBottom: 16 },
  tab: (a: boolean): React.CSSProperties => ({ padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, borderBottom: a ? '2px solid #1677ff' : '2px solid transparent', color: a ? '#1677ff' : '#666', fontWeight: a ? 600 : 400 }),
  btn: (p: boolean, d = false): React.CSSProperties => ({ padding: '6px 16px', border: p ? 'none' : '1px solid #d9d9d9', borderRadius: 4, background: d ? '#d9d9d9' : p ? '#1677ff' : '#fff', color: d ? '#999' : p ? '#fff' : '#333', cursor: d ? 'not-allowed' : 'pointer', fontSize: 13, marginRight: 8 }),
  sectionTitle: { fontSize: 14, fontWeight: 600, margin: '0 0 12px 0' } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as any, fontSize: 13 },
  th: { padding: '8px 12px', textAlign: 'left' as any, background: '#fafafa', borderBottom: '1px solid #e8e8e8' },
  td: { padding: '8px 12px', borderBottom: '1px solid #f0f0f0' },
  input: { padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, width: '100%', boxSizing: 'border-box' as any },
  select: { padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13 },
  textarea: { padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, width: '100%', resize: 'vertical' as any, boxSizing: 'border-box' as any },
  card: { padding: 14, background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', marginBottom: 12 },
  tabPanel: { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: 16, marginBottom: 12, boxSizing: 'border-box' as any },
  tableWrap: { width: '100%', overflowX: 'auto' as any, overflowY: 'visible' as any },
  formGroup: { marginBottom: 10 },
  label: { display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 },
}

// ============================================================
// 主组件
// ============================================================
const App: React.FC = () => {
  const [projectUuid, setProjectUuid] = useState('')
  const [projectKey, setProjectKey] = useState('')
  const [projectName, setProjectName] = useState('')
  const [componentUuid, setComponentUuid] = useState('')
  const [viewUuid, setViewUuid] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [reviewType, setReviewType] = useState<'dcp' | 'tr'>('dcp')
  const [reviews, setReviews] = useState<any[]>([])
  const [detail, setDetail] = useState<any>(null)
  const [selectedReviewUuid, setSelectedReviewUuid] = useState('')
  const [msg, setMsg] = useState('')
  const [phases, setPhases] = useState<any[]>([])
  const [passedPhases, setPassedPhases] = useState<string[]>([])
  const [ipdFlowLayout, setIpdFlowLayout] = useState<any>(null)
  const [allReviews, setAllReviews] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<{ uuid: string; name: string }>({ uuid: '', name: '' })
  const [hasCreatePerm, setHasCreatePerm] = useState(true) // 新建权限，默认 true 避免闪烁
  const [copyToast, setCopyToast] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15) // 上限 15，随视口自适应

  // 筛选状态
  const [filterNumber, setFilterNumber] = useState('')
  const [filterPhase, setFilterPhase] = useState('')
  const [filterTitle, setFilterTitle] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // 根据浏览器视口高度动态计算每页条数（缩放时自适应），上限 15
  useEffect(() => {
    const calc = () => {
      const vh = window.innerHeight || 600
      // 可用高度 = 视口高度 - 顶部工具栏(~60) - 表头(~42) - 分页栏(~50) - 内边距(~48)
      const available = vh - 200
      const rowHeight = 42
      const n = Math.floor(available / rowHeight)
      setPageSize(Math.min(15, Math.max(5, n)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  useEffect(() => {
    let puid = ''
    // 1. query 参数 ?projectUUID=...
    try { puid = new URLSearchParams(window.parent.location.search).get('projectUUID') || '' } catch {}
    // 2. hash 中的项目路径 #/team/{team}/project/{project_uuid}/...
    if (!puid) {
      try {
        const m = window.parent.location.hash.match(/\/project\/([A-Za-z0-9]+)/)
        if (m) puid = m[1]
      } catch {}
    }
    // 提取项目 key、component UUID、view UUID
    try {
      const hash = window.parent.location.hash
      // /project/{key}/component/{comp}/view/{view}
      const ck = hash.match(/\/project\/([A-Za-z0-9]+)/)
      if (ck) {
        setProjectKey(ck[1])
        // 解析项目名称：exchange → stamps
        const tuid = getTeamUUID()
        if (tuid) {
          fetch(`/project/api/ones-project/team/${tuid}/projects/exchange/${ck[1]}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(raw => {
              const exch = raw?.data || raw || {}
              // 用真正的项目标识符（如 LIXM）更新 projectKey，用于 review_number 生成
              const realIdentifier = exch.identifier || ''
              if (realIdentifier) setProjectKey(realIdentifier)
              const realUuid = exch.project_uuid || ''
              if (realUuid) {
                return fetch(`/project/api/project/team/${tuid}/project/${realUuid}/stamps/data?t=project`, {
                  method: 'POST', credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ project: 0 }),
                }).then(r => r.ok ? r.json() : null)
              }
              return null
            })
            .then(sdata => {
              const proj = sdata?.data?.project?.projects?.[0] || sdata?.project?.projects?.[0]
              if (proj?.name) setProjectName(proj.name)
              // stamps 返回的 project 含 identifier 时作为补充（更准确）
              if (proj?.identifier) setProjectKey(proj.identifier)
            })
            .catch(() => {})
        }
      }
      const cm = hash.match(/\/component\/([A-Za-z0-9]+)/)
      if (cm) setComponentUuid(cm[1])
      const vm = hash.match(/\/view\/([A-Za-z0-9]+)/)
      if (vm) setViewUuid(vm[1])
    } catch {}
    // 3. referrer
    if (!puid) {
      try { const m = document.referrer.match(/[?&]projectUUID=([^&]+)/); if (m) puid = m[1] } catch {}
    }
    if (puid) { setProjectUuid(puid); loadList(puid) }
    else { setMsg('无法识别当前项目'); setLoading(false) }
    // 加载阶段配置 + IPD 流程图布局
    api.getPluginConfig().then((c: any) => {
      if (c.phases?.length) setPhases(c.phases)
      if (c.ipd_flow_layout) setIpdFlowLayout(c.ipd_flow_layout)
    }).catch(() => {})
    // 获取当前用户
    const tu = getTeamUUID()
    if (tu) {
      fetch(`/project/api/project/team/${tu}/../../users/me`, { credentials: 'include' })
        .then(r => r.json())
        .then(j => { const d = j.data || j; if (d.uuid) setCurrentUser({ uuid: d.uuid, name: d.name || d.uuid }) })
        .catch(() => {})
    }
    // 检查新建权限
    checkPermission('dcp_create_review').then(p => setHasCreatePerm(p))
  }, [])

  async function loadList(puid: string, rvType?: string) {
    setLoading(true)
    setPage(1)
    const t = rvType || reviewType
    try {
      // 加载全部评审（用于 IPD 流程图），客户端按 tab 过滤列表
      const data = await api.listReviewsByProject(puid)
      const all = data.reviews || []
      setAllReviews(all)
      setReviews(all.filter((r: any) => (r.review_type || 'dcp') === t))
      setPassedPhases(data.passedPhases || [])
    }
    catch (e: any) { setMsg(`加载评审列表失败: ${e.message}`) }
    finally { setLoading(false) }
  }

  async function loadDetail(rid: string) {
    setLoading(true)
    try { const data = await api.getReviewDetail(rid); setDetail(data); setView('detail') }
    catch (e: any) { setMsg(`加载评审详情失败: ${e.message}`) }
    finally { setLoading(false) }
  }

  async function refreshDetail(rid: string) {
    // 不设 loading=true，避免 ReviewDetail 被卸载丢失 activeTab 状态
    try { const data = await api.getReviewDetail(rid); setDetail(data) }
    catch (e: any) { setMsg(`刷新失败: ${e.message}`) }
  }

  async function handleCreate(form: any) {
    setMsg('')
    try {
      const res = await api.createReview({ ...form, project_uuid: projectUuid, project_identifier: projectKey })
      setSelectedReviewUuid(res.review_uuid)
      await loadDetail(res.review_uuid)
    } catch (e: any) { setMsg(`创建失败: ${e.message}`) }
  }

  async function handleStart(rid: string) {
    setMsg('')
    try { await api.startReview(rid, { operator_uuid: currentUser.uuid }); await loadDetail(rid) } catch (e: any) { setMsg(e.message) }
  }

  async function handleRecreate(rid: string) {
    setMsg('')
    try {
      const res = await api.recreateReview(rid, { operator_uuid: currentUser.uuid, project_identifier: projectKey }) as any
      await loadList(projectUuid)
      await loadDetail(res.review_uuid)
    } catch (e: any) { setMsg('重新发起失败: ' + (e.message || '未知错误')) }
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>加载中…</div>
  if (!projectUuid) return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>{msg || '无法获取项目上下文'}</div>

  if (view === 'detail' && detail) {
    return <ReviewDetail projectUuid={projectUuid} projectKey={projectKey} componentUuid={componentUuid} viewUuid={viewUuid} data={detail} onBack={() => { setView('list'); setDetail(null); loadList(projectUuid) }} onRefresh={() => refreshDetail((detail.review as any).review_uuid)} onStart={handleStart} onRecreate={handleRecreate} msg={msg} setMsg={setMsg} />
  }

  // 筛选后的评审列表
  const filteredReviews = reviews.filter(r => {
    if (filterNumber && !(r.review_number || '').toLowerCase().includes(filterNumber.trim().toLowerCase())) return false
    if (filterPhase && r.phase_code !== filterPhase) return false
    if (filterTitle && !(r.review_title || '').toLowerCase().includes(filterTitle.trim().toLowerCase())) return false
    if (filterStatus && r.status !== filterStatus) return false
    return true
  })

  return (
    <div style={S.container}>
      {/* DCP / TR 类型切换 Tab */}
      {view === 'list' && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #e8e8e8' }}>
          {(['dcp', 'tr'] as const).map(t => (
            <button key={t} onClick={() => {
              setReviewType(t)
              setReviews(allReviews.filter((r: any) => (r.review_type || 'dcp') === t))
              setPage(1)
            }}
              style={{ padding: '8px 24px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14,
                borderBottom: reviewType === t ? '2px solid #1677ff' : '2px solid transparent',
                color: reviewType === t ? '#1677ff' : '#666', fontWeight: reviewType === t ? 600 : 400 }}>
              {t === 'dcp' ? 'DCP 评审' : 'TR 评审'} ({allReviews.filter((r: any) => (r.review_type || 'dcp') === t).length})
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>{reviewType === 'tr' ? '' : ''} {reviewType === 'tr' ? 'TR' : 'DCP'} 评审列表（{reviews.length}）</h3>
        <div>
          {hasCreatePerm && <button style={S.btn(true)} onClick={() => setView('create')}>+ 创建评审</button>}
          <button style={S.btn(false)} onClick={() => loadList(projectUuid)}>刷新</button>
        </div>
      </div>
      {msg && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, fontSize: 13, background: '#fff2f0', color: '#cf1322' }}>{msg}</div>}
      {view === 'list' && reviewType === 'dcp' && phases.length > 0 && <IPDFlowChart layout={ipdFlowLayout} phases={phases} reviews={allReviews} onPhaseClick={loadDetail} />}
      {view === 'create' && <CreateReviewForm projectUuid={projectUuid} projectKey={projectKey} projectName={projectName} pkases={phases.filter((p: any) => (p.review_type || 'dcp') === reviewType)} passedPhases={passedPhases} currentUser={currentUser} reviewType={reviewType} onCreate={handleCreate} onCancel={() => setView('list')} />}
      {reviews.length === 0 && view === 'list' ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 8 }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>该项目暂无 {reviewType === 'tr' ? 'TR' : 'DCP'} 评审单</div>
          <div style={{ fontSize: 12 }}>点击「创建评审」创建首个 {reviewType === 'tr' ? 'TR' : 'DCP'} 评审草稿</div>
        </div>
      ) : view === 'list' ? (
        <>
        {/* 筛选栏：仅在有评审数据时显示（编号/阶段/标题/状态） */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input style={{ ...S.input, width: 'auto' }} placeholder="筛选编号" value={filterNumber} onChange={e => { setFilterNumber(e.target.value); setPage(1) }} />
          <select style={{ ...S.select, width: 'auto' }} value={filterPhase} onChange={e => { setFilterPhase(e.target.value); setPage(1) }}>
            <option value="">全部阶段</option>
            {phases.map(p => <option key={p.phase_code} value={p.phase_code}>{p.phase_name || p.phase_code}</option>)}
          </select>
          <input style={{ ...S.input, width: 'auto' }} placeholder="筛选标题" value={filterTitle} onChange={e => { setFilterTitle(e.target.value); setPage(1) }} />
          <select style={{ ...S.select, width: 'auto' }} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}>
            <option value="">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {filteredReviews.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 8 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>无匹配的评审单</div>
            <div style={{ fontSize: 12 }}>请调整筛选条件</div>
          </div>
        ) : (
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', overflowX: 'auto', overflowY: 'visible' }}>
        <table style={{ ...S.table, marginBottom: 0 }}>
          <thead><tr>
            <th style={S.th}>编号</th><th style={S.th}>阶段</th><th style={S.th}>标题</th><th style={{ ...S.th, width: 70, textAlign: 'center' }}>状态</th>
            <th style={{ ...S.th, width: 90, textAlign: 'center' }}>决议</th>
            <th style={{ ...S.th, width: 60, textAlign: 'center' }}>资料</th>
            <th style={{ ...S.th, width: 100, textAlign: 'center' }}>评审人</th>
            <th style={{ ...S.th, width: 80, textAlign: 'center' }}>工作项</th>
            <th style={{ ...S.th, width: 140 }}>会议时间</th>
          </tr></thead>
          <tbody>
            {filteredReviews.slice((page - 1) * pageSize, page * pageSize).map((r: any, i: number) => {
              const effState = r.effective_state || r.status
              const sc = STATUS_COLORS[effState] || STATUS_COLORS[r.status] || '#999'
              const sl = STATUS_LABELS[effState] || STATUS_LABELS[r.status] || r.status
              return (
                <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }} onClick={() => loadDetail(r.review_uuid)}>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#1677ff', fontWeight: 600 }}>
                    <span style={{ cursor: 'pointer' }} title="点击复制编号" onClick={async (e) => { e.stopPropagation(); const ok = await copyReviewLink(r.review_number || r.review_uuid, r.review_uuid); setCopyToast(ok ? '已复制编号' : '复制失败'); setTimeout(() => setCopyToast(''), 2000) }}>{r.review_number || '-'}</span>
                  </td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{r.phase_name || r.phase_code}</td>
                  <td style={{ ...S.td, color: '#1677ff', textDecoration: 'underline' }}>{r.review_title || r.review_uuid}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: `${sc}1a`, color: sc, fontWeight: 600, whiteSpace: 'nowrap' }}>{sl}</span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>
                    {(() => {
                      const rsc = RESOLUTION_COLORS[r.resolution_status] || r.final_conclusion || ''
                      const color = (RESOLUTION_TAG_COLORS as any)[rsc] || '#999'
                      return <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: `${color}1a`, color, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.resolution_label || '—'}</span>
                    })()}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center', fontSize: 12 }}>{r.material_submitted || 0}/{r.material_total || 0}</td>
                  <td style={{ ...S.td, textAlign: 'center', fontSize: 12 }}>{r.reviewer_done}/{r.reviewer_total}</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{r.linked_issue_count || 0}</td>
                  <td style={{ ...S.td, fontSize: 12, color: '#999' }}>{r.meeting_time ? new Date(r.meeting_time).toLocaleString('zh-CN') : '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pagination page={page} total={filteredReviews.length} pageSize={pageSize} onChange={setPage} />
        </div>
        )}
        </>
      ) : null}
      {copyToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 20px', borderRadius: 6, fontSize: 13, zIndex: 9999 }}>{copyToast}</div>
      )}
    </div>
  )
}

// ============================================================
// Pagination — 分页控件
// ============================================================
const Pagination: React.FC<{
  page: number
  total: number
  pageSize: number
  onChange: (p: number) => void
}> = ({ page, total, pageSize, onChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 0' }}>
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        style={{ padding: '4px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: page <= 1 ? '#f5f5f5' : '#fff', color: page <= 1 ? '#ccc' : '#333', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 12 }}
      >上一页</button>
      <span style={{ fontSize: 12, color: '#666' }}>
        {page} / {totalPages}
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        style={{ padding: '4px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: page >= totalPages ? '#f5f5f5' : '#fff', color: page >= totalPages ? '#ccc' : '#333', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 12 }}
      >下一页</button>
    </div>
  )
}

// ============================================================
// UserPicker — 搜索 ONES 用户
// ============================================================
const UserPicker: React.FC<{
  value: string
  onChange: (user: { uuid: string; name: string }) => void
  placeholder?: string
  displayName?: string
}> = ({ value, onChange, placeholder = '搜索用户姓名或邮箱…', displayName }) => {
  const [results, setResults] = useState<{ uuid: string; name: string; email: string }[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const timerRef = React.useRef<any>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // 外部 value 清空时同步重置内部状态
  useEffect(() => {
    if (!value) {
      setSelectedName('')
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [value])

  // 已选用户名：优先用外部传入的 displayName，其次用内部 selectedName
  const shownName = value ? (displayName || selectedName || '') : ''

  function doSearch(kw: string) {
    if (kw.trim().length < 1) { setResults([]); setOpen(false); return }
    setLoading(true)
    api.searchUsers(kw.trim()).then(users => {
      setResults(users)
      setOpen(users.length > 0)
      setLoading(false)
    }).catch(() => { setResults([]); setOpen(false); setLoading(false) })
  }

  function handleSelect(u: { uuid: string; name: string; email: string }) {
    onChange({ uuid: u.uuid, name: u.name })
    setSelectedName(u.name)
    setResults([])
    setOpen(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleClear() {
    onChange({ uuid: '', name: '' })
    setSelectedName('')
    setResults([])
    setOpen(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  // 显示：已选用户名 或 搜索框
  if (shownName) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, background: '#e6f4ff', padding: '2px 10px', borderRadius: 4 }}>
          {shownName}
        </span>
        <button
          onClick={handleClear}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ff4d4f', fontSize: 16, padding: 0, lineHeight: 1 }}
          title="清除"
        >×</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        style={S.input}
        onChange={e => {
          const v = e.target.value
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(() => doSearch(v), 300)
        }}
        onFocus={() => { if (results.length > 0) setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder={placeholder}
      />
      {loading && <div style={{ position: 'absolute', right: 10, top: 6, fontSize: 12, color: '#999' }}>搜索中…</div>}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          maxHeight: 200, overflowY: 'auto', background: '#fff',
          border: '1px solid #d9d9d9', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          {results.map(u => (
            <div
              key={u.uuid}
              onMouseDown={e => { e.preventDefault(); handleSelect(u) }}
              style={{
                padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                borderBottom: '1px solid #f0f0f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = '#f5f5f5' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
            >
              <span>{u.name}</span>
              <span style={{ fontSize: 11, color: '#999' }}>{u.email}</span>
            </div>
          ))}
        </div>



      )}
    </div>
  )
}

// ============================================================
// 创建评审表单
// ============================================================
const CreateReviewForm: React.FC<{ projectUuid: string; projectKey: string; projectName: string; pkases: any[]; passedPhases: string[]; currentUser: { uuid: string; name: string }; reviewType: string; onCreate: (f: any) => void; onCancel: () => void }> = ({ onCreate, onCancel, pkases, passedPhases, currentUser, projectKey, projectUuid, projectName, reviewType }) => {
  const defaultPhase = pkases.length > 0 ? pkases[0].phase_code : ''
  const defaultPhaseName = pkases.find(p => p.phase_code === defaultPhase)?.phase_name || ''
  const [phase, setPhase] = useState(defaultPhase)
  const [title, setTitle] = useState((projectName && defaultPhaseName) ? `${projectName} ${defaultPhaseName}` : '')
  const titleEdited = React.useRef(false)
  const [meetingTime, setMeetingTime] = useState('')

  // 依赖检查
  const selectedPhaseObj = pkases.find(p => p.phase_code === phase)
  let deps: string[] = []
  try { deps = JSON.parse(selectedPhaseObj?.dependencies || '[]') } catch { deps = [] }
  const passedSet = new Set(passedPhases)
  const unmetDeps = deps.filter(d => !passedSet.has(d))
  const blocked = unmetDeps.length > 0

  return (
    <div style={{ ...S.card, maxWidth: 480, margin: '0 auto' }}>
      <h3 style={{ fontSize: 16, margin: '0 0 16px 0' }}>创建 {reviewType === 'tr' ? 'TR' : 'DCP'} 评审草稿</h3>
      <div style={S.formGroup}>
        <label style={S.label}>所属项目</label>
        <input style={{ ...S.input, background: '#f5f5f5', color: '#666' }} value={projectName || projectKey || projectUuid || ''} disabled placeholder="当前项目" />
      </div>
      <div style={S.formGroup}>
        <label style={S.label}>{reviewType === 'tr' ? 'TR' : 'DCP'} 阶段 *</label>
        {pkases.length === 0 ? (
          <div style={{ color: '#999', fontSize: 12 }}>暂未配置阶段，请先在插件配置中设置 {reviewType === 'tr' ? 'TR' : 'DCP'} 阶段</div>
        ) : (
          <select style={{ ...S.select, width: '100%' }} value={phase} onChange={e => {
            setPhase(e.target.value)
            if (!titleEdited.current) {
              const pn = pkases.find(p => p.phase_code === e.target.value)?.phase_name || ''
              setTitle((projectName && pn) ? `${projectName} ${pn}` : '')
            }
          }}>
            {pkases.map((p: any) => (
              <option key={p.phase_code} value={p.phase_code}>{p.phase_name || p.phase_code}</option>
            ))}
          </select>
        )}
      </div>
      {blocked && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, fontSize: 12, background: '#fffbe6', border: '1px solid #ffe58f', color: '#ad6800' }}>
          前置阶段未通过决议，创建草稿后仍无法正式发起评审。需先通过（决议为"通过"或"有条件通过"）：<strong>{unmetDeps.join(', ')}</strong>
        </div>
      )}
      <div style={S.formGroup}>
        <label style={S.label}>评审标题</label>
        <input style={S.input} value={title} onChange={e => { titleEdited.current = true; setTitle(e.target.value) }} placeholder="如：XX项目概念决策评审" />
      </div>
      <div style={S.formGroup}>
        <label style={S.label}>计划会议时间</label>
        <input type="datetime-local" style={S.input} value={meetingTime} onChange={e => setMeetingTime(e.target.value)} />
      </div>
      <div style={{ marginTop: 16 }}>
        <button style={S.btn(true)} onClick={() => onCreate({ phase_code: phase, review_title: title, meeting_time: meetingTime ? new Date(meetingTime).getTime() : 0, creator_uuid: currentUser.uuid || '', review_type: reviewType })}
          disabled={pkases.length === 0 || !phase}>创建评审草稿</button>
        <button style={S.btn(false)} onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

// ============================================================
// 评审详情
// ============================================================
export const ReviewDetail: React.FC<{ projectUuid: string; projectKey: string; componentUuid: string; viewUuid: string; data: any; onBack: () => void; onRefresh: () => void; onStart: (rid: string) => void; onRecreate: (rid: string) => void; msg: string; setMsg: (v: string) => void }> = ({ projectUuid, projectKey, componentUuid, viewUuid, data, onBack, onRefresh, onStart, onRecreate, msg, setMsg }) => {
  const rv = data.review
  const [activeTab, setActiveTab] = useState<TabKey>('materials')
  const effState = rv.effective_state || rv.status
  const sc = STATUS_COLORS[effState] || STATUS_COLORS[rv.status] || '#999'
  const sl = STATUS_LABELS[effState] || STATUS_LABELS[rv.status] || rv.status
  const isEditable = rv.status === 'draft' || effState === 'canceled'
  const isReviewing = rv.status === 'reviewing'
  const isDone = rv.status === 'completed' || rv.status === 'rejected'

  const TABS: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'materials', label: '评审资料', badge: data.materials?.filter((m: any) => !!m.file_data).length },
    { key: 'reviewers', label: '评审人与意见', badge: data.reviewers?.filter((r: any) => r.submitted_at > 0).length },
    { key: 'issues', label: '关联工作项', badge: data.linked_issues?.length },
    { key: 'remediation', label: '整改项', badge: data.remediation_issues?.length },
    { key: 'checklist', label: 'Checklist', badge: data.checklist?.length },
    { key: 'resolution', label: '决议快照' },
    { key: 'audit', label: '审计日志' },
    { key: 'timeline', label: '状态轨迹' },
  ]

  const [showPublishForm, setShowPublishForm] = useState(false)
  const [resolutionForm, setResolutionForm] = useState({ final_conclusion: 'pass', condition_notes: '' })
  const [publishing, setPublishing] = useState(false)
  const [copyToast, setCopyToast] = useState('')
  const [currentUser, setCurrentUser] = useState<{ uuid: string; name: string }>({ uuid: '', name: '' })
  const [resolutionRule, setResolutionRule] = useState<any>(null)
  const [configRoles, setConfigRoles] = useState<any[]>([])
  const [recallConfig, setRecallConfig] = useState<any>({ enabled: false, requireReason: true })
  const [showRecallForm, setShowRecallForm] = useState(false)
  const [recallReason, setRecallReason] = useState('')
  const [recalling, setRecalling] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [showReReviewConfirm, setShowReReviewConfirm] = useState(false)
  const [editingMeetingTime, setEditingMeetingTime] = useState(false)
  const [meetingTimeDraft, setMeetingTimeDraft] = useState('')
  const [savingMeetingTime, setSavingMeetingTime] = useState(false)
  const [reminding, setReminding] = useState(false)
  const [remediationRefreshing, setRemediationRefreshing] = useState(false)
  const [remediationMsg, setRemediationMsg] = useState('')
  const [showRemediationConfirm, setShowRemediationConfirm] = useState(false)
  const [remediationConfirming, setRemediationConfirming] = useState(false)
  const [showCreateRemediation, setShowCreateRemediation] = useState(false)
  const [showLinkRemediation, setShowLinkRemediation] = useState(false)
  const [createRemediationForm, setCreateRemediationForm] = useState({ title: '' })
  const [linkRemediationForm, setLinkRemediationForm] = useState({ issue_uuid: '', issue_number: '', issue_title: '' })
  const [creatingRemediation, setCreatingRemediation] = useState(false)
  const [linkingRemediation, setLinkingRemediation] = useState(false)
  const [remediationIssueType, setRemediationIssueType] = useState('')

  useEffect(() => {
    fetch('/project/api/project/users/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(me => { if (me) setCurrentUser({ uuid: me.uuid || '', name: me.name || '' }) })
      .catch(() => {})
  }, [])

  // 加载当前评审类型的决议规则配置 + 角色列表
  const rvReviewType = (rv.review_type || 'dcp')
  useEffect(() => {
    api.getPluginConfig().then(c => {
      const rules = c.resolution_rule_config || {}
      setResolutionRule(rules[rvReviewType] || null)
      setConfigRoles((c.roles || []).filter((r: any) => (r.review_type || 'dcp') === rvReviewType))
      if (c.review_recall_config) setRecallConfig(c.review_recall_config)
      if (c.config?.remediation_issue_type) setRemediationIssueType(c.config.remediation_issue_type)
    }).catch(() => {})
  }, [rvReviewType])

  // 判断当前用户是否有权发布决议（按规则配置的唯一决议角色）
  const canPublish = !!resolutionRule && (data.reviewers || []).some((r: any) =>
    r.reviewer_uuid === currentUser.uuid &&
    (resolutionRule.publisher?.role || '') === r.role_name
  )

  // 判断当前用户是否可以撤回评审
  const canRecall = recallConfig.enabled && isReviewing && !data.resolution && currentUser.uuid === rv.creator_uuid

  // 催办相关计算
  const isCreator = currentUser.uuid && rv.creator_uuid === currentUser.uuid
  const publisherRoleName = resolutionRule?.publisher?.role || ''
  const pendingReviewers = (data.reviewers || []).filter((r: any) => {
    if (publisherRoleName && r.role_name === publisherRoleName) return false
    return Number(r.submitted_at || 0) <= 0
  })
  const canRemindReviewers = isReviewing && isCreator && pendingReviewers.length > 0
  const canRemindResolution = isReviewing && isCreator && !data.resolution && pendingReviewers.length === 0 && !!publisherRoleName

  async function handleRecall() {
    if (recallConfig.requireReason && !recallReason.trim()) {
      setMsg('请填写撤回原因')
      return
    }
    setRecalling(true)
    try {
      const res = await api.recallReview(rv.review_uuid, { operator_uuid: currentUser.uuid, reason: recallReason }) as any
      if (res?.error) { setMsg(res.error); return }
      setMsg('评审已撤回，回到草稿状态')
      setShowRecallForm(false)
      setRecallReason('')
      onRefresh()
    } catch (e: any) {
      setMsg(e?.message || '撤回失败')
    } finally {
      setRecalling(false)
    }
  }

  // 会议时间编辑权限：仅发起人，draft/reviewing 且未发布决议
  const canEditMeetingTime = currentUser.uuid === rv.creator_uuid &&
    (rv.status === 'draft' || rv.status === 'reviewing') && !data.resolution

  async function handleSaveMeetingTime() {
    setSavingMeetingTime(true)
    try {
      const ts = meetingTimeDraft ? new Date(meetingTimeDraft).getTime() : 0
      const res = await api.updateReviewBasicInfo(rv.review_uuid, {
        operator_uuid: currentUser.uuid,
        meeting_time: ts,
      }) as any
      if (res?.error) { setMsg(res.error); return }
      setMsg('会议时间已更新')
      setEditingMeetingTime(false)
      onRefresh()
    } catch (e: any) {
      setMsg(e?.message || '保存失败')
    } finally {
      setSavingMeetingTime(false)
    }
  }

  function startEditMeetingTime() {
    // datetime-local 格式: yyyy-MM-ddTHH:mm
    if (rv.meeting_time > 0) {
      const d = new Date(rv.meeting_time)
      const pad = (n: number) => String(n).padStart(2, '0')
      setMeetingTimeDraft(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`)
    } else {
      setMeetingTimeDraft('')
    }
    setEditingMeetingTime(true)
    setMsg('')
  }

  async function handleDeleteReview() {
    if (!currentUser.uuid) return
    if (!confirm(`确定删除「${rv.phase_name || rv.phase_code} — ${rv.review_title || 'DCP评审'}」？此操作不可恢复。`)) return
    try {
      await api.deleteReview(rv.review_uuid, { operator_uuid: currentUser.uuid })
      onBack()
    } catch (e: any) { alert('删除失败: ' + (e.message || '未知错误')) }
  }

  async function handleRecreate() {
    if (!currentUser.uuid) return
    const hasFiles = (data.materials || []).some((m: any) => m.file_data)
    const hint = hasFiles
      ? '已沿用上次评审的材料附件，请确认是否需要更新。'
      : ''
    if (!confirm(`确定重新发起此评审？\n${hint}`)) return
    onRecreate(rv.review_uuid)
  }

  async function handleStartReReview() {
    if (!currentUser.uuid) return
    setTransitioning(true)
    setMsg('')
    try {
      await api.transitionReview(rv.review_uuid, {
        target_state: 're_reviewing',
        operator_uuid: currentUser.uuid,
        reason: '发起复审',
      })
      setShowReReviewConfirm(false)
      onRefresh()
    } catch (e: any) { setMsg(e.message || '操作失败') }
    finally { setTransitioning(false) }
  }

  // ---- 整改闭环 ----
  async function handleRefreshRemediation() {
    setRemediationRefreshing(true)
    setRemediationMsg('')
    try {
      await api.refreshRemediationStatus(rv.review_uuid)
      onRefresh()
    } catch (e: any) { setRemediationMsg(e.message || '刷新失败') }
    finally { setRemediationRefreshing(false) }
  }

  async function handleConfirmRemediation(nextAction: 'complete' | 're_review') {
    setRemediationConfirming(true)
    setRemediationMsg('')
    try {
      await api.confirmRemediation(rv.review_uuid, {
        publisher_uuid: currentUser.uuid || '',
        next_action: nextAction,
      })
      setShowRemediationConfirm(false)
      onRefresh()
    } catch (e: any) { setRemediationMsg(e.message || '操作失败') }
    finally { setRemediationConfirming(false) }
  }

  async function handleCreateRemediationIssue() {
    if (!createRemediationForm.title.trim()) { setRemediationMsg('请填写工作项标题'); return }
    setCreatingRemediation(true)
    setRemediationMsg('')
    try {
      const tuid = getTeamUUID()
      const taskUuid = Array.from({ length: 16 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]).join('')
      const add3Res = await fetch(`/project/api/project/team/${tuid}/tasks/add3`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: [{
            uuid: taskUuid,
            project_uuid: projectUuid,
            field_values: [
              { field_uuid: 'field001', value: createRemediationForm.title },
              { field_uuid: 'field006', value: projectUuid },
            ],
          }],
        }),
      })
      if (add3Res.ok) {
        const data = await add3Res.json()
        const task = data?.tasks?.[0]
        if (task?.uuid) {
          await api.linkIssue(rv.review_uuid, {
            issue_uuid: task.uuid,
            issue_number: task.display_id || task.uuid,
            issue_title: createRemediationForm.title,
            issue_type: remediationIssueType || '',
            issue_status: 'open',
            linked_by: currentUser.uuid || '',
            linked_by_name: currentUser.name || '',
            link_type: 'remediation',
          })
          setCreateRemediationForm({ title: '' })
          setShowCreateRemediation(false)
          onRefresh()
          return
        }
      }
      const add3Text = await add3Res.text()
      throw new Error(`创建失败: ${add3Res.status} ${add3Text.slice(0, 200)}`)
    } catch (e: any) {
      setRemediationMsg(e.message || '创建失败，可尝试跳转 ONES 手动创建后关联')
    } finally { setCreatingRemediation(false) }
  }

  async function handleLinkRemediationIssue() {
    if (!linkRemediationForm.issue_uuid.trim()) { setRemediationMsg('请填写工作项 UUID'); return }
    setLinkingRemediation(true)
    setRemediationMsg('')
    try {
      await api.linkIssue(rv.review_uuid, {
        issue_uuid: linkRemediationForm.issue_uuid.trim(),
        issue_number: linkRemediationForm.issue_number.trim(),
        issue_title: linkRemediationForm.issue_title.trim(),
        issue_type: remediationIssueType || '',
        issue_status: 'open',
        linked_by: currentUser.uuid || '',
        linked_by_name: currentUser.name || '',
        link_type: 'remediation',
      })
      setLinkRemediationForm({ issue_uuid: '', issue_number: '', issue_title: '' })
      setShowLinkRemediation(false)
      onRefresh()
    } catch (e: any) { setRemediationMsg(e.message || '关联失败') }
    finally { setLinkingRemediation(false) }
  }

  async function handlePublishResolution() {
    if (!resolutionForm.final_conclusion) { setMsg('请选择决议结果'); return }
    setPublishing(true)
    setMsg('')
    try {
      await api.publishResolution(rv.review_uuid, {
        final_conclusion: resolutionForm.final_conclusion,
        condition_notes: resolutionForm.condition_notes,
        publisher_uuid: currentUser.uuid || '',
        publisher_name: currentUser.name || '',
      })
      setShowPublishForm(false)
      onRefresh()
    } catch (e: any) { setMsg(e.message || '发布失败') }
    finally { setPublishing(false) }
  }

  async function handleRemind(target: 'reviewers' | 'resolution') {
    setReminding(true)
    setMsg('')
    try {
      const res = await api.remindReview(rv.review_uuid, { target, operator_uuid: currentUser.uuid, operator_name: currentUser.name }) as any
      if (res?.error) { setMsg(res.error); return }
      if (target === 'reviewers') {
        setMsg(`已催办 ${res.recipient_count} 名评审人`)
      } else {
        setMsg('已催办决议人')
      }
      onRefresh()
    } catch (e: any) {
      setMsg(e?.message || '催办失败')
    } finally {
      setReminding(false)
    }
  }

  return (
    <div style={S.container}>
      <div style={{ marginBottom: 12 }}>
        <button style={S.btn(false)} onClick={onBack}>← 返回列表</button>
      </div>
      {/* 顶部状态栏 */}
      <div style={S.topBar}>
        <div style={S.topRow}>
          <div>
            <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#1677ff', fontWeight: 600, marginRight: 8, cursor: 'pointer' }} title="点击复制编号" onClick={async () => { const ok = await copyReviewLink(rv.review_number || rv.review_uuid, rv.review_uuid); setCopyToast(ok ? '已复制编号' : '复制失败'); setTimeout(() => setCopyToast(''), 2000) }}>{(rv.review_type || 'dcp') === 'tr' ? '' : ''} {rv.review_number || ''}</span>
            <strong style={{ fontSize: 16 }}>{rv.phase_name || rv.phase_code} — {rv.review_title || ((rv.review_type || 'dcp') === 'tr' ? 'TR评审' : 'DCP评审')}</strong>
            <span style={S.statusTag(sc)}>{sl}</span>
            {data.resolution && <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>快照: {data.resolution.snapshot_number}</span>}
          </div>
          <div>
            {isEditable && <button style={S.btn(true)} onClick={() => onStart(rv.review_uuid)}>▶ 发起评审</button>}
            {isEditable && currentUser.uuid && rv.creator_uuid === currentUser.uuid && (
              <button style={{ ...S.btn(false), color: '#ff4d4f', borderColor: '#ff4d4f' }} onClick={handleDeleteReview}>删除</button>
            )}
            {isReviewing && !data.resolution && canPublish && <button style={S.btn(true)} onClick={() => { setShowPublishForm(!showPublishForm); setMsg('') }}>{showPublishForm ? '× 取消发布' : '生成决议'}</button>}
            {canRemindReviewers && <button style={{ ...S.btn(false), color: '#faad14', borderColor: '#faad14' }} onClick={() => handleRemind('reviewers')} disabled={reminding}>{reminding ? '催办中…' : `催办评审人(${pendingReviewers.length})`}</button>}
            {canRemindResolution && <button style={{ ...S.btn(false), color: '#faad14', borderColor: '#faad14' }} onClick={() => handleRemind('resolution')} disabled={reminding}>{reminding ? '催办中…' : '催办决议人'}</button>}
            {canRecall && !showRecallForm && <button style={{ ...S.btn(false), color: '#faad14', borderColor: '#faad14' }} onClick={() => { setShowRecallForm(true); setMsg('') }}>撤回评审</button>}
            {rv.status === 'rejected' && currentUser.uuid && rv.creator_uuid === currentUser.uuid && (
              <button style={{ ...S.btn(true), background: '#722ed1', borderColor: '#722ed1' }} onClick={handleRecreate}>重新发起</button>
            )}
            {effState === 'remediation_pending' && currentUser.uuid && rv.creator_uuid === currentUser.uuid && !showReReviewConfirm && (
              <button style={{ ...S.btn(true), background: '#fa8c16', borderColor: '#fa8c16' }} onClick={() => { setShowReReviewConfirm(true); setMsg('') }}>开始复审</button>
            )}
            {effState === 'remediation_pending' && showReReviewConfirm && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff7e6', padding: '4px 12px', borderRadius: 6, border: '1px solid #faad14' }}>
                <span style={{ fontSize: 12, color: '#fa8c16' }}>确认开始复审？评审人提交状态将重置</span>
                <button style={{ padding: '2px 10px', borderRadius: 4, border: 'none', background: '#fa8c16', color: '#fff', cursor: 'pointer', fontSize: 12 }} onClick={handleStartReReview} disabled={transitioning}>{transitioning ? '处理中…' : '确认'}</button>
                <button style={{ padding: '2px 10px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#666', cursor: 'pointer', fontSize: 12 }} onClick={() => { setShowReReviewConfirm(false); setMsg('') }}>取消</button>
              </span>
            )}
            {effState === 'remediation_pending' && !showReReviewConfirm && <span style={{ marginLeft: 8, fontSize: 12, color: '#fa8c16' }}>整改中 — 完成整改后可发起复审</span>}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          <span>创建: {rv.created_at ? new Date(rv.created_at).toLocaleString('zh-CN') : '-'}</span>
          {editingMeetingTime ? (
            <span style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span>会议:</span>
              <input type="datetime-local" style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 12 }} value={meetingTimeDraft} onChange={e => setMeetingTimeDraft(e.target.value)} />
              <button style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: '#1677ff', color: '#fff', cursor: 'pointer', fontSize: 12 }} onClick={handleSaveMeetingTime} disabled={savingMeetingTime}>{savingMeetingTime ? '保存中…' : '保存'}</button>
              <button style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #d9d9d9', background: '#fff', color: '#666', cursor: 'pointer', fontSize: 12 }} onClick={() => { setEditingMeetingTime(false); setMsg('') }}>取消</button>
            </span>
          ) : (
            <span style={{ marginLeft: 12 }}>
              会议: {rv.meeting_time > 0 ? new Date(rv.meeting_time).toLocaleString('zh-CN') : '未设置'}
              {canEditMeetingTime && <button style={{ marginLeft: 4, padding: '0 4px', border: 'none', background: 'transparent', color: '#1677ff', cursor: 'pointer', fontSize: 12 }} onClick={startEditMeetingTime}>编辑</button>}
            </span>
          )}
        </div>
      </div>
      {/* 撤回评审表单 */}
      {showRecallForm && (
        <div style={{ ...S.card, marginBottom: 16, background: '#fff7e6', borderLeft: '4px solid #faad14' }}>
          <h4 style={S.sectionTitle}>撤回评审</h4>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
            撤回后评审单将回到草稿状态，已提交的评审意见和 Checklist 将被清空，评审人待办和决议待办将失效。
          </div>
          {recallConfig.requireReason && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>撤回原因 *</label>
              <textarea style={{ ...S.input, width: '100%', minHeight: 60, resize: 'vertical' }} value={recallReason} onChange={e => setRecallReason(e.target.value)} placeholder="请填写撤回原因…" />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...S.btn(false), color: '#faad14', borderColor: '#faad14' }} onClick={handleRecall} disabled={recalling}>{recalling ? '撤回中…' : '确认撤回'}</button>
            <button style={S.btn(false)} onClick={() => { setShowRecallForm(false); setRecallReason(''); setMsg('') }}>取消</button>
          </div>
        </div>
      )}
      {/* 发布决议表单（内置，替代 prompt 弹窗） */}
      {showPublishForm && (
        <div style={{ ...S.card, marginBottom: 16, background: '#fff7e6', borderLeft: '4px solid #faad14' }}>
          <h4 style={S.sectionTitle}>发布决议</h4>
          <div style={{ marginBottom: 8, fontSize: 13, color: '#333' }}>
            {(() => {
              const reviewers: any[] = data.reviewers || []
              const submitMode = resolutionRule?.submitRequirement?.mode || 'must_vote_roles'
              if (submitMode === 'publisher_only') return '可直接发布决议'
              if (submitMode === 'must_vote_roles') {
                const mustVoteNames = configRoles.filter((r: any) => r.must_vote).map((r: any) => r.role_name)
                const mustRvrs = reviewers.filter((r: any) => mustVoteNames.includes(r.role_name))
                const mustDone = mustRvrs.filter((r: any) => r.submitted_at > 0).length
                return `必投角色 ${mustDone}/${mustRvrs.length} 已提交（必投角色全部提交后即可发布决议）`
              }
              const done = reviewers.filter((r: any) => r.submitted_at > 0).length
              return `评审进度: ${done}/${reviewers.length} 已提交（全部提交后即可发布决议）`
            })()}
          </div>
          {/* 投票状态指示器（按决议规则配置展示） */}
          {(() => {
            const reviewers: any[] = data.reviewers || []
            const rule = resolutionRule
            if (!rule) return null
            const approvalConclusions = rule.passRule?.approvalConclusions || ['pass', 'conditional_pass']
            const passMode = rule.passRule?.mode || 'min_approval_count'
            const minCount = rule.passRule?.minCount || 3
            const submitMode = rule.submitRequirement?.mode || 'must_vote_roles'

            if (passMode === 'min_approval_count') {
              // 按 voteScope 计票
              const vsMode = rule.passRule?.voteScope?.mode || 'must_vote_roles'
              const excludeRoles = rule.passRule?.voteScope?.excludeRoles || []
              const selectedRoles = rule.passRule?.voteScope?.selectedRoles || []
              let scopeNames: string[]
              if (vsMode === 'all_reviewers') {
                scopeNames = (configRoles).map((r: any) => r.role_name)
              } else if (vsMode === 'selected_roles') {
                scopeNames = (configRoles).filter((r: any) => selectedRoles.includes(r.role_name)).map((r: any) => r.role_name)
              } else {
                scopeNames = (configRoles).filter((r: any) => r.must_vote).map((r: any) => r.role_name)
              }
              scopeNames = scopeNames.filter((n: string) => !excludeRoles.includes(n))
              const candidates = reviewers.filter((r: any) => scopeNames.includes(r.role_name))
              const acceptCount = candidates.filter((r: any) => approvalConclusions.includes(r.conclusion)).length
              const totalCandidates = candidates.length
              if (totalCandidates < minCount) {
                return (
                  <div style={{ marginBottom: 8, padding: '6px 12px', borderRadius: 4, fontSize: 13, background: '#fff2f0', color: '#ff4d4f' }}>
                    可计票评审人仅 ${totalCandidates} 人，规则要求至少 ${minCount} 人通过，请补充评审人或调整规则
                  </div>
                )
              }
              const canPass = acceptCount >= minCount
              return (
                <div style={{ marginBottom: 8, padding: '6px 12px', borderRadius: 4, fontSize: 13, background: canPass ? '#f6ffed' : '#fff7e6', color: canPass ? '#52c41a' : '#faad14' }}>
                  {canPass
                    ? `同意票 ${acceptCount}/${totalCandidates}，满足大多数（≥${minCount}），可决议为「通过」`
                    : `同意票仅 ${acceptCount}/${totalCandidates}，不满足大多数（需≥${minCount}），不可决议为「通过」`}
                </div>
              )
            }
            // 非 min_approval_count 模式：按 submitRequirement.mode 展示提交进度
            if (submitMode === 'publisher_only') return null
            if (submitMode === 'must_vote_roles') {
              const mustVoteNames = configRoles.filter((r: any) => r.must_vote).map((r: any) => r.role_name)
              const mustRvrs = reviewers.filter((r: any) => mustVoteNames.includes(r.role_name))
              const mustDone = mustRvrs.filter((r: any) => r.submitted_at > 0).length
              const allMustDone = mustDone >= mustRvrs.length
              return (
                <div style={{ marginBottom: 8, padding: '6px 12px', borderRadius: 4, fontSize: 13, background: allMustDone ? '#f6ffed' : '#fff7e6', color: allMustDone ? '#52c41a' : '#faad14' }}>
                  {allMustDone
                    ? `必投角色已全部提交（${mustDone}/${mustRvrs.length}），可发布决议`
                    : `必投角色 ${mustDone}/${mustRvrs.length} 已提交，待必投角色全部提交后可发布决议`}
                </div>
              )
            }
            // all_reviewers 模式
            const doneCount = reviewers.filter((r: any) => r.submitted_at > 0).length
            const allDone = doneCount >= reviewers.length
            return (
              <div style={{ marginBottom: 8, padding: '6px 12px', borderRadius: 4, fontSize: 13, background: allDone ? '#f6ffed' : '#fff7e6', color: allDone ? '#52c41a' : '#faad14' }}>
                {allDone
                  ? `全体评审人已提交（${doneCount}/${reviewers.length}），可发布决议`
                  : `评审进度 ${doneCount}/${reviewers.length}，待全部提交后可发布决议`}
              </div>
            )
          })()}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={S.formGroup}>
              <label style={S.label}>最终结论 *</label>
              <select style={{ ...S.select, width: '100%' }} value={resolutionForm.final_conclusion} onChange={e => setResolutionForm({ ...resolutionForm, final_conclusion: e.target.value })}>
                {(resolutionRule?.allowedConclusions || ['pass', 'conditional_pass', 'reject']).map((c: string) => {
                  const labels: any = { pass: '✅ 通过', conditional_pass: '⚠️ 有条件通过', reject: '❌ 驳回', fail: '❌ 不通过', rework: '🔧 返工' }
                  return <option key={c} value={c}>{labels[c] || c}</option>
                })}
              </select>
            </div>
          </div>
          <div style={{ ...S.formGroup, marginTop: 8 }}>
            <label style={S.label}>条件说明</label>
            <textarea style={S.textarea} rows={3} value={resolutionForm.condition_notes} onChange={e => setResolutionForm({ ...resolutionForm, condition_notes: e.target.value })} placeholder="（可选）如为'有条件通过'，请说明条件…" />
          </div>
          {/* 评审意见预览 */}
          <div style={{ marginTop: 12 }}>
            <label style={S.label}>评审意见汇总</label>
            <div style={S.tableWrap}>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>角色</th><th style={S.th}>投票</th><th style={S.th}>风险</th><th style={S.th}>意见</th>
              </tr></thead>
              <tbody>
                {(data.reviewers || []).map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={S.td}>{r.role_name || r.reviewer_name || '-'}</td>
                    <td style={S.td}>
                      <span style={{ color: r.conclusion === 'pass' ? '#52c41a' : r.conclusion === 'conditional_pass' ? '#faad14' : '#ff4d4f' }}>
                        {r.conclusion === 'pass' ? '✅ 通过' : r.conclusion === 'conditional_pass' ? '⚠️ 有条件通过' : r.submitted_at > 0 ? '❌ 不通过' : '— 未提交'}
                      </span>
                    </td>
                    <td style={S.td}>{r.risk_level === 'low' ? '低' : r.risk_level === 'high' ? '高' : r.risk_level === 'medium' ? '中' : r.submitted_at > 0 ? (r.risk_level || '中') : '—'}</td>
                    <td style={{ ...S.td, fontSize: 12, color: '#666', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.opinion_summary || (r.submitted_at > 0 ? '(无文字)' : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Checklist 详情（可展开） */}
          {(data.checklist || []).length > 0 && <ChecklistInlineTab checklist={data.checklist} />}
          {/* conditional_pass / rework 整改项提醒 */}
          {(resolutionForm.final_conclusion === 'conditional_pass' || resolutionForm.final_conclusion === 'rework') && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 4, fontSize: 13, background: '#fff7e6', color: '#fa8c16', border: '1px solid #faad14' }}>
              <strong>整改要求</strong>：发布「有条件通过」或「返工」决议前，必须先在「整改项」tab 中创建至少 1 个整改工作项。
              {(data.remediation_issues || []).length > 0
                ? <span style={{ color: '#52c41a' }}> 已创建 {data.remediation_issues.length} 个整改项。</span>
                : <span style={{ color: '#ff4d4f' }}> 当前无整改项，请先创建。</span>}
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button style={{ ...S.btn(true), background: '#faad14' }} onClick={handlePublishResolution} disabled={publishing}>
              {publishing ? '发布中…' : '发布决议'}
            </button>
            <button style={S.btn(false)} onClick={() => { setShowPublishForm(false); setMsg('') }}>取消</button>
          </div>
        </div>
      )}
      {msg && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, fontSize: 13, background: '#fff2f0', color: '#cf1322' }}>{msg}</div>}
      {/* 页签 */}
      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.key} style={S.tab(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>
            {t.label}{t.badge != null && t.badge > 0 ? ` (${t.badge})` : ''}
          </button>
        ))}
      </div>
      {/* 内容区 */}
      {activeTab === 'materials' && <div style={S.tabPanel}><MaterialsPanel data={data} editable={isEditable} onRefresh={onRefresh} currentUser={currentUser} /></div>}
      {activeTab === 'reviewers' && <div style={S.tabPanel}><ReviewersPanel data={data} editable={isEditable} isReviewing={isReviewing} onRefresh={onRefresh} currentUser={currentUser} /></div>}
      {activeTab === 'issues' && <div style={S.tabPanel}><LinkedIssuesPanel data={data} projectUuid={projectUuid} projectKey={projectKey} componentUuid={componentUuid} viewUuid={viewUuid} onRefresh={onRefresh} /></div>}
      {activeTab === 'checklist' && (
        <div style={S.tabPanel}>
          {(data.checklist || []).length === 0 ? (
            <div style={{ color: '#999', padding: 40, textAlign: 'center' }}>本评审单暂无 Checklist 配置。</div>
          ) : (
            <>
              <ChecklistReadOnly checklist={data.checklist} />
              <ChecklistInlineTab checklist={data.checklist} />
            </>
          )}
        </div>
      )}
      {activeTab === 'resolution' && <div style={S.tabPanel}><ResolutionPanel data={data} onRefresh={onRefresh} /></div>}
      {activeTab === 'audit' && <div style={S.tabPanel}><AuditPanel reviewUuid={rv.review_uuid} /></div>}
      {activeTab === 'timeline' && <div style={S.tabPanel}><StateTimeline data={data} effState={effState} roundNo={rv.round_no || 1} /></div>}
      {activeTab === 'remediation' && (
        <div style={S.tabPanel}>
          <RemediationPanel
            data={data}
            effState={effState}
            currentUser={currentUser}
            isCreator={currentUser.uuid === rv.creator_uuid}
            isPublisher={canPublish}
            remediationIssueType={remediationIssueType}
            projectUuid={projectUuid}
            remediationMsg={remediationMsg}
            remediationRefreshing={remediationRefreshing}
            remediationConfirming={remediationConfirming}
            showRemediationConfirm={showRemediationConfirm}
            showCreateRemediation={showCreateRemediation}
            showLinkRemediation={showLinkRemediation}
            createRemediationForm={createRemediationForm}
            linkRemediationForm={linkRemediationForm}
            creatingRemediation={creatingRemediation}
            linkingRemediation={linkingRemediation}
            onRefresh={onRefresh}
            onSetCreateRemediationForm={setCreateRemediationForm}
            onSetLinkRemediationForm={setLinkRemediationForm}
            onSetShowCreateRemediation={setShowCreateRemediation}
            onSetShowLinkRemediation={setShowLinkRemediation}
            onSetShowRemediationConfirm={setShowRemediationConfirm}
            onCreateRemediation={handleCreateRemediationIssue}
            onLinkRemediation={handleLinkRemediationIssue}
            onRefreshRemediation={handleRefreshRemediation}
            onConfirmRemediation={handleConfirmRemediation}
            onSetRemediationMsg={setRemediationMsg}
          />
        </div>
      )}
      {copyToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 20px', borderRadius: 6, fontSize: 13, zIndex: 9999 }}>{copyToast}</div>
      )}
    </div>
  )
}

// ============================================================
// 评审资料面板（材料 + 指标）
// ============================================================
const MaterialsPanel: React.FC<{ data: any; editable: boolean; onRefresh: () => void; currentUser: { uuid: string; name: string } }> = ({ data, editable, onRefresh, currentUser }) => {
  const mats = data.materials || []
  const inds = data.indicators || []
  const [editInd, setEditInd] = useState(false)
  const [indValues, setIndValues] = useState<Record<string, string>>({})
  const [indNotes, setIndNotes] = useState<Record<string, string>>({})
  const [uploadMsg, setUploadMsg] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  function downloadMaterial(templateId: string) {
    api.getMaterialDownloadUrl(data.review.review_uuid, templateId).then((r: any) => {
      if (!r.url) return
      // 用隐藏 <a download> 在当前窗口触发下载，不开新标签
      const a = document.createElement('a')
      a.href = r.url
      a.download = ''
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }).catch(() => {})
  }

  async function previewMaterial(templateId: string, fileName: string) {
    setPreviewLoading(true)
    try {
      const r: any = await api.getMaterialPreview(data.review.review_uuid, templateId)
      if (r.content) {
        // 判断是否为浏览器可直接渲染的文件类型
        const previewable = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml', 'text/plain', 'text/csv']
        if (previewable.includes(r.mime)) {
          const dataUrl = `data:${r.mime};base64,${r.content}`
          setPreview({ url: dataUrl, name: fileName })
        } else {
          // Office 文件等不支持 iframe 预览，显示提示
          setPreview({ url: `__unsupported__`, name: fileName })
        }
      }
    } catch { /* ignore */ }
    finally { setPreviewLoading(false) }
  }

  async function changeMatStatus(templateId: string, status: string) {
    try { await api.updateMaterialStatus(data.review.review_uuid, { template_id: templateId, submit_status: status }); onRefresh() }
    catch (e: any) { console.error(e) }
  }

  function handleFileSelect(templateId: string, file: File) {
    setUploadMsg({ ...uploadMsg, [templateId]: '上传中…' })
    let objKey = ''
    // 两步上传：① 获取对象存储预签名 URL → ② 直传文件 → ③ 记录 object_key
    api.getMaterialUploadUrl(data.review.review_uuid, templateId).then((presign: any) => {
      objKey = presign.object_key || ''
      const form = new FormData()
      const fields = presign.fields || {}
      Object.keys(fields).forEach(k => form.append(k, fields[k]))
      form.append('file', file)
      return fetch(presign.url, { method: 'POST', body: form })
    }).then(res => {
      if (res.status === 201) {
        return api.uploadMaterialFile(data.review.review_uuid, {
          template_id: templateId,
          file_name: file.name,
          file_size: file.size,
          object_key: objKey,
          operator_uuid: currentUser.uuid,
        })
      }
      throw new Error(`对象存储返回 ${res.status}`)
    }).then(() => {
      setUploadMsg({ ...uploadMsg, [templateId]: '' })
      setTimeout(() => onRefresh(), 500)
    }).catch((e: any) => {
      setUploadMsg({ ...uploadMsg, [templateId]: `上传失败: ${e.message}` })
    })
  }

  function startEditInd() {
    const v: Record<string, string> = {}; const n: Record<string, string> = {}
    inds.forEach((i: any) => { v[i.template_id] = String(i.current_value ?? ''); n[i.template_id] = i.notes || '' })
    setIndValues(v); setIndNotes(n); setEditInd(true)
  }
  async function saveInd() {
    const payload = Object.entries(indValues).filter(([, v]) => v.trim() !== '').map(([tid, v]) => ({ template_id: tid, current_value: parseFloat(v) || 0, notes: indNotes[tid] || '' }))
    try { await api.updateIndicators(data.review.review_uuid, { indicators: payload }); setEditInd(false); onRefresh() }
    catch (e: any) { console.error(e) }
  }

  return (
    <div>
      {/* 交付物 */}
      <div style={{ marginBottom: 20 }}>
        <h4 style={S.sectionTitle}>交付物清单（已上传 {mats.filter((m: any) => !!m.file_data).length}/{mats.length}）</h4>
        <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>材料名称</th>
            <th style={{ ...S.th, width: 360 }}>附件</th>
          </tr></thead>
          <tbody>
            {mats.length === 0 ? <tr><td colSpan={2} style={{ ...S.td, textAlign: 'center', color: '#999' }}>无交付物</td></tr> :
              mats.map((m: any, i: number) => {
                const hasFile = !!(m.file_name)
                return (
                  <tr key={i}>
                    <td style={S.td}>{m.template?.required ? <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span> : ''}{m.template?.material_name || m.template_id}</td>
                    <td style={S.td}>
                      {editable ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <label style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 4, background: '#1677ff', color: '#fff', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' as any }}>
                            选择文件
                            <input
                              type="file"
                              style={{ display: 'none' }}
                              onChange={e => {
                                const f = e.target.files?.[0]
                                if (f) handleFileSelect(m.template_id, f)
                              }}
                            />
                          </label>
                          {hasFile && (
                            <span style={{ fontSize: 11, color: '#52c41a' }} title={`点击预览: ${m.file_name}`}>
                              <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => previewMaterial(m.template_id, m.file_name)}>{m.file_name}</span>
                              <button style={{ fontSize: 10, padding: '1px 6px', border: '1px solid #52c41a', borderRadius: 3, background: '#fff', color: '#52c41a', cursor: 'pointer', marginLeft: 4 }} onClick={() => downloadMaterial(m.template_id)}>下载</button>
                              <button
                                style={{ fontSize: 10, padding: '1px 6px', border: '1px solid #ff4d4f', borderRadius: 3, background: '#fff', color: '#ff4d4f', cursor: 'pointer', marginLeft: 4 }}
                                onClick={async () => {
                                  if (!confirm(`确定清除 ${m.file_name}？`)) return
                                  try {
                                    await api.removeMaterialFile(data.review.review_uuid, { template_id: m.template_id, operator_uuid: currentUser.uuid })
                                    onRefresh()
                                  } catch (e: any) { alert('清除失败: ' + e.message) }
                                }}
                              >清除</button>
                            </span>
                          )}
                        </div>
                      ) : hasFile ? (
                        <span style={{ fontSize: 11, color: '#1677ff' }}>
                          <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => previewMaterial(m.template_id, m.file_name)}>{m.file_name}</span>
                          <button style={{ fontSize: 10, padding: '1px 6px', border: '1px solid #52c41a', borderRadius: 3, background: '#fff', color: '#52c41a', cursor: 'pointer', marginLeft: 4 }} onClick={() => downloadMaterial(m.template_id)}>下载</button>
                        </span>
                      ) : <span style={{ color: '#999', fontSize: 11 }}>—</span>}
                      {uploadMsg[m.template_id] && <div style={{ fontSize: 11, marginTop: 2, color: uploadMsg[m.template_id].startsWith('上传失败') ? '#ff4d4f' : '#1677ff' }}>{uploadMsg[m.template_id]}</div>}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
      </div>
      {/* 指标卡 */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={S.sectionTitle}>关键指标（{inds.length}项）</h4>
          {editable && !editInd && <button style={S.btn(false)} onClick={startEditInd}>编辑</button>}
        </div>
        <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>指标</th><th style={S.th}>单位</th><th style={{ ...S.th, width: 60, textAlign: 'center' }}>黄</th><th style={{ ...S.th, width: 60, textAlign: 'center' }}>红</th>
            <th style={{ ...S.th, width: 90, textAlign: 'center' }}>当前值</th><th style={{ ...S.th, width: 60, textAlign: 'center' }}>风险</th>
          </tr></thead>
          <tbody>
            {inds.length === 0 ? <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#999' }}>无指标</td></tr> :
              inds.map((ind: any, i: number) => {
                const tpl = ind.template
                const riskBg = ind.risk_color === 'red' ? '#fff1f0' : ind.risk_color === 'yellow' ? '#fff7e6' : '#f6ffed'
                const riskText = ind.risk_color === 'red' ? '🔴 红' : ind.risk_color === 'yellow' ? '🟡 黄' : '🟢 绿'
                return (
                  <tr key={i} style={{ background: riskBg }}>
                    <td style={S.td}>{tpl?.indicator_name || ind.template_id}</td>
                    <td style={S.td}>{tpl?.unit || '-'}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{tpl?.yellow_threshold ?? '-'}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{tpl?.red_threshold ?? '-'}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      {editInd ? <input type="number" step="any" style={{ ...S.input, width: 80, textAlign: 'center' }} value={indValues[ind.template_id] || ''} onChange={e => setIndValues({ ...indValues, [ind.template_id]: e.target.value })} /> :
                        <span style={{ fontWeight: 600 }}>{ind.current_value} {tpl?.unit}</span>}
                    </td>
                    <td style={{ ...S.td, textAlign: 'center', fontSize: 12 }}>{riskText}</td>

                  </tr>

                )

              })}
          </tbody>
        </table>
        </div>
        {editInd && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button style={S.btn(true)} onClick={saveInd}>保存</button>
            <button style={S.btn(false)} onClick={() => setEditInd(false)}>取消</button>
          </div>
        )}
      </div>
      {previewLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '20px 32px', borderRadius: 8, fontSize: 14, color: '#666' }}>加载预览中…</div>
        </div>
      )}
      {preview && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', zIndex: 9999 }} onClick={() => setPreview(null)}>
          <div style={{ background: '#fff', margin: '24px', borderRadius: 8, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <strong style={{ fontSize: 14 }}>{preview.name}</strong>
              <button style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }} onClick={() => setPreview(null)}>×</button>
            </div>
            {preview.url === '__unsupported__' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>该文件格式不支持在线预览</div>
                <div style={{ fontSize: 12, color: '#ccc' }}>{preview.name}</div>
              </div>
            ) : (
              <iframe src={preview.url} style={{ flex: 1, border: 'none', width: '100%' }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 评审人与意见面板
// ============================================================
const ReviewersPanel: React.FC<{ data: any; editable: boolean; isReviewing: boolean; onRefresh: () => void; currentUser: { uuid: string; name: string } }> = ({ data, editable, isReviewing, onRefresh, currentUser }) => {
    const reviewers = data.reviewers || []
    const [roles, setRoles] = useState<any[]>([])
    const [selected, setSelected] = useState<Record<string, string>>({})
    const [nameMap, setNameMap] = useState<Record<string, string>>({})
    const [reviewerDirty, setReviewerDirty] = useState(false)
    const [savingReviewers, setSavingReviewers] = useState(false)
    const [publisherRole, setPublisherRole] = useState('')
    const reviewType = (data.review?.review_type || 'dcp')

    useEffect(() => {
      const uuids = reviewers.map((r: any) => r.reviewer_uuid).filter(Boolean)
      if (uuids.length > 0) {
        api.resolveReviewerNames(uuids).then(setNameMap)
      }
    }, [data.reviewers])

    useEffect(() => {
      api.getPluginConfig().then(c => {
        setRoles((c.roles || []).filter((r: any) => (r.review_type || 'dcp') === reviewType))
        const rules = c.resolution_rule_config || {}
        setPublisherRole(rules[reviewType]?.publisher?.role || '')
      }).catch(() => {})
    }, [reviewType])

    // 草稿态：角色列表加载后自动回填已有评审人
    useEffect(() => {
      if (editable && roles.length > 0) {
        const sel: Record<string, string> = {}
        reviewers.forEach((r: any) => { sel[r.role_name] = r.reviewer_uuid || '' })
        setSelected(sel)
        setReviewerDirty(false)
      }
    }, [roles, editable])

    async function saveReviewers() {
      // 客户端校验：必投或否决权角色必须选择评审人
      const missingRequired: string[] = []
      for (const role of roles) {
        if ((role.must_vote || role.has_veto) && !(selected[role.role_name] || '').trim()) {
          missingRequired.push(role.role_name)
        }
      }
      if (missingRequired.length > 0) {
        alert(`以下角色为必选，请选择评审人：\n${missingRequired.join('、')}`)
        return
      }
      const list = Object.entries(selected).filter(([, uid]) => uid.trim()).map(([role, uid]) => ({ role_name: role, reviewer_uuid: uid }))
      setSavingReviewers(true)
      try {
        const res = await api.updateReviewers(data.review.review_uuid, { reviewers: list, operator_uuid: currentUser.uuid }) as any
        if (!res?.ok && !res?.data?.ok) {
          throw new Error(res?.error || res?.data?.error || '保存失败')
        }
        setReviewerDirty(false)
        await new Promise(r => setTimeout(r, 800))
        onRefresh()
        setTimeout(async () => {
          try {
            const detail = await api.getReviewDetail(data.review.review_uuid)
            const savedReviewers = detail?.reviewers || []
            const savedRoles = new Set(savedReviewers.map((r: any) => r.role_name))
            const missing = list.filter(r => !savedRoles.has(r.role_name)).map(r => r.role_name)
            if (missing.length > 0) {
              alert(`评审人保存后刷新校验异常，缺失角色：${missing.join('、')}\n请重新打开编辑并保存。`)
            }
          } catch {}
        }, 1200)
      } catch (e: any) {
        alert(e?.message || e?.data?.error || '保存失败')
        onRefresh()
      } finally {
        setSavingReviewers(false)
      }
    }

    return (
      <div>
        {/* 评审人区域 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={S.sectionTitle}>评审人（{reviewers.length}人，已提交 {reviewers.filter((r: any) => r.submitted_at > 0).length}）</h4>
          </div>

          {editable ? (
            /* 草稿态：直接可编辑 */
            <div>
              {roles.length === 0 ? <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>正在加载角色配置…</div> : (
                <div>
                  {!publisherRole && <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 4, fontSize: 12, background: '#fff1f0', color: '#ff4d4f' }}>
                    ⚠ 当前{reviewType.toUpperCase()}未配置决议角色，请先在「决议规则」中选择一个决议角色。
                  </div>}
                  {publisherRole && <div style={{ marginBottom: 8, padding: '8px 12px', borderRadius: 4, fontSize: 12, background: '#e6f4ff', color: '#1677ff' }}>
                    💡 决议人不参与前置评审；当前置评审满足提交要求后，系统会为决议人生成"待我决议"。
                  </div>}
                  <div style={S.tableWrap}>
                  <table style={S.table}>
                    <thead><tr>
                      <th style={S.th}>角色</th><th style={{ ...S.th, width: 160 }}>角色属性</th><th style={S.th}>评审人</th>
                    </tr></thead>
                    <tbody>
                      {roles.map((role: any) => {
                        const isRequired = role.must_vote || role.has_veto
                        const isPublisher = publisherRole === role.role_name
                        return (
                          <tr key={role.role_name}>
                            <td style={{ ...S.td, fontWeight: 500 }}>
                              {(isRequired || isPublisher) && <span style={{ color: '#ff4d4f', marginRight: 2 }}>*</span>}
                              {role.role_name}
                            </td>
                            <td style={{ ...S.td, fontSize: 11 }}>
                              {isPublisher && <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, background: '#e6f4ff', color: '#1677ff', fontWeight: 600, marginRight: 4 }}>决议人</span>}
                              {role.must_vote && <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, background: '#fff7e6', color: '#faad14', marginRight: 4 }}>必投</span>}
                              {role.has_veto && <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, background: '#fff1f0', color: '#ff4d4f', marginRight: 4 }}>否决</span>}
                              {!isPublisher && !role.must_vote && !role.has_veto && <span style={{ color: '#999' }}>-</span>}
                            </td>
                            <td style={S.td}>
                              <UserPicker value={selected[role.role_name] || ''} displayName={nameMap[selected[role.role_name] || '']} onChange={u => { setSelected({ ...selected, [role.role_name]: u.uuid }); setReviewerDirty(true) }} placeholder={isRequired || isPublisher ? '搜索评审人…（必选）' : '搜索评审人…（可不选）'} />
                              {isPublisher && !selected[role.role_name] && <div style={{ fontSize: 11, color: '#ff4d4f', marginTop: 2 }}>决议角色必须指定 1 名人员</div>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button style={S.btn(true)} onClick={saveReviewers} disabled={savingReviewers || roles.length === 0}>
                  {savingReviewers ? '保存中…' : '保存评审人'}
                </button>
                {reviewerDirty && <span style={{ color: '#faad14', fontSize: 12 }}>评审人配置有未保存修改</span>}
              </div>
            </div>
          ) : (
            /* 非草稿态：只读 */
            <>
              {reviewers.length === 0 ? <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>尚未添加评审人。</div> :
                <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead><tr>
                    <th style={S.th}>角色</th><th style={S.th}>评审人</th><th style={{ ...S.th, width: 100, textAlign: 'center' }}>结论</th>
                    <th style={{ ...S.th, width: 70, textAlign: 'center' }}>风险</th>
                    <th style={S.th}>意见摘要</th>
                    <th style={{ ...S.th, width: 70, textAlign: 'center' }}>状态</th>
                  </tr></thead>
                  <tbody>
                    {reviewers.map((r: any, i: number) => (
                      <tr key={i}>
                        <td style={{ ...S.td, fontWeight: 500 }}>{r.role_name}</td>
                        <td style={S.td}>{nameMap[r.reviewer_uuid] || r.reviewer_uuid || '-'}</td>
                        <td style={{ ...S.td, textAlign: 'center' }}>{r.conclusion ? CONCLUSION_LABELS[r.conclusion] || r.conclusion : '-'}</td>
                        <td style={{ ...S.td, textAlign: 'center' }}>{r.risk_level === 'low' ? '低' : r.risk_level === 'medium' ? '中' : r.risk_level === 'high' ? '高' : r.submitted_at > 0 ? (r.risk_level || '中') : '—'}</td>
                        <td style={{ ...S.td, fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.opinion_summary || '-'}</td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, background: r.submitted_at > 0 ? '#f6ffed' : '#fafafa', color: r.submitted_at > 0 ? '#52c41a' : '#999' }}>
                            {r.submitted_at > 0 ? '已提交' : '待提交'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>}
            </>
          )}
        </div>
      </div>
    )
}

// ============================================================
// 关联工作项面板（只读汇总，来自各评审人在评审工作台新建的工作项）
// ============================================================
const LinkedIssuesPanel: React.FC<{ data: any; projectUuid: string; projectKey: string; componentUuid: string; viewUuid: string; onRefresh: () => void }> = ({ data, projectUuid, projectKey, componentUuid, viewUuid, onRefresh }) => {
  const issues = data.linked_issues || []
  const rv = data.review
  const teamUUID = getTeamUUID()

  function taskUrl(iss: any) {
    const pkey = projectKey || projectUuid
    const num = iss.issue_number || iss.issue_uuid
    if (componentUuid && viewUuid) {
      return `/project/#/team/${teamUUID}/project/${pkey}/component/${componentUuid}/view/${viewUuid}/issue/${num}`
    }
    return `/project/#/team/${teamUUID}/project/${pkey}/issue/${num}`
  }

  // 按创建者汇总
  const byCreator: Record<string, { name: string; count: number }> = {}
  for (const iss of issues) {
    const key = iss.linked_by || 'unknown'
    if (!byCreator[key]) byCreator[key] = { name: iss.linked_by_name || key.substring(0, 8), count: 0 }
    byCreator[key].count++
  }
  const creatorSummary = Object.values(byCreator).sort((a, b) => b.count - a.count)

  return (
    <div>
      <h4 style={S.sectionTitle}>关联工作项（{issues.length}个）</h4>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>以下工作项由各评审人在评审工作台新建，自动汇总至此。</div>
      {creatorSummary.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {creatorSummary.map((c, i) => (
            <span key={i} style={{ padding: '2px 10px', borderRadius: 12, background: '#f0f5ff', fontSize: 12, color: '#1677ff' }}>
              {c.name}: {c.count}个
            </span>
          ))}
        </div>
      )}
      {issues.length === 0 ? <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>暂无关联工作项</div> :
        <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>编号</th><th style={S.th}>标题</th><th style={{ ...S.th, width: 80 }}>类型</th>
            <th style={{ ...S.th, width: 80 }}>状态</th><th style={{ ...S.th, width: 80 }}>创建者</th>
            <th style={{ ...S.th, width: 120 }}>记录时间</th>
          </tr></thead>
          <tbody>
            {issues.map((iss: any, i: number) => (
              <tr key={i}>
                <td style={S.td}><code style={{ fontSize: 11 }}>{iss.issue_number || iss.issue_uuid?.substring(0, 12)}</code></td>
                <td style={S.td}>
                  <a href={taskUrl(iss)} target="_blank" style={{ color: '#1677ff', textDecoration: 'none' }} rel="noreferrer">
                    {iss.issue_title || '-'}
                  </a>
                </td>
                <td style={S.td}>{iss.issue_type || '-'}</td>
                <td style={S.td}>{iss.issue_status || '-'}</td>
                <td style={S.td}>{iss.linked_by_name || (iss.linked_by ? iss.linked_by.substring(0, 8) : '-')}</td>
                <td style={{ ...S.td, fontSize: 12, color: '#999' }}>{iss.linked_at ? new Date(iss.linked_at).toLocaleString('zh-CN') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>}
    </div>
  )
}

// ============================================================
// 决议快照面板
// ============================================================
const ResolutionPanel: React.FC<{ data: any; onRefresh: () => void }> = ({ data, onRefresh }) => {
  const res = data.resolution
  const supps = data.supplements || []
  const [suppForm, setSuppForm] = useState({ note_type: 'supplement', note_title: '', note_content: '' })
  const [suppMsg, setSuppMsg] = useState('')

  async function handleAddSupp() {
    if (!suppForm.note_title || !suppForm.note_content) { setSuppMsg('请填写标题和内容'); return }
    setSuppMsg('')
    try {
      await api.addSupplement(data.review.review_uuid, suppForm)
      setSuppForm({ note_type: 'supplement', note_title: '', note_content: '' })
      onRefresh()
    } catch (e: any) { setSuppMsg(e.message) }
  }

  if (!res) {
    const total = data.reviewers?.length || 0
    const done = data.reviewers?.filter((r: any) => r.submitted_at > 0).length || 0
    return (
      <div>
        <h4 style={S.sectionTitle}>决议快照</h4>
        <div style={{ ...S.card, textAlign: 'center', color: '#999', padding: 40 }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>尚未发布决议</div>
          <div style={{ fontSize: 12 }}>
            评审进度: {done}/{total} 已提交（全部提交后由决议发布人发布决议）
          </div>
        </div>
      </div>
    )
  }

  const votes: any[] = res.based_on_votes ? (() => { try { return JSON.parse(res.based_on_votes) } catch { return [] } })() : []

  return (
    <div>
      {/* 决议快照 */}
      <div style={{ ...S.card, borderLeft: '4px solid #1677ff', background: '#f0f5ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h4 style={{ ...S.sectionTitle, margin: 0 }}>决议快照</h4>
          <span style={{ fontSize: 11, color: '#ff4d4f', background: '#fff2f0', padding: '2px 8px', borderRadius: 4 }}>不可覆盖</span>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          快照编号: <code>{res.snapshot_number}</code> | 发布时间: {res.published_at ? new Date(res.published_at).toLocaleString('zh-CN') : '-'}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          决议结果: <span style={{ color: res.final_conclusion === 'pass' ? '#52c41a' : res.final_conclusion === 'conditional_pass' ? '#faad14' : '#ff4d4f' }}>
            {res.final_conclusion === 'pass' ? '✅ 通过' : res.final_conclusion === 'conditional_pass' ? '⚠️ 有条件通过' : res.final_conclusion === 'fail' ? '❌ 不通过' : res.final_conclusion === 'rework' ? '🔧 返工' : '❌ 驳回'}
          </span>
        </div>
        {res.condition_notes && <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: '#fff', padding: 12, borderRadius: 4, border: '1px solid #e8e8e8' }}>{res.condition_notes}</div>}
        {res.published_by_name && <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>发布人: {res.published_by_name}</div>}

        {/* 投票快照 */}
        {votes.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>评审意见快照</div>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>角色</th><th style={S.th}>投票</th><th style={S.th}>风险</th><th style={S.th}>意见</th>
              </tr></thead>
              <tbody>
                {votes.map((v: any, i: number) => (
                  <tr key={i}>
                    <td style={S.td}>{v.role_name}</td>
                    <td style={S.td}>
                      <span style={{ color: v.conclusion === 'pass' ? '#52c41a' : v.conclusion === 'conditional_pass' ? '#faad14' : '#ff4d4f' }}>
                        {v.conclusion === 'pass' ? '✅ 通过' : v.conclusion === 'conditional_pass' ? '⚠️ 有条件通过' : v.submitted_at > 0 ? '❌ 不通过' : '— 未投票'}
                      </span>
                    </td>
                    <td style={S.td}>{v.risk_level === 'low' ? '低' : v.risk_level === 'high' ? '高' : '中'}</td>
                    <td style={{ ...S.td, fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.opinion_summary || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* 补充/纠偏说明 */}
      {supps.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={S.sectionTitle}>补充/纠偏说明（{supps.length}条）</h4>
          {supps.map((s: any, i: number) => (
            <div key={i} style={{ ...S.card, borderLeft: `3px solid ${s.note_type === 'rectification' ? '#faad14' : '#1677ff'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {s.note_type === 'rectification' ? '纠偏说明' : '补充说明'}: {s.note_title}
                </span>
                <span style={{ color: '#999', fontSize: 12 }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleString('zh-CN') : '-'}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#666' }}>{s.note_content}</div>
            </div>
          ))}
        </div>
      )}
      {/* 添加补充说明 */}
      <div style={{ ...S.card, background: '#fafafa' }}>
        <h4 style={S.sectionTitle}>追加说明</h4>
        {suppMsg && <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 4, fontSize: 12, background: '#fff2f0', color: '#cf1322' }}>{suppMsg}</div>}
        <div style={S.formGroup}>
          <label style={S.label}>类型</label>
          <select style={{ ...S.select, width: 200 }} value={suppForm.note_type} onChange={e => setSuppForm({ ...suppForm, note_type: e.target.value })}>
            <option value="supplement">补充说明</option><option value="rectification">纠偏说明</option>
          </select>
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>标题 *</label>
          <input style={S.input} value={suppForm.note_title} onChange={e => setSuppForm({ ...suppForm, note_title: e.target.value })} placeholder="说明标题" />
        </div>
        <div style={S.formGroup}>
          <label style={S.label}>内容 *</label>
          <textarea style={S.textarea} rows={3} value={suppForm.note_content} onChange={e => setSuppForm({ ...suppForm, note_content: e.target.value })} placeholder="说明内容…" />
        </div>
        <button style={S.btn(true)} onClick={handleAddSupp}>提交</button>
      </div>
    </div>
  )
}

// ============================================================
// 审计日志面板
// ============================================================
const ACTION_LABELS: Record<string, string> = {
  create_review: '创建评审', delete_review: '删除评审', start_review: '启动评审',
  upload_material: '上传材料', remove_material: '删除材料', update_reviewers: '更新评审人',
  submit_opinion: '提交评审意见', link_issue: '关联工作项', create_issue: '创建工作项',
  publish_resolution: '发布决议', add_supplement: '添加补充说明', add_correction: '添加纠偏说明',
}

const AuditPanel: React.FC<{ reviewUuid: string }> = ({ reviewUuid }) => {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [nameMap, setNameMap] = useState<Record<string, string>>({})

  useEffect(() => {
    api.getAuditLog(reviewUuid).then(data => {
      const items = data.logs || []
      setLogs(items)
      // 解析操作者 UUID → 姓名
      const uuids = [...new Set(items.map((l: any) => l.operator_uuid).filter(Boolean))]
      if (uuids.length > 0) {
        api.resolveReviewerNames(uuids as string[]).then(setNameMap).catch(() => {})
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [reviewUuid])

  if (loading) return <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>加载审计日志…</div>

  return (
    <div>
      <h4 style={S.sectionTitle}>审计日志（{logs.length}条）</h4>
      {logs.length === 0 ? <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>暂无审计记录</div> :
        <div style={S.tableWrap}>
        <table style={{ ...S.table, marginBottom: 0 }}>
          <thead><tr>
            <th style={{ ...S.th, width: 140 }}>时间</th><th style={{ ...S.th, width: 100 }}>操作者</th>
            <th style={{ ...S.th, width: 120 }}>动作</th><th style={S.th}>详情</th>
            <th style={{ ...S.th, width: 60, textAlign: 'center' }}>结果</th>
          </tr></thead>
          <tbody>
            {logs.map((l: any, i: number) => (
              <tr key={i}>
                <td style={{ ...S.td, fontSize: 12, color: '#999' }}>{l.timestamp ? new Date(l.timestamp).toLocaleString('zh-CN') : '-'}</td>
                <td style={{ ...S.td, fontSize: 11 }}>{nameMap[l.operator_uuid] || l.operator_uuid || '-'}</td>
                <td style={S.td}>{ACTION_LABELS[l.action] || l.action}</td>
                <td style={{ ...S.td, fontSize: 12 }}>{l.detail}</td>
                <td style={{ ...S.td, textAlign: 'center' }}>
                  <span style={{ color: l.result === 'success' ? '#52c41a' : '#ff4d4f', fontSize: 12 }}>{l.result}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>}
    </div>
  )
}

// ============================================================
// 评审工作台（评审人视角：材料+指标+意见+工作项）
// ============================================================
const ReviewerWorkspace: React.FC<{ data: any; projectUuid: string; onRefresh: () => void; setMsg: (v: string) => void }> = ({ data, projectUuid, onRefresh, setMsg }) => {
  const mats = data.materials || []
  const inds = data.indicators || []
  const rv = data.review
  const [opinionForm, setOpinionForm] = useState({
    reviewer_uuid: '', role_name: '', conclusion: 'pass', risk_level: 'medium', opinion_summary: '',
  })
  const [opinionMsg, setOpinionMsg] = useState('')
  const issues = data.linked_issues || []

  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  function downloadMaterial(templateId: string) {
    api.getMaterialDownloadUrl(rv.review_uuid, templateId).then((r: any) => {
      if (!r.url) return
      const a = document.createElement('a')
      a.href = r.url
      a.download = ''
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }).catch(() => {})
  }

  async function previewMaterial(templateId: string, fileName: string) {
    setPreviewLoading(true)
    try {
      const r: any = await api.getMaterialPreview(rv.review_uuid, templateId)
      if (r.content) {
        const previewable = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp', 'image/svg+xml', 'text/plain', 'text/csv']
        if (previewable.includes(r.mime)) {
          const dataUrl = `data:${r.mime};base64,${r.content}`
          setPreview({ url: dataUrl, name: fileName })
        } else {
          setPreview({ url: `__unsupported__`, name: fileName })
        }
      }
    } catch { /* ignore */ }
    finally { setPreviewLoading(false) }
  }

  async function submitOpinion() {
    if (!opinionForm.reviewer_uuid || !opinionForm.role_name || !opinionForm.conclusion) {
      setOpinionMsg('请填写用户、角色和结论'); return
    }
    setOpinionMsg('')
    try {
      await api.submitOpinion(rv.review_uuid, opinionForm)
      setOpinionForm({ reviewer_uuid: '', role_name: '', conclusion: 'pass', risk_level: 'medium', opinion_summary: '' })
      onRefresh()
    } catch (e: any) { setOpinionMsg(e.message) }
  }

  const teamUUID = getTeamUUID()
  function taskUrl(iss: any) {
    const num = iss.issue_number || iss.issue_uuid
    return `/project/#/team/${teamUUID}/project/${projectUuid}/issue/${num}`
  }

  const reviewers = data.reviewers || []

  return (
    <div>
      {/* 评审资料 — 只读 */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h4 style={S.sectionTitle}>评审资料（已上传 {mats.filter((m: any) => !!m.file_data).length}/{mats.length}）</h4>
        <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>
            <th style={S.th}>材料名称</th>
            <th style={S.th}>附件</th>
          </tr></thead>
          <tbody>
            {mats.length === 0 ? <tr><td colSpan={2} style={{ ...S.td, textAlign: 'center', color: '#999' }}>无</td></tr> :
              mats.map((m: any, i: number) => {
                return (
                  <tr key={i}>
                    <td style={S.td}>{m.template?.required ? <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span> : ''}{m.template?.material_name || m.template_id}</td>
                    <td style={S.td}>{m.file_name ? (
                      <span style={{ fontSize: 11, color: '#1677ff' }}>
                        <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => previewMaterial(m.template_id, m.file_name)}>{m.file_name}</span>
                        <button style={{ fontSize: 10, padding: '1px 6px', border: '1px solid #52c41a', borderRadius: 3, background: '#fff', color: '#52c41a', cursor: 'pointer', marginLeft: 4 }} onClick={() => downloadMaterial(m.template_id)}>下载</button>
                      </span>
                    ) : <span style={{ color: '#999', fontSize: 11 }}>—</span>}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
      </div>

      {/* 关键指标 — 只读 */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <h4 style={S.sectionTitle}>关键指标（{inds.length}项）</h4>

        <div style={S.tableWrap}>
        <table style={S.table}>
          <thead><tr>

            <th style={S.th}>指标</th><th style={S.th}>单位</th><th style={{ ...S.th, width: 60, textAlign: 'center' }}>黄</th><th style={{ ...S.th, width: 60, textAlign: 'center' }}>红</th>
            <th style={{ ...S.th, width: 90, textAlign: 'center' }}>当前值</th><th style={{ ...S.th, width: 60, textAlign: 'center' }}>风险</th>

          </tr></thead>
          <tbody>
            {inds.length === 0 ? <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#999' }}>无</td></tr> :
              inds.map((ind: any, i: number) => {
                const tpl = ind.template
                const riskBg = ind.risk_color === 'red' ? '#fff1f0' : ind.risk_color === 'yellow' ? '#fff7e6' : '#f6ffed'
                const riskText = ind.risk_color === 'red' ? '🔴 红' : ind.risk_color === 'yellow' ? '🟡 黄' : '🟢 绿'
                return (
                  <tr key={i} style={{ background: riskBg }}>
                    <td style={S.td}>{tpl?.indicator_name || ind.template_id}</td>
                    <td style={S.td}>{tpl?.unit || '-'}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{tpl?.yellow_threshold ?? '-'}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{tpl?.red_threshold ?? '-'}</td>
                    <td style={{ ...S.td, textAlign: 'center', fontWeight: 600 }}>{ind.current_value} {tpl?.unit}</td>
                    <td style={{ ...S.td, textAlign: 'center', fontSize: 12 }}>{riskText}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
      </div>

      {/* 我的评审意见 */}
      <div style={{ ...S.card, marginBottom: 16, background: '#f0f5ff', borderLeft: '4px solid #1677ff' }}>
        <h4 style={S.sectionTitle}>我的评审意见</h4>
        {opinionMsg && <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 4, fontSize: 13, background: '#fff2f0', color: '#cf1322' }}>{opinionMsg}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={S.formGroup}>
            <label style={S.label}>用户 *</label>
            <UserPicker value={opinionForm.reviewer_uuid} onChange={u => setOpinionForm({ ...opinionForm, reviewer_uuid: u.uuid })} placeholder="搜索本人…" />
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>角色 *</label>
            <select style={{ ...S.select, width: '100%' }} value={opinionForm.role_name} onChange={e => setOpinionForm({ ...opinionForm, role_name: e.target.value })}>
              <option value="">— 选择 —</option>
              {reviewers.map((r: any, i: number) => <option key={i} value={r.role_name}>{r.role_name}{r.submitted_at > 0 ? ' (已提交)' : ''}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
          <div style={S.formGroup}>
            <label style={S.label}>结论 *</label>
            <select style={{ ...S.select, width: '100%' }} value={opinionForm.conclusion} onChange={e => setOpinionForm({ ...opinionForm, conclusion: e.target.value })}>
              <option value="pass">✅ 通过</option><option value="conditional_pass">⚠️ 有条件通过</option><option value="fail">❌ 不通过</option>{(rv.review_type || 'dcp') === 'tr' && <option value="rework">🔧 返工</option>}
            </select>
          </div>
          <div style={S.formGroup}>
            <label style={S.label}>风险等级</label>
            <select style={{ ...S.select, width: '100%' }} value={opinionForm.risk_level} onChange={e => setOpinionForm({ ...opinionForm, risk_level: e.target.value })}>
              <option value="low">低</option><option value="medium">中</option><option value="high">高</option>
            </select>
          </div>
        </div>
        <div style={{ ...S.formGroup, marginTop: 8 }}>
          <label style={S.label}>意见摘要</label>
          <textarea style={S.textarea} rows={4} value={opinionForm.opinion_summary} onChange={e => setOpinionForm({ ...opinionForm, opinion_summary: e.target.value })} placeholder="输入评审意见摘要…" />
        </div>
        <button style={{ ...S.btn(true), marginTop: 8 }} onClick={submitOpinion}>提交评审意见</button>
      </div>

      {/* 关联工作项 */}
      <div style={S.card}>
        <h4 style={S.sectionTitle}>关联工作项（{issues.length}个）</h4>
        {issues.length === 0 ? <div style={{ color: '#999', padding: 12, textAlign: 'center', fontSize: 13 }}>暂无关联工作项</div> :
          <div style={S.tableWrap}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>编号</th><th style={S.th}>标题</th><th style={{ ...S.th, width: 80 }}>类型</th><th style={{ ...S.th, width: 80 }}>状态</th><th style={{ ...S.th, width: 80 }}>创建者</th>
            </tr></thead>
            <tbody>
              {issues.map((iss: any, i: number) => (
                <tr key={i}>
                  <td style={S.td}><code style={{ fontSize: 11 }}>{iss.issue_number || iss.issue_uuid?.substring(0, 12)}</code></td>
                  <td style={S.td}>
                    <a href={taskUrl(iss)} target="_blank" style={{ color: '#1677ff', textDecoration: 'none' }} rel="noreferrer">
                      {iss.issue_title || '-'}
                    </a>
                  </td>
                  <td style={S.td}>{iss.issue_type || '-'}</td>
                  <td style={S.td}>{iss.issue_status || '-'}</td>
                  <td style={S.td}>{iss.linked_by_name || (iss.linked_by ? iss.linked_by.substring(0, 8) : '-')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>}
        <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <h4 style={{ ...S.sectionTitle, fontSize: 13 }}>+ 新建工作项</h4>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button style={S.btn(true)} onClick={() => {
              try {
                window.parent.location.href = `/project/#/team/${teamUUID}/project/${projectUuid}/issues/create`
              } catch {}
            }}>+ 新建工作项（跳转到 ONES）</button>
          </div>
          <div style={{ fontSize: 12, color: '#999' }}>新建工作项后，系统将自动关联到本评审单。</div>
        </div>
      </div>
      {previewLoading && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ color: '#fff', fontSize: 14 }}>加载预览中...</div>
        </div>
      )}
      {preview && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', zIndex: 9999 }} onClick={() => setPreview(null)}>
          <div style={{ background: '#fff', margin: '24px', borderRadius: 8, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <strong style={{ fontSize: 14 }}>{preview.name}</strong>
              <button style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }} onClick={() => setPreview(null)}>×</button>
            </div>
            {preview.url === '__unsupported__' ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}></div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>该文件格式不支持在线预览</div>
                <div style={{ fontSize: 12, color: '#ccc' }}>{preview.name}</div>
              </div>
            ) : (
              <iframe src={preview.url} style={{ flex: 1, border: 'none', width: '100%' }} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 入口
// ============================================================
ReactDOM.render(<App />, document.getElementById('ones-mf-root'))

// ============================================================
// Checklist 只读总览（Chair 在项目详情页查看）
// ============================================================
const ChecklistReadOnly: React.FC<{ checklist: any[] }> = ({ checklist }) => {
  if (!checklist || checklist.length === 0) return null

  const grouped: Record<string, any[]> = {}
  for (const c of checklist) {
    if (!grouped[c.role_name]) grouped[c.role_name] = []
    grouped[c.role_name].push(c)
  }
  const statusDisplay: Record<string, string> = { unchecked: '☐', pass: '✅', fail: '❌' }
  const statusColor: Record<string, string> = { unchecked: '#999', pass: '#52c41a', fail: '#ff4d4f' }

  return (
    <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fafafa', borderRadius: 6, border: '1px solid #e8e8e8' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Checklist 概览</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {Object.keys(grouped).map(rn => {
          const items = grouped[rn]
          const pass = items.filter((i: any) => i.status === 'pass').length
          const total = items.length
          return (
            <div key={rn} style={{ fontSize: 12 }}>
              <span style={{ fontWeight: 500 }}>{rn}</span>{' '}
              <span style={{ color: pass === total ? '#52c41a' : '#faad14' }}>{pass}/{total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// 内嵌 Checklist（发布决议时查看详情，只读可展开）
// ============================================================
const ChecklistInlineTab: React.FC<{ checklist: any[] }> = ({ checklist }) => {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({})

  const grouped: Record<string, any[]> = {}
  for (const c of checklist) {
    if (!grouped[c.role_name]) grouped[c.role_name] = []
    grouped[c.role_name].push(c)
  }

  const statusDisplay: Record<string, string> = { unchecked: '☐', pass: '✅', fail: '❌' }
  const statusColor: Record<string, string> = { unchecked: '#999', pass: '#52c41a', fail: '#ff4d4f' }

  return (
    <div style={{ marginTop: 12 }}>
      <label style={S.label}>Checklist 详情</label>
      {Object.keys(grouped).map(rn => {
        const items = grouped[rn]
        const pass = items.filter((i: any) => i.status === 'pass').length
        const total = items.length
        const isExpanded = expanded[rn] || false
        return (
          <div key={rn} style={{ marginBottom: 4 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: '#f5f5f5', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
              onClick={() => setExpanded({ ...expanded, [rn]: !isExpanded })}
            >
              <span>{isExpanded ? '▾' : '▸'}</span>
              <span>{rn}</span>
              <span style={{ color: pass === total ? '#52c41a' : '#faad14', marginLeft: 'auto' }}>{pass}/{total}</span>
            </div>
            {isExpanded && items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map((item: any) => {
              const s = item.status || 'unchecked'
              return (
                <div key={item.template_id} style={{ display: 'flex', alignItems: 'center', padding: '2px 0 2px 20px', gap: 6, fontSize: 11 }}>
                  <span style={{ color: statusColor[s], fontSize: 12 }}>{statusDisplay[s]}</span>
                  <span>{item.item_text}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// IPD 流程图（SVG 三层结构：主阶段带 + 上方DCP菱形 + 下方TR三角）
// ============================================================
const IPDFlowChart: React.FC<{
  layout: any
  phases: any[]
  reviews: any[]
  onPhaseClick: (reviewUuid: string) => void
}> = ({ layout, phases, reviews, onPhaseClick }) => {
  if (!layout || !layout.stages || layout.stages.length === 0) return null

  const stages: any[] = layout.stages
  const markers: any[] = layout.markers || []

  const phaseMap = new Map<string, any>()
  for (const p of (phases || [])) phaseMap.set(p.phase_code, p)

  function getPhaseStatus(phaseCode: string): 'passed' | 'active' | 'rejected' | 'pending' {
    const prs = reviews.filter((r: any) => r.phase_code === phaseCode)
    if (prs.length === 0) return 'pending'
    const hasPass = prs.some((r: any) => r.status === 'completed' && (r.final_conclusion === 'pass' || r.final_conclusion === 'conditional_pass'))
    if (hasPass) return 'passed'
    const hasActive = prs.some((r: any) => r.status === 'draft' || r.status === 'reviewing')
    if (hasActive) return 'active'
    const allRejected = prs.every((r: any) => r.status === 'rejected')
    if (allRejected) return 'rejected'
    return 'pending'
  }

  function getClickReview(phaseCode: string): any {
    return reviews.find((r: any) => r.phase_code === phaseCode)
  }

  // 统一状态颜色
  const MARKER_COLOR: Record<string, string> = {
    passed: '#25B864', active: '#2B6FD6', pending: '#B8C0CC', rejected: '#E0454B',
  }
  const STAGE_STYLE: Record<string, { fill: string; stroke: string; text: string }> = {
    passed:   { fill: '#E8F5ED', stroke: '#25B864', text: '#25613E' },
    active:   { fill: '#EAF2FF', stroke: '#8CB8FF', text: '#2B5CA8' },
    pending:  { fill: '#F0F1F3', stroke: '#D9DEE7', text: '#4A5260' },
    rejected: { fill: '#FFE9E6', stroke: '#E0454B', text: '#B42318' },
  }

  // SVG 布局参数
  const totalRatio = stages.reduce((s: number, st: any) => s + (st.widthRatio || 1), 0)
  const STAGE_GAP = 4
  const VIEWBOX_W = 1000
  const bandCenterY = 150
  const HEIGHTS = [74, 62, 52]
  const viewBoxH = 240

  const totalGapW = STAGE_GAP * (stages.length - 1)
  const availW = VIEWBOX_W - totalGapW
  const stageWidths = stages.map((st: any) => (st.widthRatio / totalRatio) * availW)
  const stageXs: number[] = []
  let cumX = 0
  for (let i = 0; i < stages.length; i++) { stageXs.push(cumX); cumX += stageWidths[i] + STAGE_GAP }

  function markerX(m: any): number {
    const idx = stages.findIndex((s: any) => s.code === m.stage)
    if (idx < 0) return 0
    return stageXs[idx] + stageWidths[idx] * (m.position ?? 0.5)
  }

  // 圆角多边形 path：保留原顶点坐标，仅在每个角处用 1px 二次贝塞尔做圆角
  function pointOnSeg(from: { x: number; y: number }, to: { x: number; y: number }, dist: number): { x: number; y: number } {
    const dx = to.x - from.x, dy = to.y - from.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (!len) return { x: to.x, y: to.y }
    const r = Math.min(dist, len / 2) / len
    return { x: from.x + dx * r, y: from.y + dy * r }
  }
  function roundedPoly(pts: { x: number; y: number }[], radius = 1): string {
    if (pts.length < 3) return ''
    const segs: string[] = []
    pts.forEach((corner, i) => {
      const prev = pts[(i - 1 + pts.length) % pts.length]
      const next = pts[(i + 1) % pts.length]
      const before = pointOnSeg(corner, prev, radius)
      const after = pointOnSeg(corner, next, radius)
      if (i === 0) segs.push(`M ${after.x} ${after.y}`)
      else { segs.push(`L ${before.x} ${before.y}`); segs.push(`Q ${corner.x} ${corner.y} ${after.x} ${after.y}`) }
    })
    const first = pts[0], last = pts[pts.length - 1]
    const bf = pointOnSeg(first, last, radius)
    const af = pointOnSeg(first, pts[1], radius)
    segs.push(`L ${bf.x} ${bf.y}`)
    segs.push(`Q ${first.x} ${first.y} ${af.x} ${af.y}`)
    segs.push('Z')
    return segs.join(' ')
  }

  // 主阶段形状：taper=左宽右窄收窄段，rect=矩形段
  function stagePath(idx: number): string {
    const x = stageXs[idx]
    const w = stageWidths[idx]
    const shape = stages[idx].shape
    let leftH: number, rightH: number
    if (shape === 'taper' && idx === 0) { leftH = HEIGHTS[0]; rightH = HEIGHTS[1] }
    else if (shape === 'taper' && idx === 1) { leftH = HEIGHTS[1]; rightH = HEIGHTS[2] }
    else { leftH = HEIGHTS[2]; rightH = HEIGHTS[2] }
    const lt = bandCenterY - leftH / 2
    const lb = bandCenterY + leftH / 2
    const rt = bandCenterY - rightH / 2
    const rb = bandCenterY + rightH / 2
    return roundedPoly([
      { x, y: lt },
      { x: x + w, y: rt },
      { x: x + w, y: rb },
      { x, y: lb },
    ], 1)
  }

  // 阶段带上下边界（取最宽处）
  function stageTopY(idx: number): number {
    const shape = stages[idx].shape
    let h: number
    if (shape === 'taper' && idx === 0) h = HEIGHTS[0]
    else if (shape === 'taper' && idx === 1) h = HEIGHTS[1]
    else h = HEIGHTS[2]
    return bandCenterY - h / 2
  }
  function stageBottomY(idx: number): number {
    return bandCenterY + (stages[idx].shape === 'taper' && idx === 0 ? HEIGHTS[0] : stages[idx].shape === 'taper' && idx === 1 ? HEIGHTS[1] : HEIGHTS[2]) / 2
  }

  function getStageStatus(stageCode: string): 'passed' | 'active' | 'rejected' | 'pending' {
    // 主阶段底色只看 DCP 节点，不看 TR
    const dcpMs = markers.filter((m: any) => m.stage === stageCode && (m.reviewType || 'dcp') === 'dcp')
    if (dcpMs.length === 0) return 'pending'
    const ss = dcpMs.map((m: any) => getPhaseStatus(m.phaseCode))
    if (ss.some((s: string) => s === 'rejected')) return 'rejected'
    if (ss.some((s: string) => s === 'active')) return 'active'
    if (ss.every((s: string) => s === 'passed')) return 'passed'
    if (ss.some((s: string) => s === 'passed')) return 'active' // 部分通过=已推进未完成
    return 'pending'
  }

  const DIAMOND_S = 10
  const TRI_S = 9
  const DCP_LABEL_Y = 84
  const DCP_DIAMOND_Y = 104
  const TR_APEX_Y = 184
  const TR_BASE_Y = 204
  const TR_LABEL_Y = 224

  function diamondPoints(cx: number, cy: number, size: number): string {
    return `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`
  }

  return (
    <div style={{ marginBottom: 20, padding: '16px 24px', background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 10 }}>IPD 阶段进度</div>
      <svg viewBox={`0 0 ${VIEWBOX_W} ${viewBoxH}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 240 }}>
        {/* 1. 先画主阶段带 */}
        {stages.map((st: any, idx: number) => {
          const x = stageXs[idx]
          const w = stageWidths[idx]
          const ss = getStageStatus(st.code)
          const sc = STAGE_STYLE[ss]
          return (
            <g key={`stage-${idx}`}>
              <path d={stagePath(idx)} fill={sc.fill} stroke={sc.stroke} strokeWidth="1" />
              <text x={x + w / 2} y={bandCenterY + 4} textAnchor="middle" fontSize="14" fontWeight="600" fill={sc.text}>{st.name}</text>
            </g>
          )
        })}
        {/* 2. DCP 竖线 + 菱形 + 名称 */}
        {markers.filter((m: any) => m.side === 'top').map((m: any, i: number) => {
          const x = markerX(m)
          const ph = phaseMap.get(m.phaseCode)
          const status = getPhaseStatus(m.phaseCode)
          const cr = getClickReview(m.phaseCode)
          const color = MARKER_COLOR[status]
          const stageIdx = stages.findIndex((s: any) => s.code === m.stage)
          const topY = stageIdx >= 0 ? stageTopY(stageIdx) : bandCenterY - 30
          const bottomY = stageIdx >= 0 ? stageBottomY(stageIdx) : bandCenterY + 30
          return (
            <g key={`dcp-${i}`}>
              <line x1={x} y1={DCP_DIAMOND_Y + DIAMOND_S} x2={x} y2={topY} stroke={color} strokeWidth="1.5"
                strokeDasharray={status === 'pending' ? '3,3' : 'none'} opacity={status === 'pending' ? 0.35 : 0.65} />
              <line x1={x} y1={bottomY} x2={x} y2={bandCenterY + 26} stroke={color} strokeWidth="1"
                strokeDasharray={status === 'pending' ? '3,3' : 'none'} opacity={status === 'pending' ? 0.2 : 0.35} />
              <text x={x} y={DCP_LABEL_Y} textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>{ph?.phase_name || m.phaseCode}</text>
              <polygon points={diamondPoints(x, DCP_DIAMOND_Y, DIAMOND_S)} fill={color} stroke="#fff" strokeWidth="1"
                style={{ cursor: cr ? 'pointer' : 'default' }} onClick={() => cr && onPhaseClick(cr.review_uuid)} />
            </g>
          )
        })}
        {/* 3. TR 三角(顶点朝上) + 名称 */}
        {markers.filter((m: any) => m.side === 'bottom').map((m: any, i: number) => {
          const x = markerX(m)
          const ph = phaseMap.get(m.phaseCode)
          const status = getPhaseStatus(m.phaseCode)
          const cr = getClickReview(m.phaseCode)
          const color = MARKER_COLOR[status]
          return (
            <g key={`tr-${i}`}>
              <polygon points={`${x},${TR_APEX_Y} ${x - TRI_S},${TR_BASE_Y} ${x + TRI_S},${TR_BASE_Y}`}
                fill={color} stroke="#fff" strokeWidth="1"
                style={{ cursor: cr ? 'pointer' : 'default' }} onClick={() => cr && onPhaseClick(cr.review_uuid)} />
              <text x={x} y={TR_LABEL_Y} textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>{ph?.phase_name || m.phaseCode}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ============================================================
// 状态轨迹时间线
// ============================================================
const STATE_TIMELINE_LABELS: Record<string, string> = {
  draft: '草稿', ready: '就绪', reviewing: '评审中', awaiting_resolution: '待决议',
  resolution_published: '决议已发布', remediation_pending: '整改中', re_reviewing: '复审中',
  completed: '已完成', rejected: '已否决', canceled: '已撤回', archived: '已归档',
}
const STATE_TIMELINE_COLORS: Record<string, string> = {
  draft: '#999', ready: '#8c8c8c', reviewing: '#1677ff', awaiting_resolution: '#722ed1',
  resolution_published: '#13c2c2', remediation_pending: '#fa8c16', re_reviewing: '#2f54eb',
  completed: '#52c41a', rejected: '#ff4d4f', canceled: '#bfbfbf', archived: '#d9d9d9',
}

const StateTimeline: React.FC<{ data: any; effState: string; roundNo: number }> = ({ data, effState, roundNo }) => {
  const history: any[] = data.state_history || []
  const available: string[] = data.available_transitions || []
  const [nameMap, setNameMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const uuids = history.map((e: any) => e.by).filter((u: string) => u && u !== 'system')
    if (uuids.length > 0) {
      api.resolveReviewerNames([...new Set(uuids)]).then(setNameMap).catch(() => {})
    }
  }, [data.state_history])

  return (
    <div>
      {/* 当前状态概览 */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f6f8fa', borderRadius: 8, border: '1px solid #e8e8e8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#666' }}>当前状态:</span>
          <span style={{
            padding: '2px 10px', borderRadius: 4, fontSize: 13, fontWeight: 600,
            color: '#fff', background: STATE_TIMELINE_COLORS[effState] || '#999',
          }}>{STATE_TIMELINE_LABELS[effState] || effState}</span>
          <span style={{ fontSize: 13, color: '#666' }}>| 第 {roundNo} 轮</span>
          {available.length > 0 && (
            <span style={{ fontSize: 12, color: '#999' }}>可流转至: {available.map(s => STATE_TIMELINE_LABELS[s] || s).join(' / ')}</span>
          )}
        </div>
      </div>

      {/* 状态历史时间线 */}
      <div style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 12, color: '#333' }}>状态变更轨迹</div>
        {history.length === 0 ? (
          <div style={{ color: '#999', padding: '20px 0', textAlign: 'center' }}>暂无状态记录</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            {/* 竖线 */}
            <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 2, background: '#e8e8e8' }} />
            {[...history].reverse().map((entry: any, i: number) => {
              const isLatest = i === 0
              const color = STATE_TIMELINE_COLORS[entry.state] || '#999'
              const label = STATE_TIMELINE_LABELS[entry.state] || entry.state
              const fromLabel = entry.from_state ? (STATE_TIMELINE_LABELS[entry.from_state] || entry.from_state) : ''
              return (
                <div key={i} style={{ position: 'relative', marginBottom: 16, paddingLeft: 16 }}>
                  {/* 圆点 */}
                  <div style={{
                    position: 'absolute', left: -17, top: 4, width: 10, height: 10, borderRadius: '50%',
                    background: color, border: '2px solid #fff', boxShadow: '0 0 0 1px ' + color,
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: isLatest ? color : '#333' }}>{label}</span>
                    {fromLabel && <span style={{ fontSize: 11, color: '#999' }}>← {fromLabel}</span>}
                    {entry.round_no > 1 && <span style={{ fontSize: 11, color: '#722ed1', background: '#f9f0ff', padding: '1px 6px', borderRadius: 3 }}>第{entry.round_no}轮</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    {entry.at ? new Date(entry.at).toLocaleString('zh-CN') : '-'}
                    {entry.by && entry.by !== 'system' ? <span> | 操作人: {nameMap[entry.by] || entry.by}</span> : <span> | 系统</span>}
                  </div>
                  {entry.reason && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{entry.reason}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
