import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom'
import { apiGet, apiPost, DcpApiError } from '../../api'

type NavKey = 'phases' | 'materials' | 'indicators' | 'roles' | 'checklist' | 'resolution' | 'notify' | 'ipdflow' | 'recall' | 'remediation'

const NAV: { key: NavKey; label: string }[] = [
 { key: 'phases', label: '节点模板' },
 { key: 'materials', label: '材料模板' },
 { key: 'indicators', label: '指标模板' },
 { key: 'roles', label: '评审角色' },
 { key: 'checklist', label: 'Checklist' },
 { key: 'resolution', label: '决议规则' },
 { key: 'ipdflow', label: 'IPD流程图' },
 { key: 'notify', label: '通知设置' },
 { key: 'recall', label: '撤回设置' },
 { key: 'remediation', label: '整改设置' },
]

function jsonArr(s: string): string[] {
 try { const a = JSON.parse(s); return Array.isArray(a) ? a : [] } catch { return [] }
}

// ---- 样式 ----
const S: Record<string, any> = {
 container: { display: 'flex', height: '100%', fontFamily: 'sans-serif', fontSize: 13, color: '#333' },
 nav: { width: 160, borderRight: '1px solid #e8e8e8', padding: '12px 0', background: '#fafafa', flexShrink: 0 },
 navItem: (a: boolean): React.CSSProperties => ({
 padding: '10px 16px', cursor: 'pointer', fontSize: 13,
 color: a ? '#1677ff' : '#333', background: a ? '#e6f4ff' : 'transparent',
 borderRight: a ? '2px solid #1677ff' : '2px solid transparent', fontWeight: a ? 600 : 400,
 }),
 content: { flex: 1, padding: 20, overflow: 'auto', paddingBottom: 80 },
 sectionTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as React.CSSProperties,
 input: { padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, width: '100%', boxSizing: 'border-box' as any },
 select: { padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13 },
 textarea: { padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, width: '100%', resize: 'vertical' as any, boxSizing: 'border-box' as any },
 row: { display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0', alignItems: 'center' },
 addBtn: { padding: '4px 12px', border: '1px dashed #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#1677ff' },
 delBtn: { padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#ff4d4f', fontSize: 14 },
 saveBar: { position: 'fixed' as any, bottom: 0, left: 160, right: 0, padding: '10px 20px', background: '#fff', borderTop: '1px solid #e8e8e8', display: 'flex', gap: 12, alignItems: 'center', zIndex: 10 },
 btn: (p: boolean, d = false) => ({ padding: '6px 20px', borderRadius: 4, border: 'none', cursor: d ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, background: p ? '#1677ff' : '#f0f0f0', color: p ? '#fff' : '#333', opacity: d ? 0.6 : 1 }),
}

// ============================================================
// 主组件
// ============================================================
const App: React.FC = () => {
 const [nav, setNav] = useState<NavKey>('phases')
 const [reviewType, setReviewType] = useState<'dcp' | 'tr'>('dcp')
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [message, setMessage] = useState('')
 const [editing, setEditing] = useState(false) // 编辑态开关

 const [phases, setPhases] = useState<any[]>([])
 const [materials, setMaterials] = useState<any[]>([])
 const [indicators, setIndicators] = useState<any[]>([])
 const [roles, setRoles] = useState<any[]>([])
 const [checklistItems, setChecklistItems] = useState<any[]>([])
 const [notifyConfig, setNotifyConfig] = useState<any>({ enabled: true, on_review_start: true, on_all_submitted: true, on_resolution: true, on_manual_remind: true, remind_cooldown_seconds: 60, channels: { email: true, wechat: false, dingtalk: false, feishu: false, youdao: false } })
 const [ipdFlowLayout, setIpdFlowLayout] = useState<any>(null)
 const [resolutionRules, setResolutionRules] = useState<any>({ dcp: null, tr: null })
 const [recallConfig, setRecallConfig] = useState<any>({ enabled: false, allowedBeforeResolution: true, requireReason: true, clearSubmittedOpinions: true })
 const [remediationIssueType, setRemediationIssueType] = useState('任务')

 useEffect(() => { loadConfig() }, [])

 async function loadConfig() {
 setLoading(true)
 try {
 const data = await apiGet('/dcp/config')
 // 后端 getPluginConfig 返回 { config, phases, materials, indicators, roles }
 // 兼容旧数据：拆分逗号分隔的 resolution_options，默认 dependencies
 const normPhase = (p: any) => {
 const ro = jsonArr(p.resolution_options || '[]')
 const needsSplit = ro.some((x: string) => typeof x === 'string' && (x.includes(',') || x.includes('，')))
 const fixedRo = needsSplit ? ro.flatMap((x: string) => x.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)) : ro
 return { ...p, review_type: p.review_type || 'dcp', dependencies: p.dependencies || '[]', resolution_options: JSON.stringify(fixedRo) }
 }
 const phs = (data.phases || []).map(normPhase)
 if (phs.length) {
 setPhases(phs)
 }
 if (data.materials?.length) setMaterials(data.materials.map((m: any) => ({ ...m, review_type: m.review_type || 'dcp' })))
 if (data.indicators?.length) setIndicators(data.indicators.map((i: any) => ({ ...i, review_type: i.review_type || 'dcp' })))
 if (data.roles?.length) setRoles(data.roles.map((r: any) => ({ ...r, review_type: r.review_type || 'dcp' })))
 if (data.checklistItems?.length) setChecklistItems(data.checklistItems.map((c: any) => ({ ...c, review_type: c.review_type || 'dcp' })))
 if (data.notify_config) setNotifyConfig(data.notify_config)
 if (data.review_recall_config) setRecallConfig(data.review_recall_config)
 if (data.config?.remediation_issue_type) setRemediationIssueType(data.config.remediation_issue_type)
 if (data.ipd_flow_layout) setIpdFlowLayout(data.ipd_flow_layout)
 if (data.resolution_rule_config) setResolutionRules(data.resolution_rule_config)
 } catch (err: any) { setMessage('加载失败: ' + err.message) }
 finally { setLoading(false) }
 }

 async function handleSave() {
 setSaving(true); setMessage('')
 try {
 if (phases.every(p => !p.phase_name)) { setMessage('至少需要填一个阶段名称'); setSaving(false); return }
 const normPhase = (arr: any[]) => arr.map(x => ({ ...x, review_type: x.review_type || 'dcp', dependencies: x.dependencies || '[]' }))
 const normType = (arr: any[]) => arr.map(x => ({ ...x, review_type: x.review_type || 'dcp' }))
 const body = {
 phases: normPhase(phases.filter(p => p.phase_name)),
 materials: normType(materials), indicators: normType(indicators), roles: normType(roles),
 checklistItems: normType(checklistItems),
 notify_config: notifyConfig,
 review_recall_config: recallConfig,
 ipd_flow_layout: ipdFlowLayout,
 resolution_rule_config: resolutionRules,
 config: { remediation_issue_type: remediationIssueType },
 }
 const res = await apiPost('/dcp/config', body)
 if (res.error) { setMessage('保存失败: ' + res.error) }
 else { setMessage('配置已保存'); setEditing(false) }
 } catch (err: any) { setMessage('保存失败: ' + err.message) }
 finally { setSaving(false) }
 }

 if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>加载配置…</div>

 return (
 <div style={S.container}>
 <div style={S.nav}>
 {NAV.map(item => (
 <div key={item.key} style={S.navItem(nav === item.key)} onClick={() => setNav(item.key)}>{item.label}</div>
 ))}
 </div>
 <div style={S.content}>
 {/* DCP / TR 类型切换（IPD流程图、通知设置、撤回设置、整改设置为全局配置，不区分 DCP/TR） */}
 {nav !== 'ipdflow' && nav !== 'notify' && nav !== 'recall' && nav !== 'remediation' && (
 <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid #e8e8e8' }}>
 {(['dcp', 'tr'] as const).map(t => (
 <button key={t} onClick={() => setReviewType(t)}
 style={{ padding: '6px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14,
 borderBottom: reviewType === t ? '2px solid #1677ff' : '2px solid transparent',
 color: reviewType === t ? '#1677ff' : '#666', fontWeight: reviewType === t ? 600 : 400 }}>
 {t === 'dcp' ? 'DCP 决策评审' : 'TR 技术评审'}
 </button>
 ))}
 </div>
 )}
 {!editing && (
 <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
 <button style={S.btn(true)} onClick={() => { setEditing(true); setMessage('') }}>配置</button>
 </div>
 )}
 {nav === 'phases' && <PhaseTemplates phases={phases.filter((p: any) => (p.review_type || 'dcp') === reviewType)} allPhases={phases} onChange={(v) => { const other = phases.filter((p: any) => (p.review_type || 'dcp') !== reviewType); setPhases([...other, ...v.map((x: any) => ({ ...x, review_type: reviewType }))]) }} editing={editing} reviewType={reviewType} />}
 {nav === 'materials' && <MaterialTemplates items={materials.filter((m: any) => (m.review_type || 'dcp') === reviewType)} onChange={(v) => { const other = materials.filter((m: any) => (m.review_type || 'dcp') !== reviewType); setMaterials([...other, ...v.map((x: any) => ({ ...x, review_type: reviewType }))]) }} editing={editing} phaseObjs={phases.filter((p: any) => (p.review_type || 'dcp') === reviewType).map((p: any) => ({ code: p.phase_code, name: p.phase_name || p.phase_code }))} />}
 {nav === 'indicators' && <IndicatorTemplates items={indicators.filter((i: any) => (i.review_type || 'dcp') === reviewType)} onChange={(v) => { const other = indicators.filter((i: any) => (i.review_type || 'dcp') !== reviewType); setIndicators([...other, ...v.map((x: any) => ({ ...x, review_type: reviewType }))]) }} editing={editing} phaseObjs={phases.filter((p: any) => (p.review_type || 'dcp') === reviewType).map((p: any) => ({ code: p.phase_code, name: p.phase_name || p.phase_code }))} />}
 {nav === 'roles' && <RoleRules items={roles.filter((r: any) => (r.review_type || 'dcp') === reviewType)} onChange={(v) => { const other = roles.filter((r: any) => (r.review_type || 'dcp') !== reviewType); setRoles([...other, ...v.map((x: any) => ({ ...x, review_type: reviewType }))]) }} editing={editing} />}
 {nav === 'checklist' && <ChecklistConfigPanel items={checklistItems.filter((c: any) => (c.review_type || 'dcp') === reviewType)} roles={roles.filter((r: any) => (r.review_type || 'dcp') === reviewType)} onChange={(v) => { const other = checklistItems.filter((c: any) => (c.review_type || 'dcp') !== reviewType); setChecklistItems([...other, ...v.map((x: any) => ({ ...x, review_type: reviewType }))]) }} editing={editing} phases={phases.filter((p: any) => (p.review_type || 'dcp') === reviewType)} />}
 {nav === 'resolution' && <ResolutionRuleConfig rules={resolutionRules} roles={roles} onChange={setResolutionRules} editing={editing} reviewType={reviewType} />}
 {nav === 'ipdflow' && <IpdFlowLayoutConfig layout={ipdFlowLayout} phases={phases} onChange={setIpdFlowLayout} editing={editing} />}
 {nav === 'notify' && <NotifySettings config={notifyConfig} onChange={setNotifyConfig} editing={editing} />}
 {nav === 'recall' && <RecallSettings config={recallConfig} onChange={setRecallConfig} editing={editing} />}
 {nav === 'remediation' && <RemediationSettings issueType={remediationIssueType} onChange={setRemediationIssueType} editing={editing} />}
 </div>
 {editing && (
 <div style={S.saveBar}>
 <button style={S.btn(true, saving)} disabled={saving} onClick={handleSave}>{saving ? '保存中…' : '保存'}</button>
 <button style={S.btn(false)} onClick={() => { setEditing(false); loadConfig() }}>取消</button>
 {message && <span style={{ fontSize: 13, color: message.startsWith('') ? '#ff4d4f' : '#52c41a' }}>{message}</span>}
 </div>
 )}
 </div>
 )
}

// ============================================================
// 节点模板（动态可增删）
// ============================================================
const PhaseTemplates: React.FC<{ phases: any[]; allPhases: any[]; onChange: (v: any[]) => void; editing: boolean; reviewType: string }> = ({ phases, allPhases, onChange, editing, reviewType }) => {
 const RESOLUTION_PRESETS = reviewType === 'tr'
 ? ['通过', '有条件通过', '不通过', '返工', '否决']
 : ['通过', '有条件通过', '否决', '重新评审']

 function add() {
 const prefix = reviewType === 'tr' ? 'TR' : 'DCP'
 let maxNum = 0
 phases.forEach(p => {
 const m = (p.phase_code || '').match(new RegExp(`^${prefix}(\\d+)$`))
 if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
 })
 const nextCode = `${prefix}${maxNum + 1}`
 onChange([...phases, { phase_code: nextCode, phase_name: '', resolution_options: JSON.stringify(RESOLUTION_PRESETS.slice(0, 3)), resolution_template: '', dependencies: '[]', sort_order: phases.length }])
 }
 function update(idx: number, key: string, value: any) {
 const items = [...phases]; items[idx] = { ...items[idx], [key]: value }; onChange(items)
 }
 function toggleArrayItem(idx: number, key: string, item: string) {
 const arr = jsonArr(phases[idx][key] || '[]')
 const next = arr.includes(item) ? arr.filter((x: string) => x !== item) : [...arr, item]
 update(idx, key, JSON.stringify(next))
 }
 function remove(idx: number) { onChange(phases.filter((_, i) => i !== idx)) }

 function chipStyle(selected: boolean): React.CSSProperties {
 return {
 padding: '3px 10px', borderRadius: 4, fontSize: 12, userSelect: 'none',
 cursor: editing ? 'pointer' : 'default',
 background: selected ? '#e6f4ff' : '#f5f5f5',
 color: selected ? '#1677ff' : '#999',
 border: selected ? '1px solid #91caff' : '1px solid #e8e8e8',
 transition: 'all .15s',
 }
 }

 return (
 <div>
 <div style={S.sectionTitle}><span>{reviewType === 'tr' ? 'TR' : 'DCP'} 节点配置（{phases.length}个节点）</span>{editing && <button style={S.addBtn} onClick={add}>+ 添加节点</button>}</div>
 {phases.length === 0 ? <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>暂无节点配置，请点击「+ 添加节点」创建</div> :
 phases.map((p, i) => {
 const resOpts = jsonArr(p.resolution_options || '[]')
 const deps = jsonArr(p.dependencies || '[]')
 return (
 <div key={i} style={{ ...S.card, marginBottom: 12, background: '#fafafa' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
 <span style={{ fontWeight: 600, fontSize: 14 }}>{p.phase_code} · 阶段 {i + 1}</span>
 {editing && <button style={S.delBtn} onClick={() => remove(i)}>删除</button>}
 </div>
 <div style={S.row}>
 <span style={{ width: 80, fontSize: 12, color: '#666' }}>名称 *</span>
 <input style={S.input} value={p.phase_name || ''}
 onChange={e => update(i, 'phase_name', e.target.value)} placeholder="如：概念决策评审" disabled={!editing} />
 </div>
 <div style={S.row}>
 <span style={{ width: 80, fontSize: 12, color: '#666' }}>决议选项 *</span>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, alignItems: 'center' }}>
 {RESOLUTION_PRESETS.map(opt => {
 const sel = resOpts.includes(opt)
 return <span key={opt} style={chipStyle(sel)} onClick={() => editing && toggleArrayItem(i, 'resolution_options', opt)}>{opt}</span>
 })}
 {resOpts.length === 0 && editing && <span style={{ color: '#ff4d4f', fontSize: 11 }}>至少选1项</span>}
 </div>
 </div>
 <div style={S.row}>
 <span style={{ width: 80, fontSize: 12, color: '#666' }}>前置依赖</span>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>前置阶段的最终决议须为"通过"或"有条件通过"才能发起当前阶段评审</div>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
 {allPhases.filter(ap => ap.phase_code !== p.phase_code && ap.phase_name).length === 0 ? (
 <span style={{ fontSize: 12, color: '#bbb' }}>暂无其他已命名阶段可选</span>
 ) : allPhases.filter(ap => ap.phase_code !== p.phase_code).map(ap => {
 const sel = deps.includes(ap.phase_code)
 const tag = (ap.review_type || 'dcp') === 'tr' ? '' : ''
 return <span key={ap.phase_code} style={chipStyle(sel)} onClick={() => editing && toggleArrayItem(i, 'dependencies', ap.phase_code)}>{tag} {ap.phase_name}</span>
 })}
 </div>
 </div>
 </div>
 <div style={{ ...S.row, borderBottom: 'none' }}>
 <span style={{ width: 80, fontSize: 12, color: '#666' }}>模板文本</span>
 <textarea style={S.textarea} rows={3} value={p.resolution_template || ''}
 onChange={e => update(i, 'resolution_template', e.target.value)}
 placeholder="决议模板，可在生成决议时引用…" disabled={!editing} />
 </div>
 </div>
 )
 })
 }
 </div>
 )
}

// ============================================================
// 材料模板
// ============================================================
const MaterialTemplates: React.FC<{ items: any[]; onChange: (v: any[]) => void; editing: boolean; phaseObjs: { code: string; name: string }[] }> = ({ items, onChange, editing, phaseObjs }) => {
 function add() {
 onChange([...items, { material_name: '', applicable_phases: '[]', required: true, sort_order: items.length }])
 }
 function update(idx: number, key: string, value: any) {
 const list = [...items]; list[idx] = { ...list[idx], [key]: value }; onChange(list)
 }
 function updatePhases(idx: number, phs: string[]) { update(idx, 'applicable_phases', JSON.stringify(phs)) }
 function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)) }

 return (
 <div>
 <div style={S.sectionTitle}><span>材料模板（{items.length}项）</span>{editing && <button style={S.addBtn} onClick={add}>+ 添加</button>}</div>
 {items.length === 0 ? <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>暂无材料模板</div> :
 items.map((m, i) => (
 <div key={i} style={S.row}>
 <input style={{ ...S.input, flex: 2 }} value={m.material_name} onChange={e => update(i, 'material_name', e.target.value)} placeholder="材料名称" disabled={!editing} />
 <PhaseSelector selected={jsonArr(m.applicable_phases)} onChange={v => updatePhases(i, v)} disabled={!editing} phases={phaseObjs} />
 <label style={{ fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
 <input type="checkbox" checked={m.required} onChange={e => update(i, 'required', e.target.checked)} disabled={!editing} />必交
 </label>
 {editing && <button style={S.delBtn} onClick={() => remove(i)}>×</button>}
 </div>
 ))}
 </div>
 )
}

// ============================================================
// 指标模板
// ============================================================
const IndicatorTemplates: React.FC<{ items: any[]; onChange: (v: any[]) => void; editing: boolean; phaseObjs: { code: string; name: string }[] }> = ({ items, onChange, editing, phaseObjs }) => {
 function add() {
 onChange([...items, { indicator_name: '', applicable_phases: '[]', unit: '', threshold_type: '高于阈值预警', yellow_threshold: 0, red_threshold: 0, sort_order: items.length }])
 }
 function update(idx: number, key: string, value: any) {
 const list = [...items]; list[idx] = { ...list[idx], [key]: value }; onChange(list)
 }
 function updatePhases(idx: number, phs: string[]) { update(idx, 'applicable_phases', JSON.stringify(phs)) }
 function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)) }

 return (
 <div>
 <div style={S.sectionTitle}><span>指标模板（{items.length}项）</span>{editing && <button style={S.addBtn} onClick={add}>+ 添加</button>}</div>
 {items.length === 0 ? <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>暂无指标模板</div> :
 items.map((ind, i) => (
 <div key={i} style={S.row}>
 <input style={{ ...S.input, flex: 2 }} value={ind.indicator_name} onChange={e => update(i, 'indicator_name', e.target.value)} placeholder="指标名称" disabled={!editing} />
 <PhaseSelector selected={jsonArr(ind.applicable_phases)} onChange={v => updatePhases(i, v)} disabled={!editing} phases={phaseObjs} />
 <input style={{ ...S.input, width: 60 }} value={ind.unit} onChange={e => update(i, 'unit', e.target.value)} placeholder="单位" disabled={!editing} />
 <select style={S.select} value={ind.threshold_type} onChange={e => update(i, 'threshold_type', e.target.value)} disabled={!editing}>
 <option value="达标即通过">达标即通过</option><option value="高于阈值预警">高于阈值预警</option><option value="低于阈值预警">低于阈值预警</option>
 </select>
 <input type="number" style={{ ...S.input, width: 70 }} value={ind.yellow_threshold} onChange={e => update(i, 'yellow_threshold', parseFloat(e.target.value) || 0)} placeholder="黄" disabled={!editing} />
 <input type="number" style={{ ...S.input, width: 70 }} value={ind.red_threshold} onChange={e => update(i, 'red_threshold', parseFloat(e.target.value) || 0)} placeholder="红" disabled={!editing} />
 {editing && <button style={S.delBtn} onClick={() => remove(i)}>×</button>}
 </div>
 ))}
 </div>
 )
}

