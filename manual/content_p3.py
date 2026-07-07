#!/usr/bin/env python3
"""Manual content part 3 - Review Lifecycle, State Machine, etc."""
from build_manual import ManualPDF

def build_content_p3(pdf: ManualPDF):
    # ===== Chapter 5: Review Lifecycle =====
    pdf.add_page()
    pdf.section_title('5. Review Lifecycle')

    pdf.sub_title('5.1 Creating a Review')
    pdf.body('To create a new review from within a project:')
    pdf.bullet('Navigate to the project, then click the "DCP Review" tab.')
    pdf.bullet('Click the "New Review" button.')
    pdf.bullet('Select review type: DCP or TR.')
    pdf.bullet('Choose a phase. Phases are filtered by review type and dependency rules '
               '(a phase requiring prior phases will show a block notice if prerequisites are not met).')
    pdf.bullet('Enter a review title and optional meeting time.')
    pdf.bullet('Click "Create". The system will:')
    pdf.bullet('Generate a unique review number (e.g., PROJ2026070701 or TR-PROJ2026070701).', indent=10)
    pdf.bullet('Snapshot (freeze) all templates: resolution rules, role templates, checklist templates.', indent=10)
    pdf.bullet('Auto-populate materials and indicators from matching templates.', indent=10)
    pdf.bullet('Set initial state to "Draft".', indent=10)

    pdf.sub_title('5.2 Configuring Review Materials')
    pdf.body(
        'Materials are auto-populated from templates at creation. Each material has:'
    )
    pdf.bullet('Status: Pending / Submitted / Approved / Needs Revision (color-coded).')
    pdf.bullet('File Upload: Upload a single file OR multiple attachments for each material template.')
    pdf.bullet('Notes: Free-text notes for each material.')
    pdf.bullet('Preview/Download: Inline preview and download for uploaded files and attachments.')
    pdf.body(
        'Materials marked as "Required" must be submitted before the review can be considered complete. '
        'The responsible role for each material is displayed to clarify accountability.'
    )

    pdf.sub_title('5.3 Setting Indicators')
    pdf.body('For each indicator template associated with the review phase:')
    pdf.bullet('Enter the current value for the metric.')
    pdf.bullet('The system auto-calculates risk color based on thresholds (green/yellow/red).')
    pdf.bullet('Add notes for context.')
    pdf.body(
        'Indicators support two threshold modes: "Above threshold alerts" (value > red = critical) '
        'and "Below threshold alerts" (value < red = critical). Thresholds and names are frozen '
        'at review creation for audit consistency.'
    )

    pdf.sub_title('5.4 Managing Reviewers')
    pdf.body('Add reviewers by searching team members:')
    pdf.bullet('Select a role from the pre-configured role list.')
    pdf.bullet('Search for a team member by name or email.')
    pdf.bullet('Assign the member to the role.')
    pdf.bullet('Remove or reassign reviewers as needed before the review starts.')
    pdf.body(
        'Reviewers are stored as an ordered list. The reviewer JSON is snapshotted '
        'to ensure the review committee composition is auditable.'
    )

    pdf.sub_title('5.5 Submitting Review Opinions')
    pdf.body('Reviewers submit their opinions through either the project review tab or the reviewer workspace:')
    pdf.bullet('Select a conclusion: Pass / Conditional Pass / Fail / Rework.')
    pdf.bullet('Set risk level: Low / Medium / High.')
    pdf.bullet('Write an opinion summary with detailed feedback.')
    pdf.bullet('Click "Submit Opinion". Once submitted, the opinion is recorded and timestamped.')
    pdf.body(
        'Submitted opinions are editable (re-submission) as long as the review is still in the reviewing state. '
        'Each submission is tracked per round (round_no) to support multi-round reviews.'
    )

    pdf.sub_title('5.6 Publishing Resolutions')
    pdf.body('Only the authorized publisher role (typically Chair) can publish resolutions:')
    pdf.bullet('The system checks if resolution prerequisites are met based on the frozen resolution rule.')
    pdf.bullet('If prerequisites are satisfied, the "Publish Resolution" button is enabled.')
    pdf.bullet('The publisher selects a final conclusion from the allowed list.')
    pdf.bullet('Optional: Add conditional notes for "Conditional Pass" resolutions.')
    pdf.bullet('The system generates a resolution record that snapshots:')
    pdf.bullet('All reviewer votes at the time of publication.', indent=10)
    pdf.bullet('Checklist results.', indent=10)
    pdf.bullet('Indicator values.', indent=10)
    pdf.bullet('Linked issues.', indent=10)
    pdf.body(
        'Resolution validation enforces: veto rules (veto role rejection blocks "pass"), '
        'minimum approval count, and vote scope constraints. Resolutions are immutable '
        'once published, forming a permanent audit record.'
    )

    pdf.sub_title('5.7 Remediation & Closure')
    pdf.body('After a resolution is published:')
    pdf.bullet('If the resolution includes conditional requirements, remediation work items can be created.')
    pdf.bullet('Remediation items are ONES issues linked to the review with link_type = remediation.')
    pdf.bullet('Issue status changes are monitored via event hooks (onIssueStatusChanged).')
    pdf.bullet('When all remediation items are completed:')
    pdf.bullet('The publisher can confirm remediation completion.', indent=10)
    pdf.bullet('The review transitions to "Completed" state.', indent=10)
    pdf.bullet('Alternatively, trigger a re-review (enters re_reviewing state with a new round).', indent=10)
    pdf.body(
        'Remediation work items have special locking: they cannot be deleted or have their '
        'status changed through normal work item operations when locked (enforced by TaskEventHandler).'
    )

    pdf.sub_title('5.8 Round Comparison')
    pdf.body(
        'For multi-round reviews, the "Compare Rounds" tab shows side-by-side comparison of:'
    )
    pdf.bullet('Reviewer opinions across rounds.')
    pdf.bullet('Resolution conclusions and conditions.')
    pdf.bullet('Indicator values across rounds.')
    pdf.bullet('Material submission statuses.')
    pdf.body('This helps track changes between review rounds and verify that prior concerns were addressed.')

    # ===== Chapter 6: State Machine =====
    pdf.add_page()
    pdf.section_title('6. State Machine & Transitions')

    pdf.body(
        'DCP Review Center implements a complete state machine for review lifecycle management. '
        'Each review has a review_state (fine-grained) and a backward-compatible status field.'
    )

    pdf.sub_title('States')
    states = [
        ('draft', 'Initial state after creation. Can be edited freely.'),
        ('ready', 'Review is configured and ready to start.'),
        ('reviewing', 'Active review - reviewers are submitting opinions.'),
        ('awaiting_resolution', 'All prerequisites met, waiting for publisher to issue resolution.'),
        ('resolution_published', 'Resolution has been published.'),
        ('remediation_pending', 'Remediation work items are being tracked.'),
        ('re_reviewing', 'A new review round after remediation.'),
        ('completed', 'Review successfully completed and closed.'),
        ('rejected', 'Review was rejected/denied.'),
        ('canceled', 'Review was canceled/withdrawn.'),
        ('archived', 'Review archived for long-term storage.'),
    ]
    for state, desc in states:
        pdf.bullet(f'{state}: {desc}')

    pdf.sub_title('Valid Transitions')
    transitions = [
        ('draft', 'ready, reviewing, canceled'),
        ('ready', 'reviewing, draft, canceled'),
        ('reviewing', 'awaiting_resolution, remediation_pending, draft, canceled'),
        ('awaiting_resolution', 'resolution_published, remediation_pending, reviewing, canceled'),
        ('resolution_published', 'completed, rejected, remediation_pending'),
        ('remediation_pending', 're_reviewing, canceled'),
        ('re_reviewing', 'awaiting_resolution, canceled'),
        ('completed', 'archived'),
        ('rejected', 'draft, archived'),
        ('canceled', 'archived, draft, reviewing'),
        ('archived', '(terminal state)'),
    ]
    for from_state, to_states in transitions:
        pdf.bullet(f'{from_state} -> {to_states}')

    pdf.body(
        'State transitions are validated server-side. Each transition is recorded in '
        'the state history log with timestamp, operator, reason, and round number. '
        'The state_history_json field stores up to 100 recent transitions.'
    )

    pdf.sub_title('Round Tracking')
    pdf.body(
        'Reviews support multiple rounds. Round tracking includes:'
    )
    pdf.bullet('round_no: Current round number (starts at 1, increments on re_reviewing).')
    pdf.bullet('round_state: Per-round state (draft, running, waiting_resolution, resolved, remediation_pending, re_reviewing, closed).')
    pdf.bullet('Reviewer opinions and resolutions are tagged with round_no for historical comparison.')

    # ===== Chapter 7: Permissions =====
    pdf.section_title('7. Permissions')
    pdf.body('Three permission fields control access:')
    pdf.bullet('dcp_admin: Modify templates, resolution rules, and all global configuration. Required for the Template Configuration page.')
    pdf.bullet('dcp_create_review: Create new DCP/TR reviews within a project.')
    pdf.bullet('dcp_view_review: Access the team-wide review overview dashboard.')
    pdf.body(
        'Permissions are checked via the ONES permissionrule/batch_check API on page load. '
        'Actions are also gated server-side: configuration saves require operator identity '
        'extraction from ONES request headers (Ones-User-Id).'
    )

    print("Content part 3 built")