#!/usr/bin/env python3
"""Generate DCP Review Center User Manual - HTML to PDF approach."""
import os, sys
sys.path.insert(0, '/root/.hermes/hermes-agent/venv/lib/python3.12/site-packages')
from weasyprint import HTML

CSS = """
@page { size: A4; margin: 2cm 2.2cm; @bottom-center { content: counter(page); font-size: 9pt; color: #999; } }
body { font-family: 'WenQuanYi Micro Hei', 'Noto Sans CJK SC', 'SimHei', sans-serif; font-size: 11pt; line-height: 1.7; color: #333; }
h1 { color: #1677ff; font-size: 24pt; text-align: center; margin-top: 3cm; }
h2 { color: #1677ff; font-size: 16pt; border-bottom: 2px solid #1677ff; padding-bottom: 4px; margin-top: 28px; page-break-after: avoid; }
h3 { color: #444; font-size: 13pt; margin-top: 20px; page-break-after: avoid; }
p { margin: 6px 0; }
ul { margin: 4px 0 8px 0; padding-left: 20px; }
li { margin: 3px 0; }
.note { background: #e6f4ff; border-left: 3px solid #1677ff; padding: 8px 12px; margin: 10px 0; font-size: 10pt; }
.title-page p { text-align: center; color: #666; font-size: 13pt; margin: 4px 0; }
.toc { margin: 20px 0; }
.toc a { color: #333; text-decoration: none; }
.break { page-break-before: always; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
th { background: #1677ff; color: #fff; padding: 6px 10px; text-align: left; }
td { padding: 5px 10px; border-bottom: 1px solid #eee; }
tr:nth-child(even) td { background: #fafafa; }
.footer-text { text-align: center; color: #999; font-size: 10pt; margin-top: 30px; }
"""