// ============================================================
// 评审角色
// ============================================================
const RoleRules: React.FC<{ items: any[]; onChange: (v: any[]) => void; editing: boolean }> = ({ items, onChange, editing }) => {
 function add() {
 onChange([...items, { role_name: '', must_vote: true, has_veto: false, sort_order: items.length }])
 }
 function update(idx: number, key: string, value: any) {
 const list = [...items]; list[idx] = { ...list[idx], [key]: value }; onChange(list)
 }
 function remove(idx: number) { onChange(items.filter((_, i) => i !== idx)) }

 return (
 <div>
 <div style={S.sectionTitle}>
 <span>评审角色配置（{items.length}个角色）</span>
 {editing && <button style={S.addBtn} onClick={add}>+ 添加角色</button>}
 </div>
 <div style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>配置评审角色名称及属性。「必投」=该角色必须指定评审人才能发起评审；「否决权」=该角色可否决决议</div>
 {items.length === 0 ? <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>暂无角色，请点击「+ 添加角色」创建</div> :
 items.map((r, i) => (
 <div key={i} style={{ ...S.row, justifyContent: 'flex-start' }}>
 <input style={{ ...S.input, width: 160, fontWeight: 500 }} value={r.role_name || ''}
 onChange={e => update(i, 'role_name', e.target.value)} placeholder="角色名称（如：Chair、TR负责人）" disabled={!editing} />
 <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginRight: 16 }}>
 <input type="checkbox" checked={r.must_vote} onChange={e => update(i, 'must_vote', e.target.checked)} disabled={!editing} />必投
 </label>
 <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginRight: 16 }}>
 <input type="checkbox" checked={r.has_veto} onChange={e => update(i, 'has_veto', e.target.checked)} disabled={!editing} />否决权
 </label>
 {editing && <button style={S.delBtn} onClick={() => remove(i)}>×</button>}
 </div>
 ))
 }
 </div>
 )
}

