#!/usr/bin/env python3
"""HTML content part 3 - Issues, Audit, FAQ, API Reference."""

def h2(text): return f'<h2>{text}</h2>'
def h3(text): return f'<h3>{text}</h3>'
def p(text): return f'<p>{text}</p>'
def note(text): return f'<div class="note">{text}</div>'
def li(text): return f'<li>{text}</li>'
def ul(items): return '<ul>' + ''.join(li(i) for i in items) + '</ul>'
def page_break(): return '<div class="break"></div>'

sections = []

# ==== Chapter 9: Linked Issues ====
sections.append(page_break() + h2('9. Linked Issues & Remediation / 关联工作项与整改'))

sections.append(h3('General Linked Issues / 关联工作项'))
sections.append(ul([
    'Search and link existing ONES issues by UUID or number.',
    'Real-time status synchronization.',
    'Each link records: UUID, number, title, type, status, linker, timestamp.',
    'Tagged with round_no for multi-round tracking.',
]))

sections.append(h3('Creating New Work Items / 新建工作项'))
sections.append(ul([
    'Select issue type from project-scoped list.',
    'Enter title and assignee.',
    'Auto-linked to review.',
    'Fallback URL if direct creation fails.',
]))

sections.append(h3('Remediation Work Items / 整改工作项'))
sections.append(ul([
    'Special linked issues with link_type = remediation.',
    'Created after resolution to track corrective actions.',
    'Status changes monitored via ONES event hooks.',
    'All done -> review can enter re-review.',
    'Items are not locked; incomplete or unknown status blocks re-review.',
]))

# ==== Chapter 10: Audit Trail ====
sections.append(page_break() + h2('10. Audit Trail / 审计追溯'))
sections.append(p('Every significant action is logged:'))
sections.append(ul([
    'Review creation, deletion, recreation.',
    'Status transitions and state changes.',
    'Material submissions and updates.',
    'Indicator updates.',
    'Reviewer assignments and opinion submissions.',
    'Resolution generation and publication.',
    'Issue linking and remediation tracking.',
    'Supplement notes.',
]))
sections.append(p('Each entry records: timestamp, operator UUID, action, target, detail, result. Accessible from the Audit tab in review detail.'))
sections.append(note('Resolutions are immutable audit records. Once published, they snapshot all votes, checklist results, indicators, and linked issues — creating an unalterable compliance record.'))

# ==== Chapter 11: FAQ ====
sections.append(page_break() + h2('11. FAQ & Troubleshooting / 常见问题'))

faqs = [
    ('Can I change templates after review creation?',
     'Yes, template changes apply only to new reviews. Existing reviews use frozen snapshots from creation time for auditability.'),
    ('Why is "Publish Resolution" disabled?',
     'Prerequisites not met. Check: required reviewers submitted, submit requirement mode, publisher role authorization. System shows what is missing.'),
    ('How to handle a failed/rejected review?',
     'Use "Recreate" button. Copies config into new draft with latest templates and new review number. Original review stays in audit trail.'),
    ('What happens when I recall a review?',
     'Depending on settings: may clear opinions and return to draft. Only allowed if enabled and before resolution. Logged in audit trail.'),
    ('How are multi-round reviews tracked?',
     'round_no increments on re_reviewing. All entities tagged with round_no. "Compare Rounds" tab shows side-by-side comparison.'),
    ('Cannot see DCP Review tab in project?',
     'Ensure: plugin installed at org level, project custom component configured with DCP Review, you have dcp_create_review permission.'),
    ('How to configure resolution publisher?',
     'Template Config > Resolution Rules > set Publisher role per review type (DCP/TR). Only that role sees publishing controls.'),
    ('Can I delete a review?',
     'Only draft reviews. Only original creator. Deletion removes all sub-entities (materials, indicators, reviewers, issues, logs).'),
    ('What notification channels are supported?',
     'Email, WeChat (WeCom), DingTalk, Feishu (Lark), YouDao. Each individually toggled. Include direct review links.'),
]
for q, a in faqs:
    sections.append(h3(f'{q}'))
    sections.append(p(a))

# ==== Chapter 12: API Reference ====
sections.append(page_break() + h2('12. Appendix: API Reference / 附录：API 参考'))
sections.append(p('All endpoints: /team/:teamUUID/dcp/... managed through ONES plugin routing.'))

