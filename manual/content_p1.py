#!/usr/bin/env python3
"""Manual content sections for DCP Review Center."""
from build_manual import ManualPDF

def build_manual(pdf: ManualPDF):
    pdf.title_page()
    pdf.add_page()
    pdf.set_font('CJK', '', 10) if pdf.cjk_font else pdf.set_font('Helvetica', '', 10)

    # ===== Table of Contents =====
    pdf.section_title('Table of Contents')
    toc = [
        '1. Overview & Key Concepts',
        '2. Getting Started',
        '3. System Modules',
        '   3.1 DCP Review Tab (Project Workspace)',
        '   3.2 DCP Reviewer Workspace (Personal Workspace)',
        '   3.3 DCP Review Center (Admin Sidebar)',
        '4. Managing Review Templates',
        '   4.1 Phase Templates',
        '   4.2 Material Templates',
        '   4.3 Indicator Templates',
        '   4.4 Reviewer Roles',
        '   4.5 Checklist Templates',
        '   4.6 Resolution Rules',
        '   4.7 IPD Flow Diagram',
        '   4.8 Notification Settings',
        '   4.9 Recall Settings',
        '   4.10 Remediation Settings',
        '5. Review Lifecycle',
        '   5.1 Creating a Review',
        '   5.2 Configuring Review Materials',
        '   5.3 Setting Indicators',
        '   5.4 Managing Reviewers',
        '   5.5 Submitting Review Opinions',
        '   5.6 Publishing Resolutions',
        '   5.7 Remediation & Closure',
        '   5.8 Round Comparison',
        '6. State Machine & Transitions',
        '7. Permissions',
        '8. Notifications & Reminders',
        '9. Linked Issues & Remediation Work Items',
        '10. Audit Trail',
        '11. FAQ & Troubleshooting',
        '12. Appendix: API Reference',
    ]
    for t in toc:
        pdf.body(t)

    # ===== Chapter 1: Overview =====
    pdf.add_page()
    pdf.section_title('1. Overview & Key Concepts')
    pdf.body(
        'DCP Review Center is a team-level ONES plugin for managing IPD (Integrated Product Development) '
        'decision checkpoint reviews. It supports both DCP (Decision Check Point) reviews for business '
        'decisions and TR (Technical Review) reviews for engineering validation.'
    )
    pdf.sub_title('What is DCP?')
    pdf.body(
        'DCP (Decision Check Point) is a structured decision-making checkpoint in the IPD process. '
        'At each phase boundary (Concept, Plan, Develop, Confirm, Release), a formal review meeting '
        'evaluates whether the project is ready to proceed to the next phase.'
    )
    pdf.sub_title('What is TR?')
    pdf.body(
        'TR (Technical Review) evaluates the technical maturity of deliverables at each development '
        'stage. It ensures that technical requirements, design specifications, and quality standards '
        'are met before moving forward.'
    )
    pdf.sub_title('Key Concepts')
    pdf.bullet('Review (Review Order): A single DCP or TR review instance tied to a project and phase.')
    pdf.bullet('Phase (Phase): Predefined IPD stages such as DCP1-DCP5 and TR1-TR6.')
    pdf.bullet('Materials: Required documents and attachments that must be submitted before review.')
    pdf.bullet('Indicators: Quantitative metrics with threshold-based risk coloring (green/yellow/red).')
    pdf.bullet('Reviewers: Assigned personnel with specific roles (Chair, VP, QA, etc.) and voting powers.')
    pdf.bullet('Resolution: The final decision result published by an authorized role (e.g., Chair).')
    pdf.bullet('Checklist: Role-specific verification items to ensure review completeness.')
    pdf.bullet('Remediation: Post-resolution corrective actions tracked as ONES work items.')
    pdf.bullet('Snapshot & Freeze: Templates are snapshotted at review creation to ensure auditability.')

    # ===== Chapter 2: Getting Started =====
    pdf.section_title('2. Getting Started')
    pdf.sub_title('Prerequisites')
    pdf.bullet('ONES system version >= 3.11.39')
    pdf.bullet('Node.js runtime >= 16.13.0 for plugin development')
    pdf.bullet('Plugin installed at organization level (app_id: 709xehle)')
    pdf.sub_title('Installation')
    pdf.body(
        'The plugin is distributed as a .opk file (DCP Review Center_v1.29.0.opk). '
        'Administrators can install it through the ONES Plugin Management interface. '
        'After installation, the plugin appears as three modules:'
    )
    pdf.bullet('DCP Review Tab: Embedded in project detail pages as a custom tab component.')
    pdf.bullet('DCP Reviewer Workspace: A standalone workspace for reviewers to manage their tasks.')
    pdf.bullet('DCP Review Center: Sidebar application for template configuration and team overview.')

    # ===== Chapter 3: System Modules =====
    pdf.add_page()
    pdf.section_title('3. System Modules')

    pdf.sub_title('3.1 DCP Review Tab (Project Workspace)')
    pdf.body(
        'The DCP Review tab appears inside each project page. It is the primary workspace '
        'for project teams to manage reviews within a specific project context.'
    )
    pdf.body('Key features:')
    pdf.bullet('List View: Browse all DCP and TR reviews for the current project with filtering by number, title, phase, and status.')
    pdf.bullet('Create Review: Launch new reviews by selecting review type (DCP/TR), phase, title, and meeting time.')
    pdf.bullet('Detail View: Full review management with tab navigation: Materials, Indicators, Reviewers, Remediation, Checklist, Resolution, Timeline, Audit, and Round Comparison.')
    pdf.bullet('Status Dashboard: Color-coded status indicators showing draft, reviewing, awaiting resolution, published, and completed states.')
    pdf.bullet('Copy Link: One-click copy of review number for sharing.')

    pdf.sub_title('3.2 DCP Reviewer Workspace (Personal Workspace)')
    pdf.body(
        'The Reviewer Workspace is a personal task center for each reviewer. It shows '
        'reviews assigned to the current user across all projects.'
    )
    pdf.body('Three task tabs:')
    pdf.bullet('Pending My Review: Reviews where the current user must submit an opinion.')
    pdf.bullet('Pending My Resolution: Reviews where the current user is the authorized resolution publisher.')
    pdf.bullet('Done: Completed reviews the user has participated in.')
    pdf.body('In the detail view, reviewers can:')
    pdf.bullet('Submit review opinions with conclusion (pass/conditional_pass/fail/rework) and risk level.')
    pdf.bullet('Upload or review materials.')
    pdf.bullet('Fill in indicators with current values.')
    pdf.bullet('Link existing ONES issues or create new remediation work items.')
    pdf.bullet('Publish final resolutions if authorized.')

    pdf.sub_title('3.3 DCP Review Center (Admin Sidebar)')
    pdf.body(
        'The DCP Review Center sidebar provides administrative tools:'
    )
    pdf.bullet('Template Configuration: Manage phases, materials, indicators, roles, checklists, resolution rules, IPD flow diagram, notification settings, recall settings, and remediation settings. (Requires dcp_admin permission)')
    pdf.bullet('Review Overview: Team-wide dashboard showing all reviews across all projects with filtering and status tracking. (Requires dcp_view_review permission)')

    print("Content part 1 built")