// ============================================================
// Checklist 配置面板
// ============================================================
const ChecklistConfigPanel: React.FC<{ items: any[]; roles: any[]; onChange: (v: any[]) => void; editing: boolean; phases: any[] }> = ({ items, roles, onChange, editing, phases }) => {
 const phaseList = phases.map((p: any) => ({ code: p.phase_code, name: p.phase_name || p.phase_code }))
 const [phaseIdx, setPhaseIdx] = useState(0)
 const [newItemText, setNewItemText] = useState('')
 const [newItemRole, setNewItemRole] = useState(roles[0]?.role_name || '')
 const phaseCode = phaseList[phaseIdx]?.code || ''

 function addItem() {
 if (!newItemText.trim() || !newItemRole) return
 const count = items.filter((i: any) => i.phase_code === phaseCode).length
 if (count >= 20) return // 每阶段上限20
 onChange([...items, {
 phase_code: phaseCode,
 role_name: newItemRole,
 item_text: newItemText.trim(),
 sort_order: count,
 }])
 setNewItemText('')
 }

 function removeItem(idx: number) {
 onChange(items.filter((_, i) => i !== idx))
 }

 // 按阶段过滤，按角色分组
 const phaseItems = items.filter((i: any) => i.phase_code === phaseCode)
 const grouped: Record<string, any[]> = {}
 for (const item of phaseItems) {
 if (!grouped[item.role_name]) grouped[item.role_name] = []
 grouped[item.role_name].push(item)
 }

 const roleNames = Object.keys(grouped)
 const totalInPhase = phaseItems.length

 return (
 <div>
 <h3 style={{ fontSize: 16, marginBottom: 16 }}>Checklist 配置</h3>
 <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>按阶段 → 角色组织检查项。每阶段上限 20 个。</div>
 {/* 阶段选择 */}
 <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
 {phaseList.map((p, i) => (
 <button key={p.code} onClick={() => setPhaseIdx(i)} style={{
 padding: '6px 16px', border: 'none', borderRadius: 4,
 background: phaseIdx === i ? '#1677ff' : '#f0f0f0', color: phaseIdx === i ? '#fff' : '#333',
 cursor: 'pointer', fontSize: 13, fontWeight: phaseIdx === i ? 600 : 400,
 }}>{p.name} ({items.filter((it: any) => it.phase_code === p.code).length})</button>
 ))}
 </div>

 {/* 按角色分组展示 */}
 {roleNames.length === 0 ? (
 <div style={{ color: '#999', padding: 20, textAlign: 'center' }}>该阶段暂无检查项</div>
 ) : (
 roleNames.map(rn => {
 const roleItems = grouped[rn]
 return (
 <div key={rn} style={{ marginBottom: 20 }}>
 <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{rn}</div>
 {roleItems.map((item, idx) => {
 const globalIdx = items.indexOf(item)
 return (
 <div key={idx} style={{ ...S.row, justifyContent: 'flex-start', paddingLeft: 8 }}>
 <span style={{ flex: 1, fontSize: 13 }}>☑ {item.item_text}</span>
 {editing && <button style={S.delBtn} onClick={() => removeItem(globalIdx)}>×</button>}
 </div>
 )
 })}
 </div>
 )
 })
 )}

 {/* 添加检查项 */}
 {editing && totalInPhase < 20 && (
 <div style={{ marginTop: 16, padding: '10px 12px', background: '#f9f9f9', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
 <select style={S.select} value={newItemRole} onChange={e => setNewItemRole(e.target.value)}>
 {roles.map((r: any) => <option key={r.role_name} value={r.role_name}>{r.role_name}</option>)}
 {roles.length === 0 && <option value="">无角色</option>}
 </select>
 <input style={{ ...S.input, flex: 2 }} value={newItemText} onChange={e => setNewItemText(e.target.value)} placeholder="输入检查项描述…" onKeyDown={e => e.key === 'Enter' && addItem()} />
 <button style={S.btn(true)} onClick={addItem}>+ 添加</button>
 </div>
 )}
 {editing && totalInPhase >= 20 && (
 <div style={{ marginTop: 16, color: '#faad14', fontSize: 12 }}>该阶段已达 20 项上限</div>
 )}
 </div>
 )
}

// ============================================================
// 阶段多选组件
// ============================================================
const PhaseSelector: React.FC<{ selected: string[]; onChange: (v: string[]) => void; disabled?: boolean; phases: { code: string; name: string }[] }> = ({ selected, onChange, disabled, phases }) => {
 const [open, setOpen] = useState(false)
 const ref = React.useRef<HTMLDivElement>(null)
 function toggle(code: string) {
 if (disabled) return
 if (selected.includes(code)) onChange(selected.filter(p => p !== code))
 else onChange([...selected, code])
 }
 // 选中项的名称展示
 const selectedNames = selected.map(code => phases.find(p => p.code === code)?.name || code)
 // 点击外部关闭
 useEffect(() => {
 if (!open || disabled) return
 function handleClick(e: MouseEvent) {
 if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
 }
 document.addEventListener('mousedown', handleClick)
 return () => document.removeEventListener('mousedown', handleClick)
 }, [open, disabled])
 return (
 <div ref={ref} style={{ position: 'relative', minWidth: 120 }}>
 <div onClick={() => { if (!disabled) setOpen(!open) }} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 12, cursor: disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: disabled ? '#f5f5f5' : '#fff', color: disabled ? '#999' : '#333' }}>
 {selectedNames.length > 0 ? selectedNames.join(', ') : <span style={{ color: '#999' }}>选择阶段</span>}
 </div>
 {open && !disabled && (
 <div style={{ position: 'absolute', top: 32, left: 0, background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4, padding: 8, zIndex: 100, minWidth: 160, boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
 {phases.map(p => (
 <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', cursor: 'pointer', fontSize: 12 }}>
 <input type="checkbox" checked={selected.includes(p.code)} onChange={() => toggle(p.code)} />{p.name}
 </label>
 ))}
 </div>
 )}
 </div>
 )
}

// ============================================================
// 通知设置
// ============================================================
const NOTIFY_CHANNELS = [
 { key: 'email', label: '📧 邮件' },
 { key: 'wechat', label: '💬 企业微信' },
 { key: 'dingtalk', label: '📌 钉钉' },
 { key: 'feishu', label: '🐦 飞书' },

 { key: 'youdao', label: '🔷 有度' },
]

const NotifySettings: React.FC<{ config: any; onChange: (c: any) => void; editing: boolean }> = ({ config, onChange, editing }) => {
 const c = config || {}
 const ch = c.channels || {}
 function toggle(key: string) {
 if (!editing) return
 if (key === 'on_manual_remind') {
   const cur = c.on_manual_remind !== false
   onChange({ ...c, on_manual_remind: !cur })
   return
 }
 onChange({ ...c, [key]: !c[key] })
 }
 function toggleChannel(key: string) {
 if (!editing) return
 onChange({ ...c, channels: { ...ch, [key]: !ch[key] } })
 }
 const prefix = editing ? '' : ''
 return (
 <div>
 <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{prefix} 通知设置 {editing ? '— 编辑中' : '— 只读'}</div>
 {!editing && <div style={{ marginBottom: 16, color: '#999', fontSize: 12 }}>点击右上角「配置」进入编辑模式后可修改</div>}

 {/* 全局开关 */}
 <div style={{ marginBottom: 20, padding: 12, background: '#f9f9f9', borderRadius: 8 }}>
 <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: editing ? 'pointer' : 'default', fontWeight: 600, fontSize: 14 }}>
 <input type="checkbox" checked={!!c.enabled} onChange={() => toggle('enabled')} disabled={!editing} />
 启用通知
 </label>
 <div style={{ marginTop: 4, color: '#999', fontSize: 12, marginLeft: 26 }}>关闭后所有通知均不发送</div>
 </div>

 {/* 通知场景 */}
 <div style={{ marginBottom: 20 }}>
 <div style={{ fontWeight: 600, marginBottom: 8 }}>通知场景</div>
 <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: editing ? 'pointer' : 'default' }}>
 <input type="checkbox" checked={!!c.on_review_start} onChange={() => toggle('on_review_start')} disabled={!editing} />
 发起评审时通知评审人
 </label>
 <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: editing ? 'pointer' : 'default' }}>
 <input type="checkbox" checked={!!c.on_all_submitted} onChange={() => toggle('on_all_submitted')} disabled={!editing} />
 全体评审人提交后通知决议发布人
 </label>
 <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: editing ? 'pointer' : 'default' }}>
 <input type="checkbox" checked={!!c.on_resolution} onChange={() => toggle('on_resolution')} disabled={!editing} />
 决议发布后通知创建者及评审人
 </label>
 <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: editing ? 'pointer' : 'default' }}>
 <input type="checkbox" checked={c.on_manual_remind !== false} onChange={() => toggle('on_manual_remind')} disabled={!editing} />
 允许手动催办（评审发起人催办评审人/决议人）
 </label>
 </div>

 {/* 催办冷却时间 */}
 <div style={{ marginBottom: 20 }}>
 <div style={{ fontWeight: 600, marginBottom: 8 }}>催办冷却时间</div>
 <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <select style={S.select} value={String(c.remind_cooldown_seconds || 60)} disabled={!editing}
 onChange={e => onChange({ ...c, remind_cooldown_seconds: parseInt(e.target.value) })}>
 <option value="60">1 分钟</option>
 <option value="300">5 分钟</option>
 <option value="600">10 分钟</option>
 </select>
 <span style={{ color: '#999', fontSize: 12 }}>同一评审单同一类型催办的最短间隔</span>
 </div>
 </div>

 {/* 通知渠道 */}
 <div style={{ marginBottom: 20 }}>
 <div style={{ fontWeight: 600, marginBottom: 8 }}>通知渠道</div>
 <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>注：需要 ONES 管理员先完成对应三方系统的集成配置</div>
 {NOTIFY_CHANNELS.map(item => (
 <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: editing ? 'pointer' : 'default' }}>
 <input type="checkbox" checked={!!ch[item.key]} onChange={() => toggleChannel(item.key)} disabled={!editing} />
 {item.label}
 </label>
 ))}
 </div>
 </div>
 )
}

