#!/usr/bin/env python3
"""HTML content part 2 - Templates and Lifecycle sections."""

def h2(text): return f'<h2>{text}</h2>'
def h3(text): return f'<h3>{text}</h3>'
def p(text): return f'<p>{text}</p>'
def note(text): return f'<div class="note">{text}</div>'
def li(text): return f'<li>{text}</li>'
def ul(items): return '<ul>' + ''.join(li(i) for i in items) + '</ul>'
def page_break(): return '<div class="break"></div>'

sections = []

# ==== Chapter 4: Templates ====
sections.append(page_break() + h2('4. Managing Review Templates / 管理评审模板'))
sections.append(p(
    'All templates configured through DCP Review Center sidebar. Templates are organized '
    'by review type (DCP/TR) and frozen at review creation for audit consistency.'
))

sections.append(h3('4.1 Phase Templates / 节点模板'))
sections.append(p('Phases define IPD checkpoints. Each phase has:'))
sections.append(ul([
    'Phase Code: Unique ID (e.g., DCP1, TR3).',
    'Phase Name: Human-readable label.',
    'Resolution Options: Available resolutions for this phase.',
    'Resolution Template: Default resolution text.',
    'Sort Order: Display ordering.',
    'Dependencies: Prerequisite phases that must be completed first.',
    'Review Type: DCP or TR association.',
]))
sections.append(p('Default phases: DCP1-DCP5 (concept→release) and TR1-TR6 (parallel technical reviews).'))

sections.append(h3('4.2 Material Templates / 材料模板'))
sections.append(p('Materials are documents/files required for review submission:'))
sections.append(ul([
    'Material Name: Document name.',
    'Applicable Phases: Which phases require this material.',
    'Required Flag: Whether mandatory.',
    'Responsible Role: Role accountable for submission.',
    'Sort Order: Display ordering.',
]))

sections.append(h3('4.3 Indicator Templates / 指标模板'))
sections.append(p('Quantitative metrics with threshold-based risk assessment:'))
sections.append(ul([
    'Indicator Name + Unit.',
    'Threshold Type: "Above threshold alerts" or "Below threshold alerts".',
    'Yellow Threshold: Warning level.',
    'Red Threshold: Critical level.',
    'Applicable Phases.',
]))
sections.append(p('Auto color-coded: green (ok), yellow (warning), red (critical). Frozen at creation.'))

sections.append(h3('4.4 Reviewer Roles / 评审角色'))
sections.append(ul([
    'Role Name: e.g., Chair, R&D VP, Marketing VP, Finance Rep, QA Rep, Supply Chain Rep.',
    'Must Vote: Whether required to vote before resolution.',
    'Has Veto: Whether this role can veto a "pass" resolution.',
]))
sections.append(p('Default roles initialized on first activation: Chair (veto), R&D VP, Marketing VP, Finance Rep (veto), QA Rep (veto), Supply Chain Rep.'))

sections.append(h3('4.5 Checklist Templates / 检查清单'))
sections.append(p('Role-specific verification items organized by phase and role. Each item is checked/unchecked during review and snapshotted in resolution records.'))

sections.append(h3('4.6 Resolution Rules / 决议规则'))
sections.append(p('Configured separately for DCP and TR. Validated for reachability before saving.'))
sections.append(ul([
    'Publisher: Role authorized to publish final resolution.',
    'Submit Requirement: Who must submit before resolution (must-vote roles / all reviewers / vote-scope roles / publisher only).',
    'Pass Rule: Min approval count OR all required approved OR all required submitted.',
    'Reject on Veto: Veto role rejection blocks "pass".',
    'Vote Scope: Which roles count (must-vote / selected / all reviewers).',
    'Allowed Conclusions: pass, conditional_pass, fail, rework, reject.',
]))
sections.append(p('DCP default: pass/conditional_pass/reject, min 3 approvals (excluding Chair), veto blocks pass. TR default: pass/conditional_pass/fail/rework, all must-vote submitted.'))

sections.append(h3('4.7 IPD Flow Diagram / IPD 流程图'))
sections.append(p('Visual pipeline: Concept → Plan → Develop → Confirm → Release. Diamond = DCP (top), Triangle = TR (bottom). Fully configurable layout and markers.'))

sections.append(h3('4.8 Notification Settings / 通知设置'))
sections.append(ul([
    'Master enable/disable toggle.',
    'On Review Start: Notify reviewers.',
    'On All Submitted: Notify resolution publisher.',
    'On Resolution: Notify all reviewers.',
    'Channels: Email, WeChat, DingTalk, Feishu, YouDao (individual toggles).',
]))

sections.append(h3('4.9 Recall Settings / 撤回设置'))
sections.append(ul([
    'Enabled toggle.',
    'Allowed Before Resolution: Only recall before resolution published.',
    'Require Reason: Force reason input.',
    'Clear Opinions: Whether to clear existing opinions on recall.',
]))

sections.append(h3('4.10 Remediation Settings / 整改设置'))
sections.append(p('Configure the ONES issue type for remediation work items (default: Task).'))

# ==== Chapter 5: Review Lifecycle ====
sections.append(page_break() + h2('5. Review Lifecycle / 评审生命周期'))

sections.append(h3('5.1 Creating a Review / 创建评审单'))
sections.append(ul([
    'Navigate to project > DCP Review tab > New Review.',
    'Select review type (DCP/TR) and phase. Dependencies are checked.',
    'Enter title and optional meeting time.',
    'System auto-generates unique review number (e.g., PROJ2026070701 or TR-PROJ2026070701).',
    'Templates are snapshotted (resolution rules, roles, checklist).',
    'Materials and indicators auto-populated from matching templates.',
    'Initial state: Draft.',
]))