sections.append(h3('Configuration / 配置'))
sections.append(ul(['GET /dcp/config - Get all configuration', 'POST /dcp/config - Save config (admin only)']))

sections.append(h3('Review CRUD / 评审单管理'))
sections.append(ul([
    'POST /dcp/review - Create review',
    'GET /dcp/review/:uuid - Get full detail',
    'DELETE /dcp/review/:uuid - Delete draft (creator only)',
    'POST /dcp/review/:uuid/recreate - Recreate from rejected',
    'GET /dcp/reviews/by-project/:puuid - List by project',
    'GET /dcp/reviews/team - List all team reviews',
    'GET /dcp/reviews/my - List current user reviews',
    'POST /dcp/review/:uuid/basic-info - Update basic info',
]))

sections.append(h3('Review Workflow / 评审流程'))
sections.append(ul([
    'POST /dcp/review/:uuid/start - Start (draft->reviewing)',
    'POST /dcp/review/:uuid/recall - Recall to draft',
    'POST /dcp/review/:uuid/transition - State transition',
    'GET /dcp/review/:uuid/state - Get state + transitions',
    'GET /dcp/review/:uuid/rounds - Get round comparison data',
]))

sections.append(h3('Materials / 材料管理'))
sections.append(ul([
    'POST /dcp/review/:uuid/material-status - Update status',
    'POST /dcp/review/:uuid/material-upload - Upload file',
    'POST /dcp/review/:uuid/material-remove - Remove file',
    'GET /dcp/review/:uuid/material/:tid/upload-url - Upload URL',
    'GET /dcp/review/:uuid/material/:tid/download-url - Download URL',
    'GET /dcp/review/:uuid/material/:tid/preview - Preview file',
]))

sections.append(h3('Reviewers, Indicators, Opinions / 评审人、指标、意见'))
sections.append(ul([
    'POST /dcp/review/:uuid/indicators - Update indicators',
    'POST /dcp/review/:uuid/reviewers - Update reviewers',
    'POST /dcp/review/:uuid/opinion - Submit opinion',
]))

sections.append(h3('Issues & Remediation / 工作项与整改'))
sections.append(ul([
    'POST /dcp/review/:uuid/link-issue - Link existing issue',
    'GET /dcp/review/:uuid/linked-issues - List linked issues',
    'POST /dcp/review/:uuid/create-issue - Create and link',
    'GET /dcp/review/:uuid/remediation - Get remediation items',
    'POST /dcp/review/:uuid/remediation/refresh - Refresh statuses',
    'POST /dcp/review/:uuid/remediation/sync - Sync statuses',
    'POST /dcp/review/:uuid/remediation/confirm - Confirm complete',
]))

sections.append(h3('Resolution & Audit / 决议与审计'))
sections.append(ul([
    'POST /dcp/review/:uuid/generate-resolution - Generate draft resolution',
    'POST /dcp/review/:uuid/publish-resolution - Publish final resolution',
    'POST /dcp/review/:uuid/supplement - Add supplemental note',
    'GET /dcp/review/:uuid/audit-log - Get audit trail',
    'POST /dcp/review/:uuid/checklist - Submit checklist results',
    'POST /dcp/review/:uuid/remind - Send reminder',
]))

sections.append(h3('Data Entities / 数据实体'))
sections.append(ul([
    'dcp_base_config: Global key-value configuration',
    'dcp_phase_template: Phase definitions with dependencies',
    'dcp_material_template: Material requirements per phase',
    'dcp_indicator_template: Indicator definitions with thresholds',
    'dcp_reviewer_role: Reviewer role definitions',
    'dcp_checklist_item: Checklist items per phase/role',
    'dcp_checklist_result: Checklist check results',
    'dcp_review: Main review record with state machine',
    'dcp_review_material: Per-review material instances',
    'dcp_review_indicator: Per-review indicator values',
    'dcp_review_reviewer: Per-review reviewer votes',
    'dcp_linked_issue: Linked work items',
    'dcp_resolution: Published resolutions (immutable)',
    'dcp_supplement: Supplemental notes',
    'dcp_audit_log: Action audit trail',
]))

print("HTML content part 3 ready")