// ============================================================
// 评审撤回设置
// ============================================================
const RecallSettings: React.FC<{ config: any; onChange: (c: any) => void; editing: boolean }> = ({ config, onChange, editing }) => {
 const c = config || {}
 function toggle(key: string) {
   if (!editing) return
   onChange({ ...c, [key]: !c[key] })
 }
 return (
 <div>
   <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>评审撤回设置 {editing ? '— 编辑中' : '— 只读'}</div>
   {!editing && <div style={{ marginBottom: 16, color: '#999', fontSize: 12 }}>点击右上角「配置」进入编辑模式后可修改</div>}

   <div style={{ marginBottom: 20, padding: 12, background: '#f9f9f9', borderRadius: 8 }}>
     <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: editing ? 'pointer' : 'default', fontWeight: 600, fontSize: 14 }}>
       <input type="checkbox" checked={!!c.enabled} onChange={() => toggle('enabled')} disabled={!editing} />
       允许发起人撤回已发起评审
     </label>
     <div style={{ marginTop: 4, color: '#999', fontSize: 12, marginLeft: 26 }}>
       开启后，评审发起人可以在评审中且未发布决议时撤回评审，撤回后回到草稿状态
     </div>
   </div>

   <div style={{ marginBottom: 20 }}>
     <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: editing ? 'pointer' : 'default' }}>
       <input type="checkbox" checked={!!c.requireReason} onChange={() => toggle('requireReason')} disabled={!editing} />
       撤回时必须填写原因
     </label>
     <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: editing ? 'pointer' : 'default' }}>
       <input type="checkbox" checked={!!c.clearSubmittedOpinions} onChange={() => toggle('clearSubmittedOpinions')} disabled={!editing} />
       撤回时清空已提交评审意见和 Checklist
     </label>
   </div>

   <div style={{ padding: '8px 12px', borderRadius: 4, fontSize: 12, background: '#fff7e6', color: '#faad14' }}>
     ⚠ 撤回后评审单回到草稿状态，已提交的评审意见、Checklist 状态将被清空，评审人待办和决议待办将失效。
   </div>
 </div>
 )
}

