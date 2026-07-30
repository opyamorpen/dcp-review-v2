#!/usr/bin/env python3
"""Manual content part 4 - Notifications, Issues, Audit, FAQ, API Reference."""
from build_manual import ManualPDF

def build_content_p4(pdf: ManualPDF):
    # ===== Chapter 8: Notifications =====
    pdf.add_page()
    pdf.section_title('8. Notifications & Reminders')

    pdf.sub_title('Automated Notifications')
    pdf.body('The plugin sends automated notifications at key review events:')
    pdf.bullet('Review Start: All assigned reviewers are notified when a review transitions to "reviewing" state.')
    pdf.bullet('All Opinions Submitted: The resolution publisher is notified when prerequisites are met.')
    pdf.bullet('Resolution Published: All reviewers are notified of the final decision.')
    pdf.body(
        'Notifications are sent through the ONES Notify API supporting Email, WeChat, '
        'DingTalk, Feishu (Lark), and YouDao channels. Each channel can be individually '
        'enabled/disabled. The notification includes a direct link to the review.'
    )

    pdf.sub_title('Manual Reminders')
    pdf.body(
        'From the review detail page, authorized users can manually trigger reminders:'
    )
    pdf.bullet('Remind Reviewers: Send a nudge to reviewers who have not yet submitted opinions.')
    pdf.bullet('Remind Resolution Publisher: Send a nudge when reviews are awaiting resolution.')
    pdf.body('A cooldown mechanism prevents spam (configurable cooldown in seconds).')

    # ===== Chapter 9: Linked Issues & Remediation =====
    pdf.section_title('9. Linked Issues & Remediation Work Items')

    pdf.sub_title('General Linked Issues')
    pdf.body(
        'Reviews can be linked to existing ONES work items (issues) for traceability:'
    )
    pdf.bullet('Search and link existing issues by UUID or number.')
    pdf.bullet('View linked issues with real-time status synchronization.')
    pdf.bullet('Each link records: issue UUID, number, title, type, status, linker, and timestamp.')
    pdf.bullet('Links are tagged with round_no for multi-round tracking.')

    pdf.sub_title('Creating New Work Items')
    pdf.body('From within a review, users can create new ONES work items:')
    pdf.bullet('Select issue type from project-scoped type list.')
    pdf.bullet('Enter title and assignee.')
    pdf.bullet('The new issue is automatically linked to the review.')
    pdf.bullet('Fallback URL is provided if direct creation fails (e.g., cross-origin restrictions).')

    pdf.sub_title('Remediation Work Items')
    pdf.body(
        'Remediation items are a special class of linked issues with link_type = "remediation":'
    )
    pdf.bullet('Created after resolution publication to track corrective actions.')
    pdf.bullet('Status changes are monitored via ONES event hooks.')
    pdf.bullet('When all remediation items reach "done" status, the review can enter re-review.')
    pdf.bullet('Remediation items are not locked and continue to follow normal ONES work item permissions.')
    pdf.bullet('Re-review is blocked until every remediation item is authoritatively confirmed complete.')

    # ===== Chapter 10: Audit Trail =====
    pdf.section_title('10. Audit Trail')

    pdf.body(
        'Every significant action on a review is logged in the audit trail:'
    )
    pdf.bullet('Review creation, deletion, and recreation.')
    pdf.bullet('Status transitions and state changes.')
    pdf.bullet('Material submissions and status updates.')
    pdf.bullet('Indicator updates.')
    pdf.bullet('Reviewer assignments and opinion submissions.')
    pdf.bullet('Resolution generation and publication.')
    pdf.bullet('Issue linking and remediation tracking.')
    pdf.bullet('Supplement notes added.')
    pdf.body(
        'Each audit entry records: timestamp, operator UUID, action type, target, detail, '
        'and result (success/failure). The audit log is accessible from the review detail page '
        'under the "Audit" tab and sorted chronologically.'
    )

    pdf.sub_title('Immutable Records')
    pdf.body(
        'Resolutions are immutable audit records. Once published, a resolution snapshots: '
        'all reviewer votes, checklist results, indicator values, and linked issues at that '
        'point in time. This creates an unalterable record for compliance and governance.'
    )

    # ===== Chapter 11: FAQ =====
    pdf.add_page()
    pdf.section_title('11. FAQ & Troubleshooting')

    pdf.sub_title('Q: Can I change templates after a review is created?')
    pdf.body(
        'Yes, template changes apply to new reviews only. Existing reviews use frozen (snapshotted) '
        'templates from the moment of creation. This is by design to ensure auditability.'
    )

    pdf.sub_title('Q: Why is the "Publish Resolution" button disabled?')
    pdf.body(
        'The resolution prerequisites are not met. Check: (1) Are all required reviewers submitted? '
        '(2) Does the submit requirement mode require specific roles? (3) Are you the authorized '
        'publisher role? The system clearly indicates what is missing.'
    )

    pdf.sub_title('Q: How do I handle a failed/rejected review?')
    pdf.body(
        'A rejected review can be recreated using the "Recreate" button. This copies the review '
        'configuration (reviewers, materials, indicators) into a new draft with the latest templates '
        'and a new review number. The original review remains in the audit trail.'
    )

    pdf.sub_title('Q: What happens when I recall a review?')
    pdf.body(
        'Depending on recall configuration, recalling a review may clear submitted opinions '
        'and return the review to draft state. The recall is logged in the audit trail. '
        'Recalling is only possible if enabled in settings and before resolution is published.'
    )

    pdf.sub_title('Q: How are multi-round reviews tracked?')
    pdf.body(
        'When remediation triggers a re-review, the round_no increments. Reviewer opinions, '
        'resolutions, materials, and linked issues are all tagged with round_no. The "Compare Rounds" '
        'tab in the review detail shows side-by-side comparison between rounds.'
    )

    pdf.sub_title('Q: What if I cannot see the DCP Review tab in my project?')
    pdf.body(
        'Ensure: (1) The plugin is installed at organization level, (2) The project custom component '
        'is configured with the DCP Review component, (3) You have the dcp_create_review permission.'
    )

    pdf.sub_title('Q: How do I configure who can publish resolutions?')
    pdf.body(
        'In Template Configuration > Resolution Rules, set the "Publisher" role for each review type '
        '(DCP and TR). Only reviewers assigned to that role will see the resolution publishing controls.'
    )

    pdf.sub_title('Q: Can I delete a review?')
    pdf.body(
        'Only reviews in "draft" state can be deleted. Only the original creator can delete. '
        'Deletion removes the review and all associated sub-entities (materials, indicators, reviewers, '
        'linked issues, audit logs).'
    )

    pdf.sub_title('Q: What are the supported notification channels?')
    pdf.body(
        'Email, WeChat (WeCom), DingTalk, Feishu (Lark), and YouDao. Each can be individually '
        'toggled in Notification Settings. Notifications include direct links to the review page.'
    )

    # ===== Chapter 12: Appendix =====
    pdf.add_page()
    pdf.section_title('12. Appendix: API Reference')

    pdf.body(
        'The plugin exposes external APIs for integration. All endpoints are prefixed with '
        '/team/:teamUUID/dcp/ and use the ONES plugin routing system.'
    )

    pdf.sub_title('Configuration APIs')
    apis_config = [
        ('GET /dcp/config', 'Get all plugin configuration (templates, rules, settings)'),
        ('POST /dcp/config', 'Save plugin configuration (admin only)'),
    ]
    for method, desc in apis_config:
        pdf.bullet(f'{method}: {desc}')

    pdf.sub_title('Review CRUD')
    apis_review = [
        ('POST /dcp/review', 'Create a new review'),
        ('GET /dcp/review/:review_uuid', 'Get full review detail with all sub-entities'),
        ('DELETE /dcp/review/:review_uuid', 'Delete a draft review (creator only)'),
        ('POST /dcp/review/:review_uuid/recreate', 'Recreate from rejected review'),
        ('GET /dcp/reviews/by-project/:project_uuid', 'List reviews for a project'),
        ('GET /dcp/reviews/team', 'List all team reviews (for overview)'),
        ('GET /dcp/reviews/my', 'List reviews for current user (reviewer workspace)'),
        ('POST /dcp/review/:review_uuid/basic-info', 'Update review basic info'),
    ]
    for method, desc in apis_review:
        pdf.bullet(f'{method}: {desc}')

    pdf.sub_title('Review Workflow')
    apis_wf = [
        ('POST /dcp/review/:review_uuid/start', 'Start review (draft -> reviewing)'),
        ('POST /dcp/review/:review_uuid/recall', 'Recall review to draft'),
        ('POST /dcp/review/:review_uuid/transition', 'Execute state machine transition'),
        ('GET /dcp/review/:review_uuid/state', 'Get current review state and available transitions'),
        ('GET /dcp/review/:review_uuid/rounds', 'Get all round data for comparison'),
    ]
    for method, desc in apis_wf:
        pdf.bullet(f'{method}: {desc}')

    pdf.sub_title('Materials')
    apis_mat = [
        ('POST /dcp/review/:review_uuid/material-status', 'Update material submit status'),
        ('POST /dcp/review/:review_uuid/material-upload', 'Upload material file'),
        ('POST /dcp/review/:review_uuid/material-remove', 'Remove material file'),
        ('GET /dcp/review/:review_uuid/material/:template_id/upload-url', 'Get upload URL'),
        ('GET /dcp/review/:review_uuid/material/:template_id/download-url', 'Get download URL'),
        ('GET /dcp/review/:review_uuid/material/:template_id/preview', 'Preview material file'),
    ]
    for method, desc in apis_mat:
        pdf.bullet(f'{method}: {desc}')

    pdf.sub_title('Indicators, Reviewers, Opinions')
    apis_other = [
        ('POST /dcp/review/:review_uuid/indicators', 'Update indicator values'),
        ('POST /dcp/review/:review_uuid/reviewers', 'Update reviewer assignments'),
        ('POST /dcp/review/:review_uuid/opinion', 'Submit or update review opinion'),
    ]
    for method, desc in apis_other:
        pdf.bullet(f'{method}: {desc}')

    pdf.sub_title('Linked Issues & Remediation')
    apis_issues = [
        ('POST /dcp/review/:review_uuid/link-issue', 'Link an existing issue to review'),
        ('GET /dcp/review/:review_uuid/linked-issues', 'Get all linked issues'),
        ('POST /dcp/review/:review_uuid/create-issue', 'Create and link a new issue'),
        ('GET /dcp/review/:review_uuid/remediation', 'Get remediation issues'),
        ('POST /dcp/review/:review_uuid/remediation/refresh', 'Refresh remediation statuses'),
        ('POST /dcp/review/:review_uuid/remediation/sync', 'Sync remediation statuses'),
        ('POST /dcp/review/:review_uuid/remediation/confirm', 'Confirm remediation complete'),
    ]
    for method, desc in apis_issues:
        pdf.bullet(f'{method}: {desc}')

    pdf.sub_title('Resolution & Audit')
    apis_res = [
        ('POST /dcp/review/:review_uuid/generate-resolution', 'Generate resolution draft'),
        ('POST /dcp/review/:review_uuid/publish-resolution', 'Publish final resolution'),
        ('POST /dcp/review/:review_uuid/supplement', 'Add supplemental note'),
        ('GET /dcp/review/:review_uuid/audit-log', 'Get full audit trail'),
        ('POST /dcp/review/:review_uuid/checklist', 'Submit checklist results'),
        ('POST /dcp/review/:review_uuid/remind', 'Send reminder notification'),
    ]
    for method, desc in apis_res:
        pdf.bullet(f'{method}: {desc}')

    pdf.sub_title('Data Entities')
    entities = [
        'dcp_base_config: Global key-value configuration',
        'dcp_phase_template: Phase definitions with dependencies',
        'dcp_material_template: Material requirements per phase',
        'dcp_indicator_template: Indicator definitions with thresholds',
        'dcp_reviewer_role: Reviewer role definitions',
        'dcp_checklist_item: Checklist items per phase/role',
        'dcp_review: Main review record with state machine fields',
        'dcp_review_material: Per-review material instances',
        'dcp_review_indicator: Per-review indicator values',
        'dcp_review_reviewer: Per-review reviewer assignments and votes',
        'dcp_linked_issue: Linked work items',
        'dcp_resolution: Published resolution records (immutable)',
        'dcp_supplement: Supplemental notes',
        'dcp_audit_log: Action audit trail',
        'dcp_checklist_result: Checklist check results',
    ]
    for e in entities:
        pdf.bullet(e)

    pdf.ln(10)
    pdf.body(
        '--- End of Manual ---\n'
        'DCP Review Center v1.29.0\n'
        'ONES Plugin (app_id: 709xehle)\n'
        'For support, contact your system administrator or the plugin maintainer.'
    )

    print("Content part 4 built")