sections.append(h3('5.2 Configuring Materials / 配置评审材料'))
sections.append(ul([
    'Status: Pending / Submitted / Approved / Needs Revision (color-coded).',
    'Upload single file OR multiple attachments per material template.',
    'Free-text notes per material.',
    'Inline preview and download for files/attachments.',
    'Required materials must be submitted for review completion.',
]))

sections.append(h3('5.3 Setting Indicators / 填写评审指标'))
sections.append(ul([
    'Enter current value for each metric.',
    'Auto-calculated risk color (green/yellow/red) based on frozen thresholds.',
    'Add contextual notes.',
]))

sections.append(h3('5.4 Managing Reviewers / 管理评审人'))
sections.append(ul([
    'Select role from configured list.',
    'Search team members by name/email.',
    'Assign member to role, remove or reassign before review starts.',
    'Reviewer list is snapshotted for audit.',
]))

sections.append(h3('5.5 Submitting Opinions / 提交评审意见'))
sections.append(ul([
    'Conclusion: Pass / Conditional Pass / Fail / Rework.',
    'Risk level: Low / Medium / High.',
    'Opinion summary with detailed feedback.',
    'Opinions are editable until resolution is published.',
    'Each submission tagged with round_no for multi-round support.',
]))

sections.append(h3('5.6 Publishing Resolutions / 发布决议'))
sections.append(ul([
    'Only authorized publisher role (typically Chair) can publish.',
    'System validates prerequisites based on frozen resolution rules.',
    'Select final conclusion from allowed list.',
    'Optional conditional notes for Conditional Pass.',
    'Resolution snapshots all votes, checklist results, indicators, linked issues.',
    'Veto enforcement: veto role rejection blocks "pass".',
    'Resolutions are immutable once published.',
]))

sections.append(h3('5.7 Remediation & Closure / 整改与闭环'))
sections.append(ul([
    'Create remediation work items after resolution publication.',
    'Items are ONES issues with link_type = remediation.',
    'Status changes monitored via event hooks.',
    'When all remediation items done: publisher confirms completion -> Completed state.',
    'Or trigger re-review -> re_reviewing state with new round.',
    'Remediation items are locked (cannot delete while locked).',
]))

sections.append(h3('5.8 Round Comparison / 多轮对比'))
sections.append(p('Compare Rounds tab shows side-by-side: reviewer opinions, resolution conclusions, indicator values, material statuses across review rounds.'))

# ==== Chapter 6: State Machine ====
sections.append(page_break() + h2('6. State Machine & Transitions / 状态机与流转'))
sections.append(p('Complete state machine for review lifecycle. Each review has review_state (fine-grained) + backward-compatible status field.'))

sections.append(h3('States / 状态列表'))
sections.append(ul([
    'draft: Initial state, freely editable.',
    'ready: Configured and ready to start.',
    'reviewing: Active review, reviewers submitting opinions.',
    'awaiting_resolution: Prerequisites met, waiting for publisher.',
    'resolution_published: Resolution has been published.',
    'remediation_pending: Tracking remediation work items.',
    're_reviewing: New round after remediation.',
    'completed: Successfully completed.',
    'rejected: Review was rejected.',
    'canceled: Review withdrawn.',
    'archived: Long-term storage (terminal).',
]))

sections.append(h3('Valid Transitions / 合法流转'))
sections.append(ul([
    'draft -> ready, reviewing, canceled',
    'ready -> reviewing, draft, canceled',
    'reviewing -> awaiting_resolution, remediation_pending, draft, canceled',
    'awaiting_resolution -> resolution_published, remediation_pending, reviewing, canceled',
    'resolution_published -> completed, rejected, remediation_pending',
    'remediation_pending -> re_reviewing, canceled',
    're_reviewing -> awaiting_resolution, canceled',
    'completed -> archived',
    'rejected -> draft, archived',
    'canceled -> archived, draft, reviewing',
]))

sections.append(note('Each transition is recorded in state_history_json (up to 100 entries) with timestamp, operator, reason, and round number.'))

sections.append(h3('Round Tracking / 轮次追踪'))
sections.append(ul([
    'round_no: Current round (starts at 1, increments on re_reviewing).',
    'round_state: Per-round state.',
    'Opinions, resolutions, materials, issues all tagged with round_no.',
]))

# ==== Chapter 7: Permissions ====
sections.append(page_break() + h2('7. Permissions / 权限管理'))
sections.append(ul([
    'dcp_admin: Modify templates, rules, global config (Template Config page).',
    'dcp_create_review: Create DCP/TR reviews in projects.',
    'dcp_view_review: Access team-wide review overview dashboard.',
]))
sections.append(p('Permissions checked via ONES batch_check API. Server-side enforcement: operator identity from Ones-User-Id header.'))

# ==== Chapter 8: Notifications ====
sections.append(h2('8. Notifications & Reminders / 通知与催办'))
sections.append(h3('Automated Notifications / 自动通知'))
sections.append(ul([
    'Review Start: All reviewers notified on reviewing state.',
    'All Submitted: Publisher notified when prerequisites met.',
    'Resolution Published: All reviewers notified of final decision.',
    'Channels: Email, WeChat, DingTalk, Feishu, YouDao.',
]))
sections.append(h3('Manual Reminders / 手动催办'))
sections.append(ul([
    'Remind Reviewers: Nudge unsubmitted reviewers.',
    'Remind Publisher: Nudge when awaiting resolution.',
    'Cooldown mechanism prevents spam.',
]))

print("HTML content part 2 ready")