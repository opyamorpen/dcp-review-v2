import React from 'react'
import { getTeamUUID } from '../../api'

const S = {
  card: { background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e8e8e8', marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 600, marginBottom: 12 },
  input: { padding: '4px 8px', borderRadius: 4, border: '1px solid #d9d9d9', fontSize: 13, width: '100%', boxSizing: 'border-box' as any },
  btn: (p: boolean, d = false) => ({ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: d ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, background: p ? '#1677ff' : '#f0f0f0', color: p ? '#fff' : '#333', opacity: d ? 0.6 : 1 }),
  td: { padding: '6px 10px', borderBottom: '1px solid #f0f0f0', fontSize: 13 },
  th: { padding: '8px 10px', borderBottom: '2px solid #e8e8e8', fontSize: 12, color: '#666', fontWeight: 600, textAlign: 'left' as any },
  table: { width: '100%', borderCollapse: 'collapse' as any },
  tableWrap: { overflowX: 'auto' as any },
}

const STATUS_LABELS: Record<string, string> = {
  open: '待处理', in_progress: '进行中', done: '✅ 已完成', closed: '已关闭',
}
const STATUS_COLORS: Record<string, string> = {
  open: '#faad14', in_progress: '#1677ff', done: '#52c41a', closed: '#999',
}

export const RemediationPanel: React.FC<{
  data: any
  effState: string
  currentUser: { uuid: string; name: string }
  isCreator: boolean
  isPublisher: boolean
  remediationIssueType: string
  projectUuid: string
  remediationMsg: string
  remediationRefreshing: boolean
  remediationConfirming: boolean
  showRemediationConfirm: boolean
  showCreateRemediation: boolean
  showLinkRemediation: boolean
  createRemediationForm: { title: string }
  linkRemediationForm: { issue_uuid: string; issue_number: string; issue_title: string }
  creatingRemediation: boolean
  linkingRemediation: boolean
  onRefresh: () => void
  onSetCreateRemediationForm: (v: { title: string }) => void
  onSetLinkRemediationForm: (v: { issue_uuid: string; issue_number: string; issue_title: string }) => void
  onSetShowCreateRemediation: (v: boolean) => void
  onSetShowLinkRemediation: (v: boolean) => void
  onSetShowRemediationConfirm: (v: boolean) => void
  onCreateRemediation: () => void
  onLinkRemediation: () => void
  onRefreshRemediation: () => void
  onConfirmRemediation: (nextAction: 'complete' | 're_review') => void
  onSetRemediationMsg: (v: string) => void
}> = (props) => {
  const { data, effState, isCreator, isPublisher } = props
  const issues: any[] = data.remediation_issues || []
  const allDone = data.remediation_all_done
  const isRemediationPhase = effState === 'remediation_pending'

  // 整改项列表
  const issueRows = issues.map((iss: any, i: number) => {
    const st = iss.issue_status || 'open'
    return (
      <tr key={i}>
        <td style={S.td}>{iss.issue_number || '-'}</td>
        <td style={S.td}>{iss.issue_title || '-'}</td>
        <td style={S.td}>{iss.issue_type || '-'}</td>
        <td style={S.td}><span style={{ color: STATUS_COLORS[st] || '#999' }}>{STATUS_LABELS[st] || st}</span></td>
        <td style={S.td}>{iss.locked === 'locked' ? '🔒 已锁定' : '—'}</td>
      </tr>
    )
  })

  return (
    <div>
      <div style={S.sectionTitle}>
        整改工作项
        {isRemediationPhase && issues.length > 0 && (
          <button style={{ ...S.btn(false), marginLeft: 12, fontSize: 12 }} onClick={props.onRefreshRemediation} disabled={props.remediationRefreshing}>
            {props.remediationRefreshing ? '刷新中…' : '刷新状态'}
          </button>
        )}
      </div>

      {props.remediationMsg && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 4, fontSize: 13, background: '#fff2f0', color: '#cf1322' }}>{props.remediationMsg}</div>
      )}

      {issues.length === 0 ? (
        <div style={{ color: '#999', padding: 24, textAlign: 'center', background: '#fafafa', borderRadius: 8, marginBottom: 16 }}>
          暂无整改工作项
          {isRemediationPhase && (
            <div style={{ marginTop: 8 }}>
              <button style={S.btn(true)} onClick={() => { props.onSetShowCreateRemediation(true); props.onSetRemediationMsg('') }}>+ 创建整改项</button>
              <button style={{ ...S.btn(false), marginLeft: 8 }} onClick={() => { props.onSetShowLinkRemediation(true); props.onSetRemediationMsg('') }}>关联已有工作项</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead><tr>
                <th style={S.th}>编号</th><th style={S.th}>标题</th><th style={S.th}>类型</th><th style={S.th}>状态</th><th style={S.th}>锁定</th>
              </tr></thead>
              <tbody>{issueRows}</tbody>
            </table>
          </div>

          {isRemediationPhase && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={S.btn(true)} onClick={() => { props.onSetShowCreateRemediation(true); props.onSetRemediationMsg('') }}>+ 创建整改项</button>
              <button style={S.btn(false)} onClick={() => { props.onSetShowLinkRemediation(true); props.onSetRemediationMsg('') }}>关联已有工作项</button>
            </div>
          )}

          {/* 整改完成确认 */}
          {isRemediationPhase && allDone && isPublisher && !props.showRemediationConfirm && (
            <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>所有整改项已完成，请确认整改结果：</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...S.btn(true), background: '#52c41a' }} onClick={() => props.onConfirmRemediation('complete')} disabled={props.remediationConfirming}>
                  {props.remediationConfirming ? '处理中…' : '确认完成，评审通过'}
                </button>
                <button style={{ ...S.btn(true), background: '#2f54eb' }} onClick={() => props.onSetShowRemediationConfirm(true)}>发起复审</button>
              </div>
            </div>
          )}

          {isRemediationPhase && !allDone && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 4, fontSize: 13, background: '#fff7e6', color: '#fa8c16' }}>
              部分整改项尚未完成，完成后可确认闭环或发起复审
            </div>
          )}

          {props.showRemediationConfirm && (
            <div style={{ marginTop: 16, padding: 12, background: '#e6f4ff', borderRadius: 8, border: '1px solid #91caff' }}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>确认发起复审？评审人提交状态将重置，进入新一轮评审。</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...S.btn(true), background: '#2f54eb' }} onClick={() => props.onConfirmRemediation('re_review')} disabled={props.remediationConfirming}>
                  {props.remediationConfirming ? '处理中…' : '确认发起复审'}
                </button>
                <button style={S.btn(false)} onClick={() => { props.onSetShowRemediationConfirm(false); props.onSetRemediationMsg('') }}>取消</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* 创建整改项表单 */}
      {props.showCreateRemediation && (
        <div style={{ ...S.card, marginTop: 16, background: '#f0f5ff' }}>
          <div style={S.sectionTitle}>创建整改工作项</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>标题 *</label>
            <input style={S.input} value={props.createRemediationForm.title}
              onChange={e => props.onSetCreateRemediationForm({ title: e.target.value })}
              placeholder="整改项标题" disabled={props.creatingRemediation} />
          </div>
          {props.remediationIssueType && (
            <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>类型将自动预填：{props.remediationIssueType}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btn(true)} onClick={props.onCreateRemediation} disabled={props.creatingRemediation}>
              {props.creatingRemediation ? '创建中…' : '创建'}
            </button>
            <button style={S.btn(false)} onClick={() => { props.onSetShowCreateRemediation(false); props.onSetRemediationMsg('') }}>取消</button>
          </div>
        </div>
      )}

      {/* 关联已有工作项表单 */}
      {props.showLinkRemediation && (
        <div style={{ ...S.card, marginTop: 16, background: '#f0f5ff' }}>
          <div style={S.sectionTitle}>关联已有工作项</div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>工作项 UUID *</label>
            <input style={S.input} value={props.linkRemediationForm.issue_uuid}
              onChange={e => props.onSetLinkRemediationForm({ ...props.linkRemediationForm, issue_uuid: e.target.value })}
              placeholder="工作项 UUID" disabled={props.linkingRemediation} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>编号</label>
              <input style={S.input} value={props.linkRemediationForm.issue_number}
                onChange={e => props.onSetLinkRemediationForm({ ...props.linkRemediationForm, issue_number: e.target.value })}
                placeholder="如 TASK-123" disabled={props.linkingRemediation} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>标题</label>
              <input style={S.input} value={props.linkRemediationForm.issue_title}
                onChange={e => props.onSetLinkRemediationForm({ ...props.linkRemediationForm, issue_title: e.target.value })}
                placeholder="工作项标题" disabled={props.linkingRemediation} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={S.btn(true)} onClick={props.onLinkRemediation} disabled={props.linkingRemediation}>
              {props.linkingRemediation ? '关联中…' : '关联'}
            </button>
            <button style={S.btn(false)} onClick={() => { props.onSetShowLinkRemediation(false); props.onSetRemediationMsg('') }}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