HTML_HEADER = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>DCP Review Center User Manual</title>
<style>""" + CSS + """</style></head><body>"""

HTML_FOOTER = """<div class="footer-text">--- End of Manual ---<br>DCP Review Center v1.29.0 &bull; ONES Plugin (app_id: 709xehle)<br>For support, contact your system administrator or the plugin maintainer.</div>
</body></html>"""

def h2(text): return f'<h2>{text}</h2>'
def h3(text): return f'<h3>{text}</h3>'
def p(text): return f'<p>{text}</p>'
def note(text): return f'<div class="note">{text}</div>'
def li(text): return f'<li>{text}</li>'
def ul(items): return '<ul>' + ''.join(li(i) for i in items) + '</ul>'
def page_break(): return '<div class="break"></div>'

sections = []

# ---- Title Page ----
sections.append(f"""
<div class="title-page">
<h1>DCP Review Center</h1>
<p style="font-size:18pt;margin-top:10px;">User Manual / 用户使用手册</p>
<p style="margin-top:40px;">Version 1.29.0</p>
<p>Team-level DCP/TR Review Management</p>
<p>App ID: 709xehle &bull; Mode: Organization</p>
<p style="font-size:10pt;margin-top:60px;color:#999;">ONES Open Platform Plugin</p>
</div>
""")

# ---- TOC ----
sections.append(page_break() + h2('Table of Contents / 目录'))
toc_items = [
    '1. Overview & Key Concepts / 概述与核心概念',
    '2. Getting Started / 快速入门',
    '3. System Modules / 系统模块',
    '4. Managing Review Templates / 管理评审模板',
    '5. Review Lifecycle / 评审生命周期',
    '6. State Machine & Transitions / 状态机与流转',
    '7. Permissions / 权限管理',
    '8. Notifications & Reminders / 通知与催办',
    '9. Linked Issues & Remediation / 关联工作项与整改',
    '10. Audit Trail / 审计追溯',
    '11. FAQ & Troubleshooting / 常见问题',
    '12. Appendix: API Reference / 附录：API 参考',
]
sections.append(ul(toc_items))

# ==== Chapter 1 ====
sections.append(page_break() + h2('1. Overview & Key Concepts / 概述与核心概念'))
sections.append(p(
    'DCP Review Center is a team-level ONES plugin for managing IPD (Integrated Product Development) '
    'decision checkpoint reviews. It supports both DCP (Decision Check Point) reviews for business '
    'decisions and TR (Technical Review) reviews for engineering validation.'
))
sections.append(p(
    'DCP 评审中心是一个团队级别的 ONES 插件，用于管理 IPD（集成产品开发）流程中的决策评审和技术评审。'
    '插件同时支持 DCP（决策评审）和 TR（技术评审）两种评审类型。'
))

sections.append(h3('What is DCP? / 什么是 DCP？'))
sections.append(p(
    'DCP (Decision Check Point) is a structured decision-making checkpoint in the IPD process. '
    'At each phase boundary (Concept, Plan, Develop, Confirm, Release), a formal review evaluates '
    'whether the project is ready to proceed to the next phase.'
))

sections.append(h3('What is TR? / 什么是 TR？'))
sections.append(p(
    'TR (Technical Review) evaluates the technical maturity of deliverables at each development stage. '
    'It ensures technical requirements, design specifications, and quality standards are met.'
))

sections.append(h3('Key Concepts / 核心概念'))
sections.append(ul([
    'Review / 评审单: A single DCP or TR review instance tied to a project and phase.',
    'Phase / 阶段: Predefined IPD stages (DCP1-DCP5, TR1-TR6).',
    'Materials / 评审材料: Required documents that must be submitted before review.',
    'Indicators / 评审指标: Quantitative metrics with threshold-based risk coloring (green/yellow/red).',
    'Reviewers / 评审人: Assigned personnel with roles and voting powers (veto, must-vote).',
    'Resolution / 决议: Final decision published by authorized role (e.g., Chair).',
    'Checklist / 检查清单: Role-specific verification items for review completeness.',
    'Remediation / 整改闭环: Post-resolution corrective actions tracked as ONES work items.',
    'Snapshot & Freeze / 配置快照: Templates frozen at review creation for auditability.',
]))

# ==== Chapter 2 ====
sections.append(page_break() + h2('2. Getting Started / 快速入门'))
sections.append(h3('Prerequisites / 前置条件'))
sections.append(ul([
    'ONES system version >= 3.11.39',
    'Plugin installed at organization level (app_id: 709xehle)',
    'Node.js >= 16.13.0 (for plugin development only)',
]))
sections.append(h3('Installation / 安装'))
sections.append(p(
    'The plugin is distributed as a .opk file. Administrators install it through the '
    'ONES Plugin Management interface. After installation, three modules appear:'
))
sections.append(ul([
    'DCP Review Tab: Embedded in project detail pages as custom tab.',
    'DCP Reviewer Workspace: Standalone workspace for reviewer task management.',
    'DCP Review Center: Sidebar app for template configuration and team overview.',
]))

# ==== Chapter 3 ====
sections.append(page_break() + h2('3. System Modules / 系统模块'))
sections.append(h3('3.1 DCP Review Tab / 项目内评审工作台'))
sections.append(p('Appears inside each project page. Primary workspace for project teams.'))
sections.append(ul([
    'List View: Browse reviews with filtering by number, title, phase, status, and type.',
    'Create Review: Launch new DCP/TR reviews with phase selection and dependency checking.',
    'Detail View: Tab navigation for Materials, Indicators, Reviewers, Remediation, Checklist, Resolution, Timeline, Audit, and Round Compare.',
    'Status Dashboard: Color-coded status for draft, reviewing, awaiting resolution, published, completed.',
    'Copy Link: One-click copy of review number for sharing.',
]))

sections.append(h3('3.2 DCP Reviewer Workspace / 评审人工作台'))
sections.append(p('Personal task center showing reviews assigned to the current user across all projects.'))
sections.append(ul([
    'Pending My Review: Reviews requiring the current user to submit opinions.',
    'Pending My Resolution: Reviews where current user is the authorized resolution publisher.',
    'Done: Completed reviews the user participated in.',
]))
sections.append(p('In detail view, reviewers can submit opinions, manage materials/indicators, link issues, and publish resolutions if authorized.'))

sections.append(h3('3.3 DCP Review Center Sidebar / 评审中心管理'))
sections.append(ul([
    'Template Configuration: Manage phases, materials, indicators, roles, checklists, resolution rules, IPD flow, notifications, recall, and remediation settings. (Requires dcp_admin)',
    'Review Overview: Team-wide dashboard with filtering and status tracking. (Requires dcp_view_review)',
]))

print("HTML content part 1 ready")