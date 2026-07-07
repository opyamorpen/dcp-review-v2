#!/usr/bin/env python3
"""Manual content part 2 - Templates and Configuration."""
from build_manual import ManualPDF

def build_content_p2(pdf: ManualPDF):
    # ===== Chapter 4: Managing Review Templates =====
    pdf.add_page()
    pdf.section_title('4. Managing Review Templates')
    pdf.body(
        'All templates are configured through the DCP Review Center sidebar under '
        '"Template Configuration". Templates are organized by review type (DCP / TR) '
        'and are snapshotted (frozen) at the moment a review is created to ensure '
        'auditability and prevent mid-review configuration changes from affecting '
        'ongoing reviews.'
    )

    pdf.sub_title('4.1 Phase Templates')
    pdf.body(
        'Phases define the checkpoints in the IPD lifecycle. Each phase has:'
    )
    pdf.bullet('Phase Code: Unique identifier (e.g., DCP1, TR3).')
    pdf.bullet('Phase Name: Human-readable label.')
    pdf.bullet('Resolution Options: Available resolutions for this phase (comma-separated).')
    pdf.bullet('Resolution Template: Default resolution text template.')
    pdf.bullet('Sort Order: Display ordering in lists.')
    pdf.bullet('Dependencies: List of phase codes that must be completed before this phase can start.')
    pdf.bullet('Review Type: Associates the phase with DCP or TR review type.')
    pdf.body(
        'Default phases include: DCP1-DCP5 (concept, plan, develop, confirm, release) '
        'and TR1-TR6 (corresponding technical reviews at each stage).'
    )

    pdf.sub_title('4.2 Material Templates')
    pdf.body('Materials are documents or files required for review submission. Each material template defines:')
    pdf.bullet('Material Name: Descriptive name for the required document.')
    pdf.bullet('Applicable Phases: Which phases require this material.')
    pdf.bullet('Required Flag: Whether this material is mandatory for review.')
    pdf.bullet('Responsible Role: The review role accountable for submitting this material.')
    pdf.bullet('Sort Order: Display ordering.')
    pdf.bullet('Review Type: DCP or TR.')

    pdf.sub_title('4.3 Indicator Templates')
    pdf.body('Indicators are quantitative metrics with threshold-based risk assessment:')
    pdf.bullet('Indicator Name: Metric name (e.g., "Schedule Variance %").')
    pdf.bullet('Unit: Measurement unit.')
    pdf.bullet('Threshold Type: "Above threshold alerts" or "Below threshold alerts".')
    pdf.bullet('Yellow Threshold: Value at which status turns yellow (warning).')
    pdf.bullet('Red Threshold: Value at which status turns red (critical).')
    pdf.bullet('Applicable Phases: Which phases use this indicator.')
    pdf.body(
        'Indicators are automatically color-coded: green (within threshold), '
        'yellow (warning zone), red (critical zone). Colors are calculated when '
        'indicators are submitted and recalculated on review recreation.'
    )

    pdf.sub_title('4.4 Reviewer Roles')
    pdf.body('Reviewer roles define the voting structure of the review committee:')
    pdf.bullet('Role Name: e.g., Chair, R&D VP, Marketing VP, Finance Rep, QA Rep, Supply Chain Rep.')
    pdf.bullet('Must Vote: Whether this role is required to submit a vote before resolution.')
    pdf.bullet('Has Veto: Whether this role can veto a "pass" resolution.')
    pdf.bullet('Sort Order: Display ordering.')
    pdf.body(
        'Default roles are initialized on first plugin activation: Chair (veto), '
        'R&D VP, Marketing VP, Finance Rep (veto), QA Rep (veto), Supply Chain Rep.'
    )

    pdf.sub_title('4.5 Checklist Templates')
    pdf.body('Checklists are role-specific verification items:')
    pdf.bullet('Phase Code: The phase this checklist belongs to.')
    pdf.bullet('Role Name: The role responsible for checking this item.')
    pdf.bullet('Item Text: The verification question or check item.')
    pdf.bullet('Sort Order: Display ordering.')
    pdf.body(
        'During review, each checklist item can be marked as checked/unchecked '
        'by the responsible role. Results are snapshotted in resolution records.'
    )

    pdf.sub_title('4.6 Resolution Rules')
    pdf.body(
        'Resolution rules define how final decisions are made. Rules are configured '
        'separately for DCP and TR review types and are validated for reachability '
        'before being saved.'
    )
    pdf.body('Each rule set includes:')
    pdf.bullet('Publisher: The role authorized to publish the final resolution (e.g., Chair).')
    pdf.bullet('Submit Requirement: Who must submit opinions before resolution. Options:')
    pdf.bullet('Must-vote roles only (default)', indent=10)
    pdf.bullet('All reviewers', indent=10)
    pdf.bullet('Vote-scope roles only', indent=10)
    pdf.bullet('Publisher only (no prerequisite)', indent=10)
    pdf.bullet('Pass Rule: Conditions for a "pass" resolution:')
    pdf.bullet('Min Approval Count: Require N approvals from vote-scope roles.', indent=10)
    pdf.bullet('All Required Approved: All must-vote roles must approve.', indent=10)
    pdf.bullet('All Required Submitted: All must-vote roles must submit (any conclusion).', indent=10)
    pdf.bullet('Reject on Any Veto: Veto role rejections block "pass" resolution.')
    pdf.bullet('Vote Scope: Which roles count toward the pass rule (must-vote roles, selected roles, or all reviewers).')
    pdf.bullet('Allowed Conclusions: Which final resolutions are available (pass, conditional_pass, fail, rework, reject).')
    pdf.body(
        'DCP defaults: pass/conditional_pass/reject, min 3 approvals from must-vote roles (excluding Chair), veto blocks pass. '
        'TR defaults: pass/conditional_pass/fail/rework, all must-vote submitted, veto blocks pass.'
    )

    pdf.sub_title('4.7 IPD Flow Diagram')
    pdf.body(
        'The IPD Flow Diagram visualizes review checkpoints on a development pipeline '
        'with five stages: Concept, Plan, Develop, Confirm, Release. Diamond markers '
        'represent DCP checkpoints (top) and triangle markers represent TR checkpoints '
        '(bottom). The layout and marker positions are fully configurable.'
    )

    pdf.sub_title('4.8 Notification Settings')
    pdf.body('Configure automated notifications for review events:')
    pdf.bullet('Enable/Disable: Master toggle for all notifications.')
    pdf.bullet('On Review Start: Notify reviewers when a review is initiated.')
    pdf.bullet('On All Submitted: Notify the resolution publisher when all prerequisites are met.')
    pdf.bullet('On Resolution: Notify all reviewers when a resolution is published.')
    pdf.bullet('Channels: Email, WeChat, DingTalk, Feishu (Lark), YouDao (individual toggles).')

    pdf.sub_title('4.9 Recall Settings')
    pdf.body('Configure review recall behavior:')
    pdf.bullet('Enabled: Whether reviews can be recalled after being started.')
    pdf.bullet('Allowed Before Resolution: Recall only allowed before resolution is published.')
    pdf.bullet('Require Reason: Force a reason when recalling.')
    pdf.bullet('Clear Submitted Opinions: Whether to clear existing opinions on recall.')

    pdf.sub_title('4.10 Remediation Settings')
    pdf.body('Configure the issue type used for remediation work items:')
    pdf.bullet('Remediation Issue Type: The ONES issue type for tracking corrective actions (default: Task).')

    print("Content part 2 built")