import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { apiGet, DcpApiError, getTeamUUID } from '../../api'
import { ReviewDetail } from '../dcp-review-tab'
import * as reviewApi from '../dcp-review-tab/api'

// ============================================================
// 前端兜底：浏览器侧补查项目名称
// ============================================================

function isProjectNameUnresolved(review: any): boolean {
 const name = review.project_name
 const identifier = review.project_identifier || review.project_uuid
 return !name || name === identifier || name === review.project_uuid
}

async function exchangeProject(teamUUID: string, projectKey: string): Promise<{ identifier: string; uuid: string } | null> {
 const res = await fetch(
 `/project/api/ones-project/team/${teamUUID}/projects/exchange/${projectKey}`,
 { credentials: 'include' }
 )
 if (!res.ok) return null
 const json = await res.json()
 const data = json?.data || json || {}
 return {
 identifier: data.identifier || projectKey,
 uuid: data.project_uuid || '',
 }
}

async function fetchProjectByStamp(teamUUID: string, realUUID: string): Promise<any> {
 if (!realUUID) return null
 const res = await fetch(
 `/project/api/project/team/${teamUUID}/project/${realUUID}/stamps/data?t=project`,
 {
 method: 'POST',
 credentials: 'include',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ project: 0 }),
 }
 )
 if (!res.ok) return null
 const json = await res.json()
 const data = json?.data || json || {}
 return data?.project?.projects?.[0] || null
}

async function hydrateProjectNames(teamUUID: string, reviews: any[]): Promise<any[]> {
 const unresolvedKeys = [...new Set(
 reviews
 .filter(isProjectNameUnresolved)
 .map((r: any) => r.project_identifier || r.project_uuid)
 .filter(Boolean)
 )]

 if (!unresolvedKeys.length) return reviews

 const projectMap: Record<string, any> = {}

 for (const key of unresolvedKeys) {
 try {
 const exchanged = await exchangeProject(teamUUID, key)
 const project = exchanged?.uuid
 ? await fetchProjectByStamp(teamUUID, exchanged.uuid)
 : null

 if (project?.name) {
 projectMap[key] = {
 identifier: project.identifier || exchanged?.identifier || key,
 uuid: project.uuid || exchanged?.uuid || '',
 name: project.name,
 }
 }
 } catch { /* next */ }
 }

 if (!Object.keys(projectMap).length) return reviews

 return reviews.map(review => {
 const key = review.project_identifier || review.project_uuid
 const project = projectMap[key]
 if (!project) return review
 return {
 ...review,
 project_identifier: project.identifier || review.project_identifier || review.project_uuid,
 project_real_uuid: project.uuid || review.project_real_uuid || '',
 project_name: project.name || review.project_name || review.project_uuid,
 }
 })
}

const STATUS_LABELS: Record<string, string> = { draft: '草稿', reviewing: '评审中', completed: '已完成', rejected: '已否决' }
const STATUS_COLORS: Record<string, string> = { draft: '#999', reviewing: '#1677ff', completed: '#52c41a', rejected: '#ff4d4f' }
const CONCLUSION_LABELS: Record<string, string> = { pass: '✅ 通过', conditional_pass: '⚠️ 有条件通过', fail: '❌ 不通过' }

const S: Record<string, any> = {
 container: { padding: 20, fontFamily: 'sans-serif', fontSize: 13, color: '#333' },
 statsBar: { display: 'flex', gap: 16, marginBottom: 20 },
 statCard: { flex: 1, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', textAlign: 'center' as any },
 statNum: { fontSize: 28, fontWeight: 700 },
 statLabel: { fontSize: 12, color: '#999', marginTop: 4 },
 sectionTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
 table: { width: '100%', borderCollapse: 'collapse' as any, fontSize: 13 },
 th: { padding: '8px 12px', textAlign: 'left' as any, background: '#fafafa', borderBottom: '1px solid #e8e8e8', cursor: 'pointer' },
 td: { padding: '8px 12px', borderBottom: '1px solid #f0f0f0' },
 btn: { padding: '4px 12px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12 },
 detailCard: { padding: 14, background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', marginBottom: 10 },
 backBtn: { padding: '6px 16px', border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', color: '#333', cursor: 'pointer', fontSize: 13, marginBottom: 16 },
 statusTag: (c: string): React.CSSProperties => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, background: `${c}1a`, color: c, fontWeight: 600 }),
}

const App: React.FC = () => {
 const [loading, setLoading] = useState(true)
 const [reviews, setReviews] = useState<any[]>([])
 const [stats, setStats] = useState<any>({})
 const [view, setView] = useState<'list' | 'detail'>('list')
 const [detail, setDetail] = useState<any>(null)
 const [sortKey, setSortKey] = useState('created_at')
 const [sortDesc, setSortDesc] = useState(true)
 const [msg, setMsg] = useState('')
 const [nameMap, setNameMap] = useState<Record<string, string>>({})
 const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
 const [directLink, setDirectLink] = useState(false)
 const [copyToast, setCopyToast] = useState('')

 // 复制编号到剪贴板
 async function copyReviewLink(reviewNumber: string, reviewUuid: string) {
 const text = reviewNumber
 try {
 await navigator.clipboard.writeText(text)
 setCopyToast('已复制编号')
 } catch {
 const ta = document.createElement('textarea')
 ta.value = text
 document.body.appendChild(ta)
 ta.select()
 try { document.execCommand('copy'); setCopyToast('已复制编号') } catch {}
 document.body.removeChild(ta)
 }
 setTimeout(() => setCopyToast(''), 2000)
 }

 useEffect(() => { loadReviews() }, [])

 async function loadReviews() {
 setLoading(true)
 try {
 const data = await apiGet('/dcp/reviews/team')
 const rawReviews = data.reviews || []
 // 前端兜底：如果后端返回的 project_name 仍是项目标识，浏览器侧补查
 const tu = getTeamUUID()
 const fixedReviews = tu ? await hydrateProjectNames(tu, rawReviews) : rawReviews
 setReviews(fixedReviews)
 setStats(data.stats || {})
 // 检查 URL 参数，直接定位评审单
 try {
 const params = new URLSearchParams(window.location.search)
 const rid = params.get('review_uuid')
 if (rid) { setDirectLink(true); openDetail(rid) }
 } catch {}
 } catch (e: any) { setMsg('加载失败: ' + e.message) }
 finally { setLoading(false) }
 }

 function toggleCollapse(pid: string) {
 setCollapsed(c => ({ ...c, [pid]: !c[pid] }))
 }

 async function openDetail(rid: string) {
 setLoading(true)
 setMsg('')
 try {
 const data = await reviewApi.getReviewDetail(rid)
 // 补查项目名称（后端无法调页面 API，前端 browser fetch 兜底）
 const projKey = data.review?.project_uuid || ''
 if (projKey) {
 const tuid = getTeamUUID()
 if (tuid) {
 try {
 const exchanged = await exchangeProject(tuid, projKey)
 const project = exchanged?.uuid ? await fetchProjectByStamp(tuid, exchanged.uuid) : null
 if (project?.name) {
 data.review = {
 ...data.review,
 project_name: project.name,
 project_identifier: project.identifier || exchanged?.identifier || projKey,
 }
 }
 } catch { /* 静默失败，保持显示 identifier */ }
 }
 }
 setDetail(data)
 setView('detail')
 } catch (e: any) { setMsg('加载详情失败: ' + e.message) }
 finally { setLoading(false) }
 }

 async function refreshDetail() {
 if (!detail?.review?.review_uuid) return
 try {
 const data = await reviewApi.getReviewDetail(detail.review.review_uuid)
 // 保留之前补查的项目名称
 if (detail.review.project_name) {
 data.review = { ...data.review, project_name: detail.review.project_name, project_identifier: detail.review.project_identifier }
 }
 setDetail(data)
 } catch (e: any) { setMsg('刷新失败: ' + e.message) }
 }

 async function handleStart(rid: string) {
 try {
 await reviewApi.startReview(rid)
 refreshDetail()
 } catch (e: any) { setMsg('发起失败: ' + e.message) }
 }

 function sortBy(key: string) {
 if (sortKey === key) { setSortDesc(!sortDesc) }
 else { setSortKey(key); setSortDesc(true) }
 }

 const sorted = [...reviews].sort((a: any, b: any) => {
 let va = a[sortKey], vb = b[sortKey]
 if (typeof va === 'number' && typeof vb === 'number') return sortDesc ? vb - va : va - vb
 return sortDesc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb))
 })

 if (loading && view === 'list') return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>加载中…</div>

 if (view === 'detail' && detail) {
 const rv = detail.review
 return (
 <div style={S.container}>
 {directLink && (
 <div style={{ marginBottom: 8 }}>
 <button style={{ ...S.backBtn, borderColor: '#1677ff', color: '#1677ff' }} onClick={() => { window.parent.location.href = '/project/' }}>← 返回 ONES 主界面</button>
 </div>
 )}
 <ReviewDetail
 projectUuid={rv.project_uuid || ''}
 projectKey={rv.project_identifier || rv.project_uuid || ''}
 componentUuid=""
 viewUuid=""
 data={detail}
 onBack={() => { setView('list'); setDetail(null); setDirectLink(false); loadReviews() }}
 onRefresh={refreshDetail}
 onStart={handleStart}
 msg={msg}
 setMsg={setMsg}
 />
 </div>
 )
 }

 return (
 <div style={S.container}>
 <div style={S.sectionTitle}><span>DCP 团队评审总览</span><button style={S.btn} onClick={loadReviews}>刷新</button></div>
 {msg && <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, fontSize: 13, background: '#fff2f0', color: '#cf1322' }}>{msg}</div>}
 <div style={S.statsBar}>
 <div style={S.statCard}><div style={{ ...S.statNum, color: '#1677ff' }}>{stats.total || 0}</div><div style={S.statLabel}>全部评审</div></div>
 <div style={S.statCard}><div style={{ ...S.statNum, color: '#faad14' }}>{stats.reviewing_count || 0}</div><div style={S.statLabel}>评审中</div></div>
 <div style={S.statCard}><div style={{ ...S.statNum, color: '#52c41a' }}>{stats.completed_count || 0}</div><div style={S.statLabel}>已完成</div></div>
 <div style={S.statCard}><div style={{ ...S.statNum, color: '#722ed1' }}>{stats.linked_issue_count || 0}</div><div style={S.statLabel}>关联工作项</div></div>
 </div>
 {sorted.length === 0 ? (
 <div style={{ padding: 40, textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 8 }}>团队暂无 DCP 评审单</div>
 ) : (
 (() => {
 // 按项目分组（stable: project_real_uuid, display: project_name）
 const groups: Record<string, any[]> = {}
 sorted.forEach(r => {
 const pid = r.project_real_uuid || r.project_identifier || r.project_uuid || '未知项目'
 if (!groups[pid]) groups[pid] = { name: r.project_name || r.project_uuid || '未知项目', items: [] }
 groups[pid].items.push(r)
 })
 // 按项目名称排序
 const pids = Object.keys(groups).sort((a, b) => {
 return (groups[a].name || '').localeCompare(groups[b].name || '', 'zh-CN')
 })
 return pids.map((pid, gi) => {
 const g = groups[pid]
 const items = g.items
 const pname = g.name
 const isCollapsed = collapsed[pid] !== false // 默认折叠
 return (
 <div key={gi} style={{ marginBottom: 20 }}>
 <div
 onClick={() => toggleCollapse(pid)}
 style={{
 fontSize: 14, fontWeight: 600, padding: '8px 12px', background: '#f5f5f5',
 borderRadius: isCollapsed ? '4px' : '4px 4px 0 0',
 borderBottom: isCollapsed ? 'none' : '2px solid #1677ff',
 cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
 }}
 >
 <span>{pname} <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>（{items.length} 个评审单）</span></span>
 <span style={{ fontSize: 12, color: '#999' }}>{isCollapsed ? '▶ 展开' : '▼ 收起'}</span>
 </div>
 {!isCollapsed && (
 <table style={S.table}><thead><tr>
 <th style={S.th}>编号</th>
 <th style={S.th} onClick={() => sortBy('phase_code')}>阶段 {sortKey === 'phase_code' ? (sortDesc ? '↓' : '↑') : ''}</th>
 <th style={S.th} onClick={() => sortBy('review_title')}>标题 {sortKey === 'review_title' ? (sortDesc ? '↓' : '↑') : ''}</th>
 <th style={{ ...S.th, width: 80, textAlign: 'center' }}>状态</th>
 <th style={{ ...S.th, width: 60, textAlign: 'center' }}>资料</th>
 <th style={{ ...S.th, width: 80, textAlign: 'center' }}>评审人</th>
 <th style={{ ...S.th, width: 60, textAlign: 'center' }}>工作项</th>
 <th style={{ ...S.th, width: 130 }} onClick={() => sortBy('meeting_time')}>会议时间 {sortKey === 'meeting_time' ? (sortDesc ? '↓' : '↑') : ''}</th>
 </tr></thead><tbody>
 {items.map((r: any, i: number) => {
 const sc = STATUS_COLORS[r.status] || '#999'; const sl = STATUS_LABELS[r.status] || r.status
 return (<tr key={i} style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }} onClick={() => openDetail(r.review_uuid)}>
 <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#1677ff', fontWeight: 600 }}>
 <span style={{ cursor: 'pointer' }} title="点击复制编号" onClick={(e) => { e.stopPropagation(); copyReviewLink(r.review_number || r.review_uuid, r.review_uuid) }}>{r.review_number || '-'}</span>
 </td>
 <td style={{ ...S.td, fontWeight: 600 }}>
 {r.phase_code}
 <span style={{ display: 'inline-block', marginLeft: 4, padding: '0 4px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: (r.review_type || 'dcp') === 'tr' ? '#f9f0ff' : '#e6f4ff', color: (r.review_type || 'dcp') === 'tr' ? '#722ed1' : '#1677ff' }}>{(r.review_type || 'dcp') === 'tr' ? 'TR' : 'DCP'}</span>
 </td>
 <td style={{ ...S.td, color: '#1677ff', textDecoration: 'underline' }}>{r.review_title || r.review_uuid?.substring(0, 12)}</td>
 <td style={{ ...S.td, textAlign: 'center' }}><span style={S.statusTag(sc)}>{sl}</span></td>
 <td style={{ ...S.td, textAlign: 'center', fontSize: 12 }}>{r.material_submitted || 0}/{r.material_total || 0}</td>
 <td style={{ ...S.td, textAlign: 'center', fontSize: 12 }}>{r.reviewer_done || 0}/{r.reviewer_total || 0}</td>
 <td style={{ ...S.td, textAlign: 'center' }}>{r.linked_issue_count || 0}</td>
 <td style={{ ...S.td, fontSize: 12, color: '#999' }}>{r.meeting_time ? new Date(r.meeting_time).toLocaleString('zh-CN') : '-'}</td>
 </tr>)
 })}
 </tbody></table>
 )}
 </div>
 )
 })
 })()
 )}
 {copyToast && (
 <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '8px 20px', borderRadius: 6, fontSize: 13, zIndex: 9999 }}>{copyToast}</div>
 )}
 </div>
 )
}

ReactDOM.render(<App />, document.getElementById('ones-mf-root'))

export { App as TeamOverview }