// ============================================================
// 整改设置
// ============================================================
const RemediationSettings: React.FC<{ issueType: string; onChange: (v: string) => void; editing: boolean }> = ({ issueType, onChange, editing }) => {
 return (
 <div>
 <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>整改设置 {editing ? '— 编辑中' : '— 只读'}</div>
 {!editing && <div style={{ marginBottom: 16, color: '#999', fontSize: 12 }}>点击右上角「配置」进入编辑模式后可修改</div>}

 <div style={{ marginBottom: 20, padding: 12, background: '#f9f9f9', borderRadius: 8 }}>
 <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>整改工作项默认类型</label>
 <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
   评审决议为「有条件通过」或「返工」后，在整改项区域创建整改工作项时，默认使用此类型。留空则不预填。
 </div>
 <input style={S.input} value={issueType} onChange={e => onChange(e.target.value)} placeholder="如：任务" disabled={!editing} />
 </div>

 <div style={{ padding: '8px 12px', borderRadius: 4, fontSize: 12, background: '#e6f4ff', color: '#1677ff' }}>
   配置后，评审详情页整改区域创建工作项时将自动预填此类型且不可更改。
 </div>
 </div>
 )
}

// ============================================================
// IPD 流程图布局配置
// ============================================================
const IpdFlowLayoutConfig: React.FC<{ layout: any; phases: any[]; onChange: (v: any) => void; editing: boolean }> = ({ layout, phases, onChange, editing }) => {
 if (!layout) return <div style={{ color: '#999', padding: 20 }}>加载中…</div>
 const stages: any[] = layout.stages || []
 const markers: any[] = layout.markers || []
 const allPhases = phases || []

 function updateStages(newStages: any[]) { onChange({ ...layout, stages: newStages }) }
 function updateMarkers(newMarkers: any[]) { onChange({ ...layout, markers: newMarkers }) }

 function addStage() {
 updateStages([...stages, { code: `stage_${stages.length + 1}`, name: '新阶段', shape: 'rect', widthRatio: 1 }])
 }
 function addMarker() {
 updateMarkers([...markers, { phaseCode: allPhases[0]?.phase_code || '', reviewType: 'dcp', stage: stages[0]?.code || '', position: 0.5, side: 'top', shape: 'diamond' }])
 }

 return (
 <div>
 <div style={S.sectionTitle}><span>主阶段带配置（{stages.length}个）</span>{editing && <button style={S.addBtn} onClick={addStage}>+ 添加主阶段</button>}</div>
 {stages.map((st, i) => (
 <div key={i} style={{ ...S.row, gap: 6, flexWrap: 'wrap' as any }}>
 <input style={{ ...S.input, width: 100 }} value={st.code} disabled={!editing} onChange={e => { const a = [...stages]; a[i] = { ...st, code: e.target.value }; updateStages(a) }} placeholder="code" />
 <input style={{ ...S.input, width: 100 }} value={st.name} disabled={!editing} onChange={e => { const a = [...stages]; a[i] = { ...st, name: e.target.value }; updateStages(a) }} placeholder="名称" />
 <select style={S.select} value={st.shape} disabled={!editing} onChange={e => { const a = [...stages]; a[i] = { ...st, shape: e.target.value }; updateStages(a) }}>
 <option value="taper">收窄段</option>
 <option value="rect">矩形段</option>
 </select>
 <input style={{ ...S.input, width: 70 }} type="number" step="0.1" value={st.widthRatio} disabled={!editing} onChange={e => { const a = [...stages]; a[i] = { ...st, widthRatio: parseFloat(e.target.value) || 1 }; updateStages(a) }} />
 {editing && <button style={S.delBtn} onClick={() => updateStages(stages.filter((_, j) => j !== i))}>×</button>}
 </div>
 ))}

 <div style={{ ...S.sectionTitle, marginTop: 20 }}><span>节点挂载配置（{markers.length}个）</span>{editing && <button style={S.addBtn} onClick={addMarker}>+ 添加节点</button>}</div>
 <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>phaseCode 必须来自已有节点模板，stage 必须来自上方主阶段。position 表示节点在所属主阶段中的相对位置，范围 0-1（0=阶段起点，0.5=阶段中点，1=阶段终点）。</div>
 {markers.map((m, i) => (
 <div key={i} style={{ ...S.row, gap: 6, flexWrap: 'wrap' as any }}>
 <select style={S.select} value={m.phaseCode} disabled={!editing} onChange={e => { const a = [...markers]; a[i] = { ...m, phaseCode: e.target.value }; updateMarkers(a) }}>
 <option value="">选择节点</option>
 {allPhases.map(p => <option key={p.phase_code} value={p.phase_code}>{p.phase_name || p.phase_code}</option>)}
 </select>
 <select style={S.select} value={m.stage} disabled={!editing} onChange={e => { const a = [...markers]; a[i] = { ...m, stage: e.target.value }; updateMarkers(a) }}>
 <option value="">选择阶段</option>
 {stages.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
 </select>
 <select style={S.select} value={m.side} disabled={!editing} onChange={e => { const a = [...markers]; a[i] = { ...m, side: e.target.value }; updateMarkers(a) }}>
 <option value="top">上方</option>
 <option value="bottom">下方</option>
 </select>
 <input style={{ ...S.input, width: 70 }} type="number" step="0.1" min="0" max="1" value={m.position} disabled={!editing} onChange={e => { const a = [...markers]; a[i] = { ...m, position: parseFloat(e.target.value) || 0 }; updateMarkers(a) }} />
 {editing && <button style={S.delBtn} onClick={() => updateMarkers(markers.filter((_, j) => j !== i))}>×</button>}
 </div>
 ))}
 </div>
 )
}

// ============================================================
// 决议规则配置（resolution_rule_config）
// DCP/TR 分别配置：发布人角色、提交要求、通过规则、可选决议结果
// ============================================================
const ALL_CONCLUSIONS = [
 { value: 'pass', label: '通过' },
 { value: 'conditional_pass', label: '有条件通过' },
 { value: 'reject', label: '❌ 驳回' },
 { value: 'fail', label: '不通过' },
 { value: 'rework', label: '返工' },
]

const ResolutionRuleConfig: React.FC<{ rules: any; roles: any[]; onChange: (v: any) => void; editing: boolean; reviewType: 'dcp' | 'tr' }> = ({ rules, roles, onChange, editing, reviewType }) => {
 const rule = rules[reviewType] || {
 publisher: { mode: 'single_role', role: '' },
 submitRequirement: { mode: 'must_vote_roles' },
 passRule: { mode: reviewType === 'tr' ? 'all_required_submitted' : 'min_approval_count', minCount: 3, excludeRoles: [], approvalConclusions: ['pass', 'conditional_pass'], rejectOnAnyVeto: reviewType === 'tr' },
 allowedConclusions: reviewType === 'tr' ? ['pass', 'conditional_pass', 'fail', 'rework'] : ['pass', 'conditional_pass', 'reject'],
 }
 const typeRoles = roles.filter((r: any) => (r.review_type || 'dcp') === reviewType)
 const typeLabel = reviewType === 'dcp' ? 'DCP 决策评审' : 'TR 技术评审'

 function update(path: string, value: any) {
 const newRule = JSON.parse(JSON.stringify(rule))
 const parts = path.split('.')
 let cur = newRule
 for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]]
 cur[parts[parts.length - 1]] = value
 onChange({ ...rules, [reviewType]: newRule })
 }

 function toggleArrayItem(path: string, item: string) {
 const arr = path.split('.').reduce((obj: any, key) => obj[key], rule) as string[]
 const has = arr.includes(item)
 update(path, has ? arr.filter(x => x !== item) : [...arr, item])
 }

 const chipStyle = (sel: boolean): React.CSSProperties => ({
 display: 'inline-block', padding: '3px 10px', margin: '2px 4px 2px 0', borderRadius: 4, fontSize: 12,
 cursor: editing ? 'pointer' : 'default', border: `1px solid ${sel ? '#1677ff' : '#d9d9d9'}`,
 background: sel ? '#e6f4ff' : '#fafafa', color: sel ? '#1677ff' : '#666',
 })

 return (
 <div>
 <h3 style={{ ...S.sectionTitle, fontSize: 16 }}>{typeLabel} — 决议规则配置</h3>
 <div style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>
 配置 {reviewType.toUpperCase()} 评审的决议发布权限、提交要求、通过规则和可选决议结果。修改后需保存生效。
 </div>

 {/* 1. 决议角色（单选） */}
 <div style={{ marginBottom: 20, padding: 12, background: '#fafafa', borderRadius: 4 }}>
 <div style={{ fontWeight: 600, marginBottom: 8 }}>决议角色</div>
 <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
 每条评审单只能有 1 名决议人。这里选择决议角色；具体决议人由评审单中该角色对应的人员决定。
 </div>
 <div>
 {typeRoles.length === 0 && <span style={{ color: '#ff4d4f', fontSize: 12 }}>请先在「评审角色」中配置{reviewType.toUpperCase()}角色</span>}
 {typeRoles.map((r: any) => {
   const sel = (rule.publisher?.role || '') === r.role_name
   return (
   <span key={r.role_name} style={chipStyle(sel)}
   onClick={() => editing && update('publisher.role', sel ? '' : r.role_name)}>
   {r.role_name}{r.must_vote ? ' (必投)' : ''}{r.has_veto ? ' (否决)' : ''}
   </span>
   )
 })}
 </div>
 </div>

 {/* 2. 发布前提交要求 */}
 <div style={{ marginBottom: 20, padding: 12, background: '#fafafa', borderRadius: 4 }}>
 <div style={{ fontWeight: 600, marginBottom: 8 }}>发布前提交要求</div>
 <select style={S.select} value={rule.submitRequirement?.mode || 'must_vote_roles'} disabled={!editing}
   onChange={e => update('submitRequirement.mode', e.target.value)}>
   <option value="must_vote_roles">必投角色全部提交</option>
   <option value="all_reviewers">全部评审人提交</option>
   <option value="vote_scope_roles">计票范围内角色全部提交</option>
   <option value="publisher_only">仅要求发布人存在（不校验其他人）</option>
 </select>
 </div>

 {/* 3. 通过规则 */}
 <div style={{ marginBottom: 20, padding: 12, background: '#fafafa', borderRadius: 4 }}>
   <div style={{ fontWeight: 600, marginBottom: 8 }}>通过规则（最终决议为「通过」时的校验）</div>
   <select style={S.select} value={rule.passRule?.mode || 'min_approval_count'} disabled={!editing}
     onChange={e => update('passRule.mode', e.target.value)}>
     <option value="min_approval_count">至少 N 人通过/有条件通过</option>
     <option value="all_required_approved">必投角色全部通过/有条件通过</option>
     <option value="all_required_submitted">仅校验已提交（不强制通过数）</option>
   </select>
   {(rule.passRule?.mode || 'min_approval_count') === 'min_approval_count' && (
     <>
       <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
         <label style={{ fontSize: 12 }}>最少通过人数：</label>
         <input style={{ ...S.input, width: 80 }} type="number" min="1" value={rule.passRule?.minCount || 3} disabled={!editing}
           onChange={e => update('passRule.minCount', parseInt(e.target.value) || 3)} />
       </div>
       {/* 计票范围 */}
       <div style={{ marginTop: 8 }}>
         <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>计票范围：</label>
         <select style={S.select} value={rule.passRule?.voteScope?.mode || 'must_vote_roles'} disabled={!editing}
           onChange={e => update('passRule.voteScope.mode', e.target.value)}>
           <option value="must_vote_roles">仅必投角色</option>
           <option value="all_reviewers">所有评审人</option>
           <option value="selected_roles">指定角色</option>
         </select>
       </div>
       {/* 指定角色多选 */}
       {(rule.passRule?.voteScope?.mode || 'must_vote_roles') === 'selected_roles' && (
         <div style={{ marginTop: 8 }}>
           <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>指定计票角色：</label>
           <span>
             {typeRoles.map((r: any) => (
               <span key={r.role_name} style={chipStyle((rule.passRule?.voteScope?.selectedRoles || []).includes(r.role_name))}
                 onClick={() => editing && toggleArrayItem('passRule.voteScope.selectedRoles', r.role_name)}>{r.role_name}</span>
             ))}
           </span>
         </div>
       )}
       {/* 从计票范围中排除角色 */}
       <div style={{ marginTop: 8 }}>
         <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>从计票范围中排除以下角色：</label>
         <span>
           {typeRoles.map((r: any) => (
             <span key={r.role_name} style={chipStyle((rule.passRule?.voteScope?.excludeRoles || []).includes(r.role_name))}
               onClick={() => editing && toggleArrayItem('passRule.voteScope.excludeRoles', r.role_name)}>{r.role_name}</span>
           ))}
         </span>
       </div>
       {/* 实时可达性提示 */}
       {(() => {
         const mode = rule.passRule?.voteScope?.mode || 'must_vote_roles'
         const exclude = rule.passRule?.voteScope?.excludeRoles || []
         const selected = rule.passRule?.voteScope?.selectedRoles || []
         let scopeCount = 0
         if (mode === 'all_reviewers') scopeCount = typeRoles.length
         else if (mode === 'selected_roles') scopeCount = typeRoles.filter((r: any) => selected.includes(r.role_name)).length
         else scopeCount = typeRoles.filter((r: any) => r.must_vote).length
         scopeCount -= typeRoles.filter((r: any) => exclude.includes(r.role_name) && (mode === 'all_reviewers' || (mode === 'must_vote_roles' && r.must_vote) || (mode === 'selected_roles' && selected.includes(r.role_name)))).length
         const minCount = rule.passRule?.minCount || 3
         if (scopeCount <= 0) return <div style={{ marginTop: 6, fontSize: 12, color: '#ff4d4f' }}>⚠ 当前计票范围内没有可计票角色</div>
         if (minCount > scopeCount) return <div style={{ marginTop: 6, fontSize: 12, color: '#ff4d4f' }}>⚠ 当前计票范围内最多 {scopeCount} 个角色可计票，不能要求至少 {minCount} 人通过</div>
         return <div style={{ marginTop: 6, fontSize: 12, color: '#52c41a' }}>✓ 当前计票范围 {scopeCount} 个角色可计票，要求 ≥{minCount} 人通过</div>
       })()}
     </>
   )}
   <div style={{ marginTop: 8 }}>
     <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: editing ? 'pointer' : 'default' }}>
       <input type="checkbox" checked={!!rule.passRule?.rejectOnAnyVeto} disabled={!editing}
         onChange={e => update('passRule.rejectOnAnyVeto', e.target.checked)} />
       启用否决权角色一票否决（否决权角色投反对票时，不可决议为「通过」）
     </label>
   </div>
 </div>

 {/* 4. 可选决议结果 */}
 <div style={{ marginBottom: 20, padding: 12, background: '#fafafa', borderRadius: 4 }}>
 <div style={{ fontWeight: 600, marginBottom: 8 }}>🎯 可选最终决议结果</div>
 <div style={{ color: '#999', fontSize: 12, marginBottom: 8 }}>
 勾选当前{reviewType.toUpperCase()}评审允许的最终决议结果。未勾选的选项不会在发布决议时显示。
 </div>
 <div>
 {ALL_CONCLUSIONS.map(c => (
 <span key={c.value} style={chipStyle((rule.allowedConclusions || []).includes(c.value))}
 onClick={() => editing && toggleArrayItem('allowedConclusions', c.value)}>{c.label}</span>
 ))}
 </div>
 </div>

 {!editing && (
 <div style={{ padding: '8px 12px', borderRadius: 4, fontSize: 12, background: '#f0f5ff', color: '#1677ff' }}>
 点击右上角「编辑」修改决议规则配置
 </div>
 )}
 </div>
 )
}

ReactDOM.render(<App />, document.getElementById('ones-mf-root'))

export { App as ConfigPage }